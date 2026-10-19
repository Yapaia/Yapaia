/**
 * Was Yapaia Go an Werten fuer Home Assistant bildet -- rein aus dem, was der
 * Core weiss.
 *
 * Frueher schrieb eine Bruecke diese Zustaende ueber `POST /api/states` direkt
 * nach Home Assistant. Das macht heute die Integration „Yapaia" ueber das
 * Yapaia-Protokoll (`yapaia/beschreibung.ts` benennt die Werte nur um). Hier
 * bleibt die Rechnung: welches Tempo gilt (Route vor GPS), wann ein
 * Tempolimit ohne Route zaehlt, was „zu schnell" heisst. Keine
 * Netzwerkzugriffe, damit sich jeder Wert einzeln pruefen laesst.
 */

import type { NavState, Position } from '@yapaia/shared';
import { EIGENER_FAHRZEUG_TRACKER } from './eigeneEntitaeten.js';
import { buildSpeedPayload, kreiselAttribut, maneuverIcon, spurenAttribut } from '../mqtt/mapping.js';
import { tempoAusPosition, hoeheAusPosition } from './ausPosition.js';
import {
  fahrzeugGrenze,
  massgeblichesTempo,
  faehrtZuSchnell,
  type FahrzeugAngaben,
  type Strassenklasse,
} from '../routing/fahrzeugTempo.js';
import type { Tempoauskunft } from '../routing/tempolimitDienst.js';

/** Ein Zustand, wie ihn Home Assistant entgegennimmt. */
export interface HaStateWrite {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
}

/** Was der Core gerade weiss. */
export interface YapaiaZustand {
  navState: NavState | null;
  position: Position | null;
  /**
   * Das Tempolimit an der aktuellen Stelle, OHNE laufende Route.
   *
   * Es fuellt genau die Luecke, die `navState` laesst: ohne Ziel gibt es
   * keine Route, aber sehr wohl eine Strasse. Siehe
   * `routing/tempolimitDienst.ts`.
   */
  tempoHier?: Tempoauskunft | null;
  /** Das aktive Fahrzeug -- fuer die Fahrzeuggrenze ohne Route. */
  fahrzeug?: FahrzeugAngaben | null;
}

/** Der Anzeigename des Geraets -- dieselbe Schreibweise wie bei der Discovery. */
const GERAET = 'Yapaia Go';

/** Home Assistant kennt fuer „weiss ich nicht" genau dieses Wort. */
export const UNBEKANNT = 'unknown';

function zahl(wert: number | null | undefined, stellen = 0): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return UNBEKANNT;
  return wert.toFixed(stellen);
}

/**
 * Alle Zustaende, die dieser Kanal schreibt -- rein aus dem, was der Core
 * weiss. Keine Netzwerkzugriffe, damit sich jeder einzelne Wert pruefen
 * laesst.
 */
