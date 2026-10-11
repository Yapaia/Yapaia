/**
 * Die Werte, die Yapaia Go fuer Home Assistant bildet (`buildHaStates`) --
 * die Grundlage der Entitaeten in der Integration „Yapaia".
 */

import { describe, it, expect } from 'vitest';
import type { NavState, Position } from '@yapaia/shared';
import { DASHBOARD_ENTITIES } from './dashboard.js';
import { UNBEKANNT, buildHaStates, type HaStateWrite } from './statesBridge.js';

function navState(overrides: Partial<NavState> = {}): NavState {
  return {
    status: 'navigating',
    route_id: 'r-1',
    next_maneuver: null,
    distance_to_maneuver_m: null,
    distance_remaining_m: 12_340,
    duration_remaining_s: 900,
    eta: '2026-09-09T18:00:00Z',
    speed_kmh: 82.4,
    speed_limit_kmh: 100,
    speed_limit_vehicle_kmh: null,
    altitude_m: 214,
    destination: null,
    ...overrides,
  };
}

/** Ein anstehendes Manoever in `distance` Metern. */
function abbiegung(distance: number): Partial<NavState> {
  return {
    next_maneuver: {
      type: 'turn_right',
      instruction: 'Rechts abbiegen',
      street_names: ['Obere Heide'],
    } as never,
    distance_to_maneuver_m: distance,
  };
}

function findeZustand(writes: HaStateWrite[], entityId: string): HaStateWrite | undefined {
  return writes.find((w) => w.entityId === entityId);
}

describe('welche Entitaeten geschrieben werden', () => {
  it('genau die, die auch das Dashboard sucht -- Befehle ausgenommen', () => {
    // Der eigentliche Punkt: waeren die IDs auch nur leicht anders, stuende
    // im Dashboard weiter „Entitaet nicht gefunden".
    const geschrieben = new Set(
      buildHaStates({ navState: navState(), position: null }).map(
        (w) => w.entityId,
      ),
    );
    const befehle = new Set(['stop', 'pause', 'resume', 'profile']);
    for (const eintrag of DASHBOARD_ENTITIES) {
      const id = `${eintrag.domain}.${eintrag.objectId}`;
      if (befehle.has(eintrag.schluessel)) {
        // Ueber diesen Weg kann eine Entitaet nichts entgegennehmen; sie
        // waere eine tote Schaltflaeche.
        expect(geschrieben.has(id), `${id} sollte NICHT geschrieben werden`).toBe(false);
      } else {
        expect(geschrieben.has(id), `${id} fehlt`).toBe(true);
      }
    }
  });

  it('schreibt die Position nur, wenn es eine gibt', () => {
    const ohne = buildHaStates({ navState: null, position: null });
    expect(findeZustand(ohne, 'device_tracker.yapaia_vehicle')).toBeUndefined();

    const mit = buildHaStates({
      navState: null,
      position: { lat: 49.3, lon: 8.2, accuracy: 5, timestamp: 0, source: 'browser' } as never,
    });
    expect(findeZustand(mit, 'device_tracker.yapaia_vehicle')?.attributes).toMatchObject({
      latitude: 49.3,
      longitude: 8.2,
      gps_accuracy: 5,
      source_type: 'gps',
    });
  });
});

