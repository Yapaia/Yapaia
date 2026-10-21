/**
 * Die GPS-Register eines Teltonika-Routers (RUT50 und Geschwister mit
 * RutOS) und ihre Umrechnung in eine `Position`.
 *
 * ─── DIE REGISTERKARTE ──────────────────────────────────────────────────────
 * Teltonika-Wiki, „RUT50 Monitoring via Modbus" (dieselbe Tabelle wie
 * RUTX50/RUTM50/RUTC50). Die „Register address" dort ist die 0-basierte
 * Adresse, die auf dem Draht steht; die „Register number" ist sie plus eins.
 *
 *   Adresse  Register  Inhalt
 *   143      2         Breitengrad, 32-Bit-Float
 *   145      2         Laengengrad, 32-Bit-Float
 *   147      16        Zeitpunkt des Fixes, Text
 *   163      16        GPS-Datum und -Uhrzeit, Text
 *   179      2         Geschwindigkeit in km/h
 *   181      2         Anzahl Satelliten
 *
 * Alles liegt in EINEM zusammenhaengenden Block (143 bis 182, 40 Register)
 * und wird mit einer einzigen Anfrage gelesen -- so stammen Breite, Laenge
 * und Zeit garantiert aus demselben Moment.
 *
 * ─── WO DIE WIKI-SEITEN SICH WIDERSPRECHEN ─────────────────────────────────
 * Die Seiten der einzelnen Modelle und die allgemeine Seite sind sich nicht
 * einig, ob Geschwindigkeit und Satellitenzahl Float oder Ganzzahl sind, und
 * ob der Fix-Zeitpunkt ein Unix-Zeitstempel (Millisekunden, als Text) oder
 * „JJJJ-MM-TT hh:mm:ss" (UTC) ist. Je nach Firmware stimmt das eine oder das
 * andere. Statt zu raten, versteht diese Datei BEIDES -- siehe
 * `decodeNumber32` und `parseFixTime`. Die Unterscheidung ist eindeutig: eine
 * kleine Ganzzahl als Float gelesen ist eine winzige denormalisierte Zahl
 * (unter 1e-38), keine Geschwindigkeit.
 *
 * ─── WAS DER ROUTER NICHT LIEFERT ───────────────────────────────────────────
 * Keine Fahrtrichtung, keine Hoehe, keine Genauigkeit. Die Richtung leitet
 * die Quelle aus zwei aufeinanderfolgenden Fixes ab (`./index.ts`); Hoehe
 * und Genauigkeit bleiben `null` -- ein erfundener Wert saehe aus wie eine
 * Messung.
 */

import { Buffer } from 'node:buffer';
import type { Position } from '@yapaia/shared';

export const RUT50_GPS_START_ADDRESS = 143;
export const RUT50_GPS_REGISTER_COUNT = 40;

/** Versatz innerhalb des gelesenen Blocks (Adresse − 143). */
const OFF_LAT = 0;
const OFF_LON = 2;
const OFF_FIX_TIME = 4;
const OFF_DATE_TIME = 20;
const TEXT_REGISTERS = 16;
const OFF_SPEED = 36;
const OFF_SATELLITES = 38;

/** Zwei Register (hohes Wort zuerst, wie bei Teltonika) als Bytes. */
function wordsToBuffer(hi: number, lo: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt16BE(hi & 0xffff, 0);
  buf.writeUInt16BE(lo & 0xffff, 2);
  return buf;
}

export function decodeFloat32(hi: number, lo: number): number {
  return wordsToBuffer(hi, lo).readFloatBE(0);
}

/**
 * Eine 32-Bit-Zahl, die je nach Firmware Float ODER vorzeichenlose Ganzzahl
 * ist. Plausible Werte liegen fuer beide Felder (km/h, Satelliten) zwischen
 * 0 und einigen Hundert:
 *   - als Ganzzahl gelesen ist ein Float wie 50.0 (0x42480000) riesig;
 *   - als Float gelesen ist eine Ganzzahl wie 50 (0x00000032) winzig.
 * Liegt die Ganzzahl-Lesart im plausiblen Bereich, gilt sie; sonst die
 * Float-Lesart, sofern sie es tut. `null`, wenn keine passt.
 */
