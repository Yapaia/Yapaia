/**
 * Was Yapaia Go der zentralen Integration „Yapaia" anbietet
 * (docs/integration-protokoll.md, Abschnitt 5) -- und die Werte dazu.
 *
 * Die Werte entstehen NICHT neu, sondern aus {@link buildHaStates}: dort steht
 * seit Jahren, welches Tempo gilt (Route vor GPS), wann das Tempolimit ohne
 * Route zaehlt und was `zu schnell` heisst. Zwei Rechenwege fuer dieselbe
 * Anzeige liefen frueher oder spaeter auseinander. Hier wird nur umbenannt
 * (deutsche, feste Schluessel) und aus `"unknown"` wird `null`.
 */

import { kernSprache } from '../i18n.js';
import { buildHaStates, UNBEKANNT, type YapaiaZustand } from '../ha/statesBridge.js';
import { EIGENER_FAHRZEUG_TRACKER } from '../ha/eigeneEntitaeten.js';
import type { Adresse } from '../search/adresseDienst.js';

export const PROTOKOLL = 1;
export const MODUL = 'go';
export const NAME = 'Yapaia Go';
export const API = '/yapaia/v1';
/** Siehe docs/faehigkeiten.md. */
export const FAEHIGKEITEN = ['navigation'] as const;

type Text = { de: string; en: string };

export interface Entitaet {
  schluessel: string;
  plattform: string;
  name: Text;
  geraeteklasse?: string;
  einheit?: string;
  zustandsklasse?: string;
  symbol?: string;
  symbol_aus?: string;
  kategorie?: 'config' | 'diagnostic';
  standard_aktiv?: boolean;
  aktion?: string;
  optionen_aus?: string;
  attribute?: string[];
}

export const ENTITAETEN: readonly Entitaet[] = [
  {
    schluessel: 'anweisung',
    plattform: 'sensor',
    name: { de: 'Nächste Anweisung', en: 'Next instruction' },
    symbol: 'mdi:navigation',
    symbol_aus: 'anweisung_symbol',
    attribute: ['anweisung_typ', 'anweisung_strassen', 'anweisung_kreisel', 'anweisung_spuren'],
  },
  {
    schluessel: 'anweisung_entfernung',
    plattform: 'sensor',
    name: { de: 'Entfernung zur Anweisung', en: 'Distance to instruction' },
    geraeteklasse: 'distance',
    einheit: 'm',
    zustandsklasse: 'measurement',
  },
  {
    schluessel: 'ankunft',
    plattform: 'sensor',
    name: { de: 'Ankunft', en: 'Arrival' },
    geraeteklasse: 'timestamp',
    symbol: 'mdi:clock-outline',
  },
  {
    schluessel: 'restweg',
    plattform: 'sensor',
    name: { de: 'Restweg', en: 'Distance remaining' },
    geraeteklasse: 'distance',
    einheit: 'km',
    zustandsklasse: 'measurement',
    symbol: 'mdi:map-marker-distance',
  },
  {
    schluessel: 'ziel',
    plattform: 'sensor',
    name: { de: 'Ziel', en: 'Destination' },
    symbol: 'mdi:flag-checkered',
    attribute: ['ziel_breite', 'ziel_laenge'],
  },
  {
    schluessel: 'zustand',
    plattform: 'sensor',
    name: { de: 'Zustand', en: 'State' },
    symbol: 'mdi:navigation-variant',
  },
  {
    schluessel: 'tempo',
    plattform: 'sensor',
    name: { de: 'Tempo', en: 'Speed' },
    geraeteklasse: 'speed',
    einheit: 'km/h',
    zustandsklasse: 'measurement',
    symbol: 'mdi:speedometer',
  },
  {
    schluessel: 'tempolimit',
    plattform: 'sensor',
    name: { de: 'Tempolimit', en: 'Speed limit' },
    geraeteklasse: 'speed',
    einheit: 'km/h',
    zustandsklasse: 'measurement',
    symbol: 'mdi:speedometer-medium',
  },
  {
    schluessel: 'tempolimit_fahrzeug',
    plattform: 'sensor',
    name: { de: 'Tempolimit Fahrzeug', en: 'Vehicle speed limit' },
    geraeteklasse: 'speed',
    einheit: 'km/h',
    zustandsklasse: 'measurement',
    symbol: 'mdi:truck-alert',
  },
  {
    schluessel: 'zu_schnell',
    plattform: 'binary_sensor',
    name: { de: 'Zu schnell', en: 'Speeding' },
    geraeteklasse: 'safety',
    attribute: ['grenze_kmh', 'grenze_quelle'],
  },
  {
    schluessel: 'hoehe',
    plattform: 'sensor',
    name: { de: 'Höhe', en: 'Altitude' },
    geraeteklasse: 'distance',
    einheit: 'm',
    zustandsklasse: 'measurement',
    symbol: 'mdi:altimeter',
  },
  {
    schluessel: 'ort',
    plattform: 'sensor',
    name: { de: 'Ort', en: 'Place' },
    symbol: 'mdi:map-marker-radius',
    attribute: ['land', 'land_code'],
  },
  {
    // Sprache von Go (Einstellung `language`, von der Integration aus der
    // HA-Sprache gesetzt) -- für Geräte ohne eigene Verbindung zur
    // HA-Sprache, etwa die ESPHome-Navi-Anzeige
    schluessel: 'sprache',
    plattform: 'sensor',
    name: { de: 'Sprache', en: 'Language' },
    symbol: 'mdi:translate',
    kategorie: 'diagnostic',
  },
  {
    schluessel: 'adresse',
    plattform: 'sensor',
    name: { de: 'Adresse', en: 'Address' },
    symbol: 'mdi:home-map-marker',
    attribute: ['strasse', 'hausnummer', 'plz', 'ort', 'land', 'land_code', 'entfernung_m'],
  },
  {
    schluessel: 'standort',
    plattform: 'device_tracker',
    name: { de: 'Standort', en: 'Location' },
    symbol: 'mdi:rv-truck',
  },
  {
    schluessel: 'profil',
    plattform: 'select',
    name: { de: 'Fahrzeugprofil', en: 'Vehicle profile' },
    symbol: 'mdi:rv-truck',
    optionen_aus: 'profile',
    aktion: 'profil_waehlen',
  },
  {
    schluessel: 'ziel_eingabe',
    plattform: 'text',
    name: { de: 'Ziel eingeben', en: 'Enter destination' },
    symbol: 'mdi:map-search',
    aktion: 'ziel_setzen',
  },
  { schluessel: 'pausieren', plattform: 'button', name: { de: 'Pause', en: 'Pause' }, symbol: 'mdi:pause', aktion: 'navigation_pausieren' },
  { schluessel: 'fortsetzen', plattform: 'button', name: { de: 'Weiter', en: 'Resume' }, symbol: 'mdi:play', aktion: 'navigation_fortsetzen' },
  { schluessel: 'beenden', plattform: 'button', name: { de: 'Beenden', en: 'Stop' }, symbol: 'mdi:stop', aktion: 'navigation_beenden' },
];

