/* eslint-disable no-undef -- `setInterval`/`clearInterval` sind Standard-Globale
 * in Node 22; dieselbe Begruendung wie in ha/client.ts. */

/**
 * Das Yapaia-Protokoll fuer Go (docs/integration-protokoll.md).
 *
 * Go meldet sich bei der zentralen Integration „Yapaia" an und erscheint dort
 * als Geraet „Yapaia Go" mit echten, bedienbaren Entitaeten, Aktionen
 * (`yapaia.go_ziel_setzen` …) und Ausloesern („Ziel erreicht"). Das ist DER
 * Weg zu Home Assistant; MQTT gibt es zusaetzlich (`mqtt/`).
 *
 * Die Schnittstelle liegt unter `/yapaia/v1/*` und damit AUSSERHALB von
 * `/api/` -- der allgemeine API-Schutz (`auth/plugin.ts`) greift hier nicht.
 * Stattdessen gilt das eigene Token aus der Anmeldung, immer, auch im
 * Ingress-Betrieb.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import type { NavState, Position } from '@yapaia/shared';
import type { EventBus, ArrivedPayload } from '../bus/index.js';
import { API, aenderungen, beschreibung, werte, type GoZustand, type Identitaet } from './beschreibung.js';

export type { Identitaet } from './beschreibung.js';

/**
 * Instanz-Kennung und Token: einmal erzeugt, danach aus der Datei. Ohne Pfad
 * (Tests, In-Memory-Datenbank) gelten sie nur bis zum naechsten Start.
 */
export function ladeIdentitaet(pfad: string | null): Identitaet {
  let daten: Partial<Identitaet> = {};
  if (pfad === null) return { instanz: randomBytes(6).toString('hex'), token: randomBytes(32).toString('base64url') };
  try {
    daten = JSON.parse(readFileSync(pfad, 'utf-8')) as Partial<Identitaet>;
  } catch {
    // fehlt oder kaputt: neu erzeugen
  }
  const instanz = typeof daten.instanz === 'string' && daten.instanz ? daten.instanz : randomBytes(6).toString('hex');
  const token = typeof daten.token === 'string' && daten.token ? daten.token : randomBytes(32).toString('base64url');
  if (daten.instanz !== instanz || daten.token !== token) {
    mkdirSync(dirname(pfad), { recursive: true });
    writeFileSync(pfad, JSON.stringify({ instanz, token }));
    try {
      chmodSync(pfad, 0o600);
    } catch {
      // Dateisysteme ohne Rechte (z. B. Windows in der Entwicklung)
    }
  }
  return { instanz, token };
}

export function tokenPasst(erwartet: string, header: string | undefined): boolean {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(erwartet);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Ein anderes Yapaia-Modul, wie es die Integration meldet (Abschnitt 8). */
export interface Partner {
  modul: string;
  instanz: string;
  name?: string;
  url?: string;
  token?: string;
  version?: string;
  media_player?: string;
  faehigkeiten?: string[];
}

/** Ein Fehler, den die Integration dem Nutzer zeigt. */
export class AktionsFehler extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export type Aktion = (daten: Record<string, unknown>) => Promise<unknown>;

export interface ProtokollDeps {
  ident: Identitaet;
  version: string;
  bus: EventBus;
  /** Alles ausser Fahrzustand und Position (die kommen ueber den Bus). */
  zusatz: () => Omit<GoZustand, 'navState' | 'position'>;
  aktionen: Record<string, Aktion>;
  logger: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void };
  intervallMs?: number;
  setIntervalImpl?: (fn: () => void, ms: number) => unknown;
  clearIntervalImpl?: (handle: unknown) => void;
}

interface Verbindung {
  senden: (nachricht: unknown) => void;
  zuletzt: Record<string, unknown>;
}

export class YapaiaProtokoll {
  private navState: NavState | null = null;
  private position: Position | null = null;
  private readonly verbindungen = new Set<Verbindung>();
  private readonly abmelden: Array<() => void> = [];
  private partnerListe: Partner[] | null = null;
  private zuSchnellZuletzt = false;
  private timer: unknown = null;

  constructor(private readonly deps: ProtokollDeps) {
    const { bus } = deps;
    this.abmelden.push(
      bus.subscribe('nav/state', (s) => {
        this.navState = s as NavState;
      }),
      bus.subscribe('pos/update', (p) => {
        const pos = p as Position;
        if (typeof pos?.lat === 'number' && typeof pos?.lon === 'number') this.position = pos;
      }),
      bus.subscribe('event/arrived', (p) => {
        const ziel = (p as ArrivedPayload | undefined)?.destination?.name ?? null;
        this.ereignis('ziel_erreicht', { ziel });
      }),
      bus.subscribe('event/gps_lost', () => this.ereignis('gps_verloren', {})),
      bus.subscribe('event/reroute_failed', () => this.ereignis('neuberechnung_fehlgeschlagen', {})),
    );
    const setIntervalFn = deps.setIntervalImpl ?? ((fn, ms) => setInterval(fn, ms));
    this.timer = setIntervalFn(() => this.takt(), deps.intervallMs ?? 1_000);
  }

