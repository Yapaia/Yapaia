/**
 * Position aus dem GPS-Empfaenger eines Teltonika-Routers (RUT50 und
 * Geschwister) ueber Modbus TCP -- `gps_source: rut50`.
 *
 * ─── WOZU DIESE QUELLE ──────────────────────────────────────────────────────
 * Viele Wohnmobile haben ohnehin einen LTE-Router mit GNSS-Empfaenger an Bord,
 * oft mit Dachantenne. Dessen Position ist besser als die eines Telefons
 * hinter der Windschutzscheibe, und sie ist da, ohne dass ein zweiter
 * USB-Empfaenger gesteckt werden muss. Der RUT50 gibt sie ueber seinen
 * Modbus-TCP-Server heraus (RutOS: Services → Modbus → Modbus TCP Server,
 * Port 502, Unit-ID 1).
 *
 * ─── ABLAUF ─────────────────────────────────────────────────────────────────
 * Einmal pro Sekunde werden die 40 GPS-Register (`./rut50.ts`) in EINER
 * Anfrage gelesen. Ein neuer Fix geht -- wie bei gpsd -- erst durch den
 * `PlausibilityGuard` und dann an `PositionService.pushFix('modbus', …)`.
 *
 * ─── EIN ALTER FIX IST KEIN FIX ─────────────────────────────────────────────
 * Verliert der Router den Empfang, stehen in den Registern weiter die
 * letzten Koordinaten. Sie jede Sekunde erneut einzuspeisen hiesse, eine
 * Erinnerung als Messung auszugeben -- und die GPS-Verlust-Behandlung (W-01)
 * griffe nie. Deshalb wird ein Fix nur weitergereicht, wenn sich sein
 * Zeitpunkt geaendert hat. Bleibt er stehen, verstummt die Quelle, und
 * `PositionService` meldet nach seinem Aktivitaetsfenster den Verlust.
 *
 * ─── WAS HIER BEWUSST NICHT PASSIERT ────────────────────────────────────────
 * Kein Fehler nach aussen. Ein ausgeschalteter Router oder ein abgeschalteter
 * Modbus-Server ist ein erwarteter Zustand: die Quelle bleibt inaktiv,
 * versucht es mit wachsendem Abstand (1 s bis 5 s) weiter, und die
 * Navigation faellt auf die naechste Quelle zurueck (ADR-007).
 */

/* eslint-disable no-undef -- setTimeout/clearTimeout sind Node-Globals;
 * gleiche Begruendung wie in ../service.ts. */

import type * as net from 'node:net';
import type { Position } from '@yapaia/shared';
import { PlausibilityGuard } from '../guard.js';
import type { PositionService, PositionSource } from '../service.js';
import { bearingDeg, haversineDistanceM } from '../simulator/geo.js';
import { ModbusTcpClient } from './modbusTcp.js';
import { RUT50_GPS_REGISTER_COUNT, RUT50_GPS_START_ADDRESS, decodeRut50Gps } from './rut50.js';

/** Werkseinstellung des RUT50 im LAN. */
export const RUT50_DEFAULT_HOST = '192.168.1.1';
export const MODBUS_DEFAULT_PORT = 502;
export const MODBUS_DEFAULT_UNIT_ID = 1;

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_MIN_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 5000;

/**
 * Unter dieser Strecke zwischen zwei Fixes wird keine Richtung abgeleitet:
 * das waere Messrauschen, und die Karte drehte sich danach.
 */
const MIN_HEADING_DISTANCE_M = 2;

/**
 * Aelter als das (gemessen an der Uhr des Kerns) wird ein Fix beim Start
 * nicht uebernommen. Grosszuegig, weil Router- und Kern-Uhr nicht
 * zwingend gleich gehen; es geht nur darum, einen Fix von gestern nicht als
 * „jetzt" auszugeben.
 */
export const MAX_FIX_AGE_MS = 5 * 60 * 1000;

export type ModbusConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface ModbusGpsStatus {
  connection: ModbusConnectionState;
  satellites: number | null;
  /** Letzte Fehlermeldung, fuer Protokoll und Installationspruefung. */
  lastError: string | null;
}

export interface ModbusGpsLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface ModbusGpsSourceOptions {
  positionService: PositionService;
  host?: string;
  port?: number;
  unitId?: number;
  logger?: ModbusGpsLogger;
  pollIntervalMs?: number;
  timeoutMs?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  guard?: PlausibilityGuard;
  /** Injizierbar fuer Tests. */
  createConnection?: (options: net.NetConnectOpts) => net.Socket;
  now?: () => number;
}

const defaultLogger: ModbusGpsLogger = {
  info: () => {},
  warn: (msg, meta) => console.warn(msg, meta ?? ''),
};

/**
 * `gps_source: rut50` erlaubt neben dem Hostnamen auch „host:port". Ein
 * leerer Eintrag heisst Werkseinstellung.
 */
export function parseHostPort(raw: string | undefined): { host: string; port: number } {
  const value = (raw ?? '').trim();
  if (value.length === 0 || value === 'null') {
    return { host: RUT50_DEFAULT_HOST, port: MODBUS_DEFAULT_PORT };
  }
  const m = /^(.+):(\d{1,5})$/.exec(value);
  if (m && !m[1].includes(':')) {
    const port = parseInt(m[2], 10);
    if (port > 0 && port <= 65535) return { host: m[1], port };
  }
  return { host: value, port: MODBUS_DEFAULT_PORT };
}

export class ModbusGpsSource implements PositionSource {
  readonly name = 'modbus' as const;

