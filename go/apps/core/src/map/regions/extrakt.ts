/**
 * Nur den OSM-Extrakt einer Region herunterladen — ohne zu bauen.
 *
 * ─── WOFÜR ──────────────────────────────────────────────────────────────────
 * Gewünscht: „Es macht Sinn den Bau nicht gleich nach dem Runterladen zu
 * starten. Wenn man mehrere Karten zusammen bauen will sollte man sie erst
 * alle runterladen und dann gemeinsam bauen."
 *
 * Bis 0.58.1 hiess „Installieren" bei einer mitgelieferten Region: Extrakt
 * laden UND sofort die Kacheln bauen. Wer Deutschland und Österreich wollte,
 * stand vor zwei Bauten nacheinander, jeder mit eigenem Warten — und das
 * Routing danach baute ohnehin noch einmal über beide.
 *
 * Jetzt ist das getrennt:
 *   1. Herunterladen (hier): der Extrakt landet im Zwischenlager
 *      (`planetiler-sources/<region>.osm.pbf`). Minuten, nur Netz.
 *   2. Bauen (`gesamtbau.ts`): EIN Lauf über alles Geladene — Kacheln je
 *      Karte, dann das Routing über alle, dann die Suche.
 *
 * Das Zwischenlager ist dasselbe, das Kachel-, Routing- und Suchbau ohnehin
 * benutzen: liegt der Extrakt dort, lädt keiner von ihnen ihn noch einmal.
 *
 * ─── WAS EINE HALBE DATEI NICHT DARF ────────────────────────────────────────
 * Der Routingbau sammelt JEDE `*.osm.pbf` im Lager ein. Eine halb geladene
 * Datei unter diesem Namen vergiftete also auch alle anderen Karten. Geladen
 * wird deshalb nach `<region>.osm.pbf.part` — das Muster greift darauf nicht —
 * und erst nach geprüfter Kopfkennung umbenannt (wie in den Bau-Skripten,
 * `ist_osm_pbf`).
 */

import { mkdir, open, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import type { CatalogEntry } from './catalog.js';
import { existingPartBytes, streamToFile } from './download.js';
import { extraktPfad } from './graphAbdeckung.js';
import type { JobRegistry } from './jobs.js';

/** Job-Art der Extrakt-Downloads. Bewusst NICHT `BUILD_JOB_KIND`: ein
 *  Download ist Netz, kein Arbeitsspeicher — er sperrt keinen Bau. */
export const EXTRAKT_JOB_KIND = 'extrakt';

/** Wo ein angefangener Download liegt. */
export function extraktPartPfad(lagerPfad: string, region: string): string {
  return `${extraktPfad(lagerPfad, region)}.part`;
}

/** Liegt der fertige Extrakt einer Region im Lager? */
export function hatExtrakt(lagerPfad: string, region: string): boolean {
  return existsSync(extraktPfad(lagerPfad, region));
}

/**
 * Ist das eine OSM-PBF? Dieselbe Prüfung wie `ist_osm_pbf` in den
 * Bau-Skripten: die Kennung „OSMHeader" steht per Format in den Bytes 6–14.
 */
export async function istOsmPbf(pfad: string): Promise<boolean> {
  let datei;
  try {
    datei = await open(pfad, 'r');
  } catch {
    return false;
  }
  try {
    const kopf = Buffer.alloc(15);
    const { bytesRead } = await datei.read(kopf, 0, 15, 0);
    return bytesRead === 15 && kopf.subarray(6, 15).toString('latin1') === 'OSMHeader';
  } finally {
    await datei.close();
  }
}

/**
 * Lädt den Extrakt von `entry.pbfUrl` ins Lager. Kehrt sofort zurück; der
 * Job trägt den Stand. Wirft nie.
 */
export function runExtraktJob(
  jobId: string,
  jobs: JobRegistry,
  entry: CatalogEntry,
  lagerPfad: string,
): void {
  void (async () => {
    const url = entry.pbfUrl;
    if (!url) {
      jobs.markError(jobId, {
        code: 'NO_BUILD_SOURCE',
        message: `Für die Region "${entry.id}" ist kein OSM-Extrakt hinterlegt.`,
      });
      return;
    }
    const part = extraktPartPfad(lagerPfad, entry.id);
    try {
      await mkdir(lagerPfad, { recursive: true });
    } catch (err) {
      jobs.markError(jobId, {
        code: 'DOWNLOAD_FAILED',
        message: `Das Zwischenlager ${lagerPfad} ließ sich nicht anlegen: ${(err as Error).message}`,
      });
      return;
    }
    const resumeFrom = await existingPartBytes(part);
    jobs.markRunning(jobId, entry.sizeBytes);
    try {
      await streamToFile({ url, dest: part, resumeFrom, jobId, jobs });
    } catch (err) {
      if (jobs.isCancelled(jobId)) {
        jobs.markError(jobId, { code: 'CANCELLED', message: 'Download abgebrochen' });
        return;
      }
      jobs.markError(jobId, {
        code: 'DOWNLOAD_FAILED',
        message:
          `Der OSM-Extrakt ließ sich nicht laden (${err instanceof Error ? err.message : String(err)}). ` +
          'Erneut „Herunterladen" setzt dort fort, wo es abbrach.',
      });
      return;
    }
    if (jobs.isCancelled(jobId)) {
      jobs.markError(jobId, { code: 'CANCELLED', message: 'Download abgebrochen' });
      return;
    }
    if (!(await istOsmPbf(part))) {
      await rm(part, { force: true });
      jobs.markError(jobId, {
        code: 'NOT_OSM_PBF',
        message:
          'Das Heruntergeladene ist kein OSM-Extrakt (Kopfkennung „OSMHeader" fehlt) und wurde ' +
          'verworfen. Häufigste Ursache: der Server lieferte eine Fehlerseite statt der Datei.',
      });
      return;
    }
    try {
      await rename(part, extraktPfad(lagerPfad, entry.id));
    } catch (err) {
      jobs.markError(jobId, {
        code: 'DOWNLOAD_FAILED',
        message: `Der fertige Extrakt ließ sich nicht ablegen: ${(err as Error).message}`,
      });
      return;
    }
    jobs.setNote(jobId, 'Heruntergeladen. Gebaut wird mit „Fehlendes bauen", zusammen mit den anderen Karten.');
    jobs.markDone(jobId);
  })();
}
