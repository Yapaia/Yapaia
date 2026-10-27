/**
 * Routing in Länderpaketen: Teilgraphen aus EINEM Europa-Bau zusammensetzen.
 *
 * ─── WARUM ──────────────────────────────────────────────────────────────────
 * Ein Routingbau auf dem Gerät dauert Stunden (DE+CH+LI auf einem N100: 8 h).
 * Der Kartenserver baut deshalb EINEN Graphen für ganz Europa und schneidet
 * ihn je Land in Valhalla-Kacheln (`build-info.json`: `teilgraph: true`,
 * `bau: "europa-<datum>"`). Weil alle Länder aus demselben Bau stammen,
 * passen ihre Kacheln zusammen: Deutschland + Schweiz entpackt in einen
 * Ordner routet über die Grenze genau wie der ganze Graph (geprüft
 * 2026-10-25: Zürich–München, Lugano–Berlin, Vaduz–Stuttgart auf den Meter
 * gleich). Grenzkacheln liegen in beiden Paketen, mit identischem Inhalt.
 *
 * ─── REGELN ─────────────────────────────────────────────────────────────────
 *   * Gleicher Bau wie der vorhandene Teilgraph → die Kacheln kommen DAZU.
 *   * Anderer Bau, kein Teilgraph oder ein lokal gebauter Graph → das Paket
 *     ERSETZT den Graphen (wie bisher). Länder aus dem alten Teilgraph gehen
 *     dabei verloren -- das meldet der Aufrufer.
 *   * Je Land merkt sich `teilgraph/<land>.txt`, welche Kacheln es gebracht
 *     hat. Wird eine Karte gelöscht, gehen nur die Kacheln, die kein anderes
 *     Land braucht.
 */
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface BauInfo {
  region?: string;
  regions: string[];
  built_at?: string;
  bau?: string;
  teilgraph?: boolean;
  /** Valhalla-Version, mit der gebaut wurde (z. B. "3.9.1"). */
  valhalla?: string;
}

/** Liest eine `build-info.json` (Text). Unbrauchbares -> null. */
export function bauInfoAus(text: string | null | undefined): BauInfo | null {
  if (!text) return null;
  try {
    const roh = JSON.parse(text) as Record<string, unknown>;
    if (!roh || typeof roh !== 'object') return null;
    const regions = Array.isArray(roh.regions)
      ? roh.regions.filter((r): r is string => typeof r === 'string')
      : typeof roh.region === 'string'
        ? [roh.region]
        : [];
    return {
      ...(typeof roh.region === 'string' ? { region: roh.region } : {}),
      regions,
      ...(typeof roh.built_at === 'string' ? { built_at: roh.built_at } : {}),
      ...(typeof roh.bau === 'string' ? { bau: roh.bau } : {}),
      ...(roh.teilgraph === true ? { teilgraph: true } : {}),
      ...(typeof roh.valhalla === 'string' ? { valhalla: roh.valhalla } : {}),
    };
  } catch {
    return null;
  }
}

/** Die `build-info.json` des laufenden Graphen (liegt NEBEN `graphDir`). */
export function bauInfoJetzt(graphDir: string): BauInfo | null {
  try {
    return bauInfoAus(readFileSync(join(dirname(graphDir), 'build-info.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Kommt das Paket zum vorhandenen Graphen DAZU (statt ihn zu ersetzen)? */
export function passtDazu(paket: BauInfo | null, jetzt: BauInfo | null): boolean {
  return Boolean(paket?.teilgraph && paket.bau && jetzt?.teilgraph && jetzt.bau === paket.bau);
}

function listenDir(graphDir: string): string {
  return join(dirname(graphDir), 'teilgraph');
}

async function vorhanden(pfad: string): Promise<boolean> {
  try {
    await stat(pfad);
    return true;
  } catch {
    return false;
  }
}

async function schreibeBauInfo(graphDir: string, info: BauInfo): Promise<void> {
  const ziel = join(dirname(graphDir), 'build-info.json');
  await writeFile(`${ziel}.tmp`, JSON.stringify({ ...info, regions: [...info.regions].sort() }));
  await rename(`${ziel}.tmp`, ziel);
}

/**
 * Nach dem Einwechseln eines Teilgraph-Pakets (Ersetzen): die Kachelliste des
 * Landes anlegen, die Listen des alten Graphen verwerfen.
 */
export async function teilgraphNeuBegonnen(graphDir: string, region: string, kacheln: readonly string[]): Promise<void> {
  const dir = listenDir(graphDir);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${region}.txt`), `${kacheln.join('\n')}\n`);
}

/**
 * Die Kacheln eines ausgepackten Pakets (`<neu>/tiles/valhalla_tiles/...`)
 * in den laufenden Graphen legen. `kacheln` sind Pfade relativ zu `tiles/`
 * (`valhalla_tiles/2/000/123/456.gph`).
 */
export async function teilgraphErgaenzen(
  neu: string,
  graphDir: string,
  paket: BauInfo,
  jetzt: BauInfo,
  kacheln: readonly string[],
): Promise<void> {
  for (const rel of kacheln) {
    const ziel = join(graphDir, rel);
    await mkdir(dirname(ziel), { recursive: true });
    // Liegt die Kachel schon da (Grenzkachel des Nachbarlands), ist sie
    // identisch -- Ersetzen schadet nicht und ist einfacher als Vergleichen.
    await rename(join(neu, 'tiles', rel), ziel);
  }
  const region = paket.region ?? paket.regions[0] ?? 'unbekannt';
  await mkdir(listenDir(graphDir), { recursive: true });
  await writeFile(join(listenDir(graphDir), `${region}.txt`), `${kacheln.join('\n')}\n`);
  await schreibeBauInfo(graphDir, {
    ...jetzt,
    regions: [...new Set([...jetzt.regions, ...paket.regions])],
    ...(paket.built_at ? { built_at: paket.built_at } : {}),
  });
}

/**
 * Ein Land aus dem Teilgraphen nehmen: seine Kacheln, soweit kein anderes
 * Land sie braucht. Gibt true zurück, wenn sich am Graphen etwas geändert
 * hat (dann muss Valhalla neu laden).
 */
export async function teilgraphEntfernen(graphDir: string, region: string): Promise<boolean> {
  const jetzt = bauInfoJetzt(graphDir);
  const dir = listenDir(graphDir);
  const liste = join(dir, `${region}.txt`);
  if (!jetzt?.teilgraph || !(await vorhanden(liste))) return false;
  const lies = async (pfad: string) => (await readFile(pfad, 'utf8')).split('\n').filter(Boolean);
  const eigene = await lies(liste);
  const andere = new Set<string>();
  for (const datei of await readdir(dir)) {
    if (datei.endsWith('.txt') && datei !== `${region}.txt`) for (const k of await lies(join(dir, datei))) andere.add(k);
  }
  for (const k of eigene) {
    if (!andere.has(k)) await unlink(join(graphDir, k)).catch(() => undefined);
  }
  await unlink(liste);
  await schreibeBauInfo(graphDir, { ...jetzt, regions: jetzt.regions.filter((r) => r !== region) });
  return true;
}

/** Vergleicht "3.9.1" mit "3.5.1": <0, 0, >0. Unlesbares zählt als 0.0.0. */
export function vergleicheVersion(a: string, b: string): number {
  const teile = (v: string) => (/(\d+)\.(\d+)(?:\.(\d+))?/.exec(v) ?? []).slice(1, 4).map((x) => Number(x ?? 0) || 0);
  const [x, y] = [teile(a), teile(b)];
  for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}
