/* eslint-disable no-undef -- `fetch`/`AbortSignal` sind Standard-Globale in Node 22. */

/**
 * Anmeldung beim Supervisor und Bereitstellen der Integration
 * (docs/integration-protokoll.md, Abschnitte 4 und 9).
 *
 * Beides nur im Add-on: ohne `SUPERVISOR_TOKEN` gibt es keinen Supervisor, und
 * ohne HA-Konfigurationsordner nichts, wohin die Integration koennte. Ein
 * eigenstaendig laufender Core tut dann einfach nichts davon.
 */

import { cp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { MODUL, NAME, PROTOKOLL, type Identitaet } from './beschreibung.js';

type Logger = { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void };
type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const SUPERVISOR = 'http://supervisor';

export function discoveryConfig(host: string, port: number, ident: Identitaet, version: string): Record<string, unknown> {
  return { modul: MODUL, instanz: ident.instanz, name: NAME, host, port, token: ident.token, protokoll: PROTOKOLL, version };
}

/** „Yapaia Go gefunden" in Home Assistant. Gibt zurueck, ob es geklappt hat. */
export async function melden(opts: {
  supervisorToken: string | undefined;
  port: number;
  ident: Identitaet;
  version: string;
  logger: Logger;
  fetch?: FetchLike;
}): Promise<boolean> {
  const { supervisorToken, logger } = opts;
  if (!supervisorToken) {
    logger.info('Yapaia-Integration: kein Supervisor -- von Hand einrichten', { port: opts.port, instanz: opts.ident.instanz });
    return false;
  }
  const f = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const kopf = { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' };
  try {
    const info = await f(`${SUPERVISOR}/addons/self/info`, { headers: kopf, signal: AbortSignal.timeout(10_000) });
    const host = ((await info.json()) as { data?: { hostname?: unknown } } | null)?.data?.hostname;
    if (!info.ok || typeof host !== 'string' || !host) {
      logger.warn('Yapaia-Integration: eigener Hostname unbekannt -- keine Anmeldung', { status: info.status });
      return false;
    }
    const res = await f(`${SUPERVISOR}/discovery`, {
      method: 'POST',
      headers: kopf,
      body: JSON.stringify({ service: 'yapaia', config: discoveryConfig(host, opts.port, opts.ident, opts.version) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn('Yapaia-Integration: Anmeldung abgelehnt', { status: res.status });
      return false;
    }
    logger.info('Yapaia-Integration: angemeldet', { host, port: opts.port });
    return true;
  } catch (err) {
    logger.warn('Yapaia-Integration: Supervisor nicht erreichbar', { fehler: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** `1.2.10` > `1.2.9`; fehlende Teile zaehlen als 0. */
export function vergleiche(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

async function manifestVersion(ordner: string): Promise<string | null> {
  try {
    const m = JSON.parse(await readFile(join(ordner, 'manifest.json'), 'utf-8')) as { version?: unknown };
    return typeof m.version === 'string' ? m.version : null;
  } catch {
    return null;
  }
}

/**
 * Legt die mitgebrachte Integration nach `<ha-config>/custom_components/yapaia`,
 * wenn sie dort fehlt oder aelter ist. Mehrere Yapaia-Add-ons bringen sie mit;
 * das neueste gewinnt, gleiche Versionen tun nichts.
 */
export async function integrationBereitstellen(quelle: string, haConfig: string): Promise<'installiert' | 'aktualisiert' | null> {
  const mit = await manifestVersion(quelle);
  if (!mit) return null;
  const ziel = join(haConfig, 'custom_components', 'yapaia');
  const da = await manifestVersion(ziel);
  if (da && vergleiche(da, mit) >= 0) return null;
  await rm(ziel, { recursive: true, force: true });
  await cp(quelle, ziel, { recursive: true });
  return da ? 'aktualisiert' : 'installiert';
}