export const AKTIONEN = [
  {
    name: 'ziel_setzen',
    titel: { de: 'Ziel setzen', en: 'Set destination' },
    beschreibung: {
      de: 'Sucht das Ziel, berechnet die Route mit dem aktiven Fahrzeugprofil und startet die Navigation.',
      en: 'Looks up the destination, routes with the active vehicle profile and starts navigating.',
    },
    felder: {
      ziel: { typ: 'text', titel: { de: 'Adresse oder Ort', en: 'Address or place' } },
      ort: { typ: 'ort', titel: { de: 'Oder: Koordinaten', en: 'Or: coordinates' } },
      name: { typ: 'text', titel: { de: 'Name des Ziels (zu den Koordinaten)', en: 'Destination name (for coordinates)' } },
    },
  },
  {
    name: 'zwischenziel_einfuegen',
    titel: { de: 'Zwischenziel einfügen', en: 'Add stop' },
    beschreibung: {
      de: 'Fügt den Ort als nächsten Halt in die laufende Navigation ein. Ohne laufende Navigation wird er das Ziel.',
      en: 'Adds the place as the next stop of the running navigation. Without one it becomes the destination.',
    },
    felder: {
      ort: { typ: 'ort', pflicht: true, titel: { de: 'Ort', en: 'Place' } },
      name: { typ: 'text', titel: { de: 'Name', en: 'Name' } },
    },
  },
  { name: 'navigation_pausieren', titel: { de: 'Navigation pausieren', en: 'Pause navigation' } },
  { name: 'navigation_fortsetzen', titel: { de: 'Navigation fortsetzen', en: 'Resume navigation' } },
  { name: 'navigation_beenden', titel: { de: 'Navigation beenden', en: 'Stop navigation' } },
  {
    name: 'profil_waehlen',
    titel: { de: 'Fahrzeugprofil wählen', en: 'Select vehicle profile' },
    felder: { wert: { typ: 'text', pflicht: true, titel: { de: 'Profilname', en: 'Profile name' } } },
  },
  {
    name: 'befehl',
    titel: { de: 'Sprachbefehl', en: 'Voice command' },
    beschreibung: {
      de: 'Ein Satz wie „Fahre mich nach Magdeburg" oder „Wo ist die nächste Tankstelle?". Die Antwort kommt als Ergebnis zurück.',
      en: 'A sentence such as "Take me to Magdeburg". The reply is returned as the result.',
    },
    felder: { text: { typ: 'text', pflicht: true, titel: { de: 'Satz', en: 'Sentence' } } },
  },
] as const;

