import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import { aenderungen, beschreibung, ENTITAETEN, werte, type GoZustand } from './beschreibung.js';

const LEER: GoZustand = { navState: null, position: null, profile: [], profil: null };

describe('Beschreibung', () => {
  it('passt zu der Datei, gegen die die Integration testet', () => {
    // integration/tests/fixtures/go_beschreibung.json -- neu erzeugen mit
    // `beschreibung({ instanz: 'a1', token: 'x' }, '0.0.0')`, wenn sich hier
    // etwas aendert.
    const pfad = fileURLToPath(new URL('../../../../../integration/tests/fixtures/go_beschreibung.json', import.meta.url));
    const datei = JSON.parse(readFileSync(pfad, 'utf-8'));
    expect(datei).toEqual(JSON.parse(JSON.stringify(beschreibung({ instanz: 'a1', token: 'x' }, '0.0.0'))));
  });

  it('nennt jeden Schluessel nur einmal und liefert fuer jeden einen Wert', () => {
    const schluessel = ENTITAETEN.map((e) => e.schluessel);
    expect(new Set(schluessel).size).toBe(schluessel.length);
    const w = werte(LEER);
    for (const e of ENTITAETEN) {
      if (e.plattform === 'button') continue;
      expect(w, e.schluessel).toHaveProperty(e.schluessel);
      for (const a of e.attribute ?? []) expect(w, a).toHaveProperty(a);
      if (e.symbol_aus) expect(w).toHaveProperty(e.symbol_aus);
      if (e.optionen_aus) expect(w).toHaveProperty(e.optionen_aus);
    }
  });

  it('gibt das Token nie heraus', () => {
    expect(JSON.stringify(beschreibung({ instanz: 'a1', token: 'geheim' }, '1'))).not.toContain('geheim');
  });
});

describe('Werte', () => {
  it('ohne Fahrt: unbekannt als null, nicht als "unknown"', () => {
    const w = werte(LEER);
    expect(w.ankunft).toBeNull();
    expect(w.restweg).toBeNull();
    expect(w.tempo).toBeNull();
    expect(w.zustand).toBe('idle');
    expect(w.zu_schnell).toBe(false);
    expect(w.standort).toBeNull();
    expect(w.ziel_eingabe).toBe('');
  });

  it('Tempo und Standort aus dem GPS, Profile aus dem Zusatz', () => {
    const w = werte({
      ...LEER,
      position: { lat: 52.1, lon: 11.6, speed: 25, accuracy: 4, fix: '3d', ts: '2026-10-11T10:00:00Z' } as never,
      profile: ['Wohnmobil', 'Pkw'],
      profil: 'Wohnmobil',
    });
    expect(w.tempo).toBe(90);
    expect(w.standort).toEqual({ breite: 52.1, laenge: 11.6, genauigkeit: 4 });
    expect(w.profile).toEqual(['Wohnmobil', 'Pkw']);
    expect(w.profil).toBe('Wohnmobil');
  });

  it('meldet nur Aenderungen', () => {
    expect(aenderungen({ a: 1, b: [1] }, { a: 1, b: [1, 2], c: null })).toEqual({ b: [1, 2], c: null });
  });
});
