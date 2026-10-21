/**
 * ModbusGpsSource gegen einen echten, minimalen Modbus-TCP-Server im
 * Prozess: Rahmen, Transaktions-IDs, Ausnahmen, und was bei einem alten Fix
 * passiert.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as net from 'node:net';
import { Buffer } from 'node:buffer';
import { setImmediate } from 'node:timers';
import { EventBus } from '../../bus/index.js';
import { PositionService } from '../service.js';
import { ModbusGpsSource, parseHostPort } from './index.js';
import { buildReadHoldingRegisters, parseFrames } from './modbusTcp.js';

function floatWords(value: number): number[] {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(value, 0);
  return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
}

function textWords(text: string): number[] {
  const bytes = Buffer.alloc(32);
  bytes.write(text, 'latin1');
  return Array.from({ length: 16 }, (_, i) => bytes.readUInt16BE(i * 2));
}

function gpsBlock(lat: number, lon: number, fixTimeMs: number): number[] {
  return [
    ...floatWords(lat),
    ...floatWords(lon),
    ...textWords(String(fixTimeMs)),
    ...textWords(''),
    ...floatWords(54), // km/h
    0,
    8,
  ];
}

/** Ein Modbus-TCP-Server, der fuer 0x03 ab Adresse 143 `registers` liefert. */
class MockRouter {
  registers: number[] = [];
  exception: number | null = null;
  /** Antwort in zwei TCP-Pakete zerlegen, um die Rahmenbildung zu pruefen. */
  split = false;
  readonly requests: Array<{ unitId: number; address: number; quantity: number }> = [];
  readonly server: net.Server;

  constructor() {
    this.server = net.createServer((socket) => {
      socket.on('data', (chunk: Buffer) => {
        const transactionId = chunk.readUInt16BE(0);
        const unitId = chunk.readUInt8(6);
        const address = chunk.readUInt16BE(8);
        const quantity = chunk.readUInt16BE(10);
        this.requests.push({ unitId, address, quantity });
        let reply: Buffer;
        if (this.exception !== null) {
          reply = Buffer.alloc(9);
          reply.writeUInt16BE(transactionId, 0);
          reply.writeUInt16BE(0, 2);
          reply.writeUInt16BE(3, 4);
          reply.writeUInt8(unitId, 6);
          reply.writeUInt8(0x83, 7);
          reply.writeUInt8(this.exception, 8);
        } else {
          const data = this.registers.slice(0, quantity);
          reply = Buffer.alloc(9 + data.length * 2);
          reply.writeUInt16BE(transactionId, 0);
          reply.writeUInt16BE(0, 2);
          reply.writeUInt16BE(3 + data.length * 2, 4);
          reply.writeUInt8(unitId, 6);
          reply.writeUInt8(0x03, 7);
          reply.writeUInt8(data.length * 2, 8);
          data.forEach((reg, i) => reply.writeUInt16BE(reg, 9 + i * 2));
        }
        if (this.split) {
          socket.write(reply.subarray(0, 5));
          setImmediate(() => socket.write(reply.subarray(5)));
        } else {
          socket.write(reply);
        }
      });
    });
  }