describe('die Werte selbst', () => {
  const writes = buildHaStates({ navState: navState(), position: null });

  it('Tempo, Tempolimit und Hoehe als Zahl mit Einheit', () => {
    expect(findeZustand(writes, 'sensor.yapaia_speed')).toMatchObject({
      state: '82',
      attributes: expect.objectContaining({ unit_of_measurement: 'km/h', device_class: 'speed' }),
    });
    expect(findeZustand(writes, 'sensor.yapaia_speed_limit')?.state).toBe('100');
    expect(findeZustand(writes, 'sensor.yapaia_altitude')?.state).toBe('214');
  });

  it('die Reststrecke in Kilometern -- wie in der MQTT-Fassung', () => {
    // Dort rechnet die Vorlage `m / 1000 | round(2)`; beide Wege muessen
    // denselben Wert zeigen, sonst haengt die Anzeige vom Uebertragungsweg ab.
    expect(findeZustand(writes, 'sensor.yapaia_distance_remaining')?.state).toBe('12.34');
  });

  it('„zu schnell" nur, wenn beide Werte bekannt sind', () => {
    expect(findeZustand(writes, 'binary_sensor.yapaia_speeding')?.state).toBe('off');

    const schnell = buildHaStates({
      navState: navState({ speed_kmh: 120 }),
      position: null,
    });
    expect(findeZustand(schnell, 'binary_sensor.yapaia_speeding')?.state).toBe('on');

    const ohneLimit = buildHaStates({
      navState: navState({ speed_kmh: 120, speed_limit_kmh: null }),
      position: null,
    });
    expect(findeZustand(ohneLimit, 'binary_sensor.yapaia_speeding')?.state).toBe('off');
  });

  it('unbekannte Werte heissen „unknown", nicht „null" oder „NaN"', () => {
    // Ein Sensor mit dem Text „null" sieht in Home Assistant aus wie ein
    // Messwert und ist keiner.
    const leer = buildHaStates({ navState: null, position: null });
    for (const id of ['sensor.yapaia_speed', 'sensor.yapaia_eta', 'sensor.yapaia_altitude']) {
      expect(findeZustand(leer, id)?.state, id).toBe(UNBEKANNT);
    }
    expect(findeZustand(leer, 'sensor.yapaia_nav_state')?.state).toBe('idle');
  });

  describe('das Tempolimit OHNE Route (0.14.1)', () => {
    // ─── DIE LETZTE ENTITÄT, DIE ZU UNRECHT LEER WAR ──────────────────────
    // Von den zehn Yapaia-Entitäten blieb `speed_limit` als einzige ohne
    // Route unbesetzt, obwohl es sie gibt: ETA und Anweisung brauchen ein
    // Ziel, ein Tempolimit braucht nur eine Straße.
    const frisch = { kmh: 100, road_class: 'primary' as const, stand: 'frisch' as const };

    it('das Schild kommt vom Ort, wenn keine Route läuft', () => {
      const z = buildHaStates({ navState: null, position: null, tempoHier: frisch });
      expect(findeZustand(z, 'sensor.yapaia_speed_limit')?.state).toBe('100');
    });

    it('mit Fahrzeug ergibt sich auch die Fahrzeuggrenze', () => {
      const z = buildHaStates({
        navState: null,
        position: null,
        tempoHier: { kmh: null, road_class: 'motorway', stand: 'frisch' },
        fahrzeug: { weight_t: 5, tempo_100: false },
      });
      expect(findeZustand(z, 'sensor.yapaia_speed_limit')?.state).toBe(UNBEKANNT);
      expect(findeZustand(z, 'sensor.yapaia_speed_limit_vehicle')?.state).toBe('80');
    });

    it('eine VERALTETE Auskunft gilt nicht', () => {
      // Bei 100 km/h sind dreissig Sekunden rund 800 Meter. Ein Schild, das
      // die Straße von vorhin zeigt, ist die unangenehmste Sorte Fehler: es
      // stimmt beinahe.
      const z = buildHaStates({
        navState: null,
        position: null,
        tempoHier: { ...frisch, stand: 'veraltet' },
      });
      expect(findeZustand(z, 'sensor.yapaia_speed_limit')?.state).toBe(UNBEKANNT);
    });

    it('ein Fehlschlag gilt ebenso wenig — und ist am Sensor ablesbar', () => {
      // Ohne diese Angabe sähe „Valhalla antwortet nicht" genauso aus wie
      // „hier ist nichts ausgeschildert".
      const z = buildHaStates({
        navState: null,
        position: null,
        tempoHier: { ...frisch, stand: 'fehler' },
      });
      expect(findeZustand(z, 'sensor.yapaia_speed_limit')?.state).toBe(UNBEKANNT);
      expect(
        findeZustand(z, 'binary_sensor.yapaia_speeding')?.attributes?.stand_ohne_route,
      ).toBe('fehler');
    });

    it('die laufende Route hat Vorrang vor dem Ortswert', () => {
      // Der Wert aus der Route ist auf die gefahrene Strecke bezogen. Der
      // Ortswert springt nur ein, wo bisher `unknown` stand.
      const z = buildHaStates({
        navState: navState({ speed_limit_kmh: 60 }),
        position: null,
        tempoHier: frisch,
      });
      expect(findeZustand(z, 'sensor.yapaia_speed_limit')?.state).toBe('60');
    });

    it('ohne Dienst bleibt alles wie vorher', () => {
      // Die Gegenprobe: wer die Brücke ohne diesen Dienst baut, bekommt das
      // Verhalten von 0.14.0.
      const z = buildHaStates({ navState: null, position: null });
      expect(findeZustand(z, 'sensor.yapaia_speed_limit')?.state).toBe(UNBEKANNT);
    });

    it('OHNE Route kann jetzt auch gewarnt werden', () => {
      // Tempo aus dem GPS (0.13.1), Grenze aus dem Ort (0.14.1) — erst
      // beides zusammen ergibt eine Warnung ohne Fahrt mit Ziel.
      const z = buildHaStates({
        navState: null,
        position: {
          lat: 49.2, lon: 8.3, alt: 120, speed: 30, heading: 0,
          accuracy: 8, source: 'gpsd', fix: '3d', ts: '2026-09-18T08:00:00.000Z',
        } as Position,
        tempoHier: { kmh: 50, road_class: 'residential', stand: 'frisch' },
      });
      // 30 m/s = 108 km/h bei Tempo 50.
      expect(findeZustand(z, 'binary_sensor.yapaia_speeding')?.state).toBe('on');
      expect(findeZustand(z, 'binary_sensor.yapaia_speeding')?.attributes?.grenze_kmh).toBe(50);
    });
  });

  describe('ohne Route, aber mit GPS — der gemeldete Fall', () => {
    /**
     * Aus den Entwicklerwerkzeugen, alle Yapaia-Entitäten nebeneinander:
     *
     *     device_tracker.yapaia_vehicle   latitude: 49.239076998
     *                                     longitude: 8.320296238
     *     sensor.yapaia_nav_state         idle
     *     sensor.yapaia_speed             unknown
     *     sensor.yapaia_altitude          unknown
     *
     * Das GPS lieferte eine Position auf zehn Nachkommastellen, und im
     * selben Augenblick stand beim Tempo „unbekannt". Beides zugleich.
     */
    function gps(teil: Partial<Position> = {}): Position {
      return {
        lat: 49.239076998,
        lon: 8.320296238,
        alt: 120,
        speed: 25, // m/s = 90 km/h
        heading: 180,
        accuracy: 53.2,
        source: 'gpsd',
        fix: '3d',
        ts: '2026-09-17T18:23:00.000Z',
        ...teil,
      } as Position;
    }

    it('das Tempo kommt vom GPS, wenn keine Route läuft', () => {
      const zustaende = buildHaStates({ navState: null, position: gps() });
      expect(findeZustand(zustaende, 'sensor.yapaia_speed')?.state).toBe('90');
      expect(findeZustand(zustaende, 'sensor.yapaia_nav_state')?.state).toBe('idle');
    });

    it('die Höhe ebenso — bei einem 3D-Fix', () => {
      const zustaende = buildHaStates({ navState: null, position: gps({ alt: 214.4 }) });
      expect(findeZustand(zustaende, 'sensor.yapaia_altitude')?.state).toBe('214');
    });

    it('bei einem 2D-Fix bleibt die Höhe unbekannt, das Tempo nicht', () => {
      // Eine Höhe braucht einen vierten Satelliten. Ein alter Wert aus einem
      // anderen Tal ist schlimmer als ein ehrliches „unbekannt".
      const zustaende = buildHaStates({ navState: null, position: gps({ fix: '2d' }) });
      expect(findeZustand(zustaende, 'sensor.yapaia_altitude')?.state).toBe(UNBEKANNT);
      expect(findeZustand(zustaende, 'sensor.yapaia_speed')?.state).toBe('90');
    });

    it('ohne Fix bleibt beides unbekannt', () => {
      const zustaende = buildHaStates({ navState: null, position: gps({ fix: 'none' }) });
      expect(findeZustand(zustaende, 'sensor.yapaia_speed')?.state).toBe(UNBEKANNT);
      expect(findeZustand(zustaende, 'sensor.yapaia_altitude')?.state).toBe(UNBEKANNT);
    });

    it('die laufende Route hat weiterhin Vorrang vor dem GPS', () => {
      // ─── WARUM DIESE REIHENFOLGE ──────────────────────────────────────
      // Der Wert aus `navState` ist auf die Route bezogen und speist
      // dieselbe Quelle wie `speeding`. Kämen die beiden aus verschiedenen
      // Töpfen, könnte das Display 90 km/h zeigen, während die
      // Tempo-Überschreitung mit 82 rechnet — zwei Zahlen über dieselbe
      // Fahrt, die sich widersprechen.
      const zustaende = buildHaStates({
        navState: navState({ speed_kmh: 82, altitude_m: 300 }),
        position: gps({ speed: 25, alt: 120 }),
      });
      expect(findeZustand(zustaende, 'sensor.yapaia_speed')?.state).toBe('82');
      expect(findeZustand(zustaende, 'sensor.yapaia_altitude')?.state).toBe('300');
    });

    it('läuft eine Route OHNE Tempowert, springt das GPS ein', () => {
      // `navState` gibt es, aber `speed_kmh` ist null — etwa unmittelbar
      // nach dem Start, bevor die erste Ortung durch ist.
      const zustaende = buildHaStates({
        navState: navState({ speed_kmh: null, altitude_m: null }),
        position: gps(),
      });
      expect(findeZustand(zustaende, 'sensor.yapaia_speed')?.state).toBe('90');
      expect(findeZustand(zustaende, 'sensor.yapaia_altitude')?.state).toBe('120');
    });

    it('Stillstand ist eine Null und kein fehlender Wert', () => {
      // Sonst zeigte das Display beim Halt „unbekannt" statt einer Null,
      // und aus einer Messung würde eine Lücke.
      const zustaende = buildHaStates({ navState: null, position: gps({ speed: 0 }) });
      expect(findeZustand(zustaende, 'sensor.yapaia_speed')?.state).toBe('0');
    });
  });

  it('die Anweisung bringt den Richtungspfeil als Attribut mit', () => {
    // Die Dashboard-Vorlage liest `state_attr(..., 'icon')`.
    const mit = buildHaStates({ navState: navState(abbiegung(57)), position: null });
    expect(findeZustand(mit, 'sensor.yapaia_instruction')).toMatchObject({
      state: 'Rechts abbiegen',
      attributes: expect.objectContaining({ icon: expect.stringContaining('mdi:'), distance_m: 57 }),
    });
    expect(findeZustand(mit, 'sensor.yapaia_instruction_distance')?.state).toBe('57');
  });

  // ─── DER GEMELDETE FEHLER ───────────────────────────────────────────────
  // „Die Strecke bis zur naechsten Abbiegung wird nicht geupdated. Die
  // anderen Werte wohl schon." Ursache: beide Anweisungs-Sensoren wurden aus
  // `nav/instruction` gespeist -- der ANSAGE. Deren `distance_m` ist laut
  // eigenem Typ „the distance to the maneuver AT THE MOMENT the threshold
  // fired" und steht zwischen zwei Ansagen still.
  it('die Entfernung folgt dem Zustand, nicht der Ansage', () => {
    const weit = buildHaStates({ navState: navState(abbiegung(400)), position: null });
    const nah = buildHaStates({ navState: navState(abbiegung(120)), position: null });
    expect(findeZustand(weit, 'sensor.yapaia_instruction_distance')?.state).toBe('400');
    expect(findeZustand(nah, 'sensor.yapaia_instruction_distance')?.state).toBe('120');
  });

  it('der Text springt mit dem Manoever um, nicht erst mit der naechsten Ansage', () => {
    // Sonst stuende nach einer Abbiegung weiter die eben absolvierte
    // Anweisung da -- bei 3 km bis zum naechsten Manoever minutenlang. Eine
    // falsche Anweisung ist schlimmer als eine alte Zahl.
    const danach = buildHaStates({
      navState: navState({
        next_maneuver: {
          type: 'turn_left',
          instruction: 'Links abbiegen auf den Talweg',
          street_names: ['Talweg'],
        } as never,
        distance_to_maneuver_m: 2900,
      }),
      position: null,
    });
    expect(findeZustand(danach, 'sensor.yapaia_instruction')?.state).toBe(
      'Links abbiegen auf den Talweg',
    );
    expect(findeZustand(danach, 'sensor.yapaia_instruction_distance')?.state).toBe('2900');
  });

  it('traegt den Kreisel fuer das Display -- und an jedem anderen Manoever einen LEEREN Text', () => {
    // Leer statt fehlend: ein fehlendes Attribut schickt HA nicht an ESPHome,
    // und auf dem Geraet bliebe die Ausfahrt des letzten Kreisels stehen.
    const kreisel = buildHaStates({
      navState: navState({
        next_maneuver: {
          type: 'roundabout_enter',
          instruction: 'In den Kreisverkehr einfahren',
          street_names: [],
          roundabout_exit_count: 3,
          roundabout_turn_deg: -90,
        } as never,
        distance_to_maneuver_m: 120,
      }),
      position: null,
    });
    expect(findeZustand(kreisel, 'sensor.yapaia_instruction')?.attributes?.roundabout).toBe('3|-90');

    const sonst = buildHaStates({ navState: navState(abbiegung(57)), position: null });
    expect(findeZustand(sonst, 'sensor.yapaia_instruction')?.attributes?.roundabout).toBe('');
  });

  it('ohne anstehendes Manoever steht dort „unknown", keine erfundene Null', () => {
    const leer = buildHaStates({
      navState: navState({ next_maneuver: null, distance_to_maneuver_m: null }),
      position: null,
    });
    expect(findeZustand(leer, 'sensor.yapaia_instruction')?.state).toBe(UNBEKANNT);
    expect(findeZustand(leer, 'sensor.yapaia_instruction_distance')?.state).toBe(UNBEKANNT);
  });
});
