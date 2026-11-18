/**
 * Fahrzeug-Beschränkungen (Durchfahrtshöhe, Gewicht, Breite, Länge,
 * Achslast) als kompakte Tabelle im Lite-Suchindex -- seit Go 0.71.0.
 *
 * ─── WOZU ───────────────────────────────────────────────────────────────────
 * Das Routing kennt die Grenzen (Valhalla liest dieselben OSM-Tags), die
 * Karte nicht: die OpenMapTiles-Kacheln tragen weder `maxheight` noch
 * `maxweight`. Wer frei fährt oder die Route verlässt, sieht die niedrige
 * Brücke also erst, wenn er davor steht. Diese Tabelle ist die Quelle für die
 * Kartenebene und die Warnung beim Fahren.
 *
 * ─── WARUM IM SUCHINDEX ─────────────────────────────────────────────────────
 * Wie die Ländergrenzen (grenzen.ts): der Index entsteht per osmium aus dem
 * Extrakt, eine Datei je Region, und der Kartenserver liefert ihn fertig aus.
 * Eine Tabelle mehr reist ohne neues Paketformat mit. Alte Indizes haben sie
 * nicht -- dann gibt es eben keine Beschränkungen, und nichts bricht.
 *
 * ─── WAS GESPEICHERT WIRD ───────────────────────────────────────────────────
 * Je Grenze eine Zeile: Art, Wert (normalisiert in m bzw. t), ein Punkt (der
 * Knoten oder die Mitte des Wegs), der Rahmen und -- bei Wegen -- die
 * vereinfachte Linie (für den Abgleich mit der Route). Ein Weg mit Höhe UND
 * Gewicht ergibt zwei Zeilen. Richtungsabhängige Grenzen (`:forward`/
 * `:backward`) werden noch nicht unterschieden: der kleinere Wert gilt für
 * beide Richtungen -- für eine Warnung ist das die sichere Seite.
 */

import Database from 'better-sqlite3';
import { vereinfache, type Ring } from './grenzen.js';

export type BeschraenkungArt = 'hoehe' | 'gewicht' | 'breite' | 'laenge' | 'achslast';

export interface Beschraenkung {
  art: BeschraenkungArt;
  /** Meter (Höhe, Breite, Länge) bzw. Tonnen (Gewicht, Achslast). */
  wert: number;
  lat: number;
  lon: number;
  /** Vereinfachte Linie [lon, lat] bei Wegen; fehlt bei Knoten. */
  linie?: Ring;
  /** OSM-Kennung, z. B. `w123` oder `n456` -- zum Zusammenfassen. */
  osm?: string;
}

/** Welche Tags zu welcher Art gehören (in dieser Reihenfolge geprüft). */
export const BESCHRAENKUNG_TAGS: Readonly<Record<BeschraenkungArt, readonly string[]>> = {
  hoehe: ['maxheight', 'maxheight:physical', 'maxheight:forward', 'maxheight:backward'],
  gewicht: ['maxweight', 'maxweight:forward', 'maxweight:backward'],
  breite: ['maxwidth', 'maxwidth:physical', 'maxwidth:forward', 'maxwidth:backward'],
  laenge: ['maxlength', 'maxlength:forward', 'maxlength:backward'],
  achslast: ['maxaxleload', 'maxaxleload:forward', 'maxaxleload:backward'],
};

/** Alle Tags -- für den osmium-Filter (`--print-beschraenkung-filter`). */
export const ALLE_BESCHRAENKUNG_TAGS: readonly string[] = Object.values(BESCHRAENKUNG_TAGS).flat();

/** Plausible Bereiche; alles außerhalb ist ein Tippfehler oder eine andere Einheit. */
const BEREICH: Readonly<Record<BeschraenkungArt, [number, number]>> = {
  hoehe: [1, 8],
  breite: [1, 8],
  laenge: [2, 60],
  gewicht: [0.5, 100],
  achslast: [0.5, 40],
};

const zahl = (s: string): number => Number(s.replace(',', '.'));

/**
 * Längenangabe → Meter. Versteht `3.5`, `3,5`, `3.5 m`, `3.5m`, `350 cm`,
 * `3'6"`, `11'`, `12 ft 6 in`. Liefert `null` für `default`, `none`,
 * `below_default`, `unsigned`, `no_sign`, leere und unverständliche Werte.
 */
