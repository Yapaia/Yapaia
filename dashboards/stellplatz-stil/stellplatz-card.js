/**
 * Stellplatz – eine Karte für das ganze Dashboard, in drei Aufbauten (`stil`):
 *   retro    – Kacheln (wie der Entwurf „Retro-Camper“)
 *   magazin  – Magazin: Seitenspalte, große Zahlen, kurze Sätze
 *   mix      – Magazin mit gerahmten Karten
 *   breit    – Breitbild, eine Zeile mit sechs Spalten (für 1920 × 720, z. B. Wisecoco 12,3")
 * Farben, Schriften und Deko kommen aus dem Yapaia-Design-Schema
 * (docs/design-schemata.md): `design: auto` (Standard) folgt dem Gesamt-Schema,
 * eine Schema-ID legt es für diese Karte fest.
 *
 * Zeigt Heizung (Truma), Warmwasser, Batterie, Solar, Gas/Wasser, Licht,
 * Aufbautür, Radio (Yapaia Beat), WLAN (Yapaia Router), Wetter und Sonne.
 *
 * Einbinden (Ressource, Typ JavaScript-Modul):
 *   /local/yapaia-dashboards/stellplatz-card.js
 *
 * Im Dashboard (am besten als einzige Karte einer Ansicht vom Typ „Panel“):
 *   type: custom:yapaia-stellplatz-card
 *   stil: retro | magazin | mix | breit
 *   design: auto | retro | magazin | sport | …
 * Alle Entitäten lassen sich im grafischen Editor einstellen.
 *
 * Schriften liefert die Integration lokal mit (/yapaia_design/schriften/).
 */

const LICHTER = [
  ["light.smartwomo_ausgang_out2", "Dinette"],
  ["light.smartwomo_ausgang_out1", "Außen"],
  ["light.smartwomo_ausgang_out5", "Ambiente"],
  ["light.smartwomo_ausgang_out6", "Ambiente Bett"],
  ["light.smartwomo_ausgang_out4", "Bett"],
  ["light.smartwomo_ausgang_out8", "Bad"],
  ["light.smartwomo_ausgang_out3", "Eingang"],
  ["light.smartwomo_ausgang_out7", "Nachtlicht"],
];

const STANDARD = {
  stil: "retro",
  design: "auto",
  titel: "Stellplatz",
  ort: "",
  // Ort aus einer Entität: Sensor „Ort“ von Yapaia Go (offline, ab Go 0.65.0);
  // auch eine Geocoded Location der Companion-App geht (Attribut „locality“)
  ort_entity: "sensor.yapaia_go_ort",
  raum: "climate.heizung_truma_room",
  wasser: "climate.heizung_truma_water",
  soc: "sensor.btcollector_state_of_charge",
  soc_2: "sensor.btcollector_state_of_charge_2",
  spannung: "sensor.btcollector_battery_voltage",
  strom: "sensor.btcollector_current",
  strom_2: "sensor.btcollector_current_2",
  restlaufzeit: "sensor.batterien_restlaufzeit",
  spannung_2: "sensor.btcollector_battery_voltage_2",
  // Leistung je Batterie in W (negativ = Entladen). Leer: Spannung × Strom der
  // Shunts. Die BMS-Werte (…battery_1_power) springen bei kleinen Strömen
  // zwischen echtem Wert und 0 -- deshalb nicht der Standard.
  leistung: null,
  leistung_2: null,
  // Für „voll in …“: Kapazität aller Batterien zusammen
  kapazitaet_ah: 600,
  pv: "sensor.btcollector_mppt_pv_power",
  ertrag: "sensor.btcollector_mppt_yield_today",
  gas_1: "sensor.btcollector_gas_sensor_1_level",
  gas_2: "sensor.btcollector_gas_sensor_2_level",
  frischwasser: "sensor.smartwomo_analog_pressure_sensor",
  wasser_leer_v: null,
  wasser_voll_v: null,
  tuer: "lock.door_aufbautur",
  radio: "media_player.yapaia_beat",
  internet: "sensor.yapaia_router_internet",
  wetter: "weather.forecast_home",
  sonne: "sun.sun",
  lichter: LICHTER.map(([entity, name]) => ({ entity, name })),
};

// Truma-Warmwasser: Solltemperatur ↔ Modus (Schlüssel, Textschlüssel, °C)
const WASSER_MODI = [
  ["eco", "modus_eco", 40],
  ["heiss", "modus_heiss", 60],
  ["boost", "modus_boost", 80],
];

// Texte je Sprache (docs/sprachen.md): folgt der HA-Sprache, Deutsch oder sonst Englisch
const TEXTE = {
  de: {
    auto: "Automatisch",
    stil: "Aufbau",
    kacheln: "Kacheln",
    magazin: "Magazin",
    magazin_karten: "Magazin mit Karten",
    breitbild: "Breitbild (1920 × 720)",
    design: "Design-Schema",
    titel: "Titel",
    ort_fest: "Ort fest eintragen (sonst aus der Entität)",
    ort_entity: "Ort aus Entität",
    raum: "Heizung Raum",
    warmwasser: "Warmwasser",
    soc: "Ladestand Batterie 1",
    soc_2: "Ladestand Batterie 2 (optional)",
    spannung: "Spannung Batterie 1",
    spannung_2: "Spannung Batterie 2 (optional)",
    strom: "Strom Batterie 1",
    strom_2: "Strom Batterie 2 (optional)",
    restlaufzeit_tage: "Restlaufzeit (Tage)",
    leistung: "Leistung Batterie 1 (optional, sonst Spannung × Strom)",
    leistung_2: "Leistung Batterie 2 (optional)",
    kapazitaet: "Kapazität aller Batterien",
    solarleistung: "Solarleistung",
    solarertrag: "Solarertrag heute",
    gas_1: "Gas 1",
    gas_2: "Gas 2",
    frischwasser: "Frischwasser",
    wasser_leer: "Wasser leer bei",
    wasser_voll: "Wasser voll bei",
    tuer: "Aufbautür",
    radio: "Radio",
    router_internet: "Router „Internet über“",
    wetter: "Wetter",
    sonne: "Sonne",
    lichter_liste: "Lichter (Liste aus entity und name)",
    hilfe_wasser: "Ohne beide Werte zeigt die Karte die Spannung des Drucksensors.",
    hilfe_kapazitaet: "Für die Schätzung, wann die Batterie wieder voll ist.",
    gruppe_heizung: "Heizung",
    gruppe_batterie: "Batterie und Solar",
    gruppe_vorraete: "Vorräte",
    gruppe_sonstiges: "Tür, Radio, Internet, Wetter",
    modus_eco: "Eco",
    modus_heiss: "Heiß",
    modus_boost: "Boost",
    aus: "Aus",
    "wetter_clear-night": "klare Nacht",
    wetter_cloudy: "bewölkt",
    wetter_exceptional: "Unwetter",
    wetter_fog: "Nebel",
    wetter_hail: "Hagel",
    wetter_lightning: "Gewitter",
    "wetter_lightning-rainy": "Gewitter mit Regen",
    wetter_partlycloudy: "teils bewölkt",
    wetter_pouring: "Starkregen",
    wetter_rainy: "Regen",
    wetter_snowy: "Schnee",
    "wetter_snowy-rainy": "Schneeregen",
    wetter_sunny: "sonnig",
    wetter_windy: "windig",
    "wetter_windy-variant": "windig, bewölkt",
    dauer_tage: "{n} Tagen",
    dauer_std: "{h} Std",
    dauer_std_min: "{h} Std {m} Min",
    dauer_min: "{m} Min",
    voll_laedt: "voll · lädt",
    voll_in: "voll in ca. {dauer} (gegen {uhr})",
    laedt_gerade: "lädt gerade",
    restlaufzeit_unbekannt: "Restlaufzeit unbekannt",
    restlaufzeit_text: "{rest} Restlaufzeit",
    batt_laedt: "Die Batterie <b>lädt mit {w} W</b>.",
    batt_voll: " Sie ist voll.",
    batt_voll_in: " Voll in ca. <b>{dauer}</b>, gegen {uhr}.",
    batt_verbrauch: "Gerade werden <b>{w} W</b> verbraucht. ",
    batt_kaum: "Gerade fließt kaum Strom. ",
    batt_reicht: "Reicht noch <b>{rest}</b>.",
    unbekannt: "unbekannt",
    rest_tag: "{n} Tag {std} Std",
    rest_tage: "{n} Tage {std} Std",
    rest_std: "{std} Std",
    gas_voll: "voll",
    nochmal_entriegeln: "Nochmal tippen: entriegeln",
    nochmal_verriegeln: "Nochmal tippen: verriegeln",
    tuer_locked: "verriegelt",
    tuer_unlocked: "offen",
    tuer_locking: "verriegelt …",
    tuer_unlocking: "entriegelt …",
    tuer_jammed: "klemmt!",
    raum_aus: "aus · innen {ist}°",
    raum_innen: "innen {ist}° · {zustand}",
    heizt: "heizt",
    haelt: "hält",
    kein_wlan: "kein WLAN",
    kein_wlan_gross: "Kein WLAN",
    internet_ueber: "Internet über {quelle}",
    heizung_raum: "Heizung · Raum",
    aus_klein: "aus",
    waermer: "Wärmer",
    kaelter: "Kälter",
    heizung_an_aus: "Heizung an/aus",
    wasser: "Wasser",
    batterie: "Batterie",
    richtung_laden: "lädt",
    richtung_entladen: "entlädt",
    richtung_ruhe: "Ruhe",
    richtung_verbrauch: "Verbrauch",
    solar: "Solar",
    heute_kwh: "heute <b>{kwh} kWh</b>",
    heute_kwh_klein: "heute {kwh} kWh",
    licht: "Licht",
    vorraete: "Vorräte",
    sender_waehlen: "Sender wählen",
    voriger_sender: "Voriger Sender",
    wiedergabe: "Wiedergabe",
    naechster_sender: "Nächster Sender",
    sonnenuntergang: "Sonnenuntergang",
    sonnenaufgang: "Sonnenaufgang",
    uhrzeit: "Uhrzeit",
    heute_im_mobil: "Heute im Mobil",
    energie: "Energie",
    waerme: "Wärme",
    sonne_liefert: "Die Sonne liefert <b class=\"akz\">{w} W</b>, heute {kwh} kWh.",
    sonne_heute: "Heute {kwh} kWh von der Sonne.",
    magazin_raum_an: "Innen {ist}°, die Truma {zustand}.",
    truma_heizt: "heizt",
    truma_haelt: "hält die Temperatur",
    magazin_raum_aus: "Heizung aus, innen {ist}°.",
    warmwasser_satz: "Warmwasser <b>{w}</b>.",
    alles_aus: "Alles aus",
    laeuft_gerade: "Läuft gerade",
    wind: "Wind {v} km/h",
    warmwasser_kopf: "Warmwasser",
    fehler: "Fehler: {fehler}",
    kartenbeschreibung: "Ganzes Stellplatz-Dashboard in einer Karte – Stil Retro-Camper, Outdoor-Magazin oder Mix.",
  },
  en: {
    auto: "Automatic",
    stil: "Layout",
    kacheln: "Tiles",
    magazin: "Magazine",
    magazin_karten: "Magazine with cards",
    breitbild: "Widescreen (1920 × 720)",
    design: "Design scheme",
    titel: "Title",
    ort_fest: "Fixed location (otherwise from the entity)",
    ort_entity: "Location from entity",
    raum: "Heating, cabin",
    warmwasser: "Hot water",
    soc: "State of charge battery 1",
    soc_2: "State of charge battery 2 (optional)",
    spannung: "Voltage battery 1",
    spannung_2: "Voltage battery 2 (optional)",
    strom: "Current battery 1",
    strom_2: "Current battery 2 (optional)",
    restlaufzeit_tage: "Remaining runtime (days)",
    leistung: "Power battery 1 (optional, otherwise voltage × current)",
    leistung_2: "Power battery 2 (optional)",
    kapazitaet: "Capacity of all batteries",
    solarleistung: "Solar power",
    solarertrag: "Solar yield today",
    gas_1: "Gas 1",
    gas_2: "Gas 2",
    frischwasser: "Fresh water",
    wasser_leer: "Water empty at",
    wasser_voll: "Water full at",
    tuer: "Habitation door",
    radio: "Radio",
    router_internet: "Router “Internet via”",
    wetter: "Weather",
    sonne: "Sun",
    lichter_liste: "Lights (list of entity and name)",
    hilfe_wasser: "Without both values the card shows the pressure sensor voltage.",
    hilfe_kapazitaet: "Used to estimate when the battery will be full.",
    gruppe_heizung: "Heating",
    gruppe_batterie: "Battery and solar",
    gruppe_vorraete: "Supplies",
    gruppe_sonstiges: "Door, radio, internet, weather",
    modus_eco: "Eco",
    modus_heiss: "Hot",
    modus_boost: "Boost",
    aus: "Off",
    "wetter_clear-night": "clear night",
    wetter_cloudy: "cloudy",
    wetter_exceptional: "severe weather",
    wetter_fog: "fog",
    wetter_hail: "hail",
    wetter_lightning: "thunderstorm",
    "wetter_lightning-rainy": "thunderstorm with rain",
    wetter_partlycloudy: "partly cloudy",
    wetter_pouring: "heavy rain",
    wetter_rainy: "rain",
    wetter_snowy: "snow",
    "wetter_snowy-rainy": "sleet",
    wetter_sunny: "sunny",
    wetter_windy: "windy",
    "wetter_windy-variant": "windy, cloudy",
    dauer_tage: "{n} days",
    dauer_std: "{h} h",
    dauer_std_min: "{h} h {m} min",
    dauer_min: "{m} min",
    voll_laedt: "full · charging",
    voll_in: "full in approx. {dauer} (around {uhr})",
    laedt_gerade: "charging now",
    restlaufzeit_unbekannt: "Remaining runtime unknown",
    restlaufzeit_text: "{rest} remaining",
    batt_laedt: "The battery is <b>charging at {w} W</b>.",
    batt_voll: " It is full.",
    batt_voll_in: " Full in approx. <b>{dauer}</b>, around {uhr}.",
    batt_verbrauch: "Currently <b>{w} W</b> in use. ",
    batt_kaum: "Hardly any current is flowing. ",
    batt_reicht: "Lasts another <b>{rest}</b>.",
    unbekannt: "unknown",
    rest_tag: "{n} day {std} h",
    rest_tage: "{n} days {std} h",
    rest_std: "{std} h",
    gas_voll: "full",
    nochmal_entriegeln: "Tap again to unlock",
    nochmal_verriegeln: "Tap again to lock",
    tuer_locked: "locked",
    tuer_unlocked: "open",
    tuer_locking: "locking …",
    tuer_unlocking: "unlocking …",
    tuer_jammed: "jammed!",
    raum_aus: "off · inside {ist}°",
    raum_innen: "inside {ist}° · {zustand}",
    heizt: "heating",
    haelt: "holding",
    kein_wlan: "no Wi-Fi",
    kein_wlan_gross: "No Wi-Fi",
    internet_ueber: "Internet via {quelle}",
    heizung_raum: "Heating · cabin",
    aus_klein: "off",
    waermer: "Warmer",
    kaelter: "Cooler",
    heizung_an_aus: "Heating on/off",
    wasser: "Water",
    batterie: "Battery",
    richtung_laden: "charging",
    richtung_entladen: "discharging",
    richtung_ruhe: "idle",
    richtung_verbrauch: "Usage",
    solar: "Solar",
    heute_kwh: "today <b>{kwh} kWh</b>",
    heute_kwh_klein: "today {kwh} kWh",
    licht: "Lights",
    vorraete: "Supplies",
    sender_waehlen: "Choose a station",
    voriger_sender: "Previous station",
    wiedergabe: "Play/pause",
    naechster_sender: "Next station",
    sonnenuntergang: "Sunset",
    sonnenaufgang: "Sunrise",
    uhrzeit: "Time",
    heute_im_mobil: "Today in the motorhome",
    energie: "Energy",
    waerme: "Warmth",
    sonne_liefert: "The sun delivers <b class=\"akz\">{w} W</b>, {kwh} kWh today.",
    sonne_heute: "{kwh} kWh from the sun today.",
    magazin_raum_an: "Inside {ist}°, the Truma {zustand}.",
    truma_heizt: "is heating",
    truma_haelt: "is holding the temperature",
    magazin_raum_aus: "Heating off, inside {ist}°.",
    warmwasser_satz: "Hot water <b>{w}</b>.",
    alles_aus: "All off",
    laeuft_gerade: "Now playing",
    wind: "Wind {v} km/h",
    warmwasser_kopf: "Hot water",
    fehler: "Error: {fehler}",
    kartenbeschreibung: "Complete pitch dashboard in one card – retro camper, outdoor magazine or mix style.",
  },
};
const spracheVon = (hass) =>
  String(hass?.locale?.language ?? hass?.language ?? document.querySelector("home-assistant")?.hass?.locale?.language ?? "en")
    .toLowerCase().startsWith("de") ? "de" : "en";
