import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendGrenzen, grenzeAus, landBei, leseGrenzen, vereinfache, type Ring } from './grenzen.js';

/** Zwei „Länder" nebeneinander, Grenze bei lon 7.6 (grob Basel). */
const quadrat = (x0: number, x1: number): Ring => [
  [x0, 47],
  [x1, 47],
  [x1, 48],
  [x0, 48],
  [x0, 47],
];
const feature = (iso: string, ring: Ring, extra: Record<string, unknown> = {}) => ({
  type: 'Feature',
  properties: { boundary: 'administrative', admin_level: '2', 'ISO3166-1:alpha2': iso, name: iso, ...extra },
  geometry: { type: 'Polygon', coordinates: [ring] },
});

describe('Ländergrenzen', () => {
  it('nimmt nur admin_level=2-Flächen mit ISO-Code', () => {
    expect(grenzeAus(feature('DE', quadrat(7.6, 9)))?.iso).toBe('DE');
    expect(grenzeAus(feature('ch', quadrat(6, 7.6)))?.iso).toBe('CH');
    expect(grenzeAus(feature('DE', quadrat(7.6, 9), { admin_level: '4' }))).toBeNull();
    expect(grenzeAus(feature('DE', quadrat(7.6, 9), { 'ISO3166-1:alpha2': undefined }))).toBeNull();
    const linie = { ...feature('DE', quadrat(7.6, 9)), geometry: { type: 'LineString', coordinates: quadrat(7.6, 9) } };
    expect(grenzeAus(linie)).toBeNull();
  });

  it('bestimmt das Land an der Position (auch mit Loch)', () => {
    const de = grenzeAus(feature('DE', quadrat(7.6, 9)))!;
    const ch = grenzeAus(feature('CH', quadrat(6, 7.6)))!;
    expect(landBei([de, ch], 47.5, 7.7)).toBe('DE');
    expect(landBei([de, ch], 47.5, 7.5)).toBe('CH');
    expect(landBei([de, ch], 46, 7.5)).toBeNull();
    const mitLoch = grenzeAus({
      ...feature('DE', quadrat(7.6, 9)),
      geometry: { type: 'Polygon', coordinates: [quadrat(7.6, 9), quadrat(8, 8.5)] },
    })!;
    expect(landBei([mitLoch], 47.5, 8.2)).toBeNull();
    expect(landBei([mitLoch], 47.5, 7.8)).toBe('DE');
  });

  it('vereinfacht lange Ringe und rundet auf 5 Stellen', () => {
    const ring: Ring = [];
    for (let i = 0; i <= 1000; i += 1) ring.push([7 + i / 1000 + 1e-9, 47 + (i % 2) * 1e-6]);
    ring.push([8, 48], [7, 48], [7, 47]);
    const v = vereinfache(ring);
    expect(v.length).toBeLessThan(10);
    expect(v.every(([x]) => Math.abs(x * 1e5 - Math.round(x * 1e5)) < 1e-6)).toBe(true);
  });

  it('schreibt die Grenzen in den Index und liest sie wieder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grenzen-'));
    try {
      const pfad = join(dir, 'x.db');
      const db0 = new Database(pfad);
      db0.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)');
      db0.close();
      async function* zeilen() {
        yield feature('DE', quadrat(7.6, 9));
        yield feature('XX', quadrat(0, 1), { admin_level: '6' });
      }
      expect(await appendGrenzen(pfad, zeilen())).toBe(1);
      const db = new Database(pfad, { readonly: true });
      const grenzen = leseGrenzen(db);
      expect(grenzen.map((g) => g.iso)).toEqual(['DE']);
      expect(landBei(grenzen, 47.5, 8)).toBe('DE');
      expect((db.prepare("SELECT value FROM meta WHERE key = 'grenzen_count'").get() as { value: string }).value).toBe('1');
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ein Index ohne Grenzen-Tabelle liefert eine leere Liste', () => {
    const db = new Database(':memory:');
    expect(leseGrenzen(db)).toEqual([]);
    db.close();
  });
});
