import { describe, it, expect } from 'vitest';
import type { VehicleProfile } from '@yapaia/shared';
import { schildBild, ueberschreitet, wertText, ZEICHEN_GROESSE } from './zeichen.js';
import { enthaelt, erweitert } from './store.js';

const womo = { height_m: 3.3, weight_t: 4.25, width_m: 2.35, length_m: 7.4 } as VehicleProfile;

describe('Fahrzeug-Beschränkungen auf der Karte', () => {
  it('vergleicht mit dem Fahrzeugprofil', () => {
    expect(ueberschreitet('hoehe', 3.2, womo)).toBe(true);
    expect(ueberschreitet('hoehe', 3.3, womo)).toBe(false); // Gleichstand passt
    expect(ueberschreitet('gewicht', 3.5, womo)).toBe(true);
    expect(ueberschreitet('gewicht', 7.5, womo)).toBe(false);
    expect(ueberschreitet('breite', 2.3, womo)).toBe(true);
    expect(ueberschreitet('laenge', 10, womo)).toBe(false);
    expect(ueberschreitet('achslast', 1, womo)).toBe(false); // nicht im Profil
    expect(ueberschreitet('hoehe', 2, null)).toBe(false);
  });

  it('Wert mit Einheit je Sprache', () => {
    expect(wertText('hoehe', 3.2, 'de-DE')).toBe('3,2 m');
    expect(wertText('gewicht', 7.5, 'en-GB')).toBe('7.5 t');
    expect(wertText('achslast', 10, 'de-DE')).toBe('10 t');
  });

  it('Schildbild: Rahmen außen, Fläche innen, Ecken durchsichtig', () => {
    const b = schildBild([255, 0, 0], [255, 255, 255], 3);
    const px = (x: number, y: number) => Array.from(b.data.slice((y * ZEICHEN_GROESSE + x) * 4, (y * ZEICHEN_GROESSE + x) * 4 + 4));
    expect(px(0, 0)[3]).toBe(0);
    expect(px(16, 1)).toEqual([255, 0, 0, 255]);
    expect(px(16, 16)).toEqual([255, 255, 255, 255]);
  });

  it('Ausschnitt: erweitert und enthalten', () => {
    const r: [number, number, number, number] = [8, 49, 8.2, 49.1];
    const g = erweitert(r, 1.9);
    expect(enthaelt(g, r)).toBe(true);
    expect(g[2] - g[0]).toBeCloseTo(0.4);
    const gross = erweitert([0, 40, 3, 43], 1.9);
    expect(gross[2] - gross[0]).toBeCloseTo(1.9);
  });
});