const t = (hass, schluessel, werte = {}) =>
  String(TEXTE[spracheVon(hass)]?.[schluessel] ?? TEXTE.en[schluessel] ?? schluessel).replace(/\{(\w+)\}/g, (_, k) => werte[k] ?? "");
// Zahlen, Datum, Uhrzeit im Format der HA-Sprache
const gebiet = (hass) => hass?.locale?.language ?? hass?.language ?? "de-DE";
// Format-Gebiet der gerade gezeichneten Karte (wird in _zeichnen gesetzt)
let GEBIET = "de-DE";

// Yapaia Design (Integration ab 0.7.0); ohne sie gelten die Rückfallfarben im CSS
const DESIGN = import("/yapaia_design/yapaia-design.js").then(() => window.YapaiaDesign.bereit).catch(() => null);

const zahl = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const de = (n, st = 0) => (n === null || n === undefined ? "–" : n.toLocaleString(GEBIET, { minimumFractionDigits: st, maximumFractionDigits: st }));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uhrzeit = (iso) => (iso ? new Date(iso).toLocaleTimeString(GEBIET, { hour: "2-digit", minute: "2-digit" }) : "–");

const ICON = {
  schloss: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  offen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>`,
  sonne: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>`,
  wlan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 9a15 15 0 0 1 20 0"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
  zurueck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>`,
  vor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`,
  power: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3v8M6.3 7.3a8 8 0 1 0 11.4 0"/></svg>`,
};

const HOEHENLINIEN = `<svg class="topo" viewBox="0 0 420 800" preserveAspectRatio="xMidYMax slice" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
  <path d="M-20 520c60-40 120-30 170-70s70-110 140-120 110 30 150 10"/><path d="M-20 560c70-40 130-20 190-60s80-110 150-118 100 34 120 22"/>
  <path d="M-20 600c80-40 140-10 210-50s90-100 160-110 70 30 90 24"/><path d="M-20 640c90-30 160 0 230-40s100-90 170-96"/>
  <path d="M-20 680c100-20 180 10 250-30s110-70 190-70"/><path d="M-20 720c110-10 200 20 270-14s120-50 190-46"/>
  <path d="M90 300c30-40 90-50 130-20s30 90-20 100-130-30-110-80z"/><path d="M70 300c36-60 120-70 170-30s40 120-30 136-170-40-140-106z"/>
  <path d="M50 300c40-80 150-90 210-40s50 150-40 172-210-50-170-132z"/></svg>`;

class YapaiaStellplatzCard extends HTMLElement {
  // Neue Karte: alle Standard-Entitäten ausdrücklich, damit der Editor sie zeigt
  static getStubConfig() {
    const stub = Object.fromEntries(Object.entries(STANDARD).filter(([, v]) => v !== null && v !== ""));
    return { ...stub, lichter: STANDARD.lichter.map((l) => ({ ...l })) };
  }

  static getConfigForm() {
    const e = (domain) => ({ entity: { domain } });
    return {
      schema: [
        { name: "stil", required: true, selector: { select: { mode: "box", options: [
          { value: "retro", label: t(null, "kacheln") }, { value: "magazin", label: t(null, "magazin") }, { value: "mix", label: t(null, "magazin_karten") },
          { value: "breit", label: t(null, "breitbild") }] } } },
        { name: "design", selector: { select: { mode: "dropdown", options: window.YapaiaDesign?.optionen() ?? [{ value: "auto", label: t(null, "auto") }] } } },
        { type: "grid", name: "", schema: [{ name: "titel", selector: { text: {} } }, { name: "ort", selector: { text: {} } }] },
        { name: "ort_entity", selector: { entity: { domain: "sensor" } } },
        { type: "expandable", flatten: true, name: "", title: t(null, "gruppe_heizung"), schema: [
          { name: "raum", selector: e("climate") }, { name: "wasser", selector: e("climate") }] },
        { type: "expandable", flatten: true, name: "", title: t(null, "gruppe_batterie"), schema: [
          { name: "soc", selector: e("sensor") }, { name: "soc_2", selector: e("sensor") },
          { name: "spannung", selector: e("sensor") }, { name: "spannung_2", selector: e("sensor") },
          { name: "strom", selector: e("sensor") }, { name: "strom_2", selector: e("sensor") },
          { name: "restlaufzeit", selector: e("sensor") }, { name: "leistung", selector: e("sensor") }, { name: "leistung_2", selector: e("sensor") },
          { name: "kapazitaet_ah", selector: { number: { min: 10, max: 2000, step: 10, mode: "box", unit_of_measurement: "Ah" } } },
          { name: "pv", selector: e("sensor") }, { name: "ertrag", selector: e("sensor") }] },
        { type: "expandable", flatten: true, name: "", title: t(null, "gruppe_vorraete"), schema: [
          { name: "gas_1", selector: e("sensor") }, { name: "gas_2", selector: e("sensor") }, { name: "frischwasser", selector: e("sensor") },
          { type: "grid", name: "", schema: [
            { name: "wasser_leer_v", selector: { number: { min: 0, max: 10, step: 0.01, mode: "box", unit_of_measurement: "V" } } },
            { name: "wasser_voll_v", selector: { number: { min: 0, max: 10, step: 0.01, mode: "box", unit_of_measurement: "V" } } }] }] },
        { type: "expandable", flatten: true, name: "", title: t(null, "gruppe_sonstiges"), schema: [
          { name: "tuer", selector: e("lock") }, { name: "radio", selector: e("media_player") },
          { name: "internet", selector: e("sensor") }, { name: "wetter", selector: e("weather") }, { name: "sonne", selector: e("sun") }] },
        { name: "lichter", selector: { object: {} } },
      ],
      computeLabel: (s) => ({
        stil: t(null, "stil"), design: t(null, "design"), titel: t(null, "titel"), ort: t(null, "ort_fest"), ort_entity: t(null, "ort_entity"), raum: t(null, "raum"), wasser: t(null, "warmwasser"),
        soc: t(null, "soc"), soc_2: t(null, "soc_2"), spannung: t(null, "spannung"), spannung_2: t(null, "spannung_2"), strom: t(null, "strom"),
        strom_2: t(null, "strom_2"), restlaufzeit: t(null, "restlaufzeit_tage"), leistung: t(null, "leistung"),
        leistung_2: t(null, "leistung_2"), kapazitaet_ah: t(null, "kapazitaet"), pv: t(null, "solarleistung"), ertrag: t(null, "solarertrag"),
        gas_1: t(null, "gas_1"), gas_2: t(null, "gas_2"), frischwasser: t(null, "frischwasser"), wasser_leer_v: t(null, "wasser_leer"), wasser_voll_v: t(null, "wasser_voll"),
        tuer: t(null, "tuer"), radio: t(null, "radio"), internet: t(null, "router_internet"), wetter: t(null, "wetter"), sonne: t(null, "sonne"),
        lichter: t(null, "lichter_liste"),
      })[s.name],
      computeHelper: (s) => ({
        wasser_leer_v: t(null, "hilfe_wasser"),
        kapazitaet_ah: t(null, "hilfe_kapazitaet"),
      })[s.name],
    };
  }

