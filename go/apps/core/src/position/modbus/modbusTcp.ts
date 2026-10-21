/**
 * Minimaler Modbus-TCP-Client: genau eine Funktion, „Holding Registers
 * lesen" (Funktionscode 0x03). Mehr braucht die RUT50-Quelle nicht.
 *
 * ─── WARUM KEINE BIBLIOTHEK ─────────────────────────────────────────────────
 * Aus demselben Grund wie beim gpsd-Client (`../gpsd/index.ts`): das Protokoll
 * ist fuer diesen einen Zweck winzig -- ein 7-Byte-Kopf (MBAP) und eine
 * 5-Byte-Anfrage --, und jede neue Abhaengigkeit ist Code, der im Fahrzeug
 * mitlaeuft und gepflegt werden will.
 *
 * ─── RAHMEN ─────────────────────────────────────────────────────────────────
 *   MBAP: Transaktions-ID (2) | Protokoll-ID 0 (2) | Laenge (2) | Unit-ID (1)
 *   PDU:  Funktion 0x03 (1) | Startadresse (2) | Anzahl (2)
 * Antwort: MBAP | 0x03 | Bytezahl (1) | Daten (2 × Anzahl)
 * Ausnahme: MBAP | 0x83 | Ausnahmecode (1)
 *
 * TCP erhaelt keine Nachrichtengrenzen. Eingehende Bytes werden deshalb
 * gesammelt und anhand des Laengenfelds im MBAP-Kopf in Rahmen zerlegt.
 */

/* eslint-disable no-undef -- setTimeout/clearTimeout sind Node-Globals;
 * gleiche Begruendung wie in ../service.ts. */

import * as net from 'node:net';
import { Buffer } from 'node:buffer';

const MBAP_LENGTH = 7;
const FC_READ_HOLDING_REGISTERS = 0x03;
/** Obergrenze laut Modbus-Spezifikation fuer eine einzelne Leseanfrage. */
export const MAX_REGISTERS_PER_READ = 125;

/** Baut eine „Read Holding Registers"-Anfrage. Exportiert fuer Tests. */
export function buildReadHoldingRegisters(
  transactionId: number,
  unitId: number,
  address: number,
  quantity: number,
): Buffer {
  const frame = Buffer.alloc(12);
  frame.writeUInt16BE(transactionId & 0xffff, 0);
  frame.writeUInt16BE(0, 2);
  frame.writeUInt16BE(6, 4); // Unit-ID + 5 Byte PDU
  frame.writeUInt8(unitId & 0xff, 6);
  frame.writeUInt8(FC_READ_HOLDING_REGISTERS, 7);
  frame.writeUInt16BE(address, 8);
  frame.writeUInt16BE(quantity, 10);
  return frame;
}

export type ModbusFrame =
  | { transactionId: number; registers: number[] }
  | { transactionId: number; exceptionCode: number };

/**
 * Zerlegt einen Puffer in vollstaendige Antwortrahmen. Gibt die Rahmen und
 * den unverbrauchten Rest zurueck (ein Rahmen kann ueber mehrere
 * TCP-Pakete verteilt ankommen). Exportiert fuer Tests.
 */
export function parseFrames(buffer: Buffer): { frames: ModbusFrame[]; rest: Buffer } {
  const frames: ModbusFrame[] = [];
  let offset = 0;
  while (buffer.length - offset >= MBAP_LENGTH) {
    const length = buffer.readUInt16BE(offset + 4);
    const total = 6 + length;
    if (buffer.length - offset < total) break;
    const transactionId = buffer.readUInt16BE(offset);
    const fc = buffer.readUInt8(offset + 7);
    if (fc === (FC_READ_HOLDING_REGISTERS | 0x80)) {
      frames.push({ transactionId, exceptionCode: buffer.readUInt8(offset + 8) });
    } else if (fc === FC_READ_HOLDING_REGISTERS) {
      const byteCount = buffer.readUInt8(offset + 8);
      const registers: number[] = [];
      for (let i = 0; i + 1 < byteCount && 9 + i + 1 < total; i += 2) {
        registers.push(buffer.readUInt16BE(offset + 9 + i));
      }
      frames.push({ transactionId, registers });
    }
    // Andere Funktionscodes fragt dieser Client nie an -- still verwerfen.
    offset += total;
  }
  return { frames, rest: buffer.subarray(offset) };
}

export class ModbusError extends Error {}

export interface ModbusTcpClientOptions {
  host: string;
  port: number;
  unitId: number;
  /** Wie lange auf Verbindungsaufbau bzw. Antwort gewartet wird. */
  timeoutMs: number;
  createConnection?: (options: net.NetConnectOpts) => net.Socket;
}