  private readonly positionService: PositionService;
  private readonly host: string;
  private readonly port: number;
  private readonly logger: ModbusGpsLogger;
  private readonly pollIntervalMs: number;
  private readonly minBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly guard: PlausibilityGuard;
  private readonly now: () => number;
  private readonly client: ModbusTcpClient;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private backoffMs: number;
  private connection: ModbusConnectionState = 'disconnected';
  private satellites: number | null = null;
  private lastError: string | null = null;
  /** Damit ein dauerhaft fehlender Router das Protokoll nicht vollschreibt. */
  private errorLogged = false;
  private noFixLogged = false;
  private lastFixTimeMs: number | null = null;
  private lastPosition: Position | null = null;

  constructor(opts: ModbusGpsSourceOptions) {
    this.positionService = opts.positionService;
    this.host = opts.host ?? RUT50_DEFAULT_HOST;
    this.port = opts.port ?? MODBUS_DEFAULT_PORT;
    this.logger = opts.logger ?? defaultLogger;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.minBackoffMs = opts.minBackoffMs ?? DEFAULT_MIN_BACKOFF_MS;
    this.maxBackoffMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.backoffMs = this.minBackoffMs;
    this.guard = opts.guard ?? new PlausibilityGuard();
    this.now = opts.now ?? Date.now;
    this.client = new ModbusTcpClient({
      host: this.host,
      port: this.port,
      unitId: opts.unitId ?? MODBUS_DEFAULT_UNIT_ID,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      createConnection: opts.createConnection,
    });
  }

  /** Beginnt mit dem Abfragen. Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.backoffMs = this.minBackoffMs;
    this.logger.info('modbus: lese GPS vom Router', { host: this.host, port: this.port });
    this.schedule(0);
  }

  getStatus(): ModbusGpsStatus {
    return { connection: this.connection, satellites: this.satellites, lastError: this.lastError };
  }

  dispose(): void {
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.client.close();
    this.connection = 'disconnected';
  }

  private schedule(delayMs: number): void {
    if (!this.started) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, delayMs);
    this.timer.unref?.();
  }

  /** Ein Abfragedurchgang. Oeffentlich, damit Tests ihn gezielt ausloesen koennen. */
  async poll(): Promise<void> {
    let registers: number[];
    try {
      if (!this.client.isConnected()) this.connection = 'connecting';
      registers = await this.client.readHoldingRegisters(RUT50_GPS_START_ADDRESS, RUT50_GPS_REGISTER_COUNT);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.connection = 'disconnected';
      this.lastError = message;
      if (!this.errorLogged) {
        this.errorLogged = true;
        this.logger.warn(
          'modbus: GPS des Routers nicht lesbar -- Quelle bleibt inaktiv, neuer Versuch laeuft. ' +
            'Ist im Router unter Services → Modbus → Modbus TCP Server der Server eingeschaltet ' +
            'und der Zugriff aus dem LAN erlaubt?',
          { host: this.host, port: this.port, error: message },
        );
      }
      // Nach einer Luecke darf der naechste Fix nicht mit dem letzten vor
      // ihr auf Spruenge verglichen werden.
      this.guard.reset();
      const delay = this.backoffMs;
      this.backoffMs = Math.min(this.maxBackoffMs, this.backoffMs * 2);
      this.schedule(delay);
      return;
    }

    if (this.errorLogged) {
      this.logger.info('modbus: Verbindung zum Router steht', { host: this.host, port: this.port });
    }
    this.errorLogged = false;
    this.lastError = null;
    this.connection = 'connected';
    this.backoffMs = this.minBackoffMs;
    this.handleRegisters(registers);
    this.schedule(this.pollIntervalMs);
  }

  private handleRegisters(registers: number[]): void {
    const reading = decodeRut50Gps(registers, this.now);
    this.satellites = reading.satellites;
    if (!reading.position) {
      if (!this.noFixLogged) {
        this.noFixLogged = true;
        this.logger.info('modbus: Router erreichbar, hat aber (noch) keinen GPS-Fix', {
          satellites: reading.satellites,
        });
      }
      return;
    }
    this.noFixLogged = false;

    // Derselbe Fix wie beim letzten Mal: nichts Neues -- siehe Dateikopf.
    if (reading.fixTimeMs !== null) {
      if (reading.fixTimeMs === this.lastFixTimeMs) return;
      this.lastFixTimeMs = reading.fixTimeMs;
      if (this.now() - reading.fixTimeMs > MAX_FIX_AGE_MS) return;
    }

    const position = this.withHeading(reading.position);
    const verdict = this.guard.evaluate(position);
    if (!verdict.accept || !verdict.position) {
      this.logger.warn('modbus: guard rejected fix', { reason: verdict.reason });
      return;
    }
    this.lastPosition = verdict.position;
    this.positionService.pushFix('modbus', verdict.position);
  }

  /**
   * Der Router meldet keine Fahrtrichtung. Ohne sie zeigt der Pfeil auf der
   * Karte nirgendwohin, und die Karte richtet sich nicht nach vorn aus. Sie
   * ergibt sich aus dem Weg zwischen dem letzten und diesem Fix -- im Stand
   * verwirft `PositionService` sie ohnehin (`heading.ts`).
   */
  private withHeading(position: Position): Position {
    const prev = this.lastPosition;
    if (!prev) return position;
    if (haversineDistanceM(prev, position) < MIN_HEADING_DISTANCE_M) {
      return { ...position, heading: prev.heading };
    }
    return { ...position, heading: Math.round(bearingDeg(prev, position) * 10) / 10 };
  }
}