  setConfig(config) {
    this._config = { ...STANDARD, ...config };
    if (!Array.isArray(this._config.lichter)) this._config.lichter = STANDARD.lichter;
    this._key = null;
    this._tuerBestaetigen = 0;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (e) => this._klick(e));
    }
    DESIGN.then(() => {
      this._key = null;
      this._zeichnen();
    });
    clearInterval(this._uhr);
    this._uhr = setInterval(() => this._zeichnen(), 30000);
    this._zeichnen();
  }

  disconnectedCallback() {
    clearInterval(this._uhr);
  }

  connectedCallback() {
    if (this._config && !this._uhr) this._uhr = setInterval(() => this._zeichnen(), 30000);
  }

  set hass(hass) {
    this._hass = hass;
    this._zeichnen();
  }

  getCardSize() {
    return 12;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  // ---- Daten --------------------------------------------------------------

  _s(id) {
    return id ? this._hass?.states[id] : undefined;
  }

  _wert(id) {
    const s = this._s(id);
    return s ? zahl(s.state) : null;
  }

  _daten() {
    const c = this._config;
    const raum = this._s(c.raum);
    const wasser = this._s(c.wasser);
    const wSoll = zahl(wasser?.attributes?.temperature);
    const wModus = !wasser || wasser.state === "off" ? "aus"
      : (WASSER_MODI.reduce((best, m) => (wSoll !== null && Math.abs(m[2] - wSoll) < Math.abs(best[2] - wSoll) ? m : best), WASSER_MODI[0]))[0];
    const socs = [this._wert(c.soc), this._wert(c.soc_2)].filter((v) => v !== null);
    const stroeme = [this._wert(c.strom), this._wert(c.strom_2)].filter((v) => v !== null);
    const strom = stroeme.length ? stroeme.reduce((a, b) => a + b, 0) : null;
    const rest = this._wert(c.restlaufzeit);
    const fw = this._s(c.frischwasser);
    const fwV = fw ? zahl(fw.state) : null;
    let fwPct = null;
    if (fwV !== null && c.wasser_leer_v !== null && c.wasser_voll_v !== null && c.wasser_voll_v !== c.wasser_leer_v) {
      fwPct = Math.max(0, Math.min(100, ((fwV - c.wasser_leer_v) / (c.wasser_voll_v - c.wasser_leer_v)) * 100));
    }
    const tuer = this._s(c.tuer);
    const radio = this._s(c.radio);
    const ra = radio?.attributes ?? {};
    const inet = this._s(c.internet);
    const wetter = this._s(c.wetter);
    const sonne = this._s(c.sonne);
    const jetzt = new Date();
    return {
      titel: c.titel,
      ort: c.ort || this._ortAusEntitaet() || c.titel,
      uhr: jetzt.toLocaleTimeString(GEBIET, { hour: "2-digit", minute: "2-digit" }),
      wochentag: jetzt.toLocaleDateString(GEBIET, { weekday: "long" }),
      datum: jetzt.toLocaleDateString(GEBIET, { weekday: "long", day: "numeric", month: "long" }),
      raum: raum && {
        an: raum.state !== "off" && raum.state !== "unavailable",
        ist: zahl(raum.attributes.current_temperature),
        soll: zahl(raum.attributes.temperature),
        heizt: raum.attributes.hvac_action === "heating" || (raum.state === "heat" && zahl(raum.attributes.current_temperature) < zahl(raum.attributes.temperature)),
        schritt: zahl(raum.attributes.target_temp_step) || 0.5,
      },
      wasser: wasser && { modus: wModus, ist: zahl(wasser.attributes.current_temperature), soll: wModus === "aus" ? null : wSoll },
      batt: this._batterie(socs, strom, rest),
      solar: { w: this._wert(c.pv), kwh: this._wert(c.ertrag) },
      gas: [this._wert(c.gas_1), this._wert(c.gas_2)],
      fw: { pct: fwPct, v: fwV, da: Boolean(fw) },
      tuer: tuer && { zu: tuer.state === "locked", zustand: tuer.state },
      lichter: c.lichter.map((l) => ({ ...l, an: this._s(l.entity)?.state === "on", da: Boolean(this._s(l.entity)) })),
      radio: radio && {
        spielt: radio.state === "playing",
        aus: radio.state === "off" || radio.state === "unavailable",
        sender: ra.source || ra.media_channel || null,
        titel: [ra.media_artist, ra.media_title !== ra.source ? ra.media_title : null].filter(Boolean).join(" – "),
        favoriten: (ra.source_list || []).slice(0, 4),
        quelle: ra.source,
      },
      wlan: inet && { ssid: inet.attributes.wlan_ssid || null, quelle: inet.state },
      wetter: wetter && {
        temp: zahl(wetter.attributes.temperature),
        text: TEXTE.en[`wetter_${wetter.state}`] ? t(this._hass, `wetter_${wetter.state}`) : wetter.state,
        wind: zahl(wetter.attributes.wind_speed),
      },
      sonne: sonne && { unter: sonne.attributes.next_setting, auf: sonne.attributes.next_rising, oben: sonne.state === "above_horizon" },
    };
  }

  _batterie(socs, strom, rest) {
    const c = this._config;
    const soc = socs.length ? socs.reduce((a, b) => a + b, 0) / socs.length : null;
    const volt = this._wert(c.spannung);
    // Leistung: eigene Sensoren, wenn eingetragen; sonst je Batterie Spannung × Strom
    const leistungen = [this._wert(c.leistung), this._wert(c.leistung_2)].filter((v) => v !== null);
    const teile = [[c.spannung, c.strom], [c.spannung_2, c.strom_2]]
      .map(([v, i]) => [this._wert(v) ?? volt, this._wert(i)])
      .filter(([v, i]) => v !== null && i !== null);
    const w = leistungen.length ? leistungen.reduce((a, b) => a + b, 0)
      : teile.length ? teile.reduce((sum, [v, i]) => sum + v * i, 0) : null;
    const richtung = w === null ? (strom === null ? null : strom > 0.2 ? "laden" : strom < -0.2 ? "entladen" : "ruhe")
      : w > 3 ? "laden" : w < -3 ? "entladen" : "ruhe";
    // Wann voll? Fehlende Ah ÷ Ladestrom (Ladestrom notfalls aus W ÷ V).
    // Am Ende lädt eine Lithiumbatterie langsamer -- daher „ca.“.
    let vollIn = null;
    const ladestrom = strom !== null && strom > 0.2 ? strom : w !== null && w > 3 && volt ? w / volt : null;
    if (richtung === "laden" && soc !== null && soc < 99.5 && ladestrom && zahl(c.kapazitaet_ah)) {
      vollIn = (((100 - soc) / 100) * zahl(c.kapazitaet_ah)) / ladestrom; // Stunden
    }
    return { soc, volt, strom, rest, w, richtung, laedt: richtung === "laden", vollIn, voll: soc !== null && soc >= 99.5 };
  }

  /** Ortsname aus der Entität: `locality`, sonst der Zustand (ohne Straße). */
  _ortAusEntitaet() {
    const s = this._s(this._config.ort_entity);
    if (!s || ["unknown", "unavailable", ""].includes(s.state)) return null;
    const a = s.attributes ?? {};
    if (a.locality) return a.locality;
    // „Straße 4, 67368 Ort, Land“ → „Ort“
    const teile = String(s.state).split(",").map((t) => t.trim());
    const mitPlz = teile.find((t) => /^\d{4,5}\s/.test(t));
    return mitPlz ? mitPlz.replace(/^\d{4,5}\s+/, "") : teile[0];
  }

  /** Lange Ortsnamen bekommen eine kleinere Überschrift. */
  _laenge(text) {
    const n = String(text ?? "").length;
    return n > 22 ? "sehrlang" : n > 13 ? "lang" : "";
  }

  // ---- Bausteine (für alle Stile gleich) -----------------------------------

  _dauer(std) {
    if (std === null || !Number.isFinite(std)) return "–";
    if (std >= 48) return t(this._hass, "dauer_tage", { n: Math.round(std / 24) });
    const h = Math.floor(std);
    const m = Math.round((std - h) * 60 / 5) * 5;
    return h ? (m ? t(this._hass, "dauer_std_min", { h, m }) : t(this._hass, "dauer_std", { h })) : t(this._hass, "dauer_min", { m: Math.max(5, m) });
  }

  _vollUm(std) {
    return new Date(Date.now() + std * 3600e3).toLocaleTimeString(GEBIET, { hour: "2-digit", minute: "2-digit" });
  }

  /** „−24 W“ / „+120 W“ */
  _wText(b) {
    return b.w === null ? "–" : `${b.w > 0.5 ? "+" : b.w < -0.5 ? "−" : ""}${de(Math.abs(b.w))} W`;
  }

  /** Kurzer Satz zur Batterie (Retro: unten in der Kachel). */
  _battZeile(b) {
    if (b.richtung === "laden") {
      if (b.voll) return t(this._hass, "voll_laedt");
      return b.vollIn !== null ? t(this._hass, "voll_in", { dauer: this._dauer(b.vollIn), uhr: this._vollUm(b.vollIn) }) : t(this._hass, "laedt_gerade");
    }
    return b.rest === null ? t(this._hass, "restlaufzeit_unbekannt") : t(this._hass, "restlaufzeit_text", { rest: this._restText(b) });
  }

  /** Satz zur Batterie im Magazin-Stil. */
  _battSatz(b) {
    if (b.richtung === "laden") {
      const voll = b.voll ? t(this._hass, "batt_voll") : b.vollIn !== null ? t(this._hass, "batt_voll_in", { dauer: this._dauer(b.vollIn), uhr: this._vollUm(b.vollIn) }) : "";
      return `${t(this._hass, "batt_laedt", { w: de(Math.abs(b.w ?? 0)) })}${voll}`;
    }
    const zieht = b.richtung === "entladen" ? t(this._hass, "batt_verbrauch", { w: de(Math.abs(b.w)) }) : t(this._hass, "batt_kaum");
    return `${zieht}${b.rest === null ? "" : t(this._hass, "batt_reicht", { rest: esc(this._restText(b)) })}`;
  }

  _restText(b) {
    if (b.rest === null) return t(this._hass, "unbekannt");
    const tage = Math.floor(b.rest);
    const std = Math.round((b.rest - tage) * 24);
    return tage > 0 ? t(this._hass, tage === 1 ? "rest_tag" : "rest_tage", { n: tage, std }) : t(this._hass, "rest_std", { std });
  }

  /** Richtung der Batterie als Wort; `kurz` = „Verbrauch“ statt „entlädt“ (Magazin, Breitbild). */
  _richtungText(b, verbrauch = false) {
    return { laden: t(this._hass, "richtung_laden"), entladen: t(this._hass, verbrauch ? "richtung_verbrauch" : "richtung_entladen"), ruhe: t(this._hass, "richtung_ruhe") }[b.richtung] ?? "";
  }

  _gasText(v) {
    return v === null ? "–" : v >= 99 ? t(this._hass, "gas_voll") : `${de(v)} %`;
  }

  _fwText(fw) {
    if (!fw.da) return "–";
    return fw.pct !== null ? `${de(fw.pct)} %` : `${de(fw.v, 2)} V`;
  }

  _lichtKnoepfe(d) {
    return d.lichter
      .filter((l) => l.da)
      .map((l) => `<button class="licht ${l.an ? "an" : ""}" data-a="licht" data-id="${esc(l.entity)}" aria-pressed="${l.an}">${esc(l.name)}</button>`)
      .join("");
  }

  _wasserKnoepfe(d) {
    if (!d.wasser) return "";
    return [...WASSER_MODI.map(([k, n]) => [k, t(this._hass, n)]), ["aus", t(this._hass, "aus")]]
      .map(([k, n]) => `<button class="modus ${d.wasser.modus === k ? "an" : ""}" data-a="wasser" data-id="${k}">${n}</button>`)
      .join("");
  }

  _radioFavoriten(d) {
    return (d.radio?.favoriten ?? [])
      .map((f) => `<button class="fav ${d.radio.quelle === f ? "an" : ""}" data-a="quelle" data-id="${esc(f)}">${esc(f)}</button>`)
      .join("");
  }

  _tuerText(d) {
    if (!d.tuer) return "–";
    if (this._tuerBestaetigen > Date.now()) return d.tuer.zu ? t(this._hass, "nochmal_entriegeln") : t(this._hass, "nochmal_verriegeln");
    return TEXTE.en[`tuer_${d.tuer.zustand}`] ? t(this._hass, `tuer_${d.tuer.zustand}`) : d.tuer.zustand;
  }

  _raumText(d) {
    const r = d.raum;
    if (!r) return "–";
    if (!r.an) return t(this._hass, "raum_aus", { ist: de(r.ist, 1) });
    return t(this._hass, "raum_innen", { ist: de(r.ist, 1), zustand: t(this._hass, r.heizt ? "heizt" : "haelt") });
  }

  // ---- Stil A: Retro-Camper ---------------------------------------------------

  _retro(d) {
    const b = d.batt;
    const r = d.raum;
    return `
    <div class="wurzel retro">
      <div class="streifen" aria-hidden="true"><i></i><i></i><i></i></div>
      <header>
        <div><div class="dach">${esc(d.wochentag)} · ${d.uhr}</div><h1 class="${this._laenge(d.ort)}">${esc(d.ort)}</h1></div>
        <div class="chip">
          <span class="ic">${ICON.wlan}</span>
          <div class="chiptext"><b>${esc(d.wlan?.ssid ?? t(this._hass, "kein_wlan"))}</b><small>${esc(t(this._hass, "internet_ueber", { quelle: d.wlan?.quelle ?? "–" }))}</small></div>
          ${d.wetter ? `<span class="trenner"></span><span class="ic senf">${ICON.sonne}</span><span class="chiptemp">${de(d.wetter.temp)}°</span>` : ""}
        </div>
      </header>
      <main>
        <section class="k heizung">
          <div class="spalte">
            <div class="label">${t(this._hass, "heizung_raum")}</div>
            <div class="riesig">${r?.an ? `${de(r.soll, 1)}°` : t(this._hass, "aus_klein")}</div>
            <div>${esc(this._raumText(d))}</div>
          </div>
          <div class="rund">
            <button data-a="raum" data-id="+" aria-label="${t(this._hass, "waermer")}">+</button>
            <button data-a="raum" data-id="-" aria-label="${t(this._hass, "kaelter")}">−</button>
            <button data-a="raum" data-id="an" aria-label="${t(this._hass, "heizung_an_aus")}" class="${r?.an ? "aktiv" : ""}">${ICON.power}</button>
          </div>
          <div class="linie"></div>
          <div class="spalte schmal">
            <div class="label">${t(this._hass, "wasser")}</div>
            <div class="gross">${d.wasser?.soll ? `${de(d.wasser.soll)}°` : t(this._hass, "aus_klein")}</div>
            <div class="modi">${this._wasserKnoepfe(d)}</div>
          </div>
        </section>
        <section class="k hell">
          <div class="label braun">${t(this._hass, "batterie")}</div>
          <div class="batt">
            <div class="akku"><i style="height:${b.soc ?? 0}%"></i></div>
            <div><div class="gross">${b.soc === null ? "–" : `${de(b.soc)}%`}</div>
              <div class="leistung ${b.richtung ?? ""}">${this._wText(b)}<small>${this._richtungText(b)}</small></div>
              <small>${de(b.volt, 1)} V · ${b.strom === null ? "–" : `${b.strom > 0 ? "+" : ""}${de(b.strom, 1)} A`}</small></div>
          </div>
          <div class="battzeile"><b>${esc(this._battZeile(b))}</b></div>
        </section>
        <section class="k dunkel">
          <div class="kopf"><span class="label senf">${t(this._hass, "solar")}</span><span class="ic senf gross-ic">${ICON.sonne}</span></div>
          <div class="gross">${de(d.solar.w)}<span class="einheit"> W</span></div>
          <div>${t(this._hass, "heute_kwh", { kwh: de(d.solar.kwh, 1) })}</div>
        </section>
        <section class="k hell">
          <div class="label braun">${t(this._hass, "licht")}</div>
          <div class="lichter">${this._lichtKnoepfe(d)}</div>
        </section>
        <section class="k hell">
          <div class="label braun">${t(this._hass, "vorraete")}</div>
          <div class="tanks">
            ${[[t(this._hass, "gas_1"), d.gas[0], "rost"], [t(this._hass, "gas_2"), d.gas[1], "rost"], [t(this._hass, "wasser"), d.fw.pct, "teal"]].map(([n, v, f], i) => `
              <div class="tank"><div class="saeule"><i class="${f}" style="height:${v ?? 0}%"></i></div>
              <span>${n}<br>${i === 2 ? this._fwText(d.fw) : this._gasText(v)}</span></div>`).join("")}
          </div>
        </section>
        <section class="k senfk">
          <div class="label">${t(this._hass, "tuer")}</div>
          <button class="tuerknopf" data-a="tuer" aria-label="${t(this._hass, "tuer")}">${d.tuer?.zu ? ICON.schloss : ICON.offen}</button>
          <div class="tuertext">${esc(this._tuerText(d))}</div>
        </section>
        <section class="k dunkel radio">
          <div class="label senf">${t(this._hass, "radio")}</div>
          <div><div class="sender">${esc(d.radio?.sender ?? t(this._hass, "radio"))}</div><small class="hellbraun">${esc(d.radio?.titel || (d.radio?.sender ? "" : t(this._hass, "sender_waehlen")))}</small></div>
          <div class="steuer">
            <button data-a="radio" data-id="previous" aria-label="${t(this._hass, "voriger_sender")}">${ICON.zurueck}</button>
            <button class="pp" data-a="radio" data-id="play_pause" aria-label="${t(this._hass, "wiedergabe")}">${d.radio?.spielt ? ICON.pause : ICON.play}</button>
            <button data-a="radio" data-id="next" aria-label="${t(this._hass, "naechster_sender")}">${ICON.vor}</button>
          </div>
        </section>
      </main>
    </div>`;
  }

  // ---- Stil C: Outdoor-Magazin -------------------------------------------------

  _magazin(d, mix = false) {
    const b = d.batt;
    const r = d.raum;
    const wetterZeile = d.wetter ? `${esc(d.wetter.text)}${d.wetter.wind !== null ? `,<br>${t(this._hass, "wind", { v: de(d.wetter.wind) })}` : ""}` : "";
    return `
    <div class="wurzel ${mix ? "mix" : "magazin"}">
      <aside>
        ${HOEHENLINIEN}
        ${mix ? `<div class="streifen" aria-hidden="true"><i></i><i></i><i></i></div>` : ""}
        <div class="oben">
          <div class="dach">${esc(d.datum)}</div>
          <h1 class="${this._laenge(d.ort)}">${esc(d.ort)}</h1>
        </div>
        <div class="unten">
          ${d.wetter ? `<div class="wetter"><span class="temp">${de(d.wetter.temp)}°</span><span>${wetterZeile}</span></div>` : ""}
          ${d.sonne ? `<div class="zwei">
            <div><div class="mini">${t(this._hass, d.sonne.oben ? "sonnenuntergang" : "sonnenaufgang")}</div><div class="zeit">${uhrzeit(d.sonne.oben ? d.sonne.unter : d.sonne.auf)}</div></div>
            <div><div class="mini">${t(this._hass, "uhrzeit")}</div><div class="zeit">${d.uhr}</div></div></div>` : ""}
          <div class="netz"><span class="ic">${ICON.wlan}</span><div><b>${esc(d.wlan?.ssid ?? t(this._hass, "kein_wlan_gross"))}</b><small>${esc(t(this._hass, "internet_ueber", { quelle: d.wlan?.quelle ?? "–" }))}</small></div></div>
        </div>
      </aside>
      <main>
        <div class="leiste"><span class="rubrik"><i>${t(this._hass, "heute_im_mobil")}</i></span><span>${esc(d.datum)} · ${d.uhr}</span></div>
        <section class="${mix ? "karte energie" : ""}">
          <div class="mini">${t(this._hass, "energie")}</div>
          <div class="zahl">${b.soc === null ? "–" : de(b.soc)}<span>%</span></div>
          <div class="balken"><i style="width:${b.soc ?? 0}%"></i></div>
          <div class="leistung-gross ${b.richtung ?? ""}">${this._wText(b)}<span>${this._richtungText(b, true)}</span></div>
          <p>${this._battSatz(b)}
             ${d.solar.w ? t(this._hass, "sonne_liefert", { w: de(d.solar.w), kwh: de(d.solar.kwh, 1) }) : t(this._hass, "sonne_heute", { kwh: de(d.solar.kwh, 1) })}</p>
        </section>
        <section class="${mix ? "karte waerme" : ""}">
          <div class="mini">${t(this._hass, "waerme")}</div>
          <div class="zahl">${r?.an ? `${de(r.soll, 1)}°` : t(this._hass, "aus_klein")}</div>
          <div class="plusminus">
            <button data-a="raum" data-id="-" aria-label="${t(this._hass, "kaelter")}">−</button>
            <button data-a="raum" data-id="+" aria-label="${t(this._hass, "waermer")}" class="voll">+</button>
            <button data-a="raum" data-id="an" aria-label="${t(this._hass, "heizung_an_aus")}" class="${r?.an ? "aktiv" : ""}">${ICON.power}</button>
          </div>
          <p>${r ? (r.an ? t(this._hass, "magazin_raum_an", { ist: de(r.ist, 1), zustand: t(this._hass, r.heizt ? "truma_heizt" : "truma_haelt") }) : t(this._hass, "magazin_raum_aus", { ist: de(r.ist, 1) })) : ""}
             ${t(this._hass, "warmwasser_satz", { w: d.wasser?.soll ? `${de(d.wasser.soll)}°` : t(this._hass, "aus_klein") })}</p>
          <div class="modi">${this._wasserKnoepfe(d)}</div>
        </section>
        <section class="${mix ? "karte vorraete" : ""}">
          <div class="mini">${t(this._hass, "vorraete")}</div>
          ${[[t(this._hass, "gas_1"), this._gasText(d.gas[0]), d.gas[0], "akzb"], [t(this._hass, "gas_2"), this._gasText(d.gas[1]), d.gas[1], "akzb"], [t(this._hass, "frischwasser"), this._fwText(d.fw), d.fw.pct, "blau"]]
            .map(([n, t, v, f]) => `<div class="vorrat"><div class="vz"><span class="vn">${n}</span><b>${t}</b></div><div class="vl"><i class="${f}" style="width:${v ?? 0}%"></i></div></div>`).join("")}
        </section>
        <section class="licht-bereich ${mix ? "karte" : "linieoben"}">
          <div class="vz"><div class="mini">${t(this._hass, "licht")}</div><button class="link" data-a="alle_aus">${t(this._hass, "alles_aus")}</button></div>
          <div class="pillen">${this._lichtKnoepfe(d)}</div>
        </section>
        <section class="tuer-bereich ${mix ? "karte senfk" : "linieoben"}">
          <button class="tuerknopf" data-a="tuer" aria-label="${t(this._hass, "tuer")}">${d.tuer?.zu ? ICON.schloss : ICON.offen}</button>
          <div><div class="mini">${t(this._hass, "tuer")}</div><div class="tuertext">${esc(this._tuerText(d))}</div></div>
        </section>
        <section class="radio-bereich">
          <button class="pp" data-a="radio" data-id="play_pause" aria-label="${t(this._hass, "wiedergabe")}">${d.radio?.spielt ? ICON.pause : ICON.play}</button>
          <div class="rt"><div class="mini">${d.radio?.spielt ? t(this._hass, "laeuft_gerade") : t(this._hass, "radio")}${d.radio?.sender ? ` · ${esc(d.radio.sender)}` : ""}</div><div class="titel">${esc(d.radio?.titel || d.radio?.sender || t(this._hass, "sender_waehlen"))}</div></div>
          <div class="favs">${this._radioFavoriten(d)}</div>
        </section>
      </main>
    </div>`;
  }

  // ---- Breitbild (1920 × 720) ------------------------------------------------

  _breit(d) {
    const b = d.batt;
    const r = d.raum;
    const zeitSonne = d.sonne ? uhrzeit(d.sonne.oben ? d.sonne.unter : d.sonne.auf) : null;
    return `
    <div class="wurzel breit">
      <aside class="b-seite">
        ${HOEHENLINIEN}
        <div class="b-oben">
          <div class="b-mini">${esc(d.datum)}</div>
          <h1 class="${this._laenge(d.ort)}">${esc(d.ort)}</h1>
        </div>
        <div class="b-uhr">${d.uhr}</div>
        <div class="streifen" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="b-unten">
          ${d.wetter ? `<div class="b-wetter"><span class="b-temp">${de(d.wetter.temp)}°</span><span>${esc(d.wetter.text)}${d.wetter.wind !== null ? `<br>${t(this._hass, "wind", { v: de(d.wetter.wind) })}` : ""}</span></div>` : ""}
          ${zeitSonne ? `<div class="b-zeile"><span class="ic">${ICON.sonne}</span>${t(this._hass, d.sonne.oben ? "sonnenuntergang" : "sonnenaufgang")} ${zeitSonne}</div>` : ""}
          <div class="b-zeile"><span class="ic">${ICON.wlan}</span>${esc(d.wlan?.ssid ?? t(this._hass, "kein_wlan"))} · ${esc(d.wlan?.quelle ?? "–")}</div>
        </div>
      </aside>

      <section class="b-k b-akzent">
        <div class="b-label">${t(this._hass, "waerme")}</div>
        <div class="b-riesig">${r?.an ? `${de(r.soll, 1)}°` : t(this._hass, "aus_klein")}</div>
        <div class="b-text">${esc(this._raumText(d))}</div>
        <div class="b-knoepfe">
          <button data-a="raum" data-id="-" aria-label="${t(this._hass, "kaelter")}">−</button>
          <button data-a="raum" data-id="+" aria-label="${t(this._hass, "waermer")}">+</button>
          <button data-a="raum" data-id="an" aria-label="${t(this._hass, "heizung_an_aus")}" class="${r?.an ? "aktiv" : ""}">${ICON.power}</button>
        </div>
        <div class="b-trenner"></div>
        <div class="b-label">${t(this._hass, "warmwasser_kopf")} ${d.wasser?.soll ? `· ${de(d.wasser.soll)}°` : ""}</div>
        <div class="modi">${this._wasserKnoepfe(d)}</div>
      </section>

      <section class="b-k">
        <div class="b-label">${t(this._hass, "energie")}</div>
        <div class="b-riesig">${b.soc === null ? "–" : de(b.soc)}<span class="b-einheit">%</span></div>
        <div class="b-balken"><i style="width:${b.soc ?? 0}%"></i></div>
        <div class="b-leistung ${b.richtung ?? ""}">${this._wText(b)} <small>${this._richtungText(b, true)}</small></div>
        <div class="b-text">${esc(this._battZeile(b))}</div>
        <div class="b-trenner"></div>
        <div class="b-solar"><span class="ic">${ICON.sonne}</span><b>${de(d.solar.w)} W</b><span>${t(this._hass, "heute_kwh_klein", { kwh: de(d.solar.kwh, 1) })}</span></div>
      </section>

      <section class="b-k">
        <div class="b-kopf"><div class="b-label">${t(this._hass, "licht")}</div><button class="b-link" data-a="alle_aus">${t(this._hass, "alles_aus")}</button></div>
        <div class="b-lichter">${this._lichtKnoepfe(d)}</div>
      </section>

      <div class="b-stapel">
        <section class="b-k">
          <div class="b-label">${t(this._hass, "vorraete")}</div>
          ${[[t(this._hass, "gas_1"), this._gasText(d.gas[0]), d.gas[0], ""], [t(this._hass, "gas_2"), this._gasText(d.gas[1]), d.gas[1], ""], [t(this._hass, "wasser"), this._fwText(d.fw), d.fw.pct, "blau"]]
            .map(([n, t, v, f]) => `<div class="b-vorrat"><div class="b-vz"><span>${n}</span><b>${t}</b></div><div class="b-vl"><i class="${f}" style="width:${v ?? 0}%"></i></div></div>`).join("")}
        </section>
        <section class="b-k b-tuer ${d.tuer?.zu ? "" : "offen"}">
          <button class="tuerknopf" data-a="tuer" aria-label="${t(this._hass, "tuer")}">${d.tuer?.zu ? ICON.schloss : ICON.offen}</button>
          <div><div class="b-label">${t(this._hass, "tuer")}</div><div class="b-tuertext">${esc(this._tuerText(d))}</div></div>
        </section>
      </div>

      <section class="b-k b-dunkel">
        <div class="b-label">${t(this._hass, "radio")}</div>
        <div class="b-sender">${esc(d.radio?.sender ?? t(this._hass, "radio"))}</div>
        <div class="b-text">${esc(d.radio?.titel || (d.radio?.sender ? "" : t(this._hass, "sender_waehlen")))}</div>
        <div class="b-steuer">
          <button data-a="radio" data-id="previous" aria-label="${t(this._hass, "voriger_sender")}">${ICON.zurueck}</button>
          <button class="pp" data-a="radio" data-id="play_pause" aria-label="${t(this._hass, "wiedergabe")}">${d.radio?.spielt ? ICON.pause : ICON.play}</button>
          <button data-a="radio" data-id="next" aria-label="${t(this._hass, "naechster_sender")}">${ICON.vor}</button>
        </div>
        <div class="b-favs">${this._radioFavoriten(d)}</div>
      </section>
    </div>`;
  }

  // ---- Zeichnen ----------------------------------------------------------------

  _zeichnen() {
    if (!this._config || !this.shadowRoot) return;
    if (!this._hass) {
      this.shadowRoot.innerHTML = `<style>${STIL}</style><ha-card></ha-card>`;
      return;
    }
    GEBIET = gebiet(this._hass);
    const d = this._daten();
    const schema = window.YapaiaDesign?.waehle(this._hass, { wahl: this._config.design }) ?? null;
    const key = JSON.stringify([d, this._config.stil, schema?.id, this._tuerBestaetigen > Date.now(), spracheVon(this._hass), GEBIET]);
    if (key === this._key) return;
    this._key = key;
    const stil = this._config.stil;
    const html = stil === "magazin" ? this._magazin(d) : stil === "mix" ? this._magazin(d, true) : stil === "breit" ? this._breit(d) : this._retro(d);
    this.shadowRoot.innerHTML = `<style>${STIL}</style><ha-card>${html}</ha-card>`;
    window.YapaiaDesign?.anwenden(this.shadowRoot.querySelector(".wurzel"), schema);
  }

  // ---- Bedienen ----------------------------------------------------------------

  _dienst(domain, service, data) {
    return this._hass.callService(domain, service, data).catch((err) => {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: t(this._hass, "fehler", { fehler: err.message ?? err }) }, bubbles: true, composed: true }));
    });
  }

  _klick(e) {
    const k = e.target.closest("button[data-a]");
    if (!k || !this._hass) return;
    const c = this._config;
    const id = k.dataset.id;
    switch (k.dataset.a) {
      case "licht":
        return this._dienst("light", "toggle", { entity_id: id });
      case "alle_aus":
        return this._dienst("light", "turn_off", { entity_id: c.lichter.map((l) => l.entity) });
      case "raum": {
        const r = this._s(c.raum);
        if (!r) return;
        if (id === "an") return this._dienst("climate", "set_hvac_mode", { entity_id: c.raum, hvac_mode: r.state === "off" ? "heat" : "off" });
        const schritt = zahl(r.attributes.target_temp_step) || 0.5;
        const soll = (zahl(r.attributes.temperature) ?? 20) + (id === "+" ? schritt : -schritt);
        const ziel = Math.max(zahl(r.attributes.min_temp) ?? 5, Math.min(zahl(r.attributes.max_temp) ?? 30, soll));
        return this._dienst("climate", "set_temperature", { entity_id: c.raum, temperature: ziel, ...(r.state === "off" ? { hvac_mode: "heat" } : {}) });
      }
      case "wasser": {
        if (id === "aus") return this._dienst("climate", "set_hvac_mode", { entity_id: c.wasser, hvac_mode: "off" });
        const m = WASSER_MODI.find(([key]) => key === id);
        return this._dienst("climate", "set_temperature", { entity_id: c.wasser, temperature: m[2], hvac_mode: "heat" });
      }
      case "tuer": {
        // Zweimal tippen: ein versehentlicher Wisch soll die Tür nicht öffnen
        const t = this._s(c.tuer);
        if (!t) return;
        if (this._tuerBestaetigen > Date.now()) {
          this._tuerBestaetigen = 0;
          this._dienst("lock", t.state === "locked" ? "unlock" : "lock", { entity_id: c.tuer });
        } else {
          this._tuerBestaetigen = Date.now() + 4000;
          setTimeout(() => this._zeichnen(), 4100);
        }
        return this._zeichnen();
      }
      case "radio":
        return this._dienst("media_player", id === "play_pause" ? "media_play_pause" : id === "next" ? "media_next_track" : "media_previous_track", { entity_id: c.radio });
      case "quelle":
        return this._dienst("media_player", "select_source", { entity_id: c.radio, source: id });
    }
  }
}