export function buildHaStates(zustand: YapaiaZustand): HaStateWrite[] {
  const { navState, position } = zustand;
  const tempo = navState ? buildSpeedPayload(navState) : null;
  const schreibt: HaStateWrite[] = [];

  // ─── DAS TEMPOLIMIT OHNE ROUTE ──────────────────────────────────────────
  // `navState` gibt es nur waehrend einer Fahrt mit Ziel. Eine STRASSE gibt
  // es immer -- und damit ein Tempolimit. Von den zehn Yapaia-Entitaeten war
  // `speed_limit` die einzige, die ohne Route zu Unrecht leer blieb: ETA und
  // Anweisung gibt es ohne Ziel wirklich nicht, ein Tempolimit schon.
  //
  // Die Reihenfolge ist wie ueberall: die Route zuerst, weil ihr Wert auf
  // die gefahrene Strecke bezogen ist. Der Ortswert springt nur ein, wo
  // bisher `unknown` stand.
  const hier = zustand.tempoHier ?? null;
  // Nur ein FRISCHER Ortswert zaehlt. Ein veralteter kann von der Strasse
  // von vorhin stammen, und ein Schild, das die vorige Strasse zeigt, ist
  // die unangenehmste Sorte Fehler: es stimmt beinahe.
  const hierGilt = hier !== null && hier.stand === 'frisch';
  const schildHier = hierGilt ? hier.kmh : null;
  const fahrzeugHier =
    hierGilt && zustand.fahrzeug
      ? fahrzeugGrenze(zustand.fahrzeug, (hier.road_class ?? null) as Strassenklasse | null)
      : null;

  const schild = tempo?.speed_limit_kmh ?? schildHier;
  const fahrzeugGrenzeJetzt = tempo?.speed_limit_vehicle_kmh ?? fahrzeugHier;
  const massgeblich = massgeblichesTempo(schild, fahrzeugGrenzeJetzt);

  const dazu = (
    entityId: string,
    state: string,
    name: string,
    attribute: Record<string, unknown> = {},
  ): void => {
    schreibt.push({
      entityId,
      state,
      attributes: { friendly_name: `${GERAET} ${name}`, ...attribute },
    });
  };

  // ─── TEMPO: ROUTE ZUERST, SONST DAS GPS ─────────────────────────────────
  // Gemeldet aus den Entwicklerwerkzeugen: `device_tracker.yapaia_vehicle`
  // fuehrte eine Position auf zehn Nachkommastellen, und `sensor.yapaia_speed`
  // stand im selben Augenblick auf `unknown`. Der Grund war, dass hier
  // ausschliesslich `navState` gelesen wurde -- und den gibt es nur, solange
  // eine Route laeuft. Die GPS-Position liegt dagegen immer an und bringt
  // `speed` als PFLICHTFELD mit. Die Angabe war da und wurde nicht abgeholt.
  //
  // Die Reihenfolge ist Absicht: waehrend der Navigation gilt weiterhin der
  // Wert aus `navState`, weil er auf die Route bezogen ist (und dieselbe
  // Quelle speist wie `speeding`). Das GPS springt nur ein, wo bisher
  // `unknown` stand.
  dazu('sensor.yapaia_speed', zahl(tempo?.speed_kmh ?? tempoAusPosition(position)), 'Speed', {
    unit_of_measurement: 'km/h',
    device_class: 'speed',
    state_class: 'measurement',
    icon: 'mdi:speedometer',
  });
  dazu('sensor.yapaia_speed_limit', zahl(schild), 'Speed Limit', {
    unit_of_measurement: 'km/h',
    device_class: 'speed',
    state_class: 'measurement',
    icon: 'mdi:speedometer-medium',
  });
  // ─── WAS DIESES FAHRZEUG DARF, NEBEN DEM SCHILD ────────────────────────
  // Getrennt und nicht zusammengelegt: auf einer unbegrenzten Autobahn ist
  // das Schild `unknown` und die Fahrzeuggrenze 80. Eine einzige Zahl liesse
  // offen, welche davon man draussen wiederfindet.
  dazu(
    'sensor.yapaia_speed_limit_vehicle',
    zahl(fahrzeugGrenzeJetzt),
    'Speed Limit Vehicle',
    {
      unit_of_measurement: 'km/h',
      device_class: 'speed',
      state_class: 'measurement',
      icon: 'mdi:truck-alert',
    },
  );
  // Das Tempo kommt seit 0.13.1 auch aus dem GPS, die Grenze seit 0.14.1
  // auch ohne Route -- also kann jetzt auch OHNE Fahrt gewarnt werden.
  dazu(
    'binary_sensor.yapaia_speeding',
    faehrtZuSchnell(tempo?.speed_kmh ?? tempoAusPosition(position), massgeblich.grenze)
      ? 'on'
      : 'off',
    'Speeding',
    {
    device_class: 'safety',
    // Damit am Sensor selbst ablesbar ist, WORAN die Warnung haengt. Ohne das
    // bliebe unklar, ob gerade das Schild oder das Fahrzeuggewicht
    // entscheidet -- und genau diese Frage stellt sich am Strassenrand.
    grenze_kmh: massgeblich.grenze,
    quelle: massgeblich.quelle,
    // Woher der Ortswert kommt, wenn keine Route laeuft -- oder warum es
    // keinen gibt. Ohne das saehe „Valhalla antwortet nicht" genauso aus wie
    // „hier ist nichts ausgeschildert".
    stand_ohne_route: hier?.stand ?? 'unbekannt',
    },
  );
  dazu('sensor.yapaia_eta', navState?.eta ?? UNBEKANNT, 'ETA', {
    device_class: 'timestamp',
    icon: 'mdi:clock-outline',
  });
  dazu(
    'sensor.yapaia_distance_remaining',
    navState?.distance_remaining_m === null || navState?.distance_remaining_m === undefined
      ? UNBEKANNT
      : (navState.distance_remaining_m / 1000).toFixed(2),
    'Distance Remaining',
    {
      unit_of_measurement: 'km',
      device_class: 'distance',
      state_class: 'measurement',
      icon: 'mdi:map-marker-distance',
    },
  );
  // ─── ANWEISUNG UND ENTFERNUNG KOMMEN AUS DEM ZUSTAND ──────────────────────
  // Nicht aus `nav/instruction`. Das ist die ANSAGE: sie entsteht nur, wenn
  // eine Ansage-Schwelle faellt, und ihre `distance_m` ist die Entfernung in
  // genau diesem Augenblick. Gemeldet wurde: „Die Strecke bis zur naechsten
  // Abbiegung wird nicht geupdated. Die anderen Werte wohl schon" -- die
  // anderen kommen alle aus `navState`, im Sekundentakt.
  //
  // Der Text stand aus demselben Grund still: nach einer Abbiegung blieb die
  // eben absolvierte Anweisung stehen, bis fuer die naechste eine Schwelle
  // fiel. `next_maneuver` und `distance_to_maneuver_m` werden dagegen bei
  // jedem Takt neu gebildet.
  const manoever = navState?.next_maneuver ?? null;
  dazu(
    'sensor.yapaia_instruction',
    manoever?.instruction ?? UNBEKANNT,
    'Instruction',
    manoever
      ? {
          // Dieselben Zusatzangaben wie ueber MQTT -- die Vorlage des
          // Dashboards liest `icon` fuer den Richtungspfeil.
          type: manoever.type,
          street_names: manoever.street_names,
          distance_m: navState?.distance_to_maneuver_m ?? null,
          icon: maneuverIcon(manoever.type),
          // Fuer den Kreisel auf dem Display -- IMMER gesetzt, auch leer.
          // Warum, steht an `kreiselAttribut`.
          roundabout: kreiselAttribut(manoever),
          // Die Spuren vor dem Abbiegen, links nach rechts (Masken, siehe
          // `SPUR`). IMMER gesetzt, leer statt fehlend -- aus demselben
          // Grund wie `roundabout`: sonst bliebe die Leiste des letzten
          // Manoevers stehen.
          lanes: spurenAttribut(manoever),
        }
      : { icon: 'mdi:navigation' },
  );
  dazu(
    'sensor.yapaia_instruction_distance',
    zahl(manoever ? (navState?.distance_to_maneuver_m ?? null) : null),
    'Instruction Distance',
    {
      unit_of_measurement: 'm',
      device_class: 'distance',
      state_class: 'measurement',
    },
  );
  // Die Hoehe ebenso -- aber nur bei einem 3D-Fix, siehe `ausPosition.ts`.
  dazu('sensor.yapaia_altitude', zahl(navState?.altitude_m ?? hoeheAusPosition(position)), 'Altitude', {
    unit_of_measurement: 'm',
    device_class: 'distance',
    state_class: 'measurement',
    icon: 'mdi:altimeter',
  });
  dazu('sensor.yapaia_nav_state', navState?.status ?? 'idle', 'Nav State', {
    icon: 'mdi:navigation-variant',
  });
  dazu(
    'sensor.yapaia_destination',
    navState?.destination?.name ?? UNBEKANNT,
    'Destination',
    navState?.destination
      ? {
          lat: navState.destination.latlng.lat,
          lon: navState.destination.latlng.lon,
          icon: 'mdi:flag-checkered',
        }
      : { icon: 'mdi:flag-checkered' },
  );

  if (position) {
    // `device_tracker` traegt die Position in den Attributen; der Zustand ist
    // die Zone. „not_home" ist die ehrliche Vorgabe -- ob das Fahrzeug in
    // einer Zone steht, entscheidet Home Assistant selbst nicht fuer
    // fremdgeschriebene Tracker, und „home" zu behaupten waere geraten.
    schreibt.push({
      entityId: EIGENER_FAHRZEUG_TRACKER,
      state: 'not_home',
      attributes: {
        friendly_name: `${GERAET} Vehicle`,
        source_type: 'gps',
        latitude: position.lat,
        longitude: position.lon,
        gps_accuracy: position.accuracy ?? 0,
      },
    });
  }

  return schreibt;
}
