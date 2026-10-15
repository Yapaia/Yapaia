import { describe, expect, it } from 'vitest';
import { SPUR, type Maneuver } from '@yapaia/shared';
import { encodePolyline6 } from './polyline.js';
import { buildTraceRouteBody, osrmSpur, spurenEintragen } from './spurenAusTrace.js';

/**
 * Die Werte stammen aus einer echten Antwort von Valhalla 3.5.1
 * (`/trace_route`, `format: "osrm"`), Mannheim → Frankfurt, 2026-10-15.
 * Gekuerzt auf die Kreuzungen um zwei Ausfahrten.
 */
const AUSFAHRT_3 = { lat: 49.46329, lon: 8.5327 }; // A 6, Ausfahrt 3
const DANEBEN = { lat: 49.463007, lon: 8.53346 }; // 63 m weiter, ohne Spuren
const AUSFAHRT_22 = { lat: 50.047403, lon: 8.601522 }; // A 5, Ausfahrt 22
const LANDSTRASSE = { lat: 49.9, lon: 8.6 }; // keine Kreuzung in der Naehe

const geradeaus = { indications: ['straight'], valid: false, active: false };
const ANTWORT = {
  matchings: [
    {
      legs: [
        {
          steps: [
            {
              intersections: [
                {
                  location: [8.5327, 49.46329],
                  lanes: [
                    geradeaus,
                    geradeaus,
                    {
                      indications: ['slight right'],
                      valid_indication: 'slight right',
                      valid: true,
                      active: true,
                    },
                  ],
                },
                { location: [8.53346, 49.463007] },
                {
                  location: [8.602361, 50.048679], // 154 m hinter Ausfahrt 22
                  lanes: [geradeaus, { indications: ['slight right'], valid: true, active: true }],
                },
                {
                  location: [8.601522, 50.047403],
                  lanes: [
                    geradeaus,
                    geradeaus,
                    geradeaus,
                    { indications: ['slight right'], valid_indication: 'slight right', valid: true, active: false },
                    { indications: ['slight right'], valid_indication: 'slight right', valid: true, active: true },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function manoever(begin_shape_index: number): Maneuver {
  return {
    index: begin_shape_index,
    type: 'turn_right',
    instruction: '',
    street_names: [],
    distance_m: 0,
    duration_s: 0,
    begin_shape_index,
  } as Maneuver;
}

describe('spurenEintragen', () => {
  const geometrie = encodePolyline6([AUSFAHRT_3, DANEBEN, AUSFAHRT_22, LANDSTRASSE]);

  it('ordnet die Spuren ueber den Ort zu', () => {
    const ms = [manoever(0), manoever(1), manoever(2), manoever(3)];
    expect(spurenEintragen(ms, geometrie, ANTWORT)).toBe(2);

    expect(ms[0]!.lanes).toEqual([
      { directions: SPUR.GERADEAUS },
      { directions: SPUR.GERADEAUS },
      { directions: SPUR.LEICHT_RECHTS, valid: SPUR.LEICHT_RECHTS, active: SPUR.LEICHT_RECHTS },
    ]);
    // Eine Kreuzung ohne Spuren 63 m weiter -- das Manoever dort bleibt leer,
    // statt die Spuren der Ausfahrt davor zu erben.
    expect(ms[1]!.lanes).toBeUndefined();
    // Die naechste Kreuzung gewinnt, nicht die erste in der Liste.
    expect(ms[2]!.lanes).toHaveLength(5);
    expect(ms[2]!.lanes![3]).toEqual({ directions: SPUR.LEICHT_RECHTS, valid: SPUR.LEICHT_RECHTS });
    expect(ms[3]!.lanes).toBeUndefined();
  });

  it('laesst Spuren stehen, die schon da sind', () => {
    const m = manoever(0);
    m.lanes = [{ directions: SPUR.LINKS }];
    spurenEintragen([m], geometrie, ANTWORT);
    expect(m.lanes).toEqual([{ directions: SPUR.LINKS }]);
  });

  it('uebersteht Unbrauchbares', () => {
    const ms = [manoever(0)];
    for (const raw of [null, {}, { matchings: 'x' }, { matchings: [{ legs: [{ steps: [{}] }] }] }]) {
      expect(spurenEintragen(ms, geometrie, raw)).toBe(0);
    }
    expect(ms[0]!.lanes).toBeUndefined();
  });
});

describe('osrmSpur', () => {
  it('uebersetzt die Richtungswoerter', () => {
    expect(osrmSpur({ indications: ['left', 'straight'] })).toEqual({
      directions: SPUR.LINKS | SPUR.GERADEAUS,
    });
    expect(osrmSpur({ indications: ['none'], valid: true, active: true })).toEqual({
      directions: SPUR.UNBESTIMMT,
      valid: SPUR.UNBESTIMMT,
      active: SPUR.UNBESTIMMT,
    });
  });

  it('nimmt fuer valid/active die passende Richtung, wenn Valhalla sie nennt', () => {
    expect(
      osrmSpur({ indications: ['straight', 'right'], valid_indication: 'right', valid: true, active: true }),
    ).toEqual({ directions: SPUR.GERADEAUS | SPUR.RECHTS, valid: SPUR.RECHTS, active: SPUR.RECHTS });
  });

  it('gibt null fuer eine Spur ohne bekannte Richtung', () => {
    expect(osrmSpur({ indications: [] })).toBeNull();
    expect(osrmSpur({ indications: ['merge_to_left'] })).toBeNull();
    expect(osrmSpur({})).toBeNull();
  });

  it('verwirft die ganze Kreuzung, wenn eine Spur unbrauchbar ist', () => {
    // Mit einer fehlenden Spur stimmte die Zaehlung nicht mehr.
    const ms = [manoever(0)];
    const geo = encodePolyline6([AUSFAHRT_3]);
    spurenEintragen(ms, geo, {
      matchings: [
        { legs: [{ steps: [{ intersections: [{ location: [8.5327, 49.46329], lanes: [geradeaus, {}] }] }] }] },
      ],
    });
    expect(ms[0]!.lanes).toBeUndefined();
  });
});

describe('buildTraceRouteBody', () => {
  it('fragt im OSRM-Format und laeuft die Geometrie ab', () => {
    expect(buildTraceRouteBody('abc', 'truck')).toEqual({
      encoded_polyline: 'abc',
      costing: 'truck',
      shape_match: 'edge_walk',
      format: 'osrm',
    });
  });
});