// ---- Gestaltung -------------------------------------------------------------------

const STIL = `
:host { display: block; }
ha-card { overflow: hidden; border-radius: var(--ha-card-border-radius, 12px); }
button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
svg { display: block; }
.wurzel { container-type: inline-size; box-sizing: border-box; min-height: 780px; position: relative; overflow: hidden; }
.wurzel *, .wurzel *::before { box-sizing: border-box; }
.ic { width: 26px; height: 26px; display: inline-flex; flex: none; }
.ic svg { width: 100%; height: 100%; }

/* ===== A: Retro ===== */
.retro { --sahne: var(--y-grund, #F4ECDC); --papier: var(--y-flaeche, #FBF6EC); --braun: var(--y-text, #3B2A20); --linie: var(--y-rand, #3B2A20);
  --rost: var(--y-akzent, #C8551F); --rosttext: var(--y-akzent-text, #FBF6EC); --rosttext-rgb: var(--y-akzent-text-rgb, 251, 246, 236);
  --senf: var(--y-akzent2, #E3A72F); --aufsenf: var(--y-auf-akzent2, #3B2A20); --hellbraun: var(--y-text-gedaempft, #8A5A3B); --teal: var(--y-info, #5E8C8A);
  --dunkel-bg: var(--y-text, #3B2A20); --dunkel-text: var(--y-grund, #F4ECDC); --dunkel-text-rgb: var(--y-grund-rgb, 244, 236, 220);
  --rahmen: var(--y-rand-breite, 2px) solid var(--linie);
  background: var(--sahne); color: var(--braun); font-family: var(--y-schrift-text, "DM Sans", system-ui, sans-serif); font-weight: var(--y-gewicht-text, 400); padding: 26px 30px; display: flex; flex-direction: column; gap: 18px; }
.retro .streifen { position: absolute; right: -60px; top: 34px; width: 52%; display: flex; flex-direction: column; gap: 8px; transform: skewX(-24deg); }
.retro .streifen i { height: 18px; background: var(--y-streifen-1, var(--braun)); }
.wurzel[data-y-streifen="false"] .streifen { display: none; }
.retro .streifen i:nth-child(2) { background: var(--y-streifen-2, var(--rost)); }
.retro .streifen i:nth-child(3) { background: var(--y-streifen-3, var(--senf)); }
.retro header { position: relative; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.retro .dach { font-size: 15px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--hellbraun); }
.retro h1 { margin: 0; font-family: var(--y-schrift-anzeige, "Fraunces", Georgia, serif); font-weight: var(--y-gewicht-anzeige, 900); font-size: 76px; line-height: .9; letter-spacing: -.02em; }
.retro h1.lang { font-size: 58px; }
.retro h1.sehrlang { font-size: 44px; }
.retro .chip { display: flex; gap: 12px; align-items: center; background: var(--papier); border: var(--rahmen); border-radius: 999px; padding: 10px 18px 10px 14px; margin-top: 90px; }
.retro .chiptext { display: flex; flex-direction: column; }
.retro .chiptext small { color: var(--hellbraun); font-size: 13px; }
.retro .trenner { width: 2px; height: 32px; background: var(--braun); opacity: .2; }
.retro .chiptemp { font-family: var(--y-schrift-anzeige, "Fraunces", Georgia, serif); font-weight: 600; font-size: 22px; }
.retro .senf { color: var(--senf); }
.retro main { flex: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: minmax(250px, 1fr); gap: 18px; }
.retro .k { border-radius: var(--y-radius, 32px); padding: 22px 24px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; min-width: 0; }
.retro .hell { background: var(--papier); border: var(--rahmen); box-shadow: var(--y-schatten, none); }
.retro .dunkel { background: var(--dunkel-bg); color: var(--dunkel-text); box-shadow: var(--y-schatten, none); }
.wurzel[data-y-hell="false"] { --dunkel-bg: var(--y-flaeche2); --dunkel-text: var(--y-text); --dunkel-text-rgb: var(--y-text-rgb); }
.retro .senfk { background: var(--senf); color: var(--aufsenf); }
.retro .label { font-size: 14px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
.retro .label.braun { color: var(--hellbraun); }
.retro .gross { font-family: var(--y-schrift-anzeige, "Fraunces", Georgia, serif); font-weight: var(--y-gewicht-anzeige, 900); font-size: 64px; line-height: .9; }
.retro .einheit { font-size: 30px; }
.retro .riesig { font-family: var(--y-schrift-anzeige, "Fraunces", Georgia, serif); font-weight: var(--y-gewicht-anzeige, 900); font-size: 108px; line-height: .85; }
.retro .heizung { grid-column: span 2; background: var(--rost); color: var(--rosttext); box-shadow: var(--y-schatten, none); flex-direction: row; align-items: stretch; gap: 24px; }
.retro .heizung .spalte { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.retro .heizung .schmal { flex: 0 0 170px; }
.retro .heizung .label { opacity: .85; }
.retro .rund { display: flex; flex-direction: column; gap: 10px; justify-content: center; }
.retro .rund button { width: 60px; height: 60px; border-radius: 50%; border: 2px solid var(--rosttext); background: transparent; color: var(--rosttext); font-size: 32px; display: flex; align-items: center; justify-content: center; }
.retro .rund button svg { width: 24px; height: 24px; }
.retro .rund button.aktiv { background: var(--rosttext); color: var(--rost); }
.retro .linie { width: 2px; background: rgba(var(--rosttext-rgb), .35); }
.retro .modi { display: flex; flex-wrap: wrap; gap: 6px; }
.retro .modus { padding: 6px 11px; border-radius: 999px; border: 2px solid rgba(var(--rosttext-rgb), .6); background: transparent; color: var(--rosttext); font-weight: 700; font-size: 14px; }
.retro .modus.an { background: var(--rosttext); color: var(--rost); border-color: var(--rosttext); }
.retro .batt { display: flex; align-items: center; gap: 18px; }
.retro .batt small { color: var(--hellbraun); font-size: 15px; }
.retro .akku { width: 58px; height: 118px; border: 3px solid var(--braun); border-radius: 12px; position: relative; display: flex; flex-direction: column; justify-content: flex-end; padding: 5px; flex: none; }
.retro .akku::before { content: ""; position: absolute; top: -10px; left: 17px; width: 18px; height: 7px; background: var(--braun); border-radius: 3px 3px 0 0; }
.retro .akku i { background: var(--senf); border-radius: 6px; }
.retro .leistung { font-family: var(--y-schrift-anzeige, "Fraunces", Georgia, serif); font-weight: var(--y-gewicht-anzeige, 900); font-size: 26px; margin: 4px 0 2px; display: flex; align-items: baseline; gap: 6px; }
.retro .leistung small { font-family: var(--y-schrift-text, "DM Sans", system-ui, sans-serif); font-weight: 700; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--hellbraun); }
.retro .leistung.laden { color: var(--y-ok, #2F7A4F); }
.retro .leistung.entladen { color: var(--y-fehler, var(--rost)); }
.retro .battzeile { font-size: 15px; }
.retro .kopf { display: flex; justify-content: space-between; align-items: center; }
.retro .gross-ic { width: 34px; height: 34px; }
.retro .lichter { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; flex: 1; }
.retro .licht { border-radius: var(--y-radius-klein, 16px); border: 2px solid var(--linie); background: transparent; color: var(--braun); font-weight: 700; font-size: 15px; text-align: left; padding: 8px 12px; min-height: 44px; }
.retro .licht.an { background: var(--senf); border-color: var(--senf); color: var(--aufsenf); }
.retro .tanks { flex: 1; display: flex; gap: 14px; }
.retro .tank { flex: 1; display: flex; flex-direction: column; gap: 8px; align-items: center; min-width: 0; }
.retro .tank span { font-weight: 700; font-size: 14px; text-align: center; }
.retro .saeule { flex: 1; width: 100%; min-height: 90px; border: 2px solid var(--linie); border-radius: var(--y-radius-klein, 16px); display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
.retro .saeule .rost { background: var(--rost); }
.retro .saeule .teal { background: var(--teal); }
.retro .tuerknopf { align-self: center; width: 124px; height: 124px; border-radius: 50%; border: 3px solid var(--braun); background: var(--papier); color: var(--braun); display: flex; align-items: center; justify-content: center; }
.retro .tuerknopf svg { width: 52px; height: 52px; }
.retro .tuertext { text-align: center; font-family: var(--y-schrift-anzeige, "Fraunces", Georgia, serif); font-weight: var(--y-gewicht-anzeige, 900); font-size: 26px; }
.retro .sender { font-family: var(--y-schrift-anzeige, "Fraunces", Georgia, serif); font-weight: var(--y-gewicht-anzeige, 900); font-size: 38px; line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.retro .hellbraun { opacity: .75; font-size: 15px; }
.retro .steuer { display: flex; gap: 12px; align-items: center; }
.retro .steuer button { width: 48px; height: 48px; border-radius: 50%; border: 2px solid rgba(var(--dunkel-text-rgb), .35); background: transparent; color: var(--dunkel-text); display: flex; align-items: center; justify-content: center; }
.retro .steuer button svg { width: 20px; height: 20px; }
.retro .steuer .pp { width: 64px; height: 64px; border: none; background: var(--rost); color: var(--rosttext); }
.retro .steuer .pp svg { width: 24px; height: 24px; }
@container (max-width: 1150px) {
  .retro main { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .retro .gross { font-size: 54px; }
  .retro .riesig { font-size: 92px; }
  .retro .radio { grid-column: span 2; }
}
@container (max-width: 860px) {
  .retro main { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .retro .radio { grid-column: auto; }
  .retro h1 { font-size: 56px; }
  .retro .chip { margin-top: 20px; }
}
@container (max-width: 560px) {
  .retro { padding: 18px 16px; }
  .retro main { grid-template-columns: minmax(0, 1fr); }
  .retro .heizung { grid-column: auto; flex-wrap: wrap; }
  .retro .linie { display: none; }
  .retro .riesig { font-size: 84px; }
}

/* ===== C: Magazin (und Grundgerüst für Mix) ===== */
.magazin, .mix { display: flex; flex-wrap: wrap; font-family: var(--textschrift); }
.magazin, .mix { --grund: var(--y-grund, #F7F5EF); --tinte: var(--y-text, #1C2620); --grau: var(--y-text-gedaempft, #56645A); --linie: var(--y-rand, #CFC8B8);
  --spur: var(--y-flaeche2, #E3DED2); --karte: var(--y-flaeche, #FBF6EC); --seite: var(--y-seite, #1F3A2E); --seitetext: var(--y-seite-text, #EEF2EA);
  --seitetext-rgb: var(--y-seite-text-rgb, 238, 242, 234); --seitegrau: rgba(var(--seitetext-rgb), .72);
  --akzent: var(--y-akzent2, #D9893A); --aufakzent: var(--y-auf-akzent2, #1C2620); --rost: var(--y-akzent, #C8551F); --rosttext: var(--y-akzent-text, #FBF6EC);
  --rosttext-rgb: var(--y-akzent-text-rgb, 251, 246, 236); --blau: var(--y-info, #3F6E8C);
  --schrift: var(--y-schrift-anzeige, "Instrument Serif", Georgia, serif); --zahlgewicht: var(--y-gewicht-anzeige, 400);
  --textschrift: var(--y-schrift-text, "Inter", system-ui, sans-serif); }
.magazin, .mix { background: var(--grund); color: var(--tinte); }
aside { flex: 0 0 380px; background: var(--seite); color: var(--seitetext); padding: 34px 34px 28px; display: flex; flex-direction: column; justify-content: space-between; gap: 24px; position: relative; overflow: hidden; }
aside .topo { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--seitetext); opacity: .09; }
.wurzel[data-y-hoehenlinien="false"] aside .topo { display: none; }
aside > div { position: relative; }
aside .dach { font-size: 13px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: var(--seitegrau); }
aside h1 { margin: 6px 0 0; font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 60px; line-height: .95; overflow-wrap: anywhere; }
.wurzel[data-y-schema="magazin"] aside h1 { font-style: italic; }
aside h1.lang { font-size: 46px; }
aside h1.sehrlang { font-size: 36px; }
aside .unten { display: flex; flex-direction: column; gap: 18px; }
aside .wetter { display: flex; align-items: baseline; gap: 14px; }
aside .temp { font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 112px; line-height: .8; }
aside .wetter span:last-child { font-size: 17px; color: var(--seitegrau); }
aside .zwei { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid rgba(var(--seitetext-rgb), .25); }
aside .zwei > div { padding: 12px 0; }
aside .zwei > div + div { border-left: 1px solid rgba(var(--seitetext-rgb), .25); padding-left: 18px; }
aside .mini { color: var(--seitegrau); letter-spacing: .1em; font-size: 11px; }
aside .zeit { font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 34px; }
aside .netz { display: flex; align-items: center; gap: 12px; background: rgba(var(--seitetext-rgb), .1); border-radius: 14px; padding: 12px 14px; }
aside .netz > div { display: flex; flex-direction: column; }
aside .netz small { font-size: 13px; color: var(--seitegrau); }
.mix aside .streifen { position: absolute; left: -40px; right: -40px; top: 40%; display: flex; flex-direction: column; gap: 7px; transform: skewY(-8deg); opacity: .95; }
.mix aside .streifen i { height: 14px; background: var(--y-streifen-1, var(--rost)); }
.wurzel[data-y-streifen="false"] aside .streifen { display: none; }
.mix aside .streifen i:nth-child(2) { background: var(--y-streifen-2, var(--akzent)); }
.mix aside .streifen i:nth-child(3) { background: var(--y-streifen-3, var(--seitetext)); opacity: .85; }
.mini { font-size: 12px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--grau); }
.magazin main, .mix main { flex: 1 1 560px; min-width: 0; padding: 32px 38px 28px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: auto; grid-auto-flow: row dense; column-gap: 32px; row-gap: 24px; align-content: start; }
.leiste { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; border-bottom: 2px solid var(--tinte); padding-bottom: 12px; font-size: 14px; font-weight: 500; color: var(--grau); }
.rubrik { font-family: var(--schrift); font-size: 34px; color: var(--tinte); }
.magazin main section, .mix main section { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.zahl { font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 92px; line-height: .85; }
.zahl span { font-size: 42px; }
.balken { height: 8px; background: var(--spur); border-radius: 4px; overflow: hidden; }
.balken i { display: block; height: 100%; background: var(--seite); }
.mix .balken i { background: var(--akzent); }
main p { margin: 0; font-size: 15px; line-height: 1.5; color: var(--tinte); opacity: .88; }
.akz { color: var(--rost); }
.leistung-gross { display: flex; align-items: baseline; gap: 8px; font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 34px; line-height: 1; }
.leistung-gross span { font-family: var(--textschrift); font-weight: 600; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--grau); }
.leistung-gross.laden { color: var(--y-ok, #2F7A4F); }
.leistung-gross.entladen { color: var(--y-fehler, #B4532A); }
.plusminus { display: flex; gap: 10px; }
.plusminus button { flex: 1; height: 48px; border-radius: 24px; border: 1.5px solid var(--tinte); background: transparent; color: var(--tinte); font-size: 22px; display: flex; align-items: center; justify-content: center; }
.plusminus button.voll { background: var(--tinte); color: var(--grund); }
.plusminus button svg { width: 20px; height: 20px; }
.plusminus button.aktiv { background: var(--akzent); border-color: var(--akzent); color: var(--aufakzent); }
main .modi { display: flex; flex-wrap: wrap; gap: 6px; }
main .modus { padding: 6px 12px; border-radius: 999px; border: 1.5px solid var(--linie); background: transparent; color: var(--grau); font-weight: 600; font-size: 13px; min-height: 34px; }
main .modus.an { background: var(--tinte); color: var(--grund); border-color: var(--tinte); }
.vorrat { display: flex; flex-direction: column; gap: 4px; }
.vz { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.vz b { white-space: nowrap; }
.vn { font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 28px; }
.mix .vn { font-size: 21px; }
.mix .zahl { font-size: 64px; }
.mix .zahl span { font-size: 30px; }
.mix .tuer-bereich .tuertext { font-size: 22px; }
.vl { height: 3px; background: var(--spur); }
.mix .vl { height: 8px; border-radius: 4px; overflow: hidden; }
.vl i { display: block; height: 100%; }
.vl .akzb { background: var(--akzent); }
.mix .vl .akzb { background: var(--rost); }
.vl .blau { background: var(--blau); }
.linieoben { border-top: 1px solid var(--linie); padding-top: 16px; }
.licht-bereich { grid-column: span 2; }
.link { background: none; border: none; padding: 8px 0; font-size: 13px; font-weight: 600; color: var(--tinte); text-decoration: underline; }
.pillen { display: flex; flex-wrap: wrap; gap: 10px; }
.pillen .licht { height: 48px; padding: 0 20px; border-radius: 24px; border: 1.5px solid var(--tinte); background: transparent; color: var(--tinte); font-weight: 600; font-size: 15px; }
.pillen .licht.an { background: var(--akzent); border-color: var(--akzent); color: var(--aufakzent); }
.tuer-bereich { flex-direction: row !important; align-items: center; gap: 14px !important; }
.tuer-bereich .tuerknopf { width: 64px; height: 64px; border-radius: 50%; border: none; background: var(--seite); color: var(--seitetext); display: flex; align-items: center; justify-content: center; flex: none; }
.tuer-bereich .tuerknopf svg { width: 28px; height: 28px; }
.tuer-bereich .tuertext { font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 28px; line-height: 1.1; overflow-wrap: anywhere; }
.tuer-bereich > div { min-width: 0; }
.radio-bereich { grid-column: 1 / -1; flex-direction: row !important; align-items: center; gap: 18px !important; flex-wrap: wrap; background: var(--spur); border-radius: 18px; padding: 14px 18px; }
.mix .radio-bereich { background: var(--seite); color: var(--seitetext); border-radius: 28px; }
.mix .radio-bereich .mini { color: var(--seitegrau); }
.radio-bereich .pp { width: 52px; height: 52px; border-radius: 50%; border: none; background: var(--tinte); color: var(--grund); display: flex; align-items: center; justify-content: center; flex: none; }
.mix .radio-bereich .pp { background: var(--rost); color: var(--grund); width: 60px; height: 60px; }
.radio-bereich .pp svg { width: 20px; height: 20px; }
.radio-bereich .rt { flex: 1 1 200px; min-width: 0; }
.radio-bereich .titel { font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 26px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.favs { display: flex; gap: 8px; flex-wrap: wrap; }
.fav { height: 40px; padding: 0 16px; border-radius: 20px; border: 1.5px solid var(--linie); background: transparent; color: inherit; font-weight: 600; font-size: 14px; opacity: .8; }
.fav.an { border-color: currentColor; opacity: 1; }
.mix .fav { border-color: rgba(var(--seitetext-rgb), .3); }
.mix .fav.an { border-color: var(--akzent); color: var(--akzent); }
/* Mix: Retro-Karten im Magazin-Raster */
.mix .karte { border-radius: 28px; padding: 20px 22px; }
.mix .energie, .mix .vorraete, .mix .licht-bereich { background: var(--karte); border: var(--y-rand-breite, 2px) solid var(--linie); box-shadow: var(--y-schatten, none); }
.mix .waerme { background: var(--rost); color: var(--rosttext); box-shadow: var(--y-schatten, none); }
.mix .waerme .mini, .mix .waerme p { color: var(--rosttext); }
.mix .waerme .plusminus button { border-color: var(--rosttext); color: var(--rosttext); }
.mix .waerme .plusminus button.voll { background: var(--rosttext); color: var(--rost); }
.mix .waerme .plusminus button.aktiv { background: var(--akzent); border-color: var(--akzent); color: var(--aufakzent); }
.mix .waerme .modus { border-color: rgba(var(--rosttext-rgb), .5); color: var(--rosttext); }
.mix .waerme .modus.an { background: var(--rosttext); color: var(--rost); border-color: var(--rosttext); }
.mix .senfk { background: var(--akzent); color: var(--aufakzent); }
.mix .senfk .mini { color: var(--aufakzent); }
.mix .senfk .tuerknopf { background: var(--karte); color: var(--tinte); border: 3px solid var(--tinte); }
.mix .pillen .licht { border-radius: 16px; border-width: 2px; font-weight: 700; }
.mix .leiste { border-bottom-width: 3px; }
@container (max-width: 1150px) {
  aside { flex-basis: 300px; padding: 28px 26px 24px; }
  aside h1 { font-size: 48px; }
  aside .temp { font-size: 88px; }
  .magazin main, .mix main { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 26px 28px; column-gap: 24px; }
}
@container (max-width: 760px) {
  aside { flex-basis: 100%; }
  aside .temp { font-size: 80px; }
  .magazin main, .mix main { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 24px; }
}
@container (max-width: 600px) {
  .magazin main, .mix main { grid-template-columns: minmax(0, 1fr); }
  .licht-bereich { grid-column: auto; }
  aside h1 { font-size: 44px; }
}

/* ===== Breitbild (1920 × 720) ===== */
.breit { --grund: var(--y-grund, #F4ECDC); --karte: var(--y-flaeche, #FBF6EC); --tinte: var(--y-text, #3B2A20); --grau: var(--y-text-gedaempft, #8A5A3B);
  --linie: var(--y-rand, #3B2A20); --spur: var(--y-flaeche2, #EFE3CC); --rost: var(--y-akzent, #C8551F); --rosttext: var(--y-akzent-text, #FBF6EC);
  --rosttext-rgb: var(--y-akzent-text-rgb, 251, 246, 236); --senf: var(--y-akzent2, #E3A72F); --aufsenf: var(--y-auf-akzent2, #3B2A20);
  --seite: var(--y-seite, #3B2A20); --seitetext: var(--y-seite-text, #F4ECDC); --seitetext-rgb: var(--y-seite-text-rgb, 244, 236, 220);
  --dunkel-bg: var(--y-text, #3B2A20); --dunkel-text: var(--y-grund, #F4ECDC); --dunkel-text-rgb: var(--y-grund-rgb, 244, 236, 220);
  --anzeige: var(--y-schrift-anzeige, "Fraunces", Georgia, serif); --anzeigegewicht: var(--y-gewicht-anzeige, 900);
  --r: var(--y-radius, 28px); --rk: var(--y-radius-klein, 14px); --rahmen: var(--y-rand-breite, 2px) solid var(--linie);
  display: grid; grid-template-columns: minmax(300px, 1.05fr) 1fr 1.1fr 1.25fr 0.95fr 1fr; gap: 16px; padding: 16px;
  height: var(--stellplatz-hoehe, calc(100vh - var(--header-height, 56px))); min-height: 560px; min-width: 0;
  background: var(--grund); color: var(--tinte); font-family: var(--y-schrift-text, "DM Sans", system-ui, sans-serif); }
.wurzel.breit[data-y-hell="false"] { --dunkel-bg: var(--y-flaeche2); --dunkel-text: var(--y-text); --dunkel-text-rgb: var(--y-text-rgb); }
.breit .ic { width: 22px; height: 22px; }
.breit section, .breit aside { min-width: 0; min-height: 0; }
.b-seite { position: relative; overflow: hidden; border-radius: var(--r); background: var(--seite); color: var(--seitetext);
  padding: 24px 26px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; }
.b-seite .topo { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--seitetext); opacity: .08; }
.wurzel[data-y-hoehenlinien="false"] .b-seite .topo { display: none; }
.b-seite .streifen { position: relative; margin: 0 -40px; display: flex; flex-direction: column; gap: 6px; transform: skewY(-8deg); }
.b-seite .streifen i { height: 11px; background: var(--y-streifen-1, var(--rost)); }
.b-seite .streifen i:nth-child(2) { background: var(--y-streifen-2, var(--senf)); }
.b-seite .streifen i:nth-child(3) { background: var(--y-streifen-3, var(--seitetext)); opacity: .85; }
.wurzel[data-y-streifen="false"] .b-seite .streifen { display: none; }
.b-seite > div { position: relative; }
.b-mini, .b-label { font-size: 13px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
.b-seite .b-mini { color: rgba(var(--seitetext-rgb), .72); }
.b-seite h1 { margin: 6px 0 0; font-family: var(--anzeige); font-weight: var(--anzeigegewicht); font-size: 46px; line-height: .95; overflow-wrap: anywhere; }
.b-seite h1.lang { font-size: 36px; } .b-seite h1.sehrlang { font-size: 28px; }
.b-uhr { font-family: var(--anzeige); font-weight: var(--anzeigegewicht); font-size: 92px; line-height: 1; }
.b-unten { display: flex; flex-direction: column; gap: 10px; }
.b-wetter { display: flex; align-items: baseline; gap: 12px; }
.b-temp { font-family: var(--anzeige); font-weight: var(--anzeigegewicht); font-size: 52px; line-height: 1; }
.b-wetter span:last-child { font-size: 15px; color: rgba(var(--seitetext-rgb), .8); }
.b-zeile { display: flex; align-items: center; gap: 10px; font-size: 15px; padding-top: 8px; border-top: 1px solid rgba(var(--seitetext-rgb), .2); }
.b-k { border-radius: var(--r); background: var(--karte); border: var(--rahmen); box-shadow: var(--y-schatten, none);
  padding: 20px 22px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
.b-k .b-label { color: var(--grau); }
.b-akzent { background: var(--rost); color: var(--rosttext); border-color: var(--rost); }
.b-akzent .b-label, .b-akzent .b-text { color: var(--rosttext); opacity: .9; }
.b-dunkel { background: var(--dunkel-bg); color: var(--dunkel-text); border-color: var(--dunkel-bg); }
.b-dunkel .b-label, .b-dunkel .b-text { color: var(--dunkel-text); opacity: .75; }
.b-riesig { font-family: var(--anzeige); font-weight: var(--anzeigegewicht); font-size: 84px; line-height: .9; }
.b-einheit { font-size: 38px; }
.b-text { font-size: 15px; line-height: 1.4; }
.b-trenner { height: 1px; background: currentColor; opacity: .2; margin: 2px 0; }
.b-knoepfe { display: flex; gap: 10px; }
.b-knoepfe button { flex: 1; height: 54px; border-radius: 27px; border: 2px solid var(--rosttext); background: transparent; color: var(--rosttext);
  font-size: 26px; display: flex; align-items: center; justify-content: center; }
.b-knoepfe button svg { width: 22px; height: 22px; }
.b-knoepfe button.aktiv { background: var(--rosttext); color: var(--rost); }
.breit .modi { display: flex; flex-wrap: wrap; gap: 6px; }
.breit .modus { padding: 7px 12px; border-radius: 999px; border: 2px solid rgba(var(--rosttext-rgb), .55); background: transparent; color: var(--rosttext); font-weight: 700; font-size: 14px; min-height: 36px; }
.breit .modus.an { background: var(--rosttext); color: var(--rost); border-color: var(--rosttext); }
.b-balken { height: 10px; background: var(--spur); border-radius: 5px; overflow: hidden; }
.b-balken i { display: block; height: 100%; background: var(--senf); }
.b-leistung { font-family: var(--anzeige); font-weight: var(--anzeigegewicht); font-size: 32px; }
.b-leistung small { font-family: var(--y-schrift-text, sans-serif); font-weight: 700; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--grau); }
.b-leistung.laden { color: var(--y-ok, #2F7A4F); } .b-leistung.entladen { color: var(--y-fehler, #B23A2B); }
.b-solar { display: flex; align-items: center; gap: 10px; font-size: 15px; } .b-solar .ic { color: var(--senf); } .b-solar b { font-size: 22px; }
.b-kopf { display: flex; justify-content: space-between; align-items: center; }
.b-link { background: none; border: none; color: var(--tinte); text-decoration: underline; font-weight: 700; font-size: 14px; padding: 8px 0; }
.b-lichter { flex: 1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 10px; }
.b-lichter .licht { border-radius: var(--rk); border: 2px solid var(--linie); background: transparent; color: var(--tinte); font-weight: 700; font-size: 16px; text-align: left; padding: 6px 14px; min-height: 44px; }
.b-lichter .licht.an { background: var(--senf); border-color: var(--senf); color: var(--aufsenf); }
.b-stapel { display: grid; grid-template-rows: 1fr auto; gap: 16px; min-height: 0; }
.b-vorrat { display: flex; flex-direction: column; gap: 5px; }
.b-vz { display: flex; justify-content: space-between; font-size: 16px; } .b-vz b { white-space: nowrap; }
.b-vl { height: 9px; background: var(--spur); border-radius: 5px; overflow: hidden; }
.b-vl i { display: block; height: 100%; background: var(--rost); } .b-vl i.blau { background: var(--y-info, #5E8C8A); }
.b-tuer { flex-direction: row; align-items: center; gap: 14px; background: var(--senf); color: var(--aufsenf); border-color: var(--senf); }
.b-tuer .b-label { color: var(--aufsenf); opacity: .8; }
.b-tuer .tuerknopf { width: 72px; height: 72px; border-radius: 50%; border: 3px solid var(--aufsenf); background: var(--karte); color: var(--tinte);
  display: flex; align-items: center; justify-content: center; flex: none; }
.b-tuer .tuerknopf svg { width: 32px; height: 32px; }
.b-tuertext { font-family: var(--anzeige); font-weight: var(--anzeigegewicht); font-size: 24px; line-height: 1.1; }
.b-sender { font-family: var(--anzeige); font-weight: var(--anzeigegewicht); font-size: 34px; line-height: 1.05; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.b-steuer { display: flex; gap: 10px; align-items: center; }
.b-steuer button { width: 50px; height: 50px; border-radius: 50%; border: 2px solid rgba(var(--dunkel-text-rgb), .35); background: transparent; color: var(--dunkel-text);
  display: flex; align-items: center; justify-content: center; }
.b-steuer button svg { width: 20px; height: 20px; }
.b-steuer .pp { width: 64px; height: 64px; border: none; background: var(--rost); color: var(--rosttext); }
.b-favs { margin-top: auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.b-favs .fav { height: 44px; border-radius: var(--rk); border: 1.5px solid rgba(var(--dunkel-text-rgb), .3); background: transparent; color: var(--dunkel-text);
  font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 10px; }
.b-favs .fav.an { border-color: var(--senf); color: var(--senf); }
/* Schmaler als das Breitbild: in zwei Zeilen umbrechen */
@container (max-width: 1500px) {
  .breit { grid-template-columns: repeat(3, minmax(0, 1fr)); height: auto; }
  .b-seite { grid-row: span 2; }
}
@container (max-width: 800px) {
  .breit { grid-template-columns: minmax(0, 1fr); }
  .b-seite { grid-row: auto; }
}
`;

if (!customElements.get("yapaia-stellplatz-card")) customElements.define("yapaia-stellplatz-card", YapaiaStellplatzCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((k) => k.type === "yapaia-stellplatz-card")) {
  window.customCards.push({
    type: "yapaia-stellplatz-card",
    name: "Yapaia Stellplatz",
    description: t(null, "kartenbeschreibung"),
    preview: false,
  });
}