interface Pending {
  transactionId: number;
  quantity: number;
  resolve: (registers: number[]) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Haelt EINE Verbindung offen und stellt Anfragen nacheinander. Bricht die
 * Verbindung ab oder laeuft eine Anfrage in die Zeitgrenze, wird der Socket
 * verworfen; die naechste Anfrage baut ihn neu auf. Wann sie das tut,
 * entscheidet der Aufrufer (`./index.ts`, mit Backoff).
 */
export class ModbusTcpClient {
  private readonly opts: ModbusTcpClientOptions;
  private readonly createConnectionFn: (options: net.NetConnectOpts) => net.Socket;
  private socket: net.Socket | null = null;
  private connected: Promise<void> | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private nextTransactionId = 1;
  private pending: Pending | null = null;

  constructor(opts: ModbusTcpClientOptions) {
    this.opts = opts;
    this.createConnectionFn = opts.createConnection ?? net.createConnection;
  }

  isConnected(): boolean {
    return this.socket !== null && this.connected === null;
  }

  async readHoldingRegisters(address: number, quantity: number): Promise<number[]> {
    if (quantity < 1 || quantity > MAX_REGISTERS_PER_READ) {
      throw new ModbusError(`ungueltige Registeranzahl ${quantity}`);
    }
    if (this.pending) {
      throw new ModbusError('es laeuft bereits eine Anfrage');
    }
    await this.ensureConnected();
    const socket = this.socket;
    if (!socket) throw new ModbusError('keine Verbindung');

    const transactionId = this.nextTransactionId;
    this.nextTransactionId = (this.nextTransactionId % 0xffff) + 1;

    return new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new ModbusError(`keine Antwort binnen ${this.opts.timeoutMs} ms`));
      }, this.opts.timeoutMs);
      timer.unref?.();
      this.pending = { transactionId, quantity, resolve, reject, timer };
      socket.write(buildReadHoldingRegisters(transactionId, this.opts.unitId, address, quantity));
    });
  }

  close(): void {
    this.fail(new ModbusError('Verbindung geschlossen'));
  }

  private ensureConnected(): Promise<void> {
    if (this.socket && this.connected === null) return Promise.resolve();
    if (this.connected) return this.connected;

    this.buffer = Buffer.alloc(0);
    this.connected = new Promise<void>((resolve, reject) => {
      let socket: net.Socket;
      try {
        socket = this.createConnectionFn({ host: this.opts.host, port: this.opts.port });
      } catch (err) {
        this.connected = null;
        reject(err instanceof Error ? err : new ModbusError(String(err)));
        return;
      }
      this.socket = socket;

      let settled = false;
      const settle = (err?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        if (err) reject(err);
        else resolve();
      };

      // Ein Router, der den Handshake annimmt und dann schweigt (Firewall),
      // haette sonst eine ewig wartende Verbindung zur Folge.
      const connectTimer = setTimeout(() => {
        const err = new ModbusError(`Verbindungsaufbau dauerte laenger als ${this.opts.timeoutMs} ms`);
        settle(err);
        this.fail(err);
      }, this.opts.timeoutMs);
      connectTimer.unref?.();

      // Jeder Socket bekommt einen 'error'-Listener: ein abgewiesener Router
      // darf den Prozess nie beenden.
      socket.on('error', (err) => {
        settle(err);
        this.fail(err);
      });
      socket.once('close', () => {
        settle(new ModbusError('Verbindung beendet'));
        this.fail(new ModbusError('Verbindung beendet'));
      });
      socket.once('connect', () => {
        this.connected = null;
        settle();
      });
      socket.on('data', (chunk: Buffer) => this.handleData(chunk));
    });
    return this.connected;
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const { frames, rest } = parseFrames(this.buffer);
    this.buffer = rest;
    for (const frame of frames) {
      const pending = this.pending;
      if (!pending || frame.transactionId !== pending.transactionId) continue;
      this.pending = null;
      clearTimeout(pending.timer);
      if ('exceptionCode' in frame) {
        pending.reject(new ModbusError(`Modbus-Ausnahme ${frame.exceptionCode}`));
      } else if (frame.registers.length !== pending.quantity) {
        pending.reject(
          new ModbusError(`erwartet ${pending.quantity} Register, erhalten ${frame.registers.length}`),
        );
      } else {
        pending.resolve(frame.registers);
      }
    }
  }

  /** Verwirft Socket und laufende Anfrage. Idempotent. */
  private fail(err: Error): void {
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    const socket = this.socket;
    this.socket = null;
    this.connected = null;
    this.buffer = Buffer.alloc(0);
    if (socket) {
      socket.removeAllListeners();
      // Ein spaeter 'error' nach destroy() darf nicht unbehandelt bleiben.
      socket.on('error', () => {});
      socket.destroy();
    }
  }
}
