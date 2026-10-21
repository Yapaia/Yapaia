import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { checkPosition, validatePosition } from '@yapaia/shared';
import {
  RUT50_GPS_REGISTER_COUNT,
  decodeNumber32,
  decodeRut50Gps,
  decodeText,
  parseFixTime,
} from './rut50.js';

function floatWords(value: number): [number, number] {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(value, 0);
  return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
}

function uintWords(value: number): [number, number] {
  return [(value >>> 16) & 0xffff, value & 0xffff];
}

function textWords(text: string, registers = 16): number[] {
  const bytes = Buffer.alloc(registers * 2);
  bytes.write(text, 'latin1');
  return Array.from({ length: registers }, (_, i) => bytes.readUInt16BE(i * 2));
}

/** Baut den 40-Register-Block ab Adresse 143 so, wie der RUT50 ihn liefert. */
function block(opts: {
  lat: number;
  lon: number;
  fixTime?: string;
  dateTime?: string;
  speed?: [number, number];
  satellites?: [number, number];
}): number[] {
  const regs = [
    ...floatWords(opts.lat),
    ...floatWords(opts.lon),
    ...textWords(opts.fixTime ?? ''),
    ...textWords(opts.dateTime ?? ''),
    ...(opts.speed ?? uintWords(0)),
    ...(opts.satellites ?? uintWords(0)),
  ];
  expect(regs).toHaveLength(RUT50_GPS_REGISTER_COUNT);
  return regs;
}

describe('decodeNumber32', () => {
  it('liest eine Ganzzahl als Ganzzahl', () => {
    expect(decodeNumber32(...uintWords(50), 1000)).toBe(50);
  });

  it('liest einen Float als Float', () => {
    expect(decodeNumber32(...floatWords(87.5), 1000)).toBeCloseTo(87.5);
  });

  it('verwirft, was in keiner Lesart plausibel ist', () => {
    expect(decodeNumber32(...floatWords(-3), 1000)).toBeNull();
  });
});

describe('parseFixTime', () => {
  it('versteht einen Unix-Zeitstempel in Millisekunden', () => {
    expect(parseFixTime('1792600000000')).toBe(1792600000000);
  });

  it('versteht einen Unix-Zeitstempel in Sekunden', () => {
    expect(parseFixTime('1792600000')).toBe(1792600000000);
  });

  it('versteht „JJJJ-MM-TT hh:mm:ss" als UTC', () => {
    expect(parseFixTime('2026-10-21 12:34:56')).toBe(Date.UTC(2026, 9, 21, 12, 34, 56));
  });

  it('liest leer und 0 als „kein Fix"', () => {
    expect(parseFixTime('')).toBeNull();
    expect(parseFixTime('0')).toBeNull();
  });
});

describe('decodeText', () => {
  it('schneidet am ersten Nullbyte ab', () => {
    expect(decodeText(textWords('abc'))).toBe('abc');
  });
});

describe('decodeRut50Gps', () => {
  const now = () => Date.UTC(2026, 9, 21, 12, 0, 0);

  it('macht aus einem Fix eine gueltige Position', () => {
    const reading = decodeRut50Gps(
      block({
        lat: 47.5,
        lon: 9.75,
        fixTime: String(Date.UTC(2026, 9, 21, 11, 59, 59)),
        speed: floatWords(36),
        satellites: uintWords(9),
      }),
      now,
    );
    expect(reading.satellites).toBe(9);
    expect(reading.fixTimeMs).toBe(Date.UTC(2026, 9, 21, 11, 59, 59));
    const pos = reading.position;
    expect(pos).not.toBeNull();
    expect(pos?.lat).toBeCloseTo(47.5, 5);
    expect(pos?.lon).toBeCloseTo(9.75, 5);
    expect(pos?.speed).toBeCloseTo(10, 5); // 36 km/h
    expect(pos?.source).toBe('modbus');
    expect(pos?.fix).toBe('2d');
    expect(pos?.ts).toBe('2026-10-21T11:59:59.000Z');
    expect(validatePosition(pos)).toBe(true);
    expect(checkPosition(pos!).ok).toBe(true);
  });

  it('nimmt eine Geschwindigkeit als Ganzzahl ebenso', () => {
    const reading = decodeRut50Gps(block({ lat: 47.5, lon: 9.75, speed: uintWords(72) }), now);
    expect(reading.position?.speed).toBeCloseTo(20, 5);
  });

  it('faellt ohne lesbaren Fix-Zeitpunkt auf GPS-Datum/-Uhrzeit zurueck, dann auf jetzt', () => {
    const mitDatum = decodeRut50Gps(block({ lat: 47.5, lon: 9.75, dateTime: '2026-10-21 11:58:00' }), now);
    expect(mitDatum.position?.ts).toBe('2026-10-21T11:58:00.000Z');
    const ohne = decodeRut50Gps(block({ lat: 47.5, lon: 9.75 }), now);
    expect(ohne.fixTimeMs).toBeNull();
    expect(ohne.position?.ts).toBe('2026-10-21T12:00:00.000Z');
  });

  it('liest 0/0 als „kein Fix"', () => {
    const reading = decodeRut50Gps(block({ lat: 0, lon: 0, satellites: uintWords(0) }), now);
    expect(reading.position).toBeNull();
    expect(reading.satellites).toBe(0);
  });

  it('verwirft Koordinaten ausserhalb der Erde', () => {
    expect(decodeRut50Gps(block({ lat: 95, lon: 9 }), now).position).toBeNull();
    expect(decodeRut50Gps(block({ lat: NaN, lon: 9 }), now).position).toBeNull();
  });

  it('verwirft einen zu kurzen Block', () => {
    expect(decodeRut50Gps([1, 2, 3], now).position).toBeNull();
  });
});
