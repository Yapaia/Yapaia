/**
 * Der Koordinaten-Index des Offline-Suchindex (`places(lat)`).
 *
 * ─── WARUM ES IHN BRAUCHT ──────────────────────────────────────────────────
 * Die Rückwärtssuche („was ist hier?") fragt `places` nach einem Kasten um
 * die Position. Ohne Index liest SQLite dafür JEDE Zeile -- in Deutschland
 * 9,4 Mio. --, und das dauerte auf dem Mini-PC 6 bis 9 Sekunden, in denen der
 * Kern (better-sqlite3 ist synchron) für alles andere stand. Für die Sensoren
 * „Ort" und „Adresse", die sich beim Fahren nachführen, war das untragbar.
 * Mit dem Index sind es Millisekunden.
 *
 * Neue Indizes bekommen ihn beim Bau (buildIndex.ts). Vorhandene -- auch die
 * vom Kartenserver geladenen Pakete -- bekommen ihn hier nachträglich, EINMAL,
 * in einem Worker-Thread: das Anlegen dauert bei Deutschland etwa eine Minute,
 * und so lange darf der Kern nicht stehen.
 */

import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';

export const GEO_INDEX = 'places_lage';
export const GEO_INDEX_SQL = `CREATE INDEX IF NOT EXISTS ${GEO_INDEX} ON places(lat)`;

// Der Worker bekommt seinen Code als Text: der Kern ist eine einzige
// gebündelte Datei, eine eigene Worker-Datei gäbe es zur Laufzeit nicht.
// better-sqlite3 lädt er über den Pfad, den der Haupt-Thread auflöst.
const WORKER_CODE = `
const { parentPort, workerData } = require('node:worker_threads');
const Database = require(workerData.modul);
try {
  const db = new Database(workerData.pfad, { fileMustExist: true });
  db.pragma('busy_timeout = 60000');
  db.exec(workerData.sql);
  db.close();
  parentPort.postMessage({ ok: true });
} catch (err) {
  parentPort.postMessage({ ok: false, fehler: String(err && err.message || err) });
}
`;

/** Legt den Index in `pfad` an (im Worker). Wirft nie; `false` = nicht geklappt. */
export function geoIndexAnlegen(pfad: string): Promise<{ ok: boolean; fehler?: string }> {
  return new Promise((resolve) => {
    let modul: string;
    try {
      modul = createRequire(import.meta.url).resolve('better-sqlite3');
    } catch (err) {
      resolve({ ok: false, fehler: `better-sqlite3 nicht gefunden: ${(err as Error).message}` });
      return;
    }
    const worker = new Worker(WORKER_CODE, { eval: true, workerData: { pfad, modul, sql: GEO_INDEX_SQL } });
    let fertig = false;
    worker.once('message', (m: { ok: boolean; fehler?: string }) => {
      fertig = true;
      resolve(m);
    });
    worker.once('error', (err) => {
      if (!fertig) resolve({ ok: false, fehler: err.message });
    });
    worker.once('exit', (code) => {
      if (!fertig) resolve({ ok: false, fehler: `Worker beendet (${code})` });
    });
  });
}