export function parseMeter(roh: unknown): number | null {
  if (typeof roh !== 'string') return null;
  const s = roh.trim().toLowerCase();
  if (!s) return null;
  // Fuß und Zoll: 3'6", 11', 12 ft 6 in
  const fuss = /^(\d+(?:[.,]\d+)?)\s*(?:'|ft|feet|′)\s*(?:(\d+(?:[.,]\d+)?)\s*(?:"|in|inch|inches|″|'')?)?$/.exec(s);
  if (fuss) {
    const m = zahl(fuss[1]) * 0.3048 + (fuss[2] ? zahl(fuss[2]) * 0.0254 : 0);
    return Number.isFinite(m) ? Math.round(m * 100) / 100 : null;
  }
  const metrisch = /^(\d+(?:[.,]\d+)?)\s*(m|cm|mm)?$/.exec(s);
  if (!metrisch) return null;
  let v = zahl(metrisch[1]);
  if (metrisch[2] === 'cm') v /= 100;
  else if (metrisch[2] === 'mm') v /= 1000;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/**
 * Gewichtsangabe → Tonnen. Versteht `7.5`, `7,5 t`, `7.5t`, `3500 kg`,
 * `12 st` (short tons), `6000 lbs`. Sonst `null`.
 */
export function parseTonnen(roh: unknown): number | null {
  if (typeof roh !== 'string') return null;
  const s = roh.trim().toLowerCase();
  const m = /^(\d+(?:[.,]\d+)?)\s*(t|kg|st|lbs?|cwt)?$/.exec(s);
  if (!m) return null;
  let v = zahl(m[1]);
  if (m[2] === 'kg') v /= 1000;
  else if (m[2] === 'st') v *= 0.90718474;
  else if (m[2] === 'lb' || m[2] === 'lbs') v *= 0.00045359237;
  else if (m[2] === 'cwt') v *= 0.05080234544;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/** Wert einer Art aus den Tags: der KLEINSTE gültige (sichere Seite). */
export function wertAus(art: BeschraenkungArt, tags: Readonly<Record<string, unknown>>): number | null {
  const parse = art === 'gewicht' || art === 'achslast' ? parseTonnen : parseMeter;
  const [min, max] = BEREICH[art];
  let best: number | null = null;
  for (const tag of BESCHRAENKUNG_TAGS[art]) {
    const v = parse(tags[tag]);
    if (v === null || v < min || v > max) continue;
    if (best === null || v < best) best = v;
  }
  return best;
}

/** Toleranz der Linienvereinfachung (~10 m). */
const LINIEN_TOLERANZ_GRAD = 0.0001;
const runde = (v: number): number => Math.round(v * 1e5) / 1e5;

/** Mitte einer Linie entlang ihrer Länge (planar genügt für kurze Wege). */
function linienMitte(linie: Ring): [number, number] {
  if (linie.length === 1) return linie[0];
  let gesamt = 0;
  const teile: number[] = [];
  for (let i = 1; i < linie.length; i += 1) {
    const d = Math.hypot(linie[i][0] - linie[i - 1][0], linie[i][1] - linie[i - 1][1]);
    teile.push(d);
    gesamt += d;
  }
  let rest = gesamt / 2;
  for (let i = 0; i < teile.length; i += 1) {
    if (rest <= teile[i] && teile[i] > 0) {
      const t = rest / teile[i];
      return [
        linie[i][0] + t * (linie[i + 1][0] - linie[i][0]),
        linie[i][1] + t * (linie[i + 1][1] - linie[i][1]),
      ];
    }
    rest -= teile[i];
  }
  return linie[linie.length - 1];
}

function istKoord(p: unknown): p is [number, number] {
  return (
    Array.isArray(p) &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
  );
}

/** Ein GeoJSON-Feature aus `osmium export` → null bis fünf Beschränkungen. */
export function beschraenkungenAus(feature: unknown): Beschraenkung[] {
  if (!feature || typeof feature !== 'object') return [];
  const f = feature as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown>; id?: unknown };
  const tags = f.properties ?? {};
  const g = f.geometry;
  if (!g) return [];
  let punkt: [number, number] | null = null;
  let linie: Ring | undefined;
  if (g.type === 'Point' && istKoord(g.coordinates)) {
    punkt = [runde(g.coordinates[0]), runde(g.coordinates[1])];
  } else if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
    const roh = (g.coordinates as unknown[]).filter(istKoord);
    if (roh.length === 0) return [];
    linie = roh.length > 2 ? vereinfache(roh, LINIEN_TOLERANZ_GRAD) : roh.map(([x, y]) => [runde(x), runde(y)]);
    const [x, y] = linienMitte(linie);
    punkt = [runde(x), runde(y)];
  } else {
    return [];
  }
  const osmTyp = typeof tags['@type'] === 'string' ? (tags['@type'] as string)[0] : g.type === 'Point' ? 'n' : 'w';
  const osmId = tags['@id'] ?? f.id;
  const osm = osmId !== undefined ? `${osmTyp}${String(osmId).replace(/^[a-z]/, '')}` : undefined;
  const aus: Beschraenkung[] = [];
  for (const art of Object.keys(BESCHRAENKUNG_TAGS) as BeschraenkungArt[]) {
    const wert = wertAus(art, tags);
    if (wert === null) continue;
    aus.push({ art, wert, lon: punkt[0], lat: punkt[1], ...(linie ? { linie } : {}), ...(osm ? { osm } : {}) });
  }
  return aus;
}

function rahmen(b: Beschraenkung): [number, number, number, number] {
  const pts = b.linie ?? [[b.lon, b.lat]];
  let a = Infinity, c = Infinity, d = -Infinity, e = -Infinity;
  for (const [x, y] of pts) {
    if (x < a) a = x;
    if (y < c) c = y;
    if (x > d) d = x;
    if (y > e) e = y;
  }
  return [a, c, d, e];
}

/**
 * Schreibt die Beschränkungen in einen gerade gebauten Index (Tabelle
 * `beschraenkungen`, Index auf `lat`). Gibt die Zahl der Zeilen zurück.
 */
export async function appendBeschraenkungen(dbPath: string, features: AsyncIterable<unknown>): Promise<number> {
  const db = new Database(dbPath);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS beschraenkungen (
      art TEXT NOT NULL, wert REAL NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
      min_lon REAL NOT NULL, min_lat REAL NOT NULL, max_lon REAL NOT NULL, max_lat REAL NOT NULL,
      linie TEXT, osm TEXT
    );`);
    const insert = db.prepare(
      'INSERT INTO beschraenkungen (art, wert, lat, lon, min_lon, min_lat, max_lon, max_lat, linie, osm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    let n = 0;
    let stapel: Beschraenkung[] = [];
    const schreibe = db.transaction((liste: Beschraenkung[]) => {
      for (const b of liste) {
        insert.run(b.art, b.wert, b.lat, b.lon, ...rahmen(b), b.linie ? JSON.stringify(b.linie) : null, b.osm ?? null);
      }
    });
    for await (const f of features) {
      for (const b of beschraenkungenAus(f)) {
        stapel.push(b);
        n += 1;
      }
      if (stapel.length >= 5000) {
        schreibe(stapel);
        stapel = [];
      }
    }
    schreibe(stapel);
    // Lange Wege (Gewichtsgrenze über Kilometer) reichen über den Punkt
    // hinaus; der Abruf sucht deshalb über `min_lat`/`max_lat` mit Rand.
    db.exec('CREATE INDEX IF NOT EXISTS beschraenkungen_lage ON beschraenkungen(min_lat)');
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('beschraenkungen_count', ?)").run(String(n));
    return n;
  } finally {
    db.close();
  }
}

/** Wie weit ein Weg höchstens über seinen Punkt hinausragen darf, damit er gefunden wird (Grad, ~5 km). */
export const BESCHRAENKUNG_RAND_GRAD = 0.05;

/**
 * Beschränkungen in einem Rahmen; leer, wenn der Index (noch) keine hat.
 * Wege, die nur mit einem Ende hineinragen, sind dabei (Rahmenüberlappung).
 */
export function leseBeschraenkungen(
  db: Database.Database,
  bbox: readonly [number, number, number, number],
  hoechstens: number,
): Beschraenkung[] {
  const da = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'beschraenkungen'").get();
  if (!da) return [];
  const [w, s, o, n] = bbox;
  const zeilen = db
    .prepare(
      `SELECT art, wert, lat, lon, linie, osm FROM beschraenkungen
       WHERE min_lat BETWEEN ? AND ? AND max_lat >= ? AND max_lon >= ? AND min_lon <= ?
       LIMIT ?`,
    )
    .all(s - BESCHRAENKUNG_RAND_GRAD, n, s, w, o, hoechstens) as Array<{
    art: BeschraenkungArt;
    wert: number;
    lat: number;
    lon: number;
    linie: string | null;
    osm: string | null;
  }>;
  return zeilen.map((z) => ({
    art: z.art,
    wert: z.wert,
    lat: z.lat,
    lon: z.lon,
    ...(z.linie ? { linie: JSON.parse(z.linie) as Ring } : {}),
    ...(z.osm ? { osm: z.osm } : {}),
  }));
}
