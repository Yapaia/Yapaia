/**
 * Rückwärtssuche für die Sensoren „Ort" und „Adresse" (0.65.0): echter
 * SQLite-Index aus `buildLiteIndexFile` + `appendAddresses`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { appendAddresses, buildLiteIndexFile } from './buildIndex.js';
import { LiteIndexReader } from './reader.js';
import { LiteBackend } from './liteBackend.js';
import { GEO_INDEX, geoIndexAnlegen } from './geoIndex.js';
import type { AddressRecord, NormalizedRecord } from './extract.js';

let dir: string;
afterEach(() => {
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

async function* liste(items: AddressRecord[]): AsyncGenerator<AddressRecord> {
  for (const i of items) yield i;
}

// Westheim (Pfalz): zwei Strassen, eine gleichnamige im Nachbarort
const records: NormalizedRecord[] = [
  { kind: 'village', name: 'Westheim (Pfalz)', lat: 49.2465, lon: 8.3232 },
  { kind: 'village', name: 'Lingenfeld', lat: 49.2539, lon: 8.3393 },
  { kind: 'street', name: 'Obere Heide', lat: 49.2394, lon: 8.3205, locality: 'Westheim (Pfalz)' },
  { kind: 'street', name: 'Birkenstraße', lat: 49.2380, lon: 8.3200, locality: 'Westheim (Pfalz)' },
  { kind: 'street', name: 'Birkenstraße', lat: 49.2530, lon: 8.3390, locality: 'Lingenfeld' },
];
const adressen: AddressRecord[] = [
  { street: 'Obere Heide', number: '4', postcode: '67368', city: 'Westheim (Pfalz)', lat: 49.23972, lon: 8.32076 },
  { street: 'Obere Heide', number: '9', postcode: '67368', city: 'Westheim (Pfalz)', lat: 49.23944, lon: 8.32074 },
  { street: 'Birkenstraße', number: '2', postcode: '67368', city: 'Westheim (Pfalz)', lat: 49.23905, lon: 8.32035 },
  { street: 'Birkenstraße', number: '1', postcode: '67360', city: 'Lingenfeld', lat: 49.25301, lon: 8.33902 },
];

async function baue(): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'adresse-'));
  const path = join(dir, 'lite_search-germany.db');
  buildLiteIndexFile(records, path, { region: 'germany' });
  await appendAddresses(path, liste(adressen));
  return path;
}

describe('adresseBei', () => {
  it('liefert das nächste Haus mit Straße, Nummer, PLZ und Ort', async () => {
    const r = new LiteIndexReader(await baue());
    const t = r.adresseBei(49.23908, 8.32034);
    expect(t).toMatchObject({ strasse: 'Birkenstraße', hausnummer: '2', plz: '67368', ort: 'Westheim (Pfalz)' });
    expect(t?.entfernungM).toBeLessThan(10);
  });

  it('nimmt keine gleichnamige Straße aus dem Nachbarort', async () => {
    const r = new LiteIndexReader(await baue());
    // Die Lingenfelder Birkenstraße 1 wäre hier nicht „nah", und ihr Ort passt nicht
    expect(r.adresseBei(49.23908, 8.32034)?.ort).toBe('Westheim (Pfalz)');
  });

  it('ohne Haus in der Nähe: Straße ohne Nummer, sonst nur der Ort', async () => {
    const r = new LiteIndexReader(await baue());
    // ~200 m neben der Oberen Heide, kein Haus näher als 120 m
    const strasse = r.adresseBei(49.2394, 8.3233);
    expect(strasse).toMatchObject({ strasse: 'Obere Heide', hausnummer: null, ort: 'Westheim (Pfalz)' });
    // Auf freiem Feld: nur der nächste Ort
    expect(r.adresseBei(49.2470, 8.3240)).toMatchObject({ strasse: null, ort: 'Westheim (Pfalz)' });
  });

  it('neue Indizes haben den Koordinaten-Index, das Backend fragt sie', async () => {
    const path = await baue();
    const r = new LiteIndexReader(path);
    expect(r.hatGeoIndex()).toBe(true);
    const backend = new LiteBackend({ dbDir: dir });
    expect(backend.ohneGeoIndex()).toEqual([]);
    expect(backend.adresseBei(49.23972, 8.32076)).toMatchObject({ hausnummer: '4', region: 'germany' });
  });

  it('legt den Index bei alten Indizes im Worker nach', async () => {
    const path = await baue();
    const db = new Database(path);
    db.exec(`DROP INDEX ${GEO_INDEX}`);
    db.close();
    const backend = new LiteBackend({ dbDir: dir });
    expect(backend.ohneGeoIndex()).toEqual([path]);
    expect(await geoIndexAnlegen(path)).toEqual({ ok: true });
    expect(new LiteIndexReader(path).hatGeoIndex()).toBe(true);
  });
});
