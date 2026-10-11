/* eslint-disable no-undef -- `fetch`/`AbortSignal` sind Standard-Globale in Node 22. */

/**
 * Pakete vom Yapaia Kartenserver (Repository Yapaia/map-server).
 *
 * Der Kartenserver baut auf einem eigenen Rechner, was hier Stunden dauern
 * wuerde: Karte, Suchindex UND Routing -- mit denselben Skripten wie dieses
 * Add-on. Go holt die fertigen Dateien:
 *
 *   <paket>.pmtiles          -> Kachelverzeichnis (wie ein normaler Download)
 *   lite_search-<paket>.db   -> Suchindex-Verzeichnis
 *   <paket>-routing.tar      -> ersetzt den Routinggraphen (tiles/ + build-info.json)
 *
 * Ein Paket kann mehrere Laender umfassen; sein Routing gilt ueber Grenzen
 * hinweg. Es ERSETZT den bisherigen Graphen -- genau wie ein Routingbau
 * hier ueber die installierten Karten.
 */

import { execFile } from 'node:child_process';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { CatalogEntry } from './catalog.js';
import { existingPartBytes, finalFilePath, hashFile, streamToFile } from './download.js';
import type { JobRegistry } from './jobs.js';

const ausfuehren = promisify(execFile);

/** Die Einstellung `kartenserver` (⚙ → Karten verwalten). */
export const EINSTELLUNG = 'kartenserver';

export interface KartenserverVerbindung {
  url: string;
  token: string;
}

export interface PaketDatei {
  url: string;
  sizeBytes: number;
  sha256?: string;
}

/** Ein Katalogeintrag, der vom Kartenserver stammt. */
export interface KartenserverEintrag extends CatalogEntry {
  quelle: 'kartenserver';
  gebaut?: string;
  suche?: PaketDatei;
  routing?: PaketDatei;
}

export function istKartenserverEintrag(e: CatalogEntry): e is KartenserverEintrag {
  return (e as Partial<KartenserverEintrag>).quelle === 'kartenserver';
}

/** Die gespeicherte Verbindung, oder `null`, wenn keine eingerichtet ist. */
export function verbindungAus(wert: unknown): KartenserverVerbindung | null {
  if (!wert || typeof wert !== 'object') return null;
  const { url, token } = wert as Record<string, unknown>;
  if (typeof url !== 'string' || !/^https?:\/\/\S+$/.test(url.trim())) return null;
  return { url: url.trim().replace(/\/+$/, ''), token: typeof token === 'string' ? token.trim() : '' };
}

const ID = /^[a-z0-9][a-z0-9_-]{0,62}$/;