  beschreibung(): Record<string, unknown> {
    return beschreibung(this.deps.ident, this.deps.version);
  }

  werte(): Record<string, unknown> {
    return werte({ ...this.deps.zusatz(), navState: this.navState, position: this.position });
  }

  /** Ob die Integration gerade verbunden ist -- dann liefert SIE die Entitaeten. */
  verbunden(): boolean {
    return this.verbindungen.size > 0;
  }

  /** `null`, solange die Integration nie eine Liste geschickt hat. */
  partner(): readonly Partner[] | null {
    return this.partnerListe;
  }

  setzePartner(liste: Partner[]): void {
    this.partnerListe = liste;
    this.deps.logger.info('Yapaia-Partner', {
      partner: liste.map((p) => `${p.name ?? p.modul} (${p.modul})`).join(', ') || 'keine',
    });
  }

  /** Eine neue Live-Verbindung: zuerst der vollstaendige Zustand. */
  verbinde(senden: (nachricht: unknown) => void): () => void {
    const v: Verbindung = { senden, zuletzt: this.werte() };
    this.verbindungen.add(v);
    senden({ typ: 'zustand', werte: v.zuletzt });
    return () => {
      this.verbindungen.delete(v);
    };
  }

  /** Einmal je Sekunde: nur die Aenderungen an jede Verbindung. */
  takt(): void {
    if (this.verbindungen.size === 0) {
      this.zuSchnellZuletzt = false;
      return;
    }
    const neu = this.werte();
    const zuSchnell = neu.zu_schnell === true;
    if (zuSchnell && !this.zuSchnellZuletzt) {
      this.ereignis('zu_schnell', { tempo: neu.tempo, grenze_kmh: neu.grenze_kmh });
    }
    this.zuSchnellZuletzt = zuSchnell;
    for (const v of this.verbindungen) {
      const diff = aenderungen(v.zuletzt, neu);
      if (Object.keys(diff).length > 0) {
        v.zuletzt = neu;
        v.senden({ typ: 'zustand', werte: diff });
      }
    }
  }

  ereignis(name: string, daten: Record<string, unknown>): void {
    for (const v of this.verbindungen) v.senden({ typ: 'ereignis', name, daten });
  }

  async fuehreAus(name: string, daten: Record<string, unknown>): Promise<unknown> {
    const aktion = Object.prototype.hasOwnProperty.call(this.deps.aktionen, name) ? this.deps.aktionen[name] : undefined;
    if (!aktion) throw new AktionsFehler(`Unbekannte Aktion ${name}`, 404);
    const ergebnis = await aktion(daten);
    // Den neuen Zustand gleich melden statt erst im naechsten Takt.
    this.takt();
    return ergebnis;
  }

  dispose(): void {
    for (const ab of this.abmelden.splice(0)) ab();
    if (this.timer !== null) {
      (this.deps.clearIntervalImpl ?? ((h) => clearInterval(h as never)))(this.timer);
      this.timer = null;
    }
    this.verbindungen.clear();
  }
}

function fehlerStatus(err: unknown): number {
  const s = (err as { status?: unknown; httpStatus?: unknown })?.status ?? (err as { httpStatus?: unknown })?.httpStatus;
  return typeof s === 'number' && s >= 400 && s < 600 ? s : 500;
}

/** Die Wege unter `/yapaia/v1`. Setzt voraus, dass @fastify/websocket registriert ist. */
export async function registriereProtokoll(fastify: FastifyInstance, protokoll: YapaiaProtokoll, token: string): Promise<void> {
  const nurMitToken = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!tokenPasst(token, request.headers.authorization)) {
      await reply.code(401).send({ ok: false, fehler: 'Token fehlt oder falsch' });
    }
  };

  fastify.get(`${API}/beschreibung`, { onRequest: nurMitToken }, async () => protokoll.beschreibung());

  fastify.get(`${API}/live`, { websocket: true, onRequest: nurMitToken }, (socket: WebSocket) => {
    const trennen = protokoll.verbinde((nachricht) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(nachricht));
    });
    socket.on('close', trennen);
    socket.on('error', trennen);
  });

  fastify.post<{ Params: { name: string } }>(`${API}/aktion/:name`, { onRequest: nurMitToken }, async (request, reply) => {
    const daten = request.body && typeof request.body === 'object' ? (request.body as Record<string, unknown>) : {};
    try {
      const ergebnis = await protokoll.fuehreAus(request.params.name, daten);
      return { ok: true, ...(ergebnis !== undefined ? { ergebnis } : {}) };
    } catch (err) {
      return reply.code(fehlerStatus(err)).send({ ok: false, fehler: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post(`${API}/partner`, { onRequest: nurMitToken }, async (request, reply) => {
    const liste = (request.body as { partner?: unknown } | null)?.partner;
    if (!Array.isArray(liste)) return reply.code(400).send({ ok: false, fehler: 'partner fehlt' });
    protokoll.setzePartner(liste.filter((p): p is Partner => !!p && typeof p === 'object' && typeof (p as Partner).modul === 'string'));
    return { ok: true };
  });
}
