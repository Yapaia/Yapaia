import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { NormalizedRecord } from './extract.js';
import { buildLiteIndexFile } from './buildIndex.js';
import { LiteBackend } from './liteBackend.js';
import { liteSearchDbPathForRegion } from './paths.js';
import { abstand, erlaubteFehler, korrigiere, woerter } from './tippfehler.js';

let dir: string;

afterEach(() => {
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

function index(region: string, records: NormalizedRecord[]): string {
  if (!dir || !existsSync(dir)) dir = mkdtempSync(join(tmpdir(), 'lite-tippfehler-'));
  const pfad = liteSearchDbPathForRegion(dir, region);
  buildLiteIndexFile(records, pfad, { region });
  return pfad;
}

const ort = (name: string, lat = 46.7, lon = 7.9): NormalizedRecord => ({ kind: 'city', name, lat, lon });
const strasse = (name: string): NormalizedRecord => ({ kind: 'street', name, lat: 47.05, lon: 8.3 });

describe('abstand', () => {
  it('zaehlt Einfuegen, Loeschen und Ersetzen je als einen Fehler', () => {
    expect(abstand('interlakn', 'interlaken', 2)).toBe(1);
    expect(abstand('lauzanne', 'lausanne', 2)).toBe(1);
    expect(abstand('grindewald', 'grindelwald', 2)).toBe(1);
  });

  it('zaehlt ein vertauschtes Buchstabenpaar als EINEN Fehler', () => {
    expect(abstand('zuerihc', 'zuerich', 1)).toBe(1);
    expect(abstand('luzren', 'luzern', 1)).toBe(1);
  });

  it('bricht ueber der Grenze ab und meldet max + 1', () => {
    expect(abstand('basel', 'berlin', 1)).toBe(2);
    expect(abstand('ab', 'abcdef', 2)).toBe(3);
  });
});

describe('erlaubteFehler', () => {
  it('keiner unter 4, einer ab 4, zwei ab 8 Buchstaben', () => {
    expect(erlaubteFehler(3)).toBe(0);
    expect(erlaubteFehler(4)).toBe(1);
    expect(erlaubteFehler(7)).toBe(1);
    expect(erlaubteFehler(8)).toBe(2);
  });
});

describe('woerter', () => {
  it('faltet zum Vergleichen und behaelt die Schreibweise fuer die Anzeige', () => {
    expect(woerter('Zürich Hauptbahnhof, Ost')).toEqual([
      { wort: 'zuerich', form: 'Zürich' },
      { wort: 'hauptbahnhof', form: 'Hauptbahnhof' },
    ]);
  });
});

describe('korrigiere (Wortliste im Index)', () => {
  it('nimmt unter gleich guten Woertern das haeufigere', () => {
    const pfad = index('ch', [
      ort('Lausanne'),
      ort('Lausanne-Ouchy'),
      { kind: 'poi', name: 'Bahnhof Lausanne', lat: 46.5, lon: 6.6 },
      ort('Lauzane'),
    ]);
    const db = new Database(pfad, { readonly: true });
    try {
      expect(korrigiere(db, 'Lauzanne')).toMatchObject({ wort: 'lausanne', form: 'Lausanne', fehler: 1, anzahl: 3 });
    } finally {
      db.close();
    }
  });

  it('korrigiert nicht, was es gibt, und nichts unter 4 Buchstaben', () => {
    const pfad = index('ch', [ort('Bern'), ort('Ulm'), ort('Uri')]);
    const db = new Database(pfad, { readonly: true });
    try {
      expect(korrigiere(db, 'Bern')).toBeNull();
      expect(korrigiere(db, 'Ulf')).toBeNull();
    } finally {
      db.close();
    }
  });

  it('findet auch einen Fehler am ersten Buchstaben', () => {
    const pfad = index('ch', [ort('Interlaken')]);
    const db = new Database(pfad, { readonly: true });
    try {
      expect(korrigiere(db, 'Unterlaken')?.form).toBe('Interlaken');
    } finally {
      db.close();
    }
  });
});

describe('Suche mit Tippfehler', () => {
  it('liefert die Treffer der korrigierten Eingabe und sagt, wofuer', async () => {
    index('ch', [ort('Interlaken'), ort('Grindelwald'), strasse('Bahnhofstrasse')]);
    const backend = new LiteBackend({ dbDir: dir });
    const treffer = await backend.search({ q: 'Interlakn', limit: 5 });
    expect(treffer.map((t) => t.name)).toEqual(['Interlaken']);
    expect(treffer[0]?.korrigiert).toBe('Interlaken');
  });

  it('korrigiert nur das Wort, das allein nichts findet', async () => {
    index('ch', [{ kind: 'street', name: 'Bahnhofstrasse', lat: 47.37, lon: 8.54, locality: 'Zuerich' }, ort('Zuerich')]);
    const backend = new LiteBackend({ dbDir: dir });
    const treffer = await backend.search({ q: 'Bahnhofstrase Zuerich', limit: 5 });
    expect(treffer[0]?.korrigiert).toBe('Bahnhofstrasse Zuerich');
  });

  it('laesst richtige Eingaben unberuehrt', async () => {
    index('ch', [ort('Interlaken')]);
    const backend = new LiteBackend({ dbDir: dir });
    const treffer = await backend.search({ q: 'Interlaken', limit: 5 });
    expect(treffer[0]?.korrigiert).toBeUndefined();
  });

  it('findet ohne Wortliste (Index vor 0.61.0) wie bisher nichts', async () => {
    const pfad = index('ch', [ort('Interlaken')]);
    const db = new Database(pfad);
    db.exec('DROP TABLE woerter');
    db.close();
    const backend = new LiteBackend({ dbDir: dir });
    expect(await backend.search({ q: 'Interlakn', limit: 5 })).toEqual([]);
  });
});