function datei(roh: unknown): PaketDatei | undefined {
  if (!roh || typeof roh !== 'object') return undefined;
  const d = roh as Record<string, unknown>;
  if (typeof d.url !== 'string' || !/^https?:\/\//.test(d.url) || typeof d.sizeBytes !== 'number') return undefined;
  return { url: d.url, sizeBytes: d.sizeBytes, ...(typeof d.sha256 === 'string' ? { sha256: d.sha256 } : {}) };
}

function datum(iso: unknown): string {
  const d = typeof iso === 'string' ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('de-DE') : 'unbekannt';
}

/** Ein Eintrag aus `GET /v1/katalog` -- oder `null`, wenn er nicht taugt. */
export function eintragAus(roh: unknown): KartenserverEintrag | null {
  if (!roh || typeof roh !== 'object') return null;
  const r = roh as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID.test(r.id) || typeof r.name !== 'string') return null;
  const b = r.bounds;
  if (!Array.isArray(b) || b.length !== 4 || !b.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  const karte = typeof r.url === 'string' && /^https?:\/\//.test(r.url) ? r.url : undefined;
  const suche = datei(r.suche);
  const routing = datei(r.routing);
  if (!karte && !suche && !routing) return null;
  const teile = [karte && 'Karte', suche && 'Suche', routing && 'Routing'].filter(Boolean).join(', ');
  return {
    id: r.id,
    name: r.name,
    quelle: 'kartenserver',
    ...(karte ? { url: karte } : {}),
    sizeBytes: typeof r.sizeBytes === 'number' ? r.sizeBytes : 0,
    ...(typeof r.sha256 === 'string' ? { sha256: r.sha256 } : {}),
    bounds: b as [number, number, number, number],
    ...(typeof r.gebaut === 'string' ? { gebaut: r.gebaut } : {}),
    ...(suche ? { suche } : {}),
    ...(routing ? { routing } : {}),
    note:
      `Vom Kartenserver, gebaut am ${datum(r.gebaut)}: ${teile}.` +
      (routing ? ' Das Routing ersetzt den bisherigen Graphen und gilt dann für dieses Paket.' : ''),
  };
}

/** Die Pakete des Kartenservers. Wirft mit einer Meldung fuer den Nutzer. */
export async function holeKatalog(
  v: KartenserverVerbindung,
  fetchImpl: typeof fetch = fetch,
): Promise<KartenserverEintrag[]> {
  let r: Response;
  try {
    r = await fetchImpl(`${v.url}/v1/katalog`, {
      headers: { Authorization: `Bearer ${v.token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(`Kartenserver nicht erreichbar (${err instanceof Error ? err.message : String(err)})`);
  }
  if (r.status === 401) throw new Error('Der Kartenserver hat das Token abgelehnt');
  if (!r.ok) throw new Error(`Kartenserver antwortet mit HTTP ${r.status}`);
  const daten = (await r.json().catch(() => null)) as unknown;
  if (!Array.isArray(daten)) throw new Error('Unerwartete Antwort vom Kartenserver');
  return daten.map(eintragAus).filter((e): e is KartenserverEintrag => e !== null);
}

/** Ob ein Archivpfad in den Routing-Ordner gehoert -- nichts anderes wird entpackt. */
export function erlaubterArchivpfad(pfad: string): boolean {
  if (pfad.startsWith('/') || pfad.split('/').includes('..')) return false;
  return pfad === 'build-info.json' || pfad === 'tiles' || pfad === 'tiles/' || pfad.startsWith('tiles/');
}

export interface PaketZiele {
  tilesDir: string;
  liteDir: string;
  /** `VALHALLA_TILES_DIR` -- der Graph liegt darin, `build-info.json` daneben. */
  graphDir: string;
}

export interface PaketDeps {
  tar?: (args: string[]) => Promise<string>;
}

async function vorhanden(pfad: string): Promise<boolean> {
  try {
    await stat(pfad);
    return true;
  } catch {
    return false;
  }
}

/**
 * Den Graphen einwechseln: erst komplett auspacken und pruefen, dann den
 * alten Ordner beiseite und den neuen an seine Stelle -- wie es auch
 * `yapaia-build-graph` tut. Valhalla laedt die Kacheln aus demselben Pfad.
 */
export async function graphEinwechseln(tarPfad: string, graphDir: string, deps: PaketDeps = {}): Promise<void> {
  const tar = deps.tar ?? (async (args: string[]) => (await ausfuehren('tar', args, { maxBuffer: 64 * 1024 ** 2 })).stdout);
  const liste = (await tar(['-tf', tarPfad])).split('\n').filter(Boolean);
  const fremd = liste.filter((p) => !erlaubterArchivpfad(p));
  if (fremd.length) throw new Error(`Das Routing-Archiv enthält Unerwartetes: ${fremd.slice(0, 3).join(', ')}`);
  if (!liste.some((p) => p === 'tiles/valhalla.json')) throw new Error('Das Routing-Archiv enthält keine valhalla.json');

  const valhalla = dirname(graphDir);
  const neu = join(valhalla, `.neu-${process.pid}`);
  const alt = join(valhalla, `.alt-${process.pid}`);
  await rm(neu, { recursive: true, force: true });
  await mkdir(neu, { recursive: true });
  await tar(['-xf', tarPfad, '-C', neu]);
  await rm(alt, { recursive: true, force: true });
  if (await vorhanden(graphDir)) await rename(graphDir, alt);
  await rename(join(neu, 'tiles'), graphDir);
  if (await vorhanden(join(neu, 'build-info.json'))) await rename(join(neu, 'build-info.json'), join(valhalla, 'build-info.json'));
  await rm(neu, { recursive: true, force: true });
  await rm(alt, { recursive: true, force: true });
}

async function ladeGeprueft(
  url: string,
  ziel: string,
  sha256: string | undefined,
  ctx: { jobId: string; jobs: JobRegistry; token: string; davor: number; gesamt: number },
): Promise<void> {
  await mkdir(dirname(ziel), { recursive: true });
  const teil = `${ziel}.part`;
  await streamToFile({
    url,
    dest: teil,
    resumeFrom: await existingPartBytes(teil),
    jobId: ctx.jobId,
    jobs: ctx.jobs,
    headers: { Authorization: `Bearer ${ctx.token}` },
    fortschritt: { davor: ctx.davor, gesamt: ctx.gesamt },
  });
  if (sha256) {
    const ist = await hashFile(teil);
    if (ist.toLowerCase() !== sha256.toLowerCase()) {
      await rm(teil, { force: true });
      throw Object.assign(new Error(`Prüfsumme stimmt nicht (${url.split('/').pop()})`), { code: 'HASH_MISMATCH' });
    }
  }
}

/** Laedt und installiert ein Paket im Hintergrund. */
export function runPaketJob(
  jobId: string,
  jobs: JobRegistry,
  eintrag: KartenserverEintrag,
  ziele: PaketZiele,
  token: string,
  deps: PaketDeps = {},
): Promise<void> {
  return (async () => {
    const teile: Array<{ was: string; datei: PaketDatei; ziel: string }> = [];
    if (eintrag.url) {
      teile.push({ was: 'Karte', datei: { url: eintrag.url, sizeBytes: eintrag.sizeBytes, sha256: eintrag.sha256 }, ziel: finalFilePath(ziele.tilesDir, eintrag.id) });
    }
    if (eintrag.suche) teile.push({ was: 'Suchindex', datei: eintrag.suche, ziel: join(ziele.liteDir, `lite_search-${eintrag.id}.db`) });
    if (eintrag.routing) {
      teile.push({ was: 'Routing', datei: eintrag.routing, ziel: join(dirname(ziele.graphDir), `${eintrag.id}-routing.tar`) });
    }
    const gesamt = teile.reduce((s, t) => s + t.datei.sizeBytes, 0);
    jobs.markRunning(jobId, gesamt);
    let davor = 0;
    try {
      // Erst ALLES laden und pruefen, dann einwechseln: ein Abbruch mitten im
      // Laden laesst die bisherigen Daten unangetastet.
      for (const t of teile) {
        jobs.setNote(jobId, `${t.was} wird geladen …`);
        // `<ziel>.part` -- fuer die Karte dieselbe Datei wie beim normalen
        // Download (`partFilePath`), damit ein Abbruch dort weitermacht.
        await ladeGeprueft(t.datei.url, t.ziel, t.datei.sha256, { jobId, jobs, token, davor, gesamt });
        davor += t.datei.sizeBytes;
        if (jobs.isCancelled(jobId)) throw Object.assign(new Error('Abgebrochen'), { code: 'CANCELLED' });
      }
      jobs.setNote(jobId, 'Wird installiert …');
      for (const t of teile) {
        if (t.was === 'Routing') {
          await graphEinwechseln(`${t.ziel}.part`, ziele.graphDir, deps);
          await rm(`${t.ziel}.part`, { force: true });
        } else {
          await rename(`${t.ziel}.part`, t.ziel);
        }
      }
      jobs.setNote(jobId, `Installiert: ${teile.map((t) => t.was).join(', ')}`);
      jobs.markDone(jobId);
    } catch (err) {
      const e = err as Error & { code?: string };
      jobs.markError(jobId, {
        code: jobs.isCancelled(jobId) ? 'CANCELLED' : (e.code ?? 'DOWNLOAD_FAILED'),
        message: jobs.isCancelled(jobId) ? 'Abgebrochen' : e.message,
      });
    }
  })();
}
