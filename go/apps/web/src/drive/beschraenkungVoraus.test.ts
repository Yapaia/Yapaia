import { describe, it, expect } from 'vitest';
import type { VehicleProfile } from '@yapaia/shared';
import { cumulativeMeters } from '../routing/traveledSplit.js';
import {
  entfernungRund,
  vorausAufRoute,
  vorausInFahrtrichtung,
  type BeschraenkungRoh,
  type Koord,
} from './beschraenkungVoraus.js';

const womo = { height_m: 3.3, weight_t: 4.25, width_m: 2.35, length_m: 7.4 } as VehicleProfile;

// Route nach Osten entlang lat 49, 0.001° lon ≈ 73 m.
const route: Koord[] = Array.from({ length: 30 }, (_, i) => [8 + i * 0.001, 49]);
const kum = cumulativeMeters(route);
const m = (lonOff: number) => lonOff * 73000; // grob

const knoten = (lon: number, lat: number, art: 'hoehe' | 'gewicht', wert: number, osm = `n${lon}`): BeschraenkungRoh => ({
  lon,
  lat,
  props: { art, wert, osm },
});

describe('Beschränkung voraus – mit Route', () => {
  it('findet einen zu niedrigen Höhenbegrenzer auf der Route, mit Entfernung', () => {
    const v = vorausAufRoute(route, kum, 0, [knoten(8.005, 49.0001, 'hoehe', 3.0)], womo);
    expect(v?.art).toBe('hoehe');
    expect(v!.entfernungM).toBeGreaterThan(m(0.005) * 0.95);
    expect(v!.entfernungM).toBeLessThan(m(0.005) * 1.05);
  });

  it('ignoriert passende Grenzen, solche hinter uns und abseits', () => {
    expect(vorausAufRoute(route, kum, 0, [knoten(8.005, 49, 'hoehe', 3.5)], womo)).toBeNull();
    expect(vorausAufRoute(route, kum, m(0.01), [knoten(8.005, 49, 'hoehe', 3.0)], womo)).toBeNull();
    expect(vorausAufRoute(route, kum, 0, [knoten(8.005, 49.001, 'hoehe', 3.0)], womo)).toBeNull(); // 110 m daneben
  });

  it('ein querender Weg (Brücke darüber) warnt nicht, ein Weg entlang der Route schon', () => {
    const quer: BeschraenkungRoh = {
      lon: 8.01,
      lat: 49,
      props: { art: 'gewicht', wert: 3.5, osm: 'w1', linie: [[8.01, 48.999], [8.01, 49.001]] },
    };
    expect(vorausAufRoute(route, kum, 0, [quer], womo)).toBeNull();
    const entlang: BeschraenkungRoh = {
      lon: 8.0105,
      lat: 49,
      props: { art: 'gewicht', wert: 3.5, osm: 'w2', linie: [[8.01, 49.00005], [8.011, 49.00005]] },
    };
    expect(vorausAufRoute(route, kum, 0, [entlang], womo)?.schluessel).toBe('w2|gewicht');
  });

  it('ohne Profil keine Warnung', () => {
    expect(vorausAufRoute(route, kum, 0, [knoten(8.005, 49, 'hoehe', 3.0)], null)).toBeNull();
  });
});

describe('Beschränkung voraus – freie Fahrt', () => {
  it('nur im Korridor in Fahrtrichtung', () => {
    const vorn = knoten(8.004, 49, 'hoehe', 3.0);
    expect(vorausInFahrtrichtung([8, 49], 90, [vorn], womo)?.entfernungM).toBeCloseTo(292, -1);
    expect(vorausInFahrtrichtung([8, 49], 270, [vorn], womo)).toBeNull(); // hinter uns
    expect(vorausInFahrtrichtung([8, 49], 0, [vorn], womo)).toBeNull(); // seitlich
    expect(vorausInFahrtrichtung([8, 49], 90, [knoten(8.02, 49, 'hoehe', 3.0)], womo)).toBeNull(); // zu weit
  });
});

describe('Entfernung runden', () => {
  it('50-m-Schritte, ab 1 km in km', () => {
    expect(entfernungRund(12)).toEqual({ wert: 50, einheit: 'm' });
    expect(entfernungRund(312)).toEqual({ wert: 300, einheit: 'm' });
    expect(entfernungRund(1260)).toEqual({ wert: 1.3, einheit: 'km' });
  });
});
