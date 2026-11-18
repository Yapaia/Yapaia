import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  appendBeschraenkungen,
  beschraenkungenAus,
  leseBeschraenkungen,
  parseMeter,
  parseTonnen,
  wertAus,
} from './beschraenkungen.js';
import { beschraenkungenIn, beschraenkungenSchliessen, parseBbox } from '../../map/beschraenkungen.js';

describe('Werte parsen', () => {
  it('Meter in allen üblichen Schreibweisen', () => {
    expect(parseMeter('3.5')).toBe(3.5);
    expect(parseMeter('3,5')).toBe(3.5);
    expect(parseMeter('3.5 m')).toBe(3.5);
    expect(parseMeter('3.5m')).toBe(3.5);
    expect(parseMeter('350 cm')).toBe(3.5);
    expect(parseMeter('3\'6"')).toBe(1.07);
    expect(parseMeter('11\'')).toBe(3.35);
    expect(parseMeter('12 ft 6 in')).toBe(3.81);
  });

  it('ignoriert Sonderwerte und Unsinn', () => {
    for (const w of ['default', 'none', 'below_default', 'unsigned', 'no_sign', '', 'ca. 3', '3.5;4', undefined, 3.5]) {
      expect(parseMeter(w)).toBeNull();
    }
    expect(parseTonnen('none')).toBeNull();
  });

  it('Tonnen in allen üblichen Schreibweisen', () => {
    expect(parseTonnen('7.5')).toBe(7.5);
    expect(parseTonnen('7,5 t')).toBe(7.5);
    expect(parseTonnen('7.5t')).toBe(7.5);
    expect(parseTonnen('3500 kg')).toBe(3.5);
    expect(parseTonnen('10 st')).toBe(9.07);
    expect(parseTonnen('6000 lbs')).toBe(2.72);
  });

  it('nimmt den kleinsten plausiblen Wert, verwirft Unplausibles', () => {
    expect(wertAus('hoehe', { maxheight: '4', 'maxheight:physical': '3.8' })).toBe(3.8);
    expect(wertAus('hoehe', { maxheight: '35' })).toBeNull(); // 35 m: Tippfehler (cm?)
    expect(wertAus('gewicht', { maxweight: '7.5' })).toBe(7.5);
    expect(wertAus('gewicht', { maxweight: 'default' })).toBeNull();
  });
});

describe('Features → Beschränkungen', () => {
  it('Knoten mit Höhe', () => {
    const b = beschraenkungenAus({
      type: 'Feature',
      id: 'n42',
      geometry: { type: 'Point', coordinates: [8.1, 49.2] },
      properties: { barrier: 'height_restrictor', maxheight: '2.1' },
    });
    expect(b).toEqual([{ art: 'hoehe', wert: 2.1, lon: 8.1, lat: 49.2, osm: 'n42' }]);
  });

  it('Weg mit Höhe UND Gewicht ergibt zwei Zeilen, Punkt in der Mitte', () => {
    const b = beschraenkungenAus({
      type: 'Feature',
      id: 'w7',
      geometry: { type: 'LineString', coordinates: [[8, 49], [8.002, 49]] },
      properties: { highway: 'residential', maxheight: '3,2 m', maxweight: '7.5' },
    });
    expect(b.map((x) => x.art)).toEqual(['hoehe', 'gewicht']);
    expect(b[0].lon).toBeCloseTo(8.001, 5);
    expect(b[0].linie).toHaveLength(2);
    expect(b[0].osm).toBe('w7');
  });

  it('ohne verwertbare Tags: nichts', () => {
    expect(
      beschraenkungenAus({ type: 'Feature', geometry: { type: 'Point', coordinates: [8, 49] }, properties: { maxheight: 'default' } }),
    ).toEqual([]);
    expect(beschraenkungenAus(null)).toEqual([]);
  });
});

describe('Tabelle im Index', () => {
  let dir = '';
  afterEach(() => {
    beschraenkungenSchliessen();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function* features() {
    yield { type: 'Feature', id: 'n1', geometry: { type: 'Point', coordinates: [8.0, 49.0] }, properties: { maxheight: '3.2' } };
    yield { type: 'Feature', id: 'n2', geometry: { type: 'Point', coordinates: [9.5, 49.0] }, properties: { maxweight: '7.5 t' } };
    yield { type: 'Feature', id: 'w3', geometry: { type: 'LineString', coordinates: [[7.9, 48.99], [8.1, 49.01]] }, properties: { maxwidth: '2.3' } };
  }

  function neuerIndex(name: string): string {
    const pfad = join(dir, name);
    const db = new Database(pfad);
    db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)');
    db.close();
    return pfad;
  }

  it('schreibt, liest nach Ausschnitt, und alte Indizes liefern nichts', async () => {
    dir = mkdtempSync(join(tmpdir(), 'beschr-'));
    const pfad = neuerIndex('lite_search-a.db');
    expect(await appendBeschraenkungen(pfad, features())).toBe(3);
    const db = new Database(pfad, { readonly: true });
    const da = leseBeschraenkungen(db, [7.95, 48.95, 8.05, 49.05], 100);
    expect(da.map((b) => b.art).sort()).toEqual(['breite', 'hoehe']);
    expect(db.prepare("SELECT value FROM meta WHERE key='beschraenkungen_count'").get()).toEqual({ value: '3' });
    db.close();

    const alt = neuerIndex('lite_search-alt.db');
    const altDb = new Database(alt, { readonly: true });
    expect(leseBeschraenkungen(altDb, [7, 48, 9, 50], 100)).toEqual([]);
    altDb.close();

    // Zwei Regionen mit derselben Grenze: einmal; der alte Index stört nicht.
    const zweiter = neuerIndex('lite_search-b.db');
    await appendBeschraenkungen(zweiter, features());
    const e = beschraenkungenIn([7.95, 48.95, 8.05, 49.05], [pfad, alt, zweiter]);
    expect(e.liste).toHaveLength(2);
    expect(e.mitTabelle).toBe(2);
    expect(e.gekappt).toBe(false);
    expect(beschraenkungenIn([7.95, 48.95, 8.05, 49.05], [pfad], 1).gekappt).toBe(true);
  });

  it('bbox-Parameter', () => {
    expect(parseBbox('8,49,8.5,49.5')).toEqual([8, 49, 8.5, 49.5]);
    expect(parseBbox('8,49,12,49.5')).toBeNull(); // zu groß
    expect(parseBbox('8,49,7,49.5')).toBeNull();
    expect(parseBbox('a,b,c,d')).toBeNull();
    expect(parseBbox(undefined)).toBeNull();
  });
});