  async listen(): Promise<number> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    return (this.server.address() as net.AddressInfo).port;
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

const silent = { info: () => {}, warn: () => {} };

describe('Modbus-Rahmen', () => {
  it('baut eine Leseanfrage nach Spezifikation', () => {
    const frame = buildReadHoldingRegisters(7, 1, 143, 40);
    expect([...frame]).toEqual([0, 7, 0, 0, 0, 6, 1, 3, 0, 143, 0, 40]);
  });

  it('haelt einen unvollstaendigen Rahmen fuer das naechste Paket zurueck', () => {
    const full = Buffer.from([0, 1, 0, 0, 0, 7, 1, 3, 4, 0, 1, 0, 2]);
    const first = parseFrames(full.subarray(0, 10));
    expect(first.frames).toHaveLength(0);
    const second = parseFrames(Buffer.concat([first.rest, full.subarray(10)]));
    expect(second.frames).toEqual([{ transactionId: 1, registers: [1, 2] }]);
    expect(second.rest).toHaveLength(0);
  });
});

describe('parseHostPort', () => {
  it('leer heisst Werkseinstellung', () => {
    expect(parseHostPort('')).toEqual({ host: '192.168.1.1', port: 502 });
    expect(parseHostPort(undefined)).toEqual({ host: '192.168.1.1', port: 502 });
  });

  it('versteht host und host:port', () => {
    expect(parseHostPort('192.168.2.1')).toEqual({ host: '192.168.2.1', port: 502 });
    expect(parseHostPort('router.local:5020')).toEqual({ host: 'router.local', port: 5020 });
  });
});

describe('ModbusGpsSource', () => {
  let router: MockRouter;
  let port: number;
  let bus: EventBus;
  let service: PositionService;
  let source: ModbusGpsSource | null = null;

  beforeEach(async () => {
    router = new MockRouter();
    port = await router.listen();
    bus = new EventBus();
    service = new PositionService({ bus });
  });

  afterEach(async () => {
    source?.dispose();
    source = null;
    service.dispose();
    await router.close();
  });

  function makeSource(now = () => Date.now()): ModbusGpsSource {
    source = new ModbusGpsSource({
      positionService: service,
      host: '127.0.0.1',
      port,
      logger: silent,
      timeoutMs: 500,
      now,
    });
    return source;
  }

  it('liest den GPS-Block in EINER Anfrage ab Adresse 143 und speist die Position ein', async () => {
    const t = Date.now() - 1000;
    router.registers = gpsBlock(47.5, 9.75, t);
    router.split = true;
    const push = vi.spyOn(service, 'pushFix');
    const src = makeSource();

    await src.poll();

    expect(router.requests).toEqual([{ unitId: 1, address: 143, quantity: 40 }]);
    expect(push).toHaveBeenCalledTimes(1);
    const [name, pos] = push.mock.calls[0];
    expect(name).toBe('modbus');
    expect(pos.lat).toBeCloseTo(47.5, 5);
    expect(pos.speed).toBeCloseTo(15, 5);
    expect(src.getStatus()).toEqual({ connection: 'connected', satellites: 8, lastError: null });
    expect(service.getLast()?.source).toBe('modbus');
  });

  it('speist denselben Fix nicht zweimal ein -- ein stehender Zeitstempel ist kein neuer Fix', async () => {
    const t = Date.now() - 1000;
    router.registers = gpsBlock(47.5, 9.75, t);
    const push = vi.spyOn(service, 'pushFix');
    const src = makeSource();

    await src.poll();
    await src.poll();
    expect(push).toHaveBeenCalledTimes(1);

    router.registers = gpsBlock(47.5005, 9.75, t + 1000);
    await src.poll();
    expect(push).toHaveBeenCalledTimes(2);
    // Nach Norden gefahren: die Richtung ergibt sich aus den zwei Fixes.
    expect(push.mock.calls[1][1].heading).toBeCloseTo(0, 0);
  });

  it('uebernimmt keinen Fix, der beim Start schon Stunden alt ist', async () => {
    router.registers = gpsBlock(47.5, 9.75, Date.now() - 3 * 60 * 60 * 1000);
    const push = vi.spyOn(service, 'pushFix');
    await makeSource().poll();
    expect(push).not.toHaveBeenCalled();
  });

  it('meldet eine Modbus-Ausnahme als Fehler und bleibt still', async () => {
    router.exception = 2; // Illegal Data Address
    const push = vi.spyOn(service, 'pushFix');
    const src = makeSource();
    await src.poll();
    expect(push).not.toHaveBeenCalled();
    expect(src.getStatus().connection).toBe('disconnected');
    expect(src.getStatus().lastError).toContain('Ausnahme 2');
  });

  it('wirft nie, wenn der Router gar nicht da ist', async () => {
    await router.close();
    router = new MockRouter(); // fuer afterEach
    port = await router.listen();
    await router.close();
    router = new MockRouter();
    await router.listen();
    const src = makeSource();
    await expect(src.poll()).resolves.toBeUndefined();
    expect(src.getStatus().connection).toBe('disconnected');
    expect(src.getStatus().lastError).not.toBeNull();
  });
});