export function decodeNumber32(hi: number, lo: number, max: number): number | null {
  const buf = wordsToBuffer(hi, lo);
  const asInt = buf.readUInt32BE(0);
  if (asInt <= max) return asInt;
  const asFloat = buf.readFloatBE(0);
  if (Number.isFinite(asFloat) && asFloat >= 0 && asFloat <= max) return asFloat;
  return null;
}

/** Text aus Registern: zwei ASCII-Zeichen je Register, mit Nullbytes aufgefuellt. */
export function decodeText(registers: number[]): string {
  const bytes: number[] = [];
  for (const reg of registers) {
    bytes.push((reg >> 8) & 0xff, reg & 0xff);
  }
  const end = bytes.indexOf(0);
  return Buffer.from(end === -1 ? bytes : bytes.slice(0, end))
    .toString('latin1')
    .trim();
}

/**
 * Zeitpunkt des Fixes als Millisekunden seit 1970, oder `null`.
 * Versteht beide Formate, die Teltonika dokumentiert:
 *   - Unix-Zeitstempel als Ziffernfolge (Millisekunden; Sekunden ebenso);
 *   - „JJJJ-MM-TT hh:mm:ss" in UTC.
 * Eine 0 oder ein leeres Feld heisst „noch kein Fix" und ergibt `null`.
 */
export function parseFixTime(text: string): number | null {
  if (text.length === 0) return null;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) return null;
    // Unter 1e11 sind es Sekunden (1e11 s waere das Jahr 5138).
    return n < 1e11 ? n * 1000 : n;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (m) {
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface Rut50Reading {
  /** `null`, wenn der Router (noch) keinen brauchbaren Fix hat. */
  position: Position | null;
  /** Zeitpunkt des Fixes laut Router, oder `null`, wenn unlesbar. */
  fixTimeMs: number | null;
  satellites: number | null;
}

/**
 * Wertet den 40-Register-Block ab Adresse 143 aus. `now` liefert den
 * Zeitpunkt, der gilt, wenn der Router keinen lesbaren Fix-Zeitpunkt meldet.
 *
 * Kein Fix sieht beim RUT50 so aus: Breite und Laenge sind 0 (oder das Feld
 * ist leer). Ein Fahrzeug am Schnittpunkt von Aequator und Nullmeridian ist
 * ein Schiff im Golf von Guinea -- dieser eine Punkt wird daher immer als
 * „kein Fix" gelesen.
 */
export function decodeRut50Gps(registers: number[], now: () => number = Date.now): Rut50Reading {
  if (registers.length < RUT50_GPS_REGISTER_COUNT) {
    return { position: null, fixTimeMs: null, satellites: null };
  }
  const lat = decodeFloat32(registers[OFF_LAT], registers[OFF_LAT + 1]);
  const lon = decodeFloat32(registers[OFF_LON], registers[OFF_LON + 1]);
  const speedKmh = decodeNumber32(registers[OFF_SPEED], registers[OFF_SPEED + 1], 1000);
  const satellites = decodeNumber32(registers[OFF_SATELLITES], registers[OFF_SATELLITES + 1], 1000);

  const fixTimeMs =
    parseFixTime(decodeText(registers.slice(OFF_FIX_TIME, OFF_FIX_TIME + TEXT_REGISTERS))) ??
    parseFixTime(decodeText(registers.slice(OFF_DATE_TIME, OFF_DATE_TIME + TEXT_REGISTERS)));

  const valid =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0);
  if (!valid) {
    return { position: null, fixTimeMs, satellites: satellites !== null ? Math.round(satellites) : null };
  }

  const position: Position = {
    lat,
    lon,
    alt: null,
    speed: speedKmh !== null ? speedKmh / 3.6 : null,
    heading: null,
    accuracy: null,
    source: 'modbus',
    fix: '2d',
    ts: new Date(fixTimeMs ?? now()).toISOString(),
  };
  return { position, fixTimeMs, satellites: satellites !== null ? Math.round(satellites) : null };
}
