/**
 * Ländergrenzen (admin_level=2) als kompakte Polygone im Lite-Suchindex.
 *
 * ─── WOZU ───────────────────────────────────────────────────────────────────
 * Go soll aus der aktuellen Position das LAND bestimmen können (ISO-Code) --
 * Anlass: automatischer SIM-Wechsel am Router an der Grenze. Bisher schaltet
 * eine HA-Automation nach der Mobilfunk-MCC; die wechselt erst, wenn das Modem
 * schon im Nachbarnetz hängt. Die Kartenkacheln (`boundary`-Ebene) taugen dafür
 * nicht: dort sind Grenzen LINIEN, und sie lassen sich nur im Browser abfragen.
 *
 * ─── WARUM IM SUCHINDEX ─────────────────────────────────────────────────────
 * Der Index entsteht ohnehin per osmium aus demselben Extrakt, eine Datei je
 * Region, und der Kartenserver liefert ihn als fertiges Paket aus. Eine Tabelle
 * mehr reist damit ohne neues Paketformat mit.
 *
 * ─── WIE KOMPAKT ────────────────────────────────────────────────────────────
 * Koordinaten auf 5 Nachkommastellen (~1 m), Ringe per Douglas-Peucker mit
 * ~30 m Toleranz vereinfacht. Für „auf welcher Seite der Grenze bin ich"
 * genügt das; ein paar Meter Unschärfe an der Linie sind für einen SIM-Wechsel
 * belanglos.
 *
 * ─── WAS DRIN IST ───────────────────────────────────────────────────────────
 * Nur Länder, deren Grenzrelation im Extrakt VOLLSTÄNDIG ist -- osmium baut
 * unvollständige Relationen nicht zu Flächen zusammen. Ein Deutschland-Extrakt
 * liefert also Deutschland, nicht die Nachbarn; Europa liefert alle.
 *
 * Die Laufzeitseite (Land bestimmen, an die Integration melden) steht noch aus
 * -- siehe go/docs/backlog.md, „Land aus GPS". `landBei` unten ist schon der
 * dafür gedachte Kern.
 */

import Database from 'better-sqlite3';

export type Ring = Array<[number, number]>; // [lon, lat]

export interface Grenze {
  /** ISO 3166-1 alpha-2, Großbuchstaben (z. B. "DE"). */
  iso: string;
  name: string;
  /** Alle Ringe (Außen- und Lochringe) -- Even-Odd-Regel, siehe `imPolygon`. */
  ringe: Ring[];
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
}

/** Toleranz der Vereinfachung in Grad (~30 m in Mitteleuropa). */
export const GRENZ_TOLERANZ_GRAD = 0.0003;

const runde = (v: number): number => Math.round(v * 1e5) / 1e5;

/** Abstand Punkt–Strecke im Quadrat (planar, Grad -- für die Toleranz genügt das). */
function abstandQ(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  let t = l === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return x * x + y * y;
}

