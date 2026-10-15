import { describe, expect, it } from 'vitest';
import { meldungenEntlang, routenLinie } from './entlangDerRoute.js';
import { abschnitteGeoJson, etaStufe, schwere, stauText, verzugVoraus } from './stauAufRoute.js';
import type { KartenMeldung } from './verkehrGeoJson.js';

// Eine gerade Route nach Norden, 10 km lang, bei 49° Breite (1 km je Stück).
const LINIE = routenLinie(Array.from({ length: 11 }, (_, i) => [8.5, 49 + i * 0.009] as const));

const stau = (id: string, vonKm: number, bisKm: number, verzug?: number, lon = 8.5): KartenMeldung => ({
  id,
  art: 'stau',
  strasse: 'A5',
  titel: id,
  beschreibung: '',
  lat: 49 + vonKm * 0.009,
  lon,
  symbol: 'verkehr-stau',
  stau: 'stau',
  verzug_min: verzug,
  laenge_m: Math.abs(bisKm - vonKm) * 1000,
  linie: [
    [lon, 49 + vonKm * 0.009],
    [lon, 49 + bisKm * 0.009],
  ],
});

describe('Staus auf der Route', () => {
  it('nimmt Staus in Fahrtrichtung, nicht die auf der Gegenfahrbahn', () => {
    const mit = stau('mit', 2, 4, 10);
    const gegen = stau('gegen', 4, 2, 10, 8.5003); // 20 m daneben, rückwärts
    const e = meldungenEntlang([mit, gegen], LINIE);
    expect(e.map((x) => x.meldung.id)).toEqual(['mit']);
    expect(e[0]!.entlang_m).toBeCloseTo(2000, -1);
    expect(e[0]!.bis_m).toBeCloseTo(4000, -2);
  });

  it('färbt nur den betroffenen Abschnitt, das Schwerere oben', () => {
    const e = meldungenEntlang([stau('rot', 5, 6, 20), stau('gelb', 1, 2)], LINIE);
    const g = abschnitteGeoJson(LINIE, e);
    expect(g.features.map((f) => f.properties.schwere)).toEqual(['orange', 'rot']);
    const coords = g.features[1]!.geometry.coordinates;
    expect(coords[0]![1]).toBeCloseTo(49.045, 4);
    expect(coords[coords.length - 1]![1]).toBeCloseTo(49.054, 4);
  });

  it('zählt den Verlust nur für Staus voraus, anteilig mittendrin', () => {
    const e = meldungenEntlang([stau('a', 2, 4, 10), stau('b', 6, 7, 6), stau('ohne', 8, 9)], LINIE);
    expect(verzugVoraus(e, 0)).toBe(16);
    expect(verzugVoraus(e, 3000)).toBe(11); // Hälfte von a + b
    expect(verzugVoraus(e, 5000)).toBe(6);
    expect(verzugVoraus(e, 7500)).toBe(0);
  });

  it('Schwere und Ankunftsfarbe', () => {
    expect(schwere({ art: 'stau', stau: 'zaehfliessend', verzug_min: 2 })).toBe('gelb');
    expect(schwere({ art: 'stau', stau: 'stau', verzug_min: 2 })).toBe('orange');
    expect(schwere({ art: 'stau', stau: 'stillstand' })).toBe('rot');
    expect(schwere({ art: 'baustelle' })).toBeNull();
    expect(etaStufe(0)).toBeNull();
    expect(etaStufe(3)).toBe('gelb');
    expect(etaStufe(15)).toBe('rot');
  });

  it('Text mit Länge und Verlust', () => {
    expect(stauText({ art: 'stau', stau: 'stau', laenge_m: 2400, verzug_min: 16 })).toBe('Stau · 2,4 km · +16 min');
    expect(stauText({ art: 'stau', stau: 'stillstand', laenge_m: 650 })).toBe('Stillstand · 700 m');
    expect(stauText({ art: 'baustelle' })).toBeNull();
  });
});