export const EREIGNISSE = [
  { name: 'ziel_erreicht', titel: { de: 'Ziel erreicht', en: 'Destination reached' }, daten: ['ziel'] },
  { name: 'zu_schnell', titel: { de: 'Zu schnell', en: 'Speeding' }, daten: ['tempo', 'grenze_kmh'] },
  { name: 'gps_verloren', titel: { de: 'GPS verloren', en: 'GPS lost' } },
  { name: 'neuberechnung_fehlgeschlagen', titel: { de: 'Neuberechnung fehlgeschlagen', en: 'Reroute failed' } },
] as const;

export interface Identitaet {
  instanz: string;
  token: string;
}

export function beschreibung(ident: Identitaet, version: string): Record<string, unknown> {
  return {
    protokoll: PROTOKOLL,
    modul: MODUL,
    instanz: ident.instanz,
    name: NAME,
    version,
    hersteller: 'Yapaia',
    faehigkeiten: [...FAEHIGKEITEN],
    entitaeten: ENTITAETEN,
    aktionen: AKTIONEN,
    ereignisse: EREIGNISSE,
  };
}

export interface GoZustand extends YapaiaZustand {
  /** Namen aller Fahrzeugprofile -- die Optionen der Auswahl. */
  profile: string[];
  /** Name des aktiven Profils. */
  profil: string | null;
  /** Ort und Adresse an der Position (search/adresseDienst.ts). */
  adresse?: Adresse | null;
}

function zahl(s: string | undefined): number | null {
  if (s === undefined || s === UNBEKANNT) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function textOderNull(s: string | undefined): string | null {
  return s === undefined || s === UNBEKANNT ? null : s;
}

/** Alle Werte für die Live-Verbindung -- vollständig, `null` = unbekannt. */
export function werte(z: GoZustand): Record<string, unknown> {
  const s = new Map(buildHaStates(z).map((w) => [w.entityId, w]));
  const st = (id: string) => s.get(id)?.state;
  const at = (id: string) => s.get(id)?.attributes ?? {};
  const anweisung = at('sensor.yapaia_instruction');
  const ziel = at('sensor.yapaia_destination');
  const zuSchnell = at('binary_sensor.yapaia_speeding');
  const tracker = s.get(EIGENER_FAHRZEUG_TRACKER)?.attributes;
  const zielName = textOderNull(st('sensor.yapaia_destination'));
  return {
    anweisung: textOderNull(st('sensor.yapaia_instruction')),
    anweisung_symbol: anweisung.icon ?? null,
    anweisung_typ: anweisung.type ?? null,
    anweisung_strassen: anweisung.street_names ?? null,
    anweisung_kreisel: anweisung.roundabout ?? null,
    anweisung_spuren: anweisung.lanes ?? null,
    anweisung_entfernung: zahl(st('sensor.yapaia_instruction_distance')),
    ankunft: textOderNull(st('sensor.yapaia_eta')),
    restweg: zahl(st('sensor.yapaia_distance_remaining')),
    ziel: zielName,
    ziel_eingabe: zielName ?? '',
    ziel_breite: ziel.lat ?? null,
    ziel_laenge: ziel.lon ?? null,
    zustand: textOderNull(st('sensor.yapaia_nav_state')),
    tempo: zahl(st('sensor.yapaia_speed')),
    tempolimit: zahl(st('sensor.yapaia_speed_limit')),
    tempolimit_fahrzeug: zahl(st('sensor.yapaia_speed_limit_vehicle')),
    zu_schnell: st('binary_sensor.yapaia_speeding') === 'on',
    grenze_kmh: zuSchnell.grenze_kmh ?? null,
    grenze_quelle: zuSchnell.quelle ?? null,
    hoehe: zahl(st('sensor.yapaia_altitude')),
    standort: tracker
      ? { breite: tracker.latitude, laenge: tracker.longitude, genauigkeit: tracker.gps_accuracy ?? 0 }
      : null,
    profile: z.profile,
    profil: z.profil,
    sprache: kernSprache(),
    ort: z.adresse?.ort ?? null,
    adresse: z.adresse?.text ?? null,
    strasse: z.adresse?.strasse ?? null,
    hausnummer: z.adresse?.hausnummer ?? null,
    plz: z.adresse?.plz ?? null,
    land: z.adresse?.land ?? null,
    land_code: z.adresse?.land_code ?? null,
    entfernung_m: z.adresse?.entfernung_m ?? null,
  };
}

/** Was sich gegenüber dem zuletzt gesendeten Stand geändert hat. */
export function aenderungen(alt: Record<string, unknown>, neu: Record<string, unknown>): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(neu)) {
    if (JSON.stringify(alt[k]) !== JSON.stringify(v)) diff[k] = v;
  }
  return diff;
}