/** Douglas-Peucker, iterativ (Grenzringe haben Zehntausende Punkte). */
export function vereinfache(ring: Ring, toleranz = GRENZ_TOLERANZ_GRAD): Ring {
  if (ring.length <= 4) return ring.map(([x, y]) => [runde(x), runde(y)]);
  const behalten = new Uint8Array(ring.length);
  behalten[0] = 1;
  behalten[ring.length - 1] = 1;
  const stapel: Array<[number, number]> = [[0, ring.length - 1]];
  const tq = toleranz * toleranz;
  while (stapel.length > 0) {
    const [von, bis] = stapel.pop()!;
    let max = 0;
    let idx = -1;
    for (let i = von + 1; i < bis; i += 1) {
      const d = abstandQ(ring[i], ring[von], ring[bis]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx >= 0 && max > tq) {
      behalten[idx] = 1;
      stapel.push([von, idx], [idx, bis]);
    }
  }
  const aus: Ring = [];
  for (let i = 0; i < ring.length; i += 1) {
    if (behalten[i]) aus.push([runde(ring[i][0]), runde(ring[i][1])]);
  }
  return aus;
}

function isoAus(p: Record<string, unknown>): string | null {
  const roh = p['ISO3166-1:alpha2'] ?? p['ISO3166-1'];
  return typeof roh === 'string' && /^[A-Za-z]{2}$/.test(roh) ? roh.toUpperCase() : null;
}

/**
 * Eine Zeile aus `osmium export -f geojsonseq` → `Grenze`, oder `null`, wenn
 * sie keine Landesgrenze (admin_level=2 mit ISO-Code) als Fläche ist.
 */
export function grenzeAus(feature: unknown): Grenze | null {
  if (!feature || typeof feature !== 'object') return null;
  const f = feature as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } };
  const p = f.properties ?? {};
  if (String(p.admin_level ?? '') !== '2' || p.boundary !== 'administrative') return null;
  const iso = isoAus(p);
  if (!iso) return null;
  const g = f.geometry;
  let polygone: Ring[][];
  if (g?.type === 'Polygon') polygone = [g.coordinates as Ring[]];
  else if (g?.type === 'MultiPolygon') polygone = g.coordinates as Ring[][];
  else return null;

  const ringe: Ring[] = [];
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polygone) {
    for (const ring of poly) {
      const v = vereinfache(ring);
      if (v.length < 4) continue;
      ringe.push(v);
      for (const [x, y] of v) {
        if (x < bbox[0]) bbox[0] = x;
        if (y < bbox[1]) bbox[1] = y;
        if (x > bbox[2]) bbox[2] = x;
        if (y > bbox[3]) bbox[3] = y;
      }
    }
  }
  if (ringe.length === 0) return null;
  const name = typeof p['name:de'] === 'string' ? p['name:de'] : typeof p.name === 'string' ? p.name : iso;
  return { iso, name: name as string, ringe, bbox };
}

/** Punkt in Polygon nach Even-Odd über alle Ringe (Löcher inklusive). */
export function imPolygon(ringe: readonly Ring[], lon: number, lat: number): boolean {
  let drin = false;
  for (const ring of ringe) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) drin = !drin;
    }
  }
  return drin;
}

/** Das Land an dieser Stelle (ISO-Code), oder `null` außerhalb aller bekannten. */
export function landBei(grenzen: readonly Grenze[], lat: number, lon: number): string | null {
  for (const g of grenzen) {
    const [a, b, c, d] = g.bbox;
    if (lon < a || lon > c || lat < b || lat > d) continue;
    if (imPolygon(g.ringe, lon, lat)) return g.iso;
  }
  return null;
}

/**
 * Schreibt die Grenzen in einen gerade gebauten Index (Tabelle `grenzen`).
 * Doppelte ISO-Codes (Teilflächen als eigene Relation) bleiben getrennte
 * Zeilen -- `landBei` prüft ohnehin alle. Gibt die Zahl der Zeilen zurück.
 */
export async function appendGrenzen(dbPath: string, features: AsyncIterable<unknown>): Promise<number> {
  const db = new Database(dbPath);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS grenzen (
      iso TEXT NOT NULL, name TEXT NOT NULL,
      min_lon REAL NOT NULL, min_lat REAL NOT NULL, max_lon REAL NOT NULL, max_lat REAL NOT NULL,
      ringe TEXT NOT NULL
    );`);
    const insert = db.prepare(
      'INSERT INTO grenzen (iso, name, min_lon, min_lat, max_lon, max_lat, ringe) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    let n = 0;
    for await (const f of features) {
      const g = grenzeAus(f);
      if (!g) continue;
      insert.run(g.iso, g.name, ...g.bbox, JSON.stringify(g.ringe));
      n += 1;
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('grenzen_count', ?)").run(String(n));
    return n;
  } finally {
    db.close();
  }
}

/** Liest die Grenzen eines Index; leer, wenn er (noch) keine hat. */
export function leseGrenzen(db: Database.Database): Grenze[] {
  const da = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'grenzen'").get();
  if (!da) return [];
  const zeilen = db
    .prepare('SELECT iso, name, min_lon, min_lat, max_lon, max_lat, ringe FROM grenzen')
    .all() as Array<{ iso: string; name: string; min_lon: number; min_lat: number; max_lon: number; max_lat: number; ringe: string }>;
  return zeilen.map((z) => ({
    iso: z.iso,
    name: z.name,
    bbox: [z.min_lon, z.min_lat, z.max_lon, z.max_lat],
    ringe: JSON.parse(z.ringe) as Ring[],
  }));
}
