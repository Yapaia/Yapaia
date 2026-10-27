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
 * hinweg. Laenderpakete aus EINEM Europa-Bau kommen zum vorhandenen Graphen
 * dazu (teilgraph.ts); alles andere ERSETZT ihn -- genau wie ein Routingbau
 * hier ueber die installierten Karten.
 */

import { execFile } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import type { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as zlib from 'node:zlib';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { CatalogEntry } from './catalog.js';
import { existingPartBytes, finalFilePath, hashFile, streamToFile } from './download.js';
import type { JobRegistry } from './jobs.js';
import { bauInfoAus, bauInfoJetzt, passtDazu, teilgraphErgaenzen, teilgraphNeuBegonnen, vergleicheVersion } from './teilgraph.js';

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
  /** Der GELADENEN Datei -- bei `komprimiert` also der gepackten. */
  sha256?: string;
  /** Seit 0.64.0: Suche und Routing koennen zstd-gepackt kommen (etwa halbe
   *  Groesse); entpackt wird nach dem Laden und Pruefen. */
  komprimiert?: 'zstd';
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

/**
 * Die Adresse einer Paketdatei -- ueber den Kartenserver, den der Nutzer in
 * Go eingetragen hat.
 *
 * Der Kartenserver schreibt volle URLs in den Katalog und baut sie aus seiner
 * Einstellung `OEFFENTLICHE_URL`. Steht dort etwas Falsches (gemeldet: die
 * Webseiten-Domain ohne `karten.`), fand Go den Katalog, aber jede Datei
 * endete mit 404 -- obwohl die Adresse, ueber die Go den Server ja erreicht,
 * die ganze Zeit richtig war. Pfade unter `/v1/pakete/` laufen deshalb immer
 * ueber diese Adresse; nur fremde Pfade (etwa ein Spiegel) bleiben, wie sie
 * im Katalog stehen.
 */
export function paketUrl(url: string, basis?: string): string {
  if (!basis) return url;
  try {
    const u = new URL(url);
    return u.pathname.startsWith('/v1/pakete/') ? `${basis}${u.pathname}${u.search}` : url;
  } catch {
    return url;
  }
}

function datei(roh: unknown, basis?: string): PaketDatei | undefined {
  if (!roh || typeof roh !== 'object') return undefined;
  const d = roh as Record<string, unknown>;
  if (typeof d.url !== 'string' || !/^https?:\/\//.test(d.url) || typeof d.sizeBytes !== 'number') return undefined;
  // Eine Komprimierung, die Go nicht kennt, kann es nicht auspacken -- dann
  // lieber den Teil weglassen als Unbrauchbares installieren.
  if (d.komprimiert !== undefined && d.komprimiert !== 'zstd') return undefined;
  return {
    url: paketUrl(d.url, basis),
    sizeBytes: d.sizeBytes,
    ...(typeof d.sha256 === 'string' ? { sha256: d.sha256 } : {}),
    ...(d.komprimiert === 'zstd' ? { komprimiert: 'zstd' as const } : {}),
  };
}

function datum(iso: unknown): string {
  const d = typeof iso === 'string' ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('de-DE') : 'unbekannt';
}

/** Ein Eintrag aus `GET /v1/katalog` -- oder `null`, wenn er nicht taugt. */
export function eintragAus(roh: unknown, basis?: string): KartenserverEintrag | null {
  if (!roh || typeof roh !== 'object') return null;
  const r = roh as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID.test(r.id) || typeof r.name !== 'string') return null;
  const b = r.bounds;
  if (!Array.isArray(b) || b.length !== 4 || !b.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  const karte = typeof r.url === 'string' && /^https?:\/\//.test(r.url) ? paketUrl(r.url, basis) : undefined;
  const suche = datei(r.suche, basis);
  const routing = datei(r.routing, basis);
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
      (routing
        ? ' Stammt das Routing aus demselben Bau wie das vorhandene, kommt es dazu; sonst ersetzt es den bisherigen Graphen.'
        : ''),
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
  return daten.map((d) => eintragAus(d, v.url)).filter((e): e is KartenserverEintrag => e !== null);
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
  /** Valhalla nach einer Aenderung am Graphen neu laden. */
  neustart?: () => Promise<void>;
  /** Die eigene Valhalla-Version ("3.9.1"), null = unbekannt. */
  valhallaVersion?: () => Promise<string | null>;
}

async function vorhanden(pfad: string): Promise<boolean> {
  try {
    await stat(pfad);
    return true;
  } catch {
    return false;
  }
}

/** Auspacken und pruefen: nur `tiles/...` und `build-info.json`, mit
 *  valhalla.json. Gibt den Ordner und die Archivliste zurueck. */
async function auspacken(tarPfad: string, graphDir: string, tar: (args: string[]) => Promise<string>) {
  const liste = (await tar(['-tf', tarPfad])).split('\n').filter(Boolean);
  const fremd = liste.filter((p) => !erlaubterArchivpfad(p));
  if (fremd.length) throw new Error(`Das Routing-Archiv enthält Unerwartetes: ${fremd.slice(0, 3).join(', ')}`);
  if (!liste.some((p) => p === 'tiles/valhalla.json')) throw new Error('Das Routing-Archiv enthält keine valhalla.json');
  const neu = join(dirname(graphDir), `.neu-${process.pid}`);
  await rm(neu, { recursive: true, force: true });
  await mkdir(neu, { recursive: true });
  await tar(['-xf', tarPfad, '-C', neu]);
  return { neu, liste };
}

/** Den ausgepackten Graphen an die Stelle des alten setzen. */
async function einsetzen(neu: string, graphDir: string): Promise<void> {
  const valhalla = dirname(graphDir);
  const alt = join(valhalla, `.alt-${process.pid}`);
  await rm(alt, { recursive: true, force: true });
  if (await vorhanden(graphDir)) await rename(graphDir, alt);
  await rename(join(neu, 'tiles'), graphDir);
  if (await vorhanden(join(neu, 'build-info.json'))) await rename(join(neu, 'build-info.json'), join(valhalla, 'build-info.json'));
  await rm(alt, { recursive: true, force: true });
}

function standardTar(): (args: string[]) => Promise<string> {
  return async (args: string[]) => (await ausfuehren('tar', args, { maxBuffer: 64 * 1024 ** 2 })).stdout;
}

/**
 * Den Graphen einwechseln: erst komplett auspacken und pruefen, dann den
 * alten Ordner beiseite und den neuen an seine Stelle -- wie es auch
 * `yapaia-build-graph` tut. Valhalla laedt die Kacheln aus demselben Pfad.
 */
export async function graphEinwechseln(tarPfad: string, graphDir: string, deps: PaketDeps = {}): Promise<void> {
  const { neu } = await auspacken(tarPfad, graphDir, deps.tar ?? standardTar());
  try {
    await einsetzen(neu, graphDir);
  } finally {
    await rm(neu, { recursive: true, force: true });
  }
}

export interface RoutingErgebnis {
  /** `ergaenzt`: zum vorhandenen Teilgraphen dazu; `ersetzt`: neuer Graph. */
  art: 'ergaenzt' | 'ersetzt';
  /** Laender, deren Routing beim Ersetzen verloren ging. */
  verloren: string[];
}

/**
 * Ein Routing-Paket installieren (teilgraph.ts): aus demselben Europa-Bau
 * wie der vorhandene Teilgraph -> dazu, sonst -> ersetzen.
 */
export async function routingInstallieren(tarPfad: string, graphDir: string, deps: PaketDeps = {}): Promise<RoutingErgebnis> {
  const { neu, liste } = await auspacken(tarPfad, graphDir, deps.tar ?? standardTar());
  try {
    const paket = bauInfoAus(await readFile(join(neu, 'build-info.json'), 'utf8').catch(() => null));
    // Ein Graph aus einer NEUEREN Valhalla-Version wird von der eigenen
    // womoeglich nicht gelesen -- dann lieber gar nicht einwechseln.
    if (paket?.valhalla) {
      const eigene = await (deps.valhallaVersion ?? eigeneValhallaVersion)();
      if (eigene && vergleicheVersion(paket.valhalla, eigene) > 0) {
        throw Object.assign(
          new Error(`Dieses Routing braucht Valhalla ${paket.valhalla}, hier läuft ${eigene} – bitte Yapaia Go aktualisieren.`),
          { code: 'VALHALLA_ZU_ALT' },
        );
      }
    }
    const jetzt = bauInfoJetzt(graphDir);
    const kacheln = liste
      .filter((p) => /^tiles\/valhalla_tiles\/.+\.gph$/.test(p))
      .map((p) => p.slice('tiles/'.length));
    if (paket && jetzt && passtDazu(paket, jetzt)) {
      await teilgraphErgaenzen(neu, graphDir, paket, jetzt, kacheln);
      return { art: 'ergaenzt', verloren: [] };
    }
    await einsetzen(neu, graphDir);
    if (paket?.teilgraph) {
      await teilgraphNeuBegonnen(graphDir, paket.region ?? paket.regions[0] ?? 'unbekannt', kacheln);
    } else {
      await rm(join(dirname(graphDir), 'teilgraph'), { recursive: true, force: true });
    }
    const bleibt = new Set(paket?.regions ?? []);
    return { art: 'ersetzt', verloren: (jetzt?.regions ?? []).filter((r) => !bleibt.has(r)) };
  } finally {
    await rm(neu, { recursive: true, force: true });
  }
}

/** Eine zstd-Datei entpacken (Node >= 22.15 bringt zstd in zlib mit). */
export async function zstdEntpacken(quelle: string, ziel: string): Promise<void> {
  const erzeuge = (zlib as unknown as { createZstdDecompress?: () => Transform }).createZstdDecompress;
  if (!erzeuge) throw new Error('Diese Node-Version kann kein zstd entpacken');
  await pipeline(createReadStream(quelle), erzeuge(), createWriteStream(ziel));
}

let eigeneVersion: Promise<string | null> | null = null;
/** `valhalla_service --version` (einmal je Prozess). Ohne Valhalla: null. */
export function eigeneValhallaVersion(): Promise<string | null> {
  eigeneVersion ??= ausfuehren('valhalla_service', ['--version'])
    .then(({ stdout }) => /(\d+\.\d+\.\d+)/.exec(stdout)?.[1] ?? null)
    .catch(() => null);
  return eigeneVersion;
}

/** Valhalla neu laden lassen (s6 im Add-on). Ohne s6 -- Tests, Entwicklung --
 *  passiert nichts; der Dienst liest den Graphen dann beim naechsten Start. */
export async function valhallaNeuStarten(): Promise<void> {
  if (!(await vorhanden('/run/service/valhalla'))) return;
  await ausfuehren('s6-svc', ['-r', '/run/service/valhalla']).catch(() => undefined);
}

async function ladeGeprueft(
  datei: PaketDatei,
  ziel: string,
  ctx: { jobId: string; jobs: JobRegistry; token: string; davor: number; gesamt: number },
): Promise<void> {
  const { url, sha256, sizeBytes } = datei;
  await mkdir(dirname(ziel), { recursive: true });
  const teil = `${ziel}.part`;
  const name = url.split('/').pop();
  let schon = await existingPartBytes(teil);
  // Ein frueherer Versuch kann diese Datei schon ganz geladen haben und erst
  // an der naechsten gescheitert sein. Dann nicht ab ihrem Ende weiterladen
  // wollen -- der Server antwortet darauf mit 416 --, sondern nur pruefen.
  // Ist die Teil-Datei groesser als die Datei, taugt sie nicht: neu laden.
  if (sizeBytes > 0 && schon > sizeBytes) {
    await rm(teil, { force: true });
    schon = 0;
  }
  if (sizeBytes <= 0 || schon < sizeBytes) await streamToFile({
    url,
    dest: teil,
    resumeFrom: schon,
    jobId: ctx.jobId,
    jobs: ctx.jobs,
    headers: { Authorization: `Bearer ${ctx.token}` },
    fortschritt: { davor: ctx.davor, gesamt: ctx.gesamt },
  }).catch((err: unknown) => {
    const status = /HTTP status (\d+)/.exec(err instanceof Error ? err.message : '')?.[1];
    if (!status) throw err;
    const was = status === '404' ? 'nicht gefunden' : status === '401' ? 'Token abgelehnt' : `HTTP ${status}`;
    throw Object.assign(new Error(`Kartenserver: ${name} ${was} (${url})`), { code: 'DOWNLOAD_FAILED' });
  });
  if (sha256) {
    const ist = await hashFile(teil);
    if (ist.toLowerCase() !== sha256.toLowerCase()) {
      await rm(teil, { force: true });
      throw Object.assign(new Error(`Prüfsumme stimmt nicht (${name})`), { code: 'HASH_MISMATCH' });
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
      // Gepackte Teile werden als `<ziel>.zst.part` geladen und geprueft.
      const ladeziel = (t: { datei: PaketDatei; ziel: string }) => (t.datei.komprimiert ? `${t.ziel}.zst` : t.ziel);
      for (const t of teile) {
        jobs.setNote(jobId, `${t.was} wird geladen …`);
        // `<ziel>.part` -- fuer die Karte dieselbe Datei wie beim normalen
        // Download (`partFilePath`), damit ein Abbruch dort weitermacht.
        await ladeGeprueft(t.datei, ladeziel(t), { jobId, jobs, token, davor, gesamt });
        davor += t.datei.sizeBytes;
        if (jobs.isCancelled(jobId)) throw Object.assign(new Error('Abgebrochen'), { code: 'CANCELLED' });
      }
      // Erst entpacken, dann einwechseln -- wie oben: ein Fehler hier laesst
      // die bisherigen Daten unangetastet.
      for (const t of teile) {
        if (!t.datei.komprimiert) continue;
        jobs.setNote(jobId, `${t.was} wird entpackt …`);
        await zstdEntpacken(`${ladeziel(t)}.part`, `${t.ziel}.part`);
        await rm(`${ladeziel(t)}.part`, { force: true });
      }
      jobs.setNote(jobId, 'Wird installiert …');
      let routing: RoutingErgebnis | null = null;
      for (const t of teile) {
        if (t.was === 'Routing') {
          routing = await routingInstallieren(`${t.ziel}.part`, ziele.graphDir, deps);
          await rm(`${t.ziel}.part`, { force: true });
          await (deps.neustart ?? valhallaNeuStarten)();
        } else {
          await rename(`${t.ziel}.part`, t.ziel);
        }
      }
      let note = `Installiert: ${teile.map((t) => t.was).join(', ')}`;
      if (routing?.art === 'ergaenzt') note += ' (Routing zum vorhandenen hinzugefügt)';
      if (routing && routing.verloren.length > 0) {
        note +=
          `. Das Routing für ${routing.verloren.join(', ')} stammte aus einem anderen Bau und ist ersetzt worden – ` +
          'dafür die Pakete dieser Länder erneut laden.';
      }
      jobs.setNote(jobId, note);
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
