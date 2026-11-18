/**
 * Fahrzeug-Beschränkungen aus allen Suchindizes, für einen Kartenausschnitt
 * (seit Go 0.71.0). Die Tabelle entsteht beim Bau des Lite-Index
 * (`search/lite/beschraenkungen.ts`); alte Indizes haben sie nicht und
 * liefern dann einfach nichts.
 *
 * Anders als die Sonderziele (einmal alle) wird hier nach Ausschnitt gefragt:
 * Gewichts- und Höhengrenzen gibt es in Deutschland sechsstellig.
 */

import Database from 'better-sqlite3';
import { statSync } from 'node:fs';
import { listLiteSearchDbFiles, resolveLiteSearchDir } from '../search/lite/paths.js';
import { leseBeschraenkungen, type Beschraenkung } from '../search/lite/beschraenkungen.js';

/** Höchstens so viele je Antwort -- die Karte fragt erst ab Zoom 11. */
export const BESCHRAENKUNGEN_HOECHSTENS = 4000;
/** Größter erlaubter Ausschnitt in Grad (Breite und Höhe). */
export const BESCHRAENKUNGEN_MAX_AUSSCHNITT_GRAD = 2;

// Offene Dateien bleiben offen, solange sie sich nicht ändern: die Karte
// fragt bei jedem Verschieben, und ein Neubau ersetzt die Datei (rename),
// was die Änderungszeit verrät.
const offen = new Map<string, { db: Database.Database; mtimeMs: number }>();

function oeffne(pfad: string): Database.Database | null {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(pfad).mtimeMs;
  } catch {
    const alt = offen.get(pfad);
    alt?.db.close();
    offen.delete(pfad);
    return null;
  }
  const da = offen.get(pfad);
  if (da && da.mtimeMs === mtimeMs) return da.db;
  da?.db.close();
  const db = new Database(pfad, { readonly: true, fileMustExist: true });
  offen.set(pfad, { db, mtimeMs });
  return db;
}

/** Nur für Tests: alle offenen Dateien schließen. */
export function beschraenkungenSchliessen(): void {
  for (const { db } of offen.values()) db.close();
  offen.clear();
}

/** `w,s,o,n` → Rahmen, oder `null`, wenn unbrauchbar oder zu groß. */
export function parseBbox(roh: unknown): [number, number, number, number] | null {
  if (typeof roh !== 'string') return null;
  const t = roh.split(',').map(Number);
  if (t.length !== 4 || !t.every(Number.isFinite)) return null;
  const [w, s, o, n] = t;
  if (w >= o || s >= n || s < -90 || n > 90 || w < -180 || o > 180) return null;
  if (o - w > BESCHRAENKUNGEN_MAX_AUSSCHNITT_GRAD || n - s > BESCHRAENKUNGEN_MAX_AUSSCHNITT_GRAD) return null;
  return [w, s, o, n];
}

export interface BeschraenkungenErgebnis {
  liste: Beschraenkung[];
  gekappt: boolean;
  /** Wie viele Indizes die Tabelle überhaupt haben (0 = Suche neu bauen). */
  mitTabelle: number;
}

export function beschraenkungenIn(
  bbox: readonly [number, number, number, number],
  dateien?: readonly string[],
  hoechstens = BESCHRAENKUNGEN_HOECHSTENS,
): BeschraenkungenErgebnis {
  const pfade = dateien ?? listLiteSearchDbFiles(resolveLiteSearchDir());
  const liste: Beschraenkung[] = [];
  let mitTabelle = 0;
  for (const pfad of pfade) {
    if (liste.length >= hoechstens) break;
    try {
      const db = oeffne(pfad);
      if (!db) continue;
      const hat = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'beschraenkungen'").get();
      if (!hat) continue;
      mitTabelle += 1;
      liste.push(...leseBeschraenkungen(db, bbox, hoechstens - liste.length));
    } catch {
      // Ein unlesbarer Index (gerade im Neubau) darf die anderen nicht mitnehmen.
    }
  }
  // Regionen überlappen an den Rändern: dieselbe OSM-Grenze nur einmal.
  const gesehen = new Set<string>();
  const eindeutig = liste.filter((b) => {
    if (!b.osm) return true;
    const k = `${b.osm}|${b.art}`;
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
  return { liste: eindeutig, gekappt: liste.length >= hoechstens, mitTabelle };
}

export interface BeschraenkungFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { art: string; wert: number; osm?: string; linie?: Array<[number, number]> };
}

/** Als GeoJSON; `mitLinien` hängt die vereinfachte Weglinie an (für Warnungen). */
export function beschraenkungenGeoJson(e: BeschraenkungenErgebnis, mitLinien = false) {
  return {
    type: 'FeatureCollection' as const,
    features: e.liste.map(
      (b): BeschraenkungFeature => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
        properties: {
          art: b.art,
          wert: b.wert,
          ...(b.osm ? { osm: b.osm } : {}),
          ...(mitLinien && b.linie ? { linie: b.linie } : {}),
        },
      }),
    ),
    gekappt: e.gekappt,
    mitTabelle: e.mitTabelle,
  };
}
