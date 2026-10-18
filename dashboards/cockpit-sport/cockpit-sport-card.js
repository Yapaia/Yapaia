/**
 * Cockpit „Sport“ – eine Lovelace-Karte im Stil eines Auto-Infotainments:
 * die Karte von Yapaia Go bildschirmfüllend, darüber schräge Kacheln für
 * Radio und Favoriten, rechts oben die nächste Anweisung, unten Ankunft und
 * eine Leiste mit Tempo, Tempolimit und Höhe.
 *
 * Einbinden (Ressource, Typ JavaScript-Modul):
 *   /local/yapaia-cockpit/cockpit-sport-card.js
 * Braucht daneben die Karten-Kachel von Yapaia Go:
 *   /local/yapaia/yapaia-map-card.js
 *
 * Im Dashboard (Ansicht vom Typ „Panel“):
 *   type: custom:yapaia-cockpit-sport-card
 */

const E = {
  anweisung: 'sensor.yapaia_go_anweisung',
  entfernung: 'sensor.yapaia_go_anweisung_entfernung',
  ankunft: 'sensor.yapaia_go_ankunft',
  restweg: 'sensor.yapaia_go_restweg',
  ziel: 'sensor.yapaia_go_ziel',
  tempo: 'sensor.yapaia_go_tempo',
  limit: 'sensor.yapaia_go_tempolimit',
  zuSchnell: 'binary_sensor.yapaia_go_zu_schnell',
  hoehe: 'sensor.yapaia_go_hoehe',
  profil: 'select.yapaia_go_profil',
  beenden: 'button.yapaia_go_beenden',
  zustand: 'sensor.yapaia_go_zustand',
  radio: 'media_player.yapaia_beat',
  titel: 'sensor.yapaia_beat_now_playing',
  radiotext: 'sensor.yapaia_beat_radiotext',
  stumm: 'switch.yapaia_satellite_mikrofon_stumm',
  // Yapaia Router (GL.iNet): Internet über WLAN oder Mobilfunk
  internet: 'sensor.yapaia_router_internet',
  wlanSignal: 'sensor.yapaia_router_wlan_signal',
  balken: 'sensor.yapaia_router_signalbalken',
  netztyp: 'sensor.yapaia_router_netztyp',
  aktiveSim: 'sensor.yapaia_router_aktive_sim',
  roaming: 'binary_sensor.yapaia_router_roaming',
  anbieter: 'sensor.yapaia_router_anbieter',
  baender: 'sensor.yapaia_router_baender',
  rsrp: 'sensor.yapaia_router_rsrp',
  rsrq: 'sensor.yapaia_router_rsrq',
  sinr: 'sensor.yapaia_router_sinr',
  land: 'sensor.yapaia_router_land',
  sim: 'select.yapaia_router_sim',
  umschaltung: 'sensor.yapaia_router_umschaltung',
  satellit: 'assist_satellite.yapaia_satellite_assist_satellit',
};
const LEER = new Set(['unknown', 'unavailable', 'none', '', undefined, null]);

// ─── ANORDNUNG ───────────────────────────────────────────────────────────────
// Jedes Objekt lässt sich verschieben und vergrößern, getrennt für Ruhe und
// Navigation -- unabhängig von Yapaia Go selbst. Gespeichert je Gerät (wie in
// Go): ein Tablet im Fahrzeug und ein Telefon in der Hand brauchen Verschiedenes.
// Verschoben wird in `--u` (wächst mit der Breite wie alles andere), nicht in
// Pixeln: sonst rutscht alles, sobald die Seitenleiste von Home Assistant auf-
// oder zuklappt.
const ANORDNUNG = 'yapaia.cockpitSport.anordnung';
const OBJEKTE = [
  ['oben', '.oben', 'Leiste oben'],
  ['radio', '.medien', 'Radio'],
  ['favoriten', '.gruen', 'Favoriten'],
  ['anweisung', '.nav', 'Anweisung'],
  ['kompass', '.kompass', 'Kompass'],
  ['schild', '.schild', 'Tempolimit'],
  ['lupe', '.lupe', 'Suche'],
  ['ankunft', '.eta', 'Ankunft'],
  ['leiste', '.leiste', 'Leiste unten'],
];
// ─── KOPFZEILE ───────────────────────────────────────────────────────────────
// Die Kopfzeile von Home Assistant („Cockpit Sport“) lässt sich über den Knopf
// in der oberen Leiste ausblenden, je Gerät gespeichert. Dafür bekommt
// `hui-root` (die Hülle des Dashboards) eine Regel: Kopfzeile weg, Höhe 0 --
// die Ansicht rückt nach oben und die Karte füllt den Bildschirm. Das greift
// in Home Assistant hinein und kann nach einem Update nicht mehr wirken; dann
// bleibt die Kopfzeile eben stehen.
// Tür und Lichter des Wohnmobils -- im grafischen Editor änderbar.
const TUER = 'lock.door_aufbautur';
const LICHT = 'light.smartwomo_ausgang_out2';
const LICHTER = [
  { entity: 'light.smartwomo_ausgang_out2', name: 'Dinette' },
  { entity: 'light.smartwomo_ausgang_out1', name: 'Außen' },
  { entity: 'light.smartwomo_ausgang_out5', name: 'Ambiente' },
  { entity: 'light.smartwomo_ausgang_out6', name: 'Ambiente Bett' },
  { entity: 'light.smartwomo_ausgang_out4', name: 'Bett' },
  { entity: 'light.smartwomo_ausgang_out8', name: 'Bad' },
  { entity: 'light.smartwomo_ausgang_out3', name: 'Eingang' },
  { entity: 'light.smartwomo_ausgang_out7', name: 'Nachtlicht' },
];
const LANG_DRUECKEN_MS = 500;

const KOPFZEILE = 'yapaia.cockpitSport.kopfzeile';
const KOPF_STIL = ':host { --header-height: 0px; } .header { display: none !important; }';

const FAHRT = new Set(['navigating', 'off_route', 'paused']);

// Spuren vor dem Abbiegen (ab Yapaia Go 0.53.0, Attribut `anweisung_spuren`
// der Anweisung). Erst ab 1500 m (Go selbst: 500 m, `apps/web/src/drive/spuren.ts`;
// auf der Autobahn war das zu knapp zum Einordnen),
// links nach rechts, nur die BESTE Spur (`active`) hell -- eine bloß
// mögliche (`valid`) hieße unter Umständen, kurz vor der Ausfahrt noch einmal
// wechseln zu müssen. Bits und Pfeile wie die der Anweisung oben.
const SPUREN_AB_M = 1500;
const SPUR_PFEILE = [
  [256, 'mdi:u-turn-left'],
  [4 | 8 | 512, 'mdi:arrow-left-top'],
  [16, 'mdi:arrow-top-left'],
  [2, 'mdi:arrow-up'],
  [32, 'mdi:arrow-top-right'],
  [64 | 128 | 1024, 'mdi:arrow-right-top'],
];
function spurPfeile(maske) {
  if (!(maske > 0)) return [];
  // 1 = Spur ohne Markierung, auf der Autobahn die durchgehenden: geradeaus.
  if (maske === 1) return [[1 | 2, 'mdi:arrow-up']];
  return SPUR_PFEILE.filter(([bits]) => maske & bits);
}
const MASSSTAB_MIN = 0.5;
const MASSSTAB_MAX = 2;
const runde = (v) => Math.round(v * 100) / 100;

/** `u` = aktuelle Größe von `--u` in px, um alte Werte (Pixel) umzurechnen. */
function anordnungLesen(u) {
  const leer = { einheit: 'u', ruhe: {}, fahrt: {} };
  try {
    const w = JSON.parse(localStorage.getItem(ANORDNUNG) || 'null');
    if (!w || typeof w !== 'object') return leer;
    const f = w.einheit === 'u' ? 1 : 1 / (u > 0 ? u : 14);
    const pruefe = (m) => {
      const raus = {};
      for (const [id, p] of Object.entries((w && w[m]) || {})) {
        if (p && [p.dx, p.dy, p.s].every(Number.isFinite)) raus[id] = { dx: runde(p.dx * f), dy: runde(p.dy * f), s: p.s };
      }
      return raus;
    };
    return { einheit: 'u', ruhe: pruefe('ruhe'), fahrt: pruefe('fahrt') };
  } catch (err) {
    return leer;
  }
}

// ─── NETZ-ANZEIGE ────────────────────────────────────────────────────────────
// Oben rechts wie am Telefon: WLAN-Bögen, wenn der Router über WLAN ins
// Internet geht, sonst Balken (links klein, rechts groß) mit Netztyp und
// aktiver SIM -- rot im Roaming. Live, weil der Router alle 15 s meldet.
const GRAU = 'rgba(255, 255, 255, 0.25)';

function balkenSvg(an, von = 5) {
  let teile = '';
  for (let i = 0; i < von; i += 1) {
    const h = 4 + i * 3;
    teile += `<rect x="${i * 5}" y="${16 - h}" width="3.4" height="${h}" rx="0.8" fill="${i < an ? 'currentColor' : GRAU}"/>`;
  }
  return `<svg viewBox="0 0 ${von * 5 - 1.6} 16" aria-hidden="true">${teile}</svg>`;
}

function wlanSvg(an) {
  // an: 0-4 (Punkt + drei Bögen)
  const bogen = (r, i) => {
    const d = r * Math.SQRT1_2;
    return `<path d="M ${12 - d} ${16.5 - d} A ${r} ${r} 0 0 1 ${12 + d} ${16.5 - d}" fill="none" stroke-width="2.4"
      stroke-linecap="round" stroke="${an > i ? 'currentColor' : GRAU}"/>`;
  };
  return `<svg viewBox="0 0 24 18" aria-hidden="true"><circle cx="12" cy="15.8" r="1.8" fill="${an > 0 ? 'currentColor' : GRAU}"/>
    ${bogen(6, 1)}${bogen(10.5, 2)}${bogen(15, 3)}</svg>`;
}

/** „NR5G-NSA“ → „5G“, „LTE“ → „LTE“, „HSPA+“ → „H+“, „EDGE“ → „E“ … */
function netzKurz(typ) {
  const t = String(typ || '').toUpperCase();
  if (!t) return '';
  if (t.includes('NR') || t.includes('5G')) return '5G';
  if (t.includes('LTE')) return 'LTE';
  if (t.includes('HSPA') || t.includes('HSDPA') || t.includes('HSUPA')) return 'H+';
  if (t.includes('WCDMA') || t.includes('UMTS') || t.includes('3G') || t.includes('SCDMA')) return '3G';
  if (t.includes('EDGE')) return 'E';
  if (t.includes('GPRS')) return 'G';
  if (t.includes('GSM') || t.includes('2G')) return '2G';
  return t;
}

// ─── SPRITPREISE ─────────────────────────────────────────────────────────────
// Wie in Yapaia Go (`apps/web/src/tanken/preise.ts`): Tankerkönig über Go,
// je Gegend eine Abfrage, die nächste Station in höchstens 250 m, Sorte aus
// dem aktiven Fahrzeugprofil, Farbe nach Alter der Abfrage.
const PREIS_MAX_M = 250;

function preisText(euro) {
  const t = Math.round(euro * 1000);
  const rest = String(t % 1000).padStart(3, '0');
  return `${Math.floor(t / 1000)},${rest.slice(0, 2)}${'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(rest[2])]}`;
}

function preisFrische(abgerufen, offen) {
  if (!offen) return 'zu';
  const alter = Date.now() - Date.parse(abgerufen);
  if (!Number.isFinite(alter) || alter > 3600000) return 'alt';
  return alter > 900000 ? 'aelter' : 'frisch';
}

const FRISCHE_TEXT = { frisch: 'Preis aktuell', aelter: 'Preis älter als 15 Minuten', alt: 'Preis älter als eine Stunde',
  zu: 'Tankstelle geschlossen' };

const STIL = `
  :host { display: block; height: 100%; }
  [hidden] { display: none !important; }
  .tv {
    position: relative; overflow: hidden;
    height: var(--cockpit-hoehe, calc(100vh - var(--header-height, 56px)));
    min-height: 420px; background: #0a0d14; color: #f2f3f5;
    font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --kupfer: #c9895b; --dunkel: rgba(22, 24, 30, 0.92);
    /* ─── KEINE CONTAINER-EINHEITEN ─────────────────────────────────────────
       Bis 2026-10-15 stand hier 1.calc(var(--cw, 1vw) * 25). Das Autoradio (Eonon UX6K Pro Max)
       hat eine WebView ohne cqw/cqh/@container (erst ab Chrome 105): jedes
       Maß wurde ungültig, Symbole riesig, Text winzig. Jetzt misst
       _masse() die Kachel und setzt --cw/--ch (1 % Breite/Höhe in px);
       bis dahin gilt die Fensterbreite. */
    --u: clamp(9px, calc(var(--cw, 1vw) * 1.25), 17px);
  }
  .mass { position: absolute; width: calc(var(--u) * 100); height: 0; visibility: hidden; pointer-events: none; }
  /* Bildschirmfüllend; die Leisten liegen halbdurchsichtig darüber (Wunsch
     2026-10-15: kein schwarzer Streifen hinter Kopf- und Fußleiste). */
  .karte { position: absolute; inset: 0; }
  yapaia-map-card { display: block; height: 100%;
    --ha-card-border-radius: 0; --ha-card-border-width: 0; --ha-card-box-shadow: none; }
  .oben, .leiste { position: absolute; left: 0; right: 0; display: flex; align-items: center; z-index: 3; }
  .oben { top: 0; height: calc(var(--u) * 4.4); padding: 0 calc(var(--u) * 1.4); gap: calc(var(--u) * 0.9);
    background: linear-gradient(rgba(10, 13, 20, 0.78), rgba(16, 20, 29, 0.62)); backdrop-filter: blur(3px); }
  .knopf { width: calc(var(--u) * 2.9); height: calc(var(--u) * 2.9); border-radius: calc(var(--u) * 0.7);
    display: grid; place-items: center; background: #1b202b; color: #e8e9ec; border: 0; cursor: pointer; padding: 0;
    --mdc-icon-size: calc(var(--u) * 1.7); }
  .knopf.rund { border-radius: 50%; }
  .knopf.kupfer { background: var(--kupfer); color: #14161b; }
  .knopf.tuerkis { background: #18a999; color: #06231f; }
  .knopf.rahmen { background: transparent; outline: 1.5px solid #e8e9ec; }
  .knopf.an { background: #b3261e; color: #fff; }
  .mitte { flex: 1; display: grid; place-items: center; }
  .griff { width: calc(var(--u) * 5); height: 3px; border-radius: 2px; background: #e8e9ec; opacity: 0.85; }
  .status { display: flex; align-items: center; gap: calc(var(--u) * 0.8); font-size: calc(var(--u) * 1.6);
    --mdc-icon-size: calc(var(--u) * 1.5); }
  .uhr { font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
  #s-mikro { cursor: pointer; }
  .netz { display: flex; align-items: center; gap: calc(var(--u) * 0.45); background: none; border: 0; color: inherit;
    cursor: pointer; padding: 0; font: inherit; font-size: calc(var(--u) * 1.15); font-weight: 600; letter-spacing: 0.03em; }
  .netz svg { height: calc(var(--u) * 1.5); width: auto; display: block; }
  .netz.roaming { color: #ff6b5e; }
  .netz.weg { opacity: 0.55; }
  .klapp { position: absolute; z-index: 6; background: var(--dunkel); border-radius: calc(var(--u) * 0.7);
    box-shadow: 0 calc(var(--u) * 0.8) calc(var(--u) * 2.4) rgba(0, 0, 0, 0.55); padding: calc(var(--u) * 1);
    border-top: 2px solid var(--kupfer); font-size: calc(var(--u) * 1.3); }
  .klapp .kopf { display: flex; align-items: center; justify-content: space-between; gap: calc(var(--u) * 0.6);
    font-weight: 600; font-size: calc(var(--u) * 1.5); margin-bottom: calc(var(--u) * 0.6); }
  .klapp .kopf .zu { background: none; border: 0; color: #fff; cursor: pointer; padding: 0; --mdc-icon-size: calc(var(--u) * 1.8); }
  #s-tuer { cursor: pointer; }
  #s-tuer.offen { color: #ff6b5e; }
  .symbole button.licht-an { color: #ffd166; }
  /* Halte: Zwischenziele und Ziel mit Ankunft und km (Antippen von „Ankunft“). */
  .halte { bottom: calc(var(--u) * 13.4); left: 50%; transform: translateX(-50%); width: clamp(280px, calc(var(--cw, 1vw) * 40), 540px); }
  .halte ol { list-style: none; margin: 0; padding: 0; max-height: calc(var(--ch, 1vh) * 45); overflow-y: auto; }
  .halte li { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: calc(var(--u) * 0.9);
    padding: calc(var(--u) * 0.55) 0; border-top: 1px solid rgba(255, 255, 255, 0.1); --mdc-icon-size: calc(var(--u) * 1.6); }
  .halte li:first-child { border-top: 0; }
  .halte .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .halte .km, .halte .uhr { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .halte .uhr { font-weight: 600; }
  .halte li.ziel .name { font-weight: 600; }
  .eta .raster { cursor: pointer; }
  .licht-menu { bottom: calc(var(--u) * 6.4); left: 50%; transform: translateX(-50%); width: clamp(280px, calc(var(--cw, 1vw) * 34), 460px); }
  .lichter { display: grid; grid-template-columns: 1fr 1fr; gap: calc(var(--u) * 0.6); }
  .lichter button { display: flex; align-items: center; gap: calc(var(--u) * 0.6); background: #1b2130; color: #d7d9de;
    border: 1px solid #343b4b; border-radius: calc(var(--u) * 0.5); padding: calc(var(--u) * 0.7) calc(var(--u) * 0.8);
    cursor: pointer; font: inherit; text-align: left; --mdc-icon-size: calc(var(--u) * 1.8); }
  .lichter button.an { border-color: #ffd166; color: #fff; }
  .lichter button.an ha-icon { color: #ffd166; }
  .lichter button.weg { opacity: 0.45; }
  .netz-info { top: calc(var(--u) * 4.6); right: calc(var(--u) * 1.4); width: clamp(260px, calc(var(--cw, 1vw) * 30), 420px); }
  .netz-info .kopf .netz { pointer-events: none; font-size: calc(var(--u) * 1.3); }
  .netz-info dl { display: grid; grid-template-columns: auto 1fr; gap: calc(var(--u) * 0.35) calc(var(--u) * 1); margin: 0; }
  .netz-info dt { opacity: 0.65; }
  .netz-info dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; }
  .netz-info .rot { color: #ff6b5e; }
  .netz-info .sims { display: flex; gap: calc(var(--u) * 0.6); margin-top: calc(var(--u) * 0.9); }
  .netz-info .sims button { flex: 1; background: #1b2130; color: #fff; border: 1px solid #343b4b; border-radius: calc(var(--u) * 0.5);
    padding: calc(var(--u) * 0.6); font-size: calc(var(--u) * 1.3); cursor: pointer; }
  .netz-info .sims button.an { background: var(--kupfer); border-color: var(--kupfer); color: #14161b; font-weight: 600; }
  .netz-info .sims button:disabled { opacity: 0.6; cursor: default; }
  .netz-info .stand { margin-top: calc(var(--u) * 0.5); font-size: calc(var(--u) * 1.1); opacity: 0.75; }
  .orte { left: 50%; transform: translateX(-50%); bottom: calc(var(--u) * 6.4); width: clamp(300px, calc(var(--cw, 1vw) * 46), 640px); }
  .kategorien { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 0.5); }
  .kategorien button { background: #1b2130; color: #fff; border: 1px solid #343b4b; border-radius: calc(var(--u) * 0.5);
    padding: calc(var(--u) * 0.5) calc(var(--u) * 0.8); font-size: calc(var(--u) * 1.25); cursor: pointer; }
  .kategorien button.an { background: var(--kupfer); border-color: var(--kupfer); color: #14161b; }
  .orte .treffer { max-height: calc(var(--ch, 1vh) * 34); }
  .orte .treffer button.an { background: rgba(124, 58, 237, 0.35); }
  .orte.vorschau .kategorien, .orte.vorschau #orte-liste, .orte.vorschau .kopf { display: none; }
  .orte-vorschau { display: none; align-items: center; gap: calc(var(--u) * 0.6); }
  .orte.vorschau .orte-vorschau { display: flex; }
  .orte-vorschau .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .orte-vorschau .text span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .orte-vorschau .zeile2 { display: flex; align-items: center; gap: calc(var(--u) * 0.5); font-size: calc(var(--u) * 1.05); }
  .orte-vorschau #ov-weit { opacity: 0.65; }
  .orte-vorschau button { background: #1b2130; color: #fff; border: 1px solid #343b4b; border-radius: calc(var(--u) * 0.5);
    padding: calc(var(--u) * 0.5) calc(var(--u) * 0.7); font-size: calc(var(--u) * 1.2); cursor: pointer; --mdc-icon-size: calc(var(--u) * 1.6); }
  .orte-vorschau button.los { background: #7c3aed; border-color: #7c3aed; font-weight: 600; }
  .tv.orte-offen .eta { visibility: hidden; }
  .preis { flex: none; border-radius: 999px; padding: calc(var(--u) * 0.15) calc(var(--u) * 0.7); font-size: calc(var(--u) * 1.1);
    font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .preis.frisch { background: rgba(16, 185, 129, 0.25); color: #6ee7b7; }
  .preis.aelter { background: rgba(245, 158, 11, 0.25); color: #fcd34d; }
  .preis.alt { background: rgba(148, 163, 184, 0.25); color: #cbd5e1; }
  .preis.zu { background: rgba(148, 163, 184, 0.2); color: #94a3b8; text-decoration: line-through; }
  .orte .los { flex: none; background: #7c3aed; color: #fff; border-radius: calc(var(--u) * 0.4);
    padding: calc(var(--u) * 0.3) calc(var(--u) * 0.7); font-size: calc(var(--u) * 1.1); font-weight: 600; }

  .kachel { position: absolute; left: calc(var(--u) * 1.6); z-index: 2; width: clamp(230px, calc(var(--cw, 1vw) * 31), 460px);
    filter: drop-shadow(0 calc(var(--u) * 0.6) calc(var(--u) * 0.9) rgba(0, 0, 0, 0.45)); }
  .kachel > .flaeche { clip-path: polygon(0 0, 100% 0, 91% 100%, 0 100%);
    border-radius: calc(var(--u) * 1) 0 0 calc(var(--u) * 1); padding: calc(var(--u) * 1.2) calc(var(--u) * 4.2) calc(var(--u) * 1.2) calc(var(--u) * 1.4); }
  .medien { top: calc(var(--u) * 5.6); }
  .medien > .flaeche { background: linear-gradient(135deg, #7b3fc4 0%, #4a1f86 55%, #371466 100%); }
  .gruen { top: calc(var(--u) * 20.6); }
  .gruen > .flaeche { background: linear-gradient(135deg, #1f9d58 0%, #14703d 60%, #0d5a30 100%); }
  .kopf { display: flex; gap: calc(var(--u) * 1); align-items: center; min-height: calc(var(--u) * 5.2); }
  .logo { width: calc(var(--u) * 4.6); height: calc(var(--u) * 4.6); border-radius: calc(var(--u) * 0.5);
    object-fit: cover; background: rgba(0, 0, 0, 0.25); flex: none; }
  .zeilen { min-width: 0; }
  .zeilen div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gross { font-size: calc(var(--u) * 1.75); font-weight: 600; }
  .klein { font-size: calc(var(--u) * 1.25); opacity: 0.85; }
  .ring { position: absolute; top: calc(var(--u) * 1.1); right: calc(var(--u) * 4.4); width: calc(var(--u) * 2.3);
    height: calc(var(--u) * 2.3); border-radius: 50%; background: rgba(255, 255, 255, 0.18); display: grid;
    place-items: center; --mdc-icon-size: calc(var(--u) * 1.4); }
  .tasten { display: flex; gap: calc(var(--u) * 2.2); padding: calc(var(--u) * 1.3) 0 calc(var(--u) * 0.3) calc(var(--u) * 2.6); }
  .tasten button { background: none; border: 0; color: #fff; cursor: pointer; padding: 0;
    --mdc-icon-size: calc(var(--u) * 2.5); }
  .label { font-size: calc(var(--u) * 1.3); font-weight: 500; margin-bottom: calc(var(--u) * 0.8); }
  /* Seiten zu je vier Sendern, wischen blättert (Scroll-Snap). */
  .favoriten { display: flex; width: calc(var(--u) * 21.9); overflow-x: auto; scroll-snap-type: x mandatory;
    scrollbar-width: none; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
  .favoriten::-webkit-scrollbar { display: none; }
  .fav-seite { flex: none; width: 100%; display: flex; gap: calc(var(--u) * 0.5); scroll-snap-align: start; }
  .punkte { display: inline-flex; gap: calc(var(--u) * 0.5); margin-left: calc(var(--u) * 0.8); vertical-align: middle; }
  .punkte button { width: calc(var(--u) * 0.8); height: calc(var(--u) * 0.8); padding: 0; border: 0; border-radius: 50%;
    background: rgba(255, 255, 255, 0.4); cursor: pointer; }
  .punkte button.an { background: #fff; }
  .fav { background: none; border: 0; color: #fff; cursor: pointer; padding: 0; width: calc(var(--u) * 5.1);
    font-size: calc(var(--u) * 1); text-align: center; }
  .fav img, .fav .ersatz { width: calc(var(--u) * 4.4); height: calc(var(--u) * 4.4); border-radius: 50%;
    object-fit: cover; background: #fff; display: grid; place-items: center; margin: 0 auto calc(var(--u) * 0.4);
    color: #14703d; font-weight: 700; font-size: calc(var(--u) * 1.5); border: 2px solid transparent; box-sizing: border-box; }
  .fav.aktiv img, .fav.aktiv .ersatz { border-color: #fff; box-shadow: 0 0 0 2px var(--kupfer); }
  .fav span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .nav { position: absolute; z-index: 2; top: calc(var(--u) * 5.6); right: calc(var(--u) * 5.6);
    width: clamp(260px, calc(var(--cw, 1vw) * 36), 560px); background: var(--dunkel); border-radius: calc(var(--u) * 0.5);
    padding: calc(var(--u) * 0.9) calc(var(--u) * 1.3); box-shadow: 0 calc(var(--u) * 0.4) calc(var(--u) * 1) rgba(0, 0, 0, 0.4); }
  /* Links Pfeil und Entfernung untereinander, rechts der GANZE Text (umbrechen statt
     abschneiden -- „Auf die A3 Richtung …“ braucht die Richtung). */
  .nav .zeile { display: flex; align-items: center; gap: calc(var(--u) * 1); --mdc-icon-size: calc(var(--u) * 2.6); }
  .nav .links { display: flex; flex-direction: column; align-items: center; flex: none; gap: calc(var(--u) * 0.2); }
  .nav .weit { font-size: calc(var(--u) * 1.6); font-weight: 600; white-space: nowrap; }
  .nav .text { font-size: calc(var(--u) * 1.45); line-height: 1.25; min-width: 0; overflow-wrap: anywhere; }
  .nav .spuren { display: flex; justify-content: center; gap: calc(var(--u) * 0.3); margin-top: calc(var(--u) * 0.7);
    padding-top: calc(var(--u) * 0.7); border-top: 1px solid rgba(255, 255, 255, 0.2); --mdc-icon-size: calc(var(--u) * 2.2); }
  .nav .spuren[hidden] { display: none; }
  .nav .spur { display: flex; padding: calc(var(--u) * 0.2) calc(var(--u) * 0.3); border-radius: calc(var(--u) * 0.3);
    color: rgba(255, 255, 255, 0.35); }
  .nav .spur.an { background: #fff; color: #14161b; }
  .nav .spur.an .blass { opacity: 0.3; }
  .kompass { position: absolute; z-index: 2; top: calc(var(--u) * 5.6); right: calc(var(--u) * 1.4); }
  .schild { position: absolute; z-index: 2; top: calc(var(--u) * 12.6); right: calc(var(--u) * 1.4);
    width: calc(var(--u) * 4.6); height: calc(var(--u) * 4.6); border-radius: 50%; background: #fff; color: #111;
    border: calc(var(--u) * 0.55) solid #d5231e; box-sizing: border-box; display: grid; place-items: center;
    font-size: calc(var(--u) * 1.75); font-weight: 700; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); }
  .schild.warn { animation: puls 0.8s ease-in-out infinite alternate; }
  @keyframes puls { to { transform: scale(1.12); box-shadow: 0 0 0 calc(var(--u) * 0.6) rgba(213, 35, 30, 0.45); } }

  .eta { position: absolute; z-index: 2; left: 50%; transform: var(--anordnung, translate(0)) translateX(-10%); bottom: calc(var(--u) * 7);
    background: var(--dunkel); border-radius: calc(var(--u) * 0.5); display: flex; align-items: center;
    gap: calc(var(--u) * 1.3); padding: calc(var(--u) * 0.8) calc(var(--u) * 1.2); --mdc-icon-size: calc(var(--u) * 1.9);
    box-shadow: 0 calc(var(--u) * 0.4) calc(var(--u) * 1) rgba(0, 0, 0, 0.4); }
  .eta .raster { display: grid; grid-template-columns: auto auto; column-gap: calc(var(--u) * 1.8); row-gap: 2px;
    font-size: calc(var(--u) * 1.45); font-variant-numeric: tabular-nums; }
  .eta .raster b { font-weight: 600; }
  .eta button { background: none; border: 0; border-left: 1px solid rgba(255, 255, 255, 0.2); color: #fff; cursor: pointer;
    padding: 0 0 0 calc(var(--u) * 1); }
  .lupe { position: absolute; z-index: 2; left: 38%; bottom: calc(var(--u) * 7); }
  .lupe .knopf { background: var(--dunkel); border-radius: calc(var(--u) * 0.4); }

  .leiste { bottom: 0; height: calc(var(--u) * 5.6); padding: 0 calc(var(--u) * 1.6); gap: calc(var(--u) * 1.6);
    background: linear-gradient(rgba(16, 20, 29, 0.62), rgba(7, 9, 14, 0.78)); backdrop-filter: blur(3px);
    border-top: 1px solid rgba(255, 255, 255, 0.08); }
  .auto { color: var(--kupfer); font-size: calc(var(--u) * 1.25); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    max-width: calc(var(--cw, 1vw) * 18); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wert { font-size: calc(var(--u) * 2.9); font-weight: 300; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .wert small { font-size: calc(var(--u) * 1.2); opacity: 0.75; margin-left: 0.25em; }
  .wert.warn { color: #ff6b5e; }
  .symbole { flex: 1; display: flex; justify-content: center; align-items: center; gap: calc(var(--u) * 2.2); }
  .symbole button { background: none; border: 0; color: #d7d9de; cursor: pointer; padding: 0; --mdc-icon-size: calc(var(--u) * 2.1); }
  .symbole button.an { color: #ff6b5e; }
  .marke { font-size: calc(var(--u) * 1.5); font-weight: 600; letter-spacing: 0.14em; border-top: 2px solid var(--kupfer);
    padding-top: calc(var(--u) * 0.25); }
  .wagen { color: var(--kupfer); --mdc-icon-size: calc(var(--u) * 2.4); }
  .wagen.hoert { color: #5ad1ff; }
  .laut { font-size: calc(var(--u) * 1.15); font-variant-numeric: tabular-nums; opacity: 0; transition: opacity 0.4s;
    min-width: 3.2em; text-align: center; white-space: nowrap; color: var(--kupfer); }
  .laut.sichtbar { opacity: 1; }
  .kompass ha-icon { transition: transform 0.4s; }
  .kompass .knopf.kurs { background: var(--kupfer); color: #14161b; }
  .kompass .knopf.frei { background: #fff; color: #1565c0; }
  .kompass .knopf.frei ha-icon { transform: none !important; }

  .suche { position: absolute; z-index: 5; left: 50%; transform: translateX(-50%); top: calc(var(--u) * 6.2);
    width: clamp(300px, calc(var(--cw, 1vw) * 46), 640px); background: var(--dunkel); border-radius: calc(var(--u) * 0.7);
    box-shadow: 0 calc(var(--u) * 0.8) calc(var(--u) * 2.4) rgba(0, 0, 0, 0.55); padding: calc(var(--u) * 1);
    border-top: 2px solid var(--kupfer); }
  .suche .feld { display: flex; align-items: center; gap: calc(var(--u) * 0.8); --mdc-icon-size: calc(var(--u) * 1.9); }
  .suche input { flex: 1; min-width: 0; background: #0c0f16; color: #fff; border: 1px solid #343b4b;
    border-radius: calc(var(--u) * 0.5); padding: calc(var(--u) * 0.8) calc(var(--u) * 1); font-size: calc(var(--u) * 1.6); outline: none; }
  .suche input:focus { border-color: var(--kupfer); }
  .suche .zu { background: none; border: 0; color: #fff; cursor: pointer; padding: 0; }
  .treffer { margin-top: calc(var(--u) * 0.6); max-height: calc(var(--ch, 1vh) * 46); overflow-y: auto; }
  .treffer button { display: flex; align-items: center; gap: calc(var(--u) * 0.9); width: 100%; text-align: left; background: none;
    border: 0; border-top: 1px solid rgba(255, 255, 255, 0.1); color: #fff; cursor: pointer;
    padding: calc(var(--u) * 0.8) calc(var(--u) * 0.3); font-size: calc(var(--u) * 1.4); --mdc-icon-size: calc(var(--u) * 1.6); }
  .treffer .titel { font-size: calc(var(--u) * 1.05); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
    opacity: 0.55; padding: calc(var(--u) * 0.7) calc(var(--u) * 0.4) calc(var(--u) * 0.2); }
  .treffer button:active { background: rgba(255, 255, 255, 0.08); }
  .treffer .art { font-size: calc(var(--u) * 1.05); opacity: 0.65; }
  .treffer span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .treffer .text { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .treffer .zeile2 { font-size: calc(var(--u) * 1.05); opacity: 0.65; }
  .hinweis { margin-top: calc(var(--u) * 0.7); font-size: calc(var(--u) * 1.25); opacity: 0.85; }
  .hinweis.fehler { color: #ff8a80; opacity: 1; }

  /* Anpassen */
  .anpassen-leiste { position: absolute; z-index: 30; top: calc(var(--u) * 0.5); left: 50%; transform: translateX(-50%);
    max-width: 60%; height: calc(var(--u) * 3.4); box-sizing: border-box;
    display: flex; gap: calc(var(--u) * 0.6); align-items: center; background: var(--dunkel); padding: calc(var(--u) * 0.6);
    border-radius: calc(var(--u) * 0.7); border-top: 2px solid var(--kupfer); box-shadow: 0 calc(var(--u) * 0.6) calc(var(--u) * 1.6) rgba(0, 0, 0, 0.5);
    font-size: calc(var(--u) * 1.15); white-space: nowrap; }
  .anpassen-leiste button { background: #1b2130; color: #fff; border: 1px solid #343b4b; border-radius: calc(var(--u) * 0.5);
    padding: calc(var(--u) * 0.5) calc(var(--u) * 1); font: inherit; cursor: pointer; }
  .anpassen-leiste button.an { background: var(--kupfer); border-color: var(--kupfer); }
  .anpassen-leiste .info { opacity: 0.75; padding: 0 calc(var(--u) * 0.4); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .bearbeiten .griff-rahmen { position: absolute; inset: -3px; z-index: 25; border: 2px dashed var(--kupfer);
    border-radius: calc(var(--u) * 0.6); cursor: move; touch-action: none; background: rgba(205, 127, 50, 0.08); }
  .griff-rahmen .name { position: absolute; left: 4px; top: 4px; font-size: 12px; background: var(--kupfer); color: #fff;
    padding: 1px 6px; border-radius: 4px; pointer-events: none; }
  .griff-rahmen .groesse { position: absolute; right: -10px; bottom: -10px; width: 22px; height: 22px; border-radius: 50%;
    background: var(--kupfer); border: 2px solid #fff; cursor: nwse-resize; touch-action: none; }
  /* Eigene Anordnung (_anordnen), als transform statt translate/scale (Chrome 101). */
  .oben, .medien, .gruen, .nav, .kompass, .schild, .lupe, .leiste { transform: var(--anordnung, none); }
  .bearbeiten .schild[hidden], .bearbeiten .eta[hidden] { display: flex !important; }
  /* Das Tempolimit liegt auf dem Größenpunkt der Anweisung und ist selbst nicht verschiebbar. */
  .bearbeiten .schild { pointer-events: none; }

  /* Schmal (bis 700 px Kachelbreite): setzt _masse(), kein @container (s. o.). */
  .tv.schmal .gruen, .tv.schmal .lupe, .tv.schmal .kompass { display: none; }
  .tv.schmal .nav { right: calc(var(--u) * 1.4); top: calc(var(--u) * 19); }
  .tv.schmal .eta { transform: var(--anordnung, translate(0)) translateX(-50%); }
`;

const HTML = `
  <div class="tv">
    <i class="mass"></i>
    <div class="karte"></div>
    <div class="oben">
      <button class="knopf rund" data-nav="/yapaia-cockpit/cockpit" title="Cockpit"><ha-icon icon="mdi:view-dashboard"></ha-icon></button>
      <button class="knopf rund" data-nav="/lovelace" title="Übersicht"><ha-icon icon="mdi:apps"></ha-icon></button>
      <button class="knopf kupfer" data-app="yapaia_go" title="Yapaia Go"><ha-icon icon="mdi:rv-truck"></ha-icon></button>
      <button class="knopf tuerkis" data-app="yapaia_beat" title="Yapaia Beat"><ha-icon icon="mdi:radio"></ha-icon></button>
      <button class="knopf rahmen" data-nav="/config/dashboard" title="Einstellungen"><ha-icon icon="mdi:plus"></ha-icon></button>
      <button class="knopf rund" id="anpassen" title="Dashboard anpassen"><ha-icon icon="mdi:arrow-expand-all"></ha-icon></button>
      <button class="knopf rund" id="kopfzeile" title="Kopfzeile von Home Assistant ausblenden"><ha-icon icon="mdi:fullscreen"></ha-icon></button>
      <div class="mitte"><div class="griff"></div></div>
      <div class="status">
        <ha-icon id="s-tuer" icon="mdi:lock" title="Aufbautür auf- / abschließen" hidden></ha-icon>
        <ha-icon id="s-mikro" icon="mdi:microphone" title="Mikrofon des Satelliten stumm / an"></ha-icon>
        <ha-icon id="s-nav" icon="mdi:navigation-variant-outline"></ha-icon>
        <button class="netz" id="netz" hidden title="Internet: Details"></button>
        <span class="uhr" id="uhr"></span>
      </div>
    </div>

    <div class="anpassen-leiste" id="a-leiste" hidden>
      <button id="a-ruhe">Ruhe</button><button id="a-fahrt">Navigation</button>
      <span class="info" id="a-info"></span>
      <button id="a-zurueck">Zurücksetzen</button><button id="a-fertig">Fertig</button>
    </div>

    <div class="kachel medien"><div class="flaeche">
      <div class="ring"><ha-icon icon="mdi:radio-tower"></ha-icon></div>
      <div class="kopf">
        <img class="logo" id="m-logo" alt="">
        <div class="zeilen"><div class="gross" id="m-sender"></div><div class="klein" id="m-titel"></div><div class="klein" id="m-art"></div></div>
      </div>
      <div class="tasten">
        <button data-radio="media_previous_track" title="Zurück"><ha-icon icon="mdi:skip-previous-outline"></ha-icon></button>
        <button id="m-spiel" title="Wiedergabe"><ha-icon icon="mdi:play-outline"></ha-icon></button>
        <button data-radio="media_next_track" title="Weiter"><ha-icon icon="mdi:skip-next-outline"></ha-icon></button>
        <button id="m-stumm" title="Stumm"><ha-icon icon="mdi:volume-high"></ha-icon></button>
      </div>
    </div></div>

    <div class="kachel gruen"><div class="flaeche">
      <div class="ring"><ha-icon icon="mdi:star-outline"></ha-icon></div>
      <div class="label">Favoriten <span class="punkte" id="fav-punkte"></span></div>
      <div class="favoriten" id="favoriten"></div>
    </div></div>

    <div class="nav">
      <div class="zeile"><div class="links"><ha-icon id="n-icon" icon="mdi:navigation-outline"></ha-icon><span class="weit" id="n-weit"></span></div><span class="text" id="n-text"></span></div>
      <div class="spuren" id="n-spuren" hidden></div>
    </div>
    <div class="kompass"><button class="knopf rund" id="kompass" title="Karte: Norden oben / in Fahrtrichtung"><ha-icon icon="mdi:navigation"></ha-icon></button></div>
    <div class="schild" id="schild" hidden></div>

    <div class="lupe"><button class="knopf" id="lupe" title="Ziel suchen"><ha-icon icon="mdi:magnify"></ha-icon></button></div>
    <div class="suche" id="suche" hidden>
      <div class="feld">
        <ha-icon icon="mdi:magnify"></ha-icon>
        <input id="such-feld" type="search" placeholder="Ziel: Ort, Straße, Stellplatz …" autocomplete="off" autocapitalize="words" enterkeyhint="go">
        <button class="zu" id="such-zu" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <div class="treffer" id="treffer"></div>
      <div class="hinweis" id="such-hinweis"></div>
    </div>
    <div class="klapp netz-info" id="netz-info" hidden></div>
    <div class="klapp licht-menu" id="licht-menu" hidden>
      <div class="kopf"><span>Licht</span><button class="zu" id="licht-zu" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="lichter" id="lichter"></div>
    </div>
    <div class="klapp orte" id="orte" hidden>
      <div class="kopf"><span id="orte-titel">Sonderziele in der Nähe</span>
        <button class="zu" id="orte-zu" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="kategorien" id="orte-kat"></div>
      <div class="treffer" id="orte-liste"></div>
      <div class="orte-vorschau">
        <button id="ov-zurueck" title="Voriger"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
        <div class="text"><span id="ov-name"></span>
          <div class="zeile2"><span id="ov-weit"></span><span class="preis" id="ov-preis" hidden></span></div></div>
        <button id="ov-weiter" title="Nächster"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
        <button id="ov-liste" title="Zurück zur Liste"><ha-icon icon="mdi:format-list-bulleted"></ha-icon></button>
        <button class="los" id="ov-los"></button>
        <button id="ov-zu" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <div class="hinweis" id="orte-hinweis"></div>
    </div>
    <div class="klapp halte" id="halte" hidden>
      <div class="kopf"><span>Route</span><button class="zu" id="halte-zu" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <ol id="halte-liste"></ol>
      <div class="hinweis" id="halte-hinweis" hidden></div>
    </div>
    <div class="eta" id="eta" hidden>
      <ha-icon icon="mdi:flag-checkered"></ha-icon>
      <div class="raster"><b id="e-dauer"></b><b id="e-km"></b><span id="e-uhr"></span><span id="e-zustand"></span></div>
      <button id="e-ende" title="Navigation beenden"><ha-icon icon="mdi:close"></ha-icon></button>
    </div>

    <div class="leiste">
      <span class="auto" id="l-profil"></span>
      <span class="wert" id="l-tempo"></span>
      <div class="symbole">
        <button id="l-mikro" title="Spracheingabe"><ha-icon icon="mdi:microphone-outline"></ha-icon></button>
        <button id="l-licht" title="Licht Dinette – lange drücken: alle Lichter"><ha-icon icon="mdi:lightbulb-outline"></ha-icon></button>
        <button id="l-orte" title="Sonderziele in der Nähe: Tankstelle, Stellplatz, Parkplatz …"><ha-icon icon="mdi:map-marker-radius-outline"></ha-icon></button>
        <span class="marke">YAPAIA</span>
        <button id="l-leiser" title="Leiser"><ha-icon icon="mdi:volume-minus"></ha-icon></button>
        <span class="laut" id="l-laut"></span>
        <button id="l-lauter" title="Lauter"><ha-icon icon="mdi:volume-plus"></ha-icon></button>
      </div>
      <span class="wert" id="l-hoehe"></span>
      <ha-icon class="wagen" id="l-wagen" icon="mdi:car-side"></ha-icon>
    </div>
  </div>
`;

class YapaiaCockpitSportCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._karte = null;
    this._kartenHoehe = 0;
    this._favSchluessel = '';
    this._uhr = null;
  }

  static getStubConfig() {
    return { door_entity: TUER, light_entity: LICHT, lights: LICHTER };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'door_entity', selector: { entity: { domain: 'lock' } } },
        { name: 'light_entity', selector: { entity: { domain: 'light' } } },
        {
          name: 'lights',
          selector: {
            object: {
              multiple: true,
              label_field: 'name',
              fields: {
                name: { label: 'Name', selector: { text: {} } },
                entity: { label: 'Licht', required: true, selector: { entity: { domain: ['light', 'switch'] } } },
              },
            },
          },
        },
        { name: 'height', selector: { number: { min: 300, max: 2000, mode: 'box', unit_of_measurement: 'px' } } },
        { name: 'demo', selector: { boolean: {} } },
      ],
      computeLabel: (s) =>
        ({
          door_entity: 'Tür (Symbol oben)',
          light_entity: 'Licht (Lampe unten, Tippen)',
          lights: 'Lichter im Menü (Lampe lange drücken), in dieser Reihenfolge',
          height: 'Höhe (leer: ganze Seite)',
          demo: 'Beispielwerte einer Navigation zeigen',
        })[s.name],
    };
  }

  setConfig(config) {
    this._config = config || {};
    this._lichtSchluessel = null;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `<style>${STIL}</style>${HTML}`;
      this._verdrahten();
    }
    if (this._config.height) this.style.setProperty('--cockpit-hoehe', `${Number(this._config.height)}px`);
  }

  getCardSize() {
    return 12;
  }

  connectedCallback() {
    this._uhr = setInterval(() => this._zeit(), 15000);
    this._nadel = setInterval(() => this._kompassZeigen(), 700);
    this._diagTakt = setInterval(() => this._diagnose(), 1000);
    if (this._warEingehaengt) this._diag('eingehaengt', 'Karte erneut eingehängt (Home Assistant hat das Dashboard neu aufgebaut)');
    this._warEingehaengt = true;
    this._beobachter = new ResizeObserver(() => {
      this._masse();
      this._kartePassen();
    });
    const feld = this.shadowRoot && this.shadowRoot.querySelector('.karte');
    if (feld) this._beobachter.observe(feld);
    const tv = this.shadowRoot && this.shadowRoot.querySelector('.tv');
    if (tv) this._beobachter.observe(tv);
    this._masse();
    this._zeit();
    this._kopfzeile();
  }

  disconnectedCallback() {
    clearInterval(this._uhr);
    clearInterval(this._nadel);
    clearInterval(this._diagTakt);
    if (this._beobachter) this._beobachter.disconnect();
    this._kopfzeile(false); // andere Dashboards behalten ihre Kopfzeile
  }

  // ─── Kopfzeile von Home Assistant ───────────────────────────────────────────
  _kopfzeileAus() {
    try {
      return localStorage.getItem(KOPFZEILE) === 'aus';
    } catch (err) {
      return false;
    }
  }

  /** Die Hülle des Dashboards, quer durch die Shadow-DOMs nach oben. */
  _huiRoot() {
    let n = this;
    while (n && n.localName !== 'hui-root') n = n.assignedSlot || n.parentNode || n.host;
    return n || null;
  }

  /** Kopfzeile nach Einstellung zeigen oder ausblenden; `false` zeigt sie immer. */
  _kopfzeile(aus = this._kopfzeileAus()) {
    const knopf = this.shadowRoot && this.$('kopfzeile');
    if (knopf) {
      knopf.firstElementChild.setAttribute('icon', aus ? 'mdi:fullscreen-exit' : 'mdi:fullscreen');
      knopf.title = aus ? 'Kopfzeile von Home Assistant zeigen' : 'Kopfzeile von Home Assistant ausblenden';
    }
    // beim Abmelden hängt die Karte schon nicht mehr im Dashboard: gemerkte Hülle
    const wurzel = this._huiRoot() || this._wurzel;
    this._wurzel = wurzel;
    const sr = wurzel && wurzel.shadowRoot;
    if (!sr) return;
    let stil = sr.getElementById('yapaia-kopfzeile');
    if (aus && !stil) {
      stil = document.createElement('style');
      stil.id = 'yapaia-kopfzeile';
      stil.textContent = KOPF_STIL;
      sr.appendChild(stil);
    } else if (!aus && stil) {
      stil.remove();
    }
  }

  set hass(hass) {
    this._rohHass = hass;
    // `demo: true` in der Kartenkonfiguration zeigt Beispielwerte einer laufenden
    // Navigation -- zum Ansehen und Einrichten, ohne loszufahren. Dasselbe beim
    // Anpassen des Bildschirms „Navigation“.
    if (this._bearbeiten === 'ruhe') {
      const states = { ...hass.states };
      for (const id of [E.anweisung, E.entfernung, E.ankunft, E.restweg, E.ziel, E.limit]) {
        states[id] = { ...(states[id] || {}), state: 'unknown', attributes: {} };
      }
      states[E.zustand] = { ...(states[E.zustand] || {}), state: 'idle', attributes: {} };
      hass = { ...hass, states, callService: hass.callService.bind(hass) };
    } else if ((this._config && this._config.demo) || this._bearbeiten === 'fahrt') {
      const bsp = {
        [E.anweisung]: [
          'Rechts abbiegen auf Speyerer Straße',
          {
            icon: 'mdi:arrow-right-top',
            anweisung_spuren: [{ directions: 8 }, { directions: 2 }, { directions: 2 | 64, valid: 64, active: 64 }],
          },
        ],
        [E.entfernung]: ['260', {}],
        [E.ankunft]: [new Date(Date.now() + 23 * 60000).toISOString(), {}],
        [E.restweg]: ['24.5', {}],
        [E.ziel]: ['Mannheim, Sandhofer Straße 116', {}],
        [E.limit]: ['50', {}],
        [E.tempo]: ['47', {}],
        [E.zustand]: ['navigating', {}],
      };
      const states = { ...hass.states };
      for (const [id, [state, attributes]] of Object.entries(bsp)) states[id] = { ...(states[id] || {}), state, attributes };
      hass = { ...hass, states, callService: hass.callService.bind(hass) };
    }
    this._hass = hass;
    if (this._karte) this._karte.hass = hass;
    else this._kartePassen();
    this._zeigen();
  }

  $(id) {
    return this.shadowRoot.getElementById(id);
  }

  _z(id) {
    const s = this._hass && this._hass.states[id];
    return s && !LEER.has(s.state) ? s.state : null;
  }

  _rufe(domain, dienst, daten) {
    if (this._hass) this._hass.callService(domain, dienst, daten);
  }

  _verdrahten() {
    const r = this.shadowRoot;
    r.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => this._gehe(b.dataset.nav)));
    r.querySelectorAll('[data-app]').forEach((b) => b.addEventListener('click', () => this._app(b.dataset.app)));
    r.querySelectorAll('[data-radio]').forEach((b) =>
      b.addEventListener('click', () => this._rufe('media_player', b.dataset.radio, { entity_id: E.radio })),
    );
    this.$('m-spiel').addEventListener('click', () => {
      const spielt = this._z(E.radio) === 'playing';
      this._rufe('media_player', spielt ? 'media_stop' : 'media_play', { entity_id: E.radio });
    });
    this.$('e-ende').addEventListener('click', () => this._rufe('button', 'press', { entity_id: E.beenden }));
    this.$('eta').addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('#e-ende')) return;
      const h = this.$('halte');
      h.hidden = !h.hidden;
      if (!h.hidden) this._halte();
    });
    this.$('halte-zu').addEventListener('click', () => (this.$('halte').hidden = true));
    this.$('l-orte').addEventListener('click', () => (this.$('orte').hidden ? this._orteOeffnen() : this._orteSchliessen()));
    this.$('orte-zu').addEventListener('click', () => this._orteSchliessen());
    this.$('ov-zu').addEventListener('click', () => this._orteSchliessen());
    this.$('ov-liste').addEventListener('click', () => this._orteVorschau(false));
    this.$('ov-los').addEventListener('click', () => this._orte && this._orteEinfuegen(this._orte.treffer[this._orte.aktiv]));
    const blaettern = (schritt) => {
      const o = this._orte;
      if (o && o.treffer.length) this._orteWahl((o.aktiv + schritt + o.treffer.length) % o.treffer.length);
    };
    this.$('ov-zurueck').addEventListener('click', () => blaettern(-1));
    this.$('ov-weiter').addEventListener('click', () => blaettern(1));
    this.$('l-mikro').addEventListener('click', () => this._sprechen());
    this.$('s-mikro').addEventListener('click', () => this._rufe('switch', 'toggle', { entity_id: E.stumm }));
    this.$('s-tuer').addEventListener('click', () => this._tuerUmschalten());
    this._langDruecken(this.$('l-licht'), () => this._licht().length && this._rufe('homeassistant', 'toggle', { entity_id: this._licht() }), () => {
      this.$('licht-menu').hidden = !this.$('licht-menu').hidden;
      this._lichtZeigen();
    });
    this.$('licht-zu').addEventListener('click', () => (this.$('licht-menu').hidden = true));
    this.$('lichter').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-licht]');
      if (b) this._rufe('homeassistant', 'toggle', { entity_id: b.dataset.licht });
    });
    this.$('netz').addEventListener('click', () => {
      this.$('netz-info').hidden = !this.$('netz-info').hidden;
      this._netzInfo();
    });
    this.$('m-stumm').addEventListener('click', () => this._stumm());
    this.$('anpassen').addEventListener('click', () => this._anpassen(this._bearbeiten ? null : this._modus()));
    this.$('kopfzeile').addEventListener('click', () => {
      try {
        localStorage.setItem(KOPFZEILE, this._kopfzeileAus() ? 'an' : 'aus');
      } catch (err) {
        /* ohne Speicher kein Umschalten */
      }
      this._kopfzeile();
    });
    this.$('a-ruhe').addEventListener('click', () => this._anpassen('ruhe'));
    this.$('a-fahrt').addEventListener('click', () => this._anpassen('fahrt'));
    this.$('a-fertig').addEventListener('click', () => this._anpassen(null));
    this.$('a-zurueck').addEventListener('click', () => this._zuruecksetzen());
    this.$('l-leiser').addEventListener('click', () => this._lautstaerke(-0.05));
    this.$('l-lauter').addEventListener('click', () => this._lautstaerke(0.05));
    this.$('kompass').addEventListener('click', () => this._kompass());
    this.$('lupe').addEventListener('click', () => this._sucheZeigen(this.$('suche').hidden));
    this.$('such-zu').addEventListener('click', () => this._sucheZeigen(false));
    const feld = this.$('such-feld');
    feld.addEventListener('input', () => {
      clearTimeout(this._suchTakt);
      this._suchTakt = setTimeout(() => this._suchen(feld.value), 300);
    });
    feld.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && feld.value.trim()) this._ersterTreffer(feld.value);
      if (e.key === 'Escape') this._sucheZeigen(false);
    });
  }

  // ─── Anordnung ────────────────────────────────────────────────────────────
  /** Ruhe oder Navigation -- beim Anpassen der gewählte Bildschirm. */
  _modus() {
    if (this._bearbeiten) return this._bearbeiten;
    const z = this._hass && this._hass.states[E.zustand];
    return z && FAHRT.has(z.state) ? 'fahrt' : 'ruhe';
  }

  /** `--u` in px (gemessen, es hängt an der Breite der Karte). */
  _u() {
    const m = this.shadowRoot.querySelector('.mass');
    return (m && m.offsetWidth / 100) || 0;
  }

  _anordnen() {
    if (!this._werte) {
      const u = this._u();
      if (!u) return; // noch nicht sichtbar: alte Pixelwerte erst mit echter Breite umrechnen
      const alt = (() => { try { return localStorage.getItem(ANORDNUNG); } catch (err) { return null; } })();
      this._werte = anordnungLesen(u);
      if (alt && !alt.includes('"einheit":"u"')) this._speichern(); // einmal umgerechnet
    }
    const werte = this._werte[this._modus()] || {};
    for (const [id, sel] of OBJEKTE) {
      const el = this.shadowRoot.querySelector(sel);
      if (!el) continue;
      const p = werte[id];
      const an = p && (p.dx || p.dy || p.s !== 1);
      // Nicht style.translate/style.scale: die gibt es erst ab Chrome 104, das
      // Autoradio hat 101 -- die Werte änderten sich, zu sehen war nichts.
      // Der STIL setzt --anordnung vor die eigene Transformation (.eta).
      if (an) el.style.setProperty('--anordnung', `translate(calc(var(--u) * ${p.dx}), calc(var(--u) * ${p.dy})) scale(${p.s})`);
      else el.style.removeProperty('--anordnung');
    }
  }

  _speichern() {
    try {
      localStorage.setItem(ANORDNUNG, JSON.stringify(this._werte));
    } catch (err) {
      /* ohne Speicher gilt es bis zum Neuladen */
    }
  }

  /** `'ruhe'`/`'fahrt'` richtet diesen Bildschirm ein, `null` beendet. */
  _anpassen(modus) {
    this._bearbeiten = modus;
    const tv = this.shadowRoot.querySelector('.tv');
    tv.classList.toggle('bearbeiten', !!modus);
    this.$('a-leiste').hidden = !modus;
    this.$('a-ruhe').classList.toggle('an', modus === 'ruhe');
    this.$('a-fahrt').classList.toggle('an', modus === 'fahrt');
    this.$('anpassen').classList.toggle('an', !!modus);
    this.shadowRoot.querySelectorAll('.griff-rahmen').forEach((g) => g.remove());
    if (modus) for (const [id, sel, name] of OBJEKTE) this._griff(id, sel, name);
    // Die Karte von Go hat ihre eigene Anordnung (Anker der Position,
    // Verkehrsliste) -- ab Go 0.49.0 vom Dashboard aus einzurichten.
    const w = this._kartenFenster();
    const api = w && w.__yapaiaEinbettung;
    const kann = api && api.version >= 2;
    if (kann) api.bearbeiten(modus);
    if (modus) {
      const info = this.$('a-info');
      info.textContent = kann ? 'Fadenkreuz = Position' : 'Position: ab Go 0.49.0';
      info.title =
        'Rahmen ziehen verschiebt, der Punkt unten rechts ändert die Größe. ' +
        (kann ? 'Das Fadenkreuz in der Karte setzt die eigene Position.' : 'Die Position in der Karte lässt sich ab Yapaia Go 0.49.0 verschieben.');
    }
    if (this._rohHass) this.hass = this._rohHass;
  }

  _zuruecksetzen() {
    const modus = this._bearbeiten;
    if (!modus) return;
    this._werte[modus] = {};
    this._speichern();
    const w = this._kartenFenster();
    const api = w && w.__yapaiaEinbettung;
    if (api && api.version >= 2) api.zuruecksetzen(modus);
    this._anordnen();
  }

  /** Rahmen zum Ziehen, Punkt unten rechts zum Vergrößern. */
  _griff(id, sel, name) {
    const el = this.shadowRoot.querySelector(sel);
    if (!el) return;
    const rahmen = document.createElement('div');
    rahmen.className = 'griff-rahmen';
    rahmen.innerHTML = `<span class="name"></span><span class="groesse"></span>`;
    rahmen.firstElementChild.textContent = name;
    el.appendChild(rahmen);
    let start = null;
    const anfang = (art, x, y) => {
      const p = (this._werte[this._bearbeiten] || {})[id] || { dx: 0, dy: 0, s: 1 };
      start = { x, y, p: { ...p }, art, u: this._u() || 14 };
    };
    const weiter = (x, y) => {
      const ddx = x - start.x;
      const ddy = y - start.y;
      const p = start.p;
      const u = start.u;
      const neu =
        start.art === 'ziehen'
          ? { ...p, dx: runde(p.dx + ddx / u), dy: runde(p.dy + ddy / u) }
          : { ...p, s: Math.round(Math.min(MASSSTAB_MAX, Math.max(MASSSTAB_MIN, p.s + (ddx + ddy) / 400)) * 100) / 100 };
      this._werte[this._bearbeiten] = { ...this._werte[this._bearbeiten], [id]: neu };
      this._anordnen();
    };
    const ende = () => {
      start = null;
      this._speichern();
    };
    // ─── TOUCH ÜBER TOUCH-EVENTS, NICHT ÜBER POINTER-EVENTS ─────────────────
    // Auf dem Autoradio (Eonon UX6K Pro Max) kam pointerdown am Rahmen an, die
    // Bewegung aber nie: die WebView bricht den Pointer ab. Touch-Events mit
    // preventDefault (nicht passiv) halten den Finger fest; Pointer bleibt für
    // Maus und Stift.
    for (const [ziel, art] of [[rahmen, 'ziehen'], [rahmen.lastElementChild, 'groesse']]) {
      ziel.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        anfang(art, e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });
      ziel.addEventListener('touchmove', (e) => {
        if (!start) return;
        e.preventDefault();
        e.stopPropagation();
        weiter(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });
      for (const t of ['touchend', 'touchcancel']) {
        ziel.addEventListener(t, (e) => {
          if (!start) return;
          e.stopPropagation();
          ende();
        });
      }
      ziel.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        anfang(art, e.clientX, e.clientY);
      });
      ziel.addEventListener('pointermove', (e) => {
        if (!start || e.pointerType === 'touch') return;
        e.preventDefault();
        e.stopPropagation();
        weiter(e.clientX, e.clientY);
      });
      for (const t of ['pointerup', 'pointercancel']) {
        ziel.addEventListener(t, (e) => {
          if (!start || e.pointerType === 'touch') return;
          e.stopPropagation();
          ende();
        });
      }
    }
    rahmen.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  // ─── Lautstärke ────────────────────────────────────────────────────────────
  // Spielt Beat auf einem Lautsprecher aus Home Assistant (z. B. dem Satelliten),
  // bestimmt DESSEN Lautstärke, was man hört -- nicht die von Beat selbst.
  _lautZiel() {
    const radio = this._hass && this._hass.states[E.radio];
    const sprecher = radio && radio.attributes && radio.attributes.speaker;
    const erreichbar = sprecher && this._hass.states[sprecher] && this._hass.states[sprecher].state !== 'unavailable';
    return erreichbar ? sprecher : E.radio;
  }

  /** Stumm schalten, wo man es hört (wie die Lautstärke), und zurück. */
  _stumm() {
    const ziel = this._lautZiel();
    const z = this._hass && this._hass.states[ziel];
    const stumm = !!(z && z.attributes && z.attributes.is_volume_muted);
    this._rufe('media_player', 'volume_mute', { entity_id: ziel, is_volume_muted: !stumm });
  }

  _lautstaerke(schritt) {
    const ziel = this._lautZiel();
    const jetzt = Number(this._hass.states[ziel] && this._hass.states[ziel].attributes.volume_level);
    const neu = Math.max(0, Math.min(1, (Number.isFinite(jetzt) ? jetzt : 0.5) + schritt));
    this._rufe('media_player', 'volume_set', { entity_id: ziel, volume_level: Math.round(neu * 100) / 100 });
    const anzeige = this.$('l-laut');
    anzeige.textContent = `${Math.round(neu * 100)} %`;
    anzeige.classList.add('sichtbar');
    clearTimeout(this._lautTakt);
    this._lautTakt = setTimeout(() => anzeige.classList.remove('sichtbar'), 2500);
  }

  // ─── Diagnose (vorübergehend) ──────────────────────────────────────────────
  // Gemeldet: unterwegs wandert die eigene Position aus dem Bild, und die Karte
  // flackert, als würde sie neu geladen (danach wieder Norden oben). Im
  // Testbrowser nicht nachzustellen -- deshalb schreibt die Karte Auffälligkeiten
  // ins Log von Home Assistant (Einstellungen → System → Protokolle,
  // Logger `yapaia.cockpit_sport`). Je Art höchstens alle 30 s, insgesamt 300.
  _diag(art, text) {
    if (!this._hass) return;
    const jetzt = Date.now();
    this._diagZuletzt = this._diagZuletzt || {};
    this._diagAnzahl = this._diagAnzahl || 0;
    const abstand = art === 'bild' ? 60000 : 30000;
    if (this._diagAnzahl >= 300 || jetzt - (this._diagZuletzt[art] || 0) < abstand) return;
    this._diagZuletzt[art] = jetzt;
    this._diagAnzahl += 1;
    this._hass
      .callService('system_log', 'write', { message: `[Cockpit-Diagnose] ${text}`, level: 'warning', logger: 'yapaia.cockpit_sport' })
      .catch(() => {});
  }

  _diagnose() {
    const w = this._kartenFenster();
    if (!w) return;
    try {
      const map = w.__yapaiaMapController.getMap();
      if (!map) return;
      if (w !== this._diagFenster) {
        if (this._diagFenster) this._diag('neuladen', 'Karte neu geladen (neues Fenster im Rahmen)');
        this._diagFenster = w;
        this._diagKarte = null;
      }
      if (map !== this._diagKarte) {
        if (this._diagKarte) this._diag('neukarte', 'Neue Karteninstanz im selben Fenster');
        this._diagKarte = map;
        map.on('webglcontextlost', () => this._diag('webgl', 'WebGL-Kontext verloren (iPad hat der Karte die Grafik entzogen)'));
        map.on('webglcontextrestored', () => this._diag('webgl2', 'WebGL-Kontext wiederhergestellt'));
      }
      const modus = w.localStorage.getItem('yapaia.viewMode') || '2d-north';
      if (this._diagModus && modus !== this._diagModus && Date.now() - (this._kompassZeit || 0) > 3000) {
        this._diag('modus', `Ansicht ohne Kompass-Knopf gewechselt: ${this._diagModus} → ${modus}`);
      }
      this._diagModus = modus;
      const pos = w.__yapaiaPositionStore && w.__yapaiaPositionStore.getState().position;
      const nav = w.__yapaiaNavStore && w.__yapaiaNavStore.getState().navState;
      if (!pos || !nav || !FAHRT.has(nav.status)) return;
      const c = map.getContainer();
      const pad = map.getPadding();
      const ax = pad.left + (c.clientWidth - pad.left - pad.right) / 2;
      const ay = pad.top + (c.clientHeight - pad.top - pad.bottom) / 2;
      const p = map.project([pos.lon, pos.lat]);
      const weit = Math.abs(p.x - ax) > c.clientWidth * 0.2 || Math.abs(p.y - ay) > c.clientHeight * 0.2;
      this._diagWeit = weit ? (this._diagWeit || 0) + 1 : 0;
      // Einmal je Minute eine Momentaufnahme: wo der Anker liegt, wo der Punkt,
      // wie hoch Karte und Rahmen sind, Neigung und Leistungsstufe.
      const dg = w.__yapaiaDegrade;
      const stufe = dg ? dg.level : '?';
      if (this._diagStufe !== undefined && stufe !== this._diagStufe) {
        this._diag('stufe', `Leistungsstufe ${this._diagStufe} → ${stufe}`);
      }
      this._diagStufe = stufe;
      this._diag('bild', `Momentaufnahme: Anker ${(ax / c.clientWidth).toFixed(2)}|${(ay / c.clientHeight).toFixed(2)}, ` +
        `Punkt ${(p.x / c.clientWidth).toFixed(2)}|${(p.y / c.clientHeight).toFixed(2)}, Karte ${c.clientWidth}x${c.clientHeight}, ` +
        `Feld ${Math.round(this.shadowRoot.querySelector('.karte').clientHeight)} hoch, ${modus}, Neigung ${Math.round(map.getPitch())}°, ` +
        `Stufe ${stufe}, ${Math.round(nav.speed_kmh || 0)} km/h`);
      if (this._diagWeit === 3) {
        const f = w.__yapaiaFollowMeStore && w.__yapaiaFollowMeStore.getState();
        const alter = pos.timestamp ? Math.round((Date.now() - new Date(pos.timestamp).getTime()) / 1000) : '?';
        this._diag('weg', `Position weg vom Anker: dx ${Math.round(p.x - ax)} dy ${Math.round(p.y - ay)} px ` +
          `(Karte ${c.clientWidth}x${c.clientHeight}, Rahmen ${Math.round(this.shadowRoot.querySelector('.karte').clientHeight)} hoch), ` +
          `folgen ${f && f.isFollowing} pause ${f && f.isPaused}, ${modus}, Kurs ${Math.round(map.getBearing())}°, ` +
          `Zoom ${map.getZoom().toFixed(1)}, ${Math.round(nav.speed_kmh || 0)} km/h, Fix vor ${alter} s, bewegt ${map.isMoving()}`);
      }
    } catch (err) {
      /* Karte lädt gerade */
    }
  }

  // ─── Karte im Rahmen ───────────────────────────────────────────────────────
  /** Das Fenster der eingebetteten Go-Karte (gleiche Herkunft wie Home Assistant). */
  _kartenFenster() {
    try {
      const rahmen = this._karte && this._karte.shadowRoot && this._karte.shadowRoot.querySelector('iframe');
      const w = rahmen && rahmen.contentWindow;
      return w && w.__yapaiaMapController ? w : null;
    } catch (err) {
      return null;
    }
  }

  /** Go unter dem Ingress-Pfad der Karte, z. B. `/api/hassio_ingress/<token>/`. */
  _goBasis() {
    const rahmen = this._karte && this._karte.shadowRoot && this._karte.shadowRoot.querySelector('iframe');
    const src = rahmen && rahmen.getAttribute('src');
    return src ? src.replace(/[^/]*$/, '') : null;
  }

  /**
   * Kompass, wie im Auto: sitzt die eigene Position nicht mehr auf ihrem Platz
   * (jemand hat die Karte verschoben), holt der Knopf sie zurück. Sitzt sie
   * dort, schaltet er die Ansicht weiter -- Norden oben → in Fahrtrichtung →
   * in Fahrtrichtung, geneigt (3D).
   *
   * Ab Yapaia Go 0.48.1 geht beides über `__yapaiaEinbettung` der Kachel,
   * ohne Neuladen. Ältere Fassungen kennen nur den im Browser gemerkten Modus
   * (`yapaia.viewMode`), den sie beim Laden lesen: dort wird die Kachel für
   * den Ansichtswechsel neu geladen.
   */
  _kompass() {
    this._kompassZeit = Date.now();
    const w = this._kartenFenster();
    if (!w) return;
    const folge = ['2d-north', '2d-course', '3d-course'];
    const api = w.__yapaiaEinbettung;
    try {
      if (api) {
        const stand = api.stand();
        if (!stand.zentriert) api.zentrieren();
        else api.ansicht(folge[(folge.indexOf(stand.ansicht) + 1) % folge.length]);
      } else {
        const verfolgung = w.__yapaiaFollowMeStore && w.__yapaiaFollowMeStore.getState();
        if (verfolgung && (verfolgung.isPaused || !verfolgung.isFollowing)) {
          // zurück auf die eigene Position
          verfolgung.setFollowing(true);
          const p = w.__yapaiaPositionStore && w.__yapaiaPositionStore.getState().position;
          const map = w.__yapaiaMapController.getMap();
          if (p && map) map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 15), duration: 500 });
        } else {
          const jetzt = w.localStorage.getItem('yapaia.viewMode') || '2d-north';
          w.localStorage.setItem('yapaia.viewMode', folge[(folge.indexOf(jetzt) + 1) % folge.length]);
          w.location.reload();
        }
      }
    } catch (err) {
      return;
    }
    this._kompassZeigen();
  }

  /** Die Nadel zeigt nach Norden; Farbe und Tooltip nennen den Modus. */
  _kompassZeigen() {
    const knopf = this.shadowRoot && this.$('kompass');
    if (!knopf) return;
    let modus = '2d-north';
    try {
      const w = this._kartenFenster();
      if (w) modus = w.localStorage.getItem('yapaia.viewMode') || modus;
      const map = w && w.__yapaiaMapController.getMap();
      if (map) knopf.firstElementChild.style.transform = `rotate(${-map.getBearing()}deg)`;
    } catch (err) {
      /* Karte lädt gerade neu */
    }
    let zentriert = true;
    try {
      const w = this._kartenFenster();
      const v = w && w.__yapaiaFollowMeStore && w.__yapaiaFollowMeStore.getState();
      if (v) zentriert = v.isFollowing && !v.isPaused;
    } catch (err) {
      /* Karte lädt gerade neu */
    }
    knopf.classList.toggle('frei', !zentriert);
    knopf.classList.toggle('kurs', modus !== '2d-north');
    knopf.firstElementChild.setAttribute('icon', modus === '3d-course' ? 'mdi:navigation-variant' : 'mdi:navigation');
    knopf.title = zentriert
      ? { '2d-north': 'Norden oben', '2d-course': 'In Fahrtrichtung', '3d-course': 'In Fahrtrichtung, 3D' }[modus] || ''
      : 'Auf meine Position zentrieren';
    if (!zentriert) knopf.firstElementChild.setAttribute('icon', 'mdi:crosshairs-gps');
  }

  // ─── Zielsuche ─────────────────────────────────────────────────────────────
  _sucheZeigen(an) {
    const feld = this.$('suche');
    feld.hidden = !an;
    if (an) {
      this.$('such-feld').value = '';
      this.$('treffer').textContent = '';
      this._hinweis('Tippen und einen Vorschlag wählen – oder Enter für das erste passende Ziel.');
      this._vorschlaege();
      setTimeout(() => this.$('such-feld').focus(), 50);
    }
  }

  _hinweis(text, fehler = false) {
    const el = this.$('such-hinweis');
    el.textContent = text;
    el.classList.toggle('fehler', fehler);
  }

  /**
   * Wie in Yapaia Go selbst: Enter nimmt den ersten Vorschlag der Liste --
   * also den nächstgelegenen. Der Freitext an `go_ziel_setzen` würde in Go
   * ohne Standort gesucht und landete bei „Lidl“ irgendwo in Deutschland.
   */
  async _ersterTreffer(text) {
    clearTimeout(this._suchTakt);
    const q = text.trim();
    if (this._trefferFuer !== q) await this._suchen(q);
    const t = this._trefferFuer === q && this._treffer && this._treffer[0];
    if (t) this._waehle(t);
    else if (q.length < 3) this._zielSetzen({ ziel: q }, q);
  }

  // `name` kennt Yapaia Go ab 0.48.0; ältere Fassungen übergehen das Feld.
  _waehle(t) {
    const name = t.name || t.label;
    this._verlaufMerken(name, t.latlng);
    this._zielSetzen({ ort: { latitude: t.latlng.lat, longitude: t.latlng.lon }, name }, name);
  }

  /**
   * Wie die Suche in Go selbst (`SearchBar.tsx`, `favorites/navigate.ts`):
   * jedes gewählte Ziel in den Verlauf. Über `go_ziel_setzen` trägt Go es
   * nicht selbst ein. Fehler sind egal -- das Ziel wird trotzdem gesetzt.
   */
  _verlaufMerken(name, latlng) {
    const basis = this._goBasis();
    if (!basis) return;
    fetch(`${basis}api/v1/history`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: name, destination: { latlng: { lat: latlng.lat, lon: latlng.lon }, name } }),
    }).catch(() => {});
  }

  /** Ein Eintrag der Trefferliste (Suche, Favoriten, Verlauf). */
  _trefferKnopf(symbol, name, zweite, art, beiKlick) {
    const b = document.createElement('button');
    const icon = document.createElement('ha-icon');
    icon.setAttribute('icon', symbol);
    const text = document.createElement('span');
    text.className = 'text';
    const n = document.createElement('span');
    n.textContent = name;
    text.append(n);
    if (zweite) {
      const z = document.createElement('span');
      z.className = 'zeile2';
      z.textContent = zweite;
      text.append(z);
    }
    const a = document.createElement('span');
    a.className = 'art';
    a.textContent = art || '';
    b.append(icon, text, a);
    b.addEventListener('click', beiKlick);
    return b;
  }

  /**
   * Solange noch nichts (oder zu wenig) getippt ist: Favoriten und die
   * letzten drei verschiedenen Ziele aus Yapaia Go -- wie dort, wo Favoriten
   * und Verlauf erscheinen, sobald man in die Suche tippt.
   */
  async _vorschlaege() {
    const liste = this.$('treffer');
    const basis = this._goBasis();
    if (!basis) return;
    const nr = (this._suchNr = (this._suchNr || 0) + 1);
    const holen = (pfad) =>
      fetch(`${basis}api/v1/${pfad}`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((d) => (Array.isArray(d.data) ? d.data : []))
        .catch(() => []);
    const [favoriten, verlauf, hier] = await Promise.all([holen('favorites'), holen('history'), this._position(basis)]);
    if (nr !== this._suchNr) return; // inzwischen wurde getippt
    const gesehen = new Set();
    const zuletzt = [];
    for (const h of verlauf) {
      const d = h && h.destination;
      if (!d || !d.latlng || !Number.isFinite(d.latlng.lat)) continue;
      const name = d.name || h.query || `${d.latlng.lat.toFixed(4)}, ${d.latlng.lon.toFixed(4)}`;
      const schluessel = `${name}|${d.latlng.lat.toFixed(4)}|${d.latlng.lon.toFixed(4)}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      zuletzt.push({ name, latlng: d.latlng });
      if (zuletzt.length === 3) break;
    }
    const weg = (latlng) => (hier ? YapaiaCockpitSportCard._km(YapaiaCockpitSportCard._abstand(hier, latlng)) : '');
    liste.textContent = '';
    const titel = (text) => {
      const t = document.createElement('div');
      t.className = 'titel';
      t.textContent = text;
      liste.appendChild(t);
    };
    const favs = favoriten
      .filter((f) => f && f.latlng)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (favs.length) {
      titel('Favoriten');
      for (const f of favs) {
        const symbol = { home: 'mdi:home', work: 'mdi:briefcase' }[f.category] || 'mdi:star';
        liste.appendChild(this._trefferKnopf(symbol, f.name, '', weg(f.latlng), () => this._waehle({ name: f.name, latlng: f.latlng })));
      }
    }
    if (zuletzt.length) {
      titel('Zuletzt');
      for (const z of zuletzt) {
        liste.appendChild(this._trefferKnopf('mdi:history', z.name, '', weg(z.latlng), () => this._waehle(z)));
      }
    }
  }

  /** Eigene Position aus Go, damit die Suche Treffer in der Nähe bevorzugt. */
  async _position(basis) {
    try {
      const w = this._kartenFenster();
      const p = w && w.__yapaiaPositionStore && w.__yapaiaPositionStore.getState().position;
      if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return { lat: p.lat, lon: p.lon };
    } catch (err) {
      /* Karte lädt gerade neu */
    }
    try {
      const r = await fetch(`${basis}api/v1/position`, { credentials: 'same-origin' });
      const p = r.ok ? await r.json() : null;
      if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return { lat: p.lat, lon: p.lon };
    } catch (err) {
      /* ohne Position sucht Go eben ohne Vorliebe */
    }
    return null;
  }

  // Abstand in Metern (Haversine), wie `search/distance.ts` in Go.
  static _abstand(a, b) {
    const r = (g) => (g * Math.PI) / 180;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Wie `formatDistance` in Go (`routing/format.ts`).
  static _km(m) {
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  }

  /**
   * Gleiche Suche wie das Suchfeld von Yapaia Go (`apps/web/src/search`):
   * ab 3 Zeichen, 8 Treffer, mit der eigenen Position als Vorliebe und
   * danach nach Entfernung sortiert; Zweitzeile Adresse/Ort wie dort.
   */
  async _suchen(text) {
    const q = text.trim();
    const liste = this.$('treffer');
    if (q.length < 3) {
      this._treffer = [];
      this._trefferFuer = q;
      this._vorschlaege();
      return;
    }
    const basis = this._goBasis();
    if (!basis) {
      this._hinweis('Die Karte von Yapaia Go ist noch nicht geladen.', true);
      return;
    }
    const nr = (this._suchNr = (this._suchNr || 0) + 1);
    try {
      const hier = await this._position(basis);
      const such = new URLSearchParams({ q, limit: '8' });
      if (hier) {
        such.set('lat', String(hier.lat));
        such.set('lon', String(hier.lon));
      }
      const antwort = await fetch(`${basis}api/v1/search?${such}`, { credentials: 'same-origin' });
      const daten = await antwort.json();
      if (nr !== this._suchNr) return; // inzwischen wurde weitergetippt
      let treffer = (Array.isArray(daten.data) ? daten.data : []).filter((t) => t && t.latlng);
      if (hier) {
        treffer = treffer
          .map((t, i) => ({ t, i, m: YapaiaCockpitSportCard._abstand(hier, t.latlng) }))
          .sort((a, b) => a.m - b.m || a.i - b.i)
          .map((x) => ({ ...x.t, _m: x.m }));
      }
      this._treffer = treffer;
      this._trefferFuer = q;
      liste.textContent = '';
      for (const t of treffer) {
        const teile = [t.address, t.locality].filter((x) => typeof x === 'string' && x.trim());
        const zweite = teile.length ? teile.join(', ') : t.label && t.label.trim() !== (t.name || '').trim() ? t.label : '';
        const art = t._m !== undefined ? YapaiaCockpitSportCard._km(t._m) : '';
        liste.appendChild(this._trefferKnopf('mdi:map-marker-outline', t.name || t.label, zweite, art, () => this._waehle(t)));
      }
      this._hinweis(treffer.length ? '' : `Zu „${q}“ hat Yapaia Go nichts gefunden.`, !treffer.length);
    } catch (err) {
      if (nr === this._suchNr) this._hinweis('Die Suche von Yapaia Go antwortet nicht.', true);
    }
  }

  async _zielSetzen(daten, name) {
    this._hinweis(`Route nach ${name} wird berechnet …`);
    try {
      // Mit Rückgabe: Go sagt, was daraus geworden ist (oder warum nicht).
      const r = await this._hass.callService('yapaia', 'go_ziel_setzen', daten, undefined, false, true);
      const antwort = r && r.response ? Object.values(r.response)[0] : null;
      const text = antwort && (antwort.antwort || antwort.meldung || antwort.fehler);
      if (antwort && antwort.ok === false) {
        this._hinweis(text || 'Yapaia Go konnte die Route nicht berechnen.', true);
        return;
      }
      this._hinweis(text || `Navigation nach ${name} gestartet.`);
      setTimeout(() => this._sucheZeigen(false), 1800);
    } catch (err) {
      this._hinweis((err && err.message) || 'Yapaia Go konnte die Route nicht berechnen.', true);
    }
  }

  _gehe(pfad) {
    history.pushState(null, '', pfad);
    window.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
  }

  /** Das Panel eines Add-ons: der Slug trägt die Herkunft davor (`906ac131_yapaia_go`). */
  _app(name) {
    const panels = (this._hass && this._hass.panels) || {};
    const pfad = Object.keys(panels).find((p) => p.endsWith(`_${name}`) || p === name);
    if (pfad) this._gehe(`/${pfad}`);
  }

  async _karteAnlegen(hoehe) {
    if (this._karteWird) return;
    this._karteWird = true;
    await customElements.whenDefined('yapaia-map-card');
    const karte = document.createElement('yapaia-map-card');
    const feld = this.shadowRoot.querySelector('.karte');
    this._kartenHoehe = hoehe;
    karte.setConfig({ height: this._kartenHoehe });
    karte.hass = this._hass;
    feld.appendChild(karte);
    this._karte = karte;
  }

  /** Die Go-Kachel hat eine feste Höhe in Pixeln; bei geändertem Fenster nachziehen. */
  // Ersatz für cqw/cqh/@container, die ältere WebViews nicht kennen (s. STIL).
  _masse() {
    const tv = this.shadowRoot && this.shadowRoot.querySelector('.tv');
    if (!tv || !tv.clientWidth) return;
    tv.style.setProperty('--cw', `${tv.clientWidth / 100}px`);
    tv.style.setProperty('--ch', `${tv.clientHeight / 100}px`);
    tv.classList.toggle('schmal', tv.clientWidth <= 700);
  }

  _kartePassen() {
    if (!this.shadowRoot || !this._hass) return;
    const h = Math.round(this.shadowRoot.querySelector('.karte').clientHeight);
    // Beim ersten Zeichnen hat das Feld noch keine Höhe -- erst anlegen, wenn sie da ist.
    if (h < 120) return;
    if (!this._karte) {
      void this._karteAnlegen(h);
      return;
    }
    if (Math.abs(h - this._kartenHoehe) < 24) return;
    this._diag('hoehe', `Kartenhöhe ${this._kartenHoehe} → ${h} px, Kachel wird neu aufgebaut`);
    this._kartenHoehe = h;
    // Gedrehtes Tablet oder geändertes Fenster: die Kachel baut sich mit der neuen Höhe neu auf.
    this._karte.setConfig({ height: h });
  }

  _zeit() {
    const uhr = this.shadowRoot && this.$('uhr');
    if (uhr) uhr.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (this._hass) this._eta();
  }

  _text(id, wert) {
    const el = this.$(id);
    if (el && el.textContent !== wert) el.textContent = wert;
  }

  // Die Spurleiste unter der Anweisung. Neu gezeichnet nur, wenn sich etwas
  // ändert -- `hass` kommt mehrmals in der Sekunde.
  _spuren(lanes, meter, typ) {
    const feld = this.$('n-spuren');
    if (!feld) return;
    // Ohne Spurdaten an einer Teilung, Auf- oder Ausfahrt: eine vereinfachte
    // Zweierleiste, die Seite, auf die es geht, hell -- wie auf der
    // Navi-Anzeige. Spurdaten gibt es nur, wo OpenStreetMap sie kennt.
    const art = String(typ || '');
    const links = art.includes('left');
    const rechts = art.includes('right');
    if ((!Array.isArray(lanes) || lanes.length === 0) && (links || rechts) &&
        /fork|ramp|exit|stay|keep|slight/.test(art)) {
      const teilung = /fork|stay|keep/.test(art);
      lanes = [
        { directions: links || teilung ? 16 : 2, active: links ? 16 : 0 },
        { directions: rechts || teilung ? 32 : 2, active: rechts ? 32 : 0 },
      ];
    }
    const spuren =
      Array.isArray(lanes) && Number.isFinite(meter) && meter <= SPUREN_AB_M
        ? lanes
            .map((l) => {
              // In der empfohlenen Spur nur DER Pfeil kräftig, der für diese
              // Route gilt (`active`): eine Spur „geradeaus + rechts raus“ zeigte
              // sonst zwei gleich helle Pfeile, und man las zwei Spuren.
              const aktiv = (l && l.active) || 0;
              const pfeile = spurPfeile(l && l.directions);
              const trifft = pfeile.some(([bits]) => aktiv & bits);
              return {
                an: aktiv > 0,
                pfeile: pfeile.map(([bits, icon]) => ({ icon, blass: aktiv > 0 && trifft && !(aktiv & bits) })),
              };
            })
            .filter((l) => l.pfeile.length > 0)
        : [];
    const schluessel = JSON.stringify(spuren);
    if (feld.dataset.spuren === schluessel) return;
    feld.dataset.spuren = schluessel;
    feld.hidden = spuren.length === 0;
    feld.replaceChildren(
      ...spuren.map((spur) => {
        const el = document.createElement('div');
        el.className = spur.an ? 'spur an' : 'spur';
        for (const { icon, blass } of spur.pfeile) {
          const i = document.createElement('ha-icon');
          i.setAttribute('icon', icon);
          if (blass) i.className = 'blass';
          el.appendChild(i);
        }
        return el;
      }),
    );
  }

  // ─── Favoriten-Seiten ──────────────────────────────────────────────────────
  _favSeiten(anzahl, aktiv, vorher = 0) {
    const feld = this.$('favoriten');
    const punkte = this.$('fav-punkte');
    punkte.textContent = '';
    if (anzahl > 1) {
      for (let i = 0; i < anzahl; i++) {
        const p = document.createElement('button');
        p.title = `Seite ${i + 1}`;
        p.addEventListener('click', () => feld.scrollTo({ left: i * feld.clientWidth, behavior: 'smooth' }));
        punkte.appendChild(p);
      }
    }
    const markieren = () => {
      const nr = feld.clientWidth ? Math.round(feld.scrollLeft / feld.clientWidth) : 0;
      [...punkte.children].forEach((p, i) => p.classList.toggle('an', i === nr));
    };
    if (!this._favScroll) {
      this._favScroll = true;
      feld.addEventListener('scroll', () => {
        clearTimeout(this._favTakt);
        this._favTakt = setTimeout(() => this._favMarkieren && this._favMarkieren(), 60);
      }, { passive: true });
    }
    this._favMarkieren = markieren;
    // Zur Seite mit dem laufenden Sender -- nur beim ersten Aufbau, sonst
    // springt die Anzeige zurück, während man blättert.
    if (!this._favGeblaettert) {
      this._favGeblaettert = true;
      requestAnimationFrame(() => {
        feld.scrollLeft = aktiv * feld.clientWidth;
        markieren();
      });
    } else {
      feld.scrollLeft = vorher;
      markieren();
    }
  }

  // ─── Tür und Licht ─────────────────────────────────────────────────────────
  _tuer() {
    return (this._config && this._config.door_entity) || TUER;
  }

  _licht() {
    return (this._config && this._config.light_entity) || LICHT;
  }

  _lichter() {
    const liste = this._config && Array.isArray(this._config.lights) && this._config.lights.length ? this._config.lights : LICHTER;
    return liste.filter((l) => l && l.entity);
  }

  _tuerUmschalten() {
    const st = this._hass && this._hass.states[this._tuer()];
    if (!st) return;
    this._rufe('lock', st.state === 'locked' ? 'unlock' : 'lock', { entity_id: this._tuer() });
  }

  _tuerZeigen() {
    const knopf = this.$('s-tuer');
    const st = this._hass && this._hass.states[this._tuer()];
    knopf.hidden = !st;
    if (!st) return;
    const symbol = { locked: 'mdi:lock', unlocked: 'mdi:lock-open-variant', locking: 'mdi:lock-clock', unlocking: 'mdi:lock-clock', jammed: 'mdi:lock-alert', open: 'mdi:lock-open-variant' }[st.state] || 'mdi:lock-question';
    knopf.setAttribute('icon', symbol);
    knopf.classList.toggle('offen', st.state !== 'locked');
    knopf.title = st.state === 'locked' ? 'Aufbautür ist zu – tippen zum Aufschließen' : 'Aufbautür ist offen – tippen zum Abschließen';
  }

  _lichtZeigen() {
    const st = this._hass && this._hass.states[this._licht()];
    const an = !!st && st.state === 'on';
    const knopf = this.$('l-licht');
    knopf.classList.toggle('licht-an', an);
    knopf.querySelector('ha-icon').setAttribute('icon', an ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline');
    if (this.$('licht-menu').hidden) return;
    const schluessel = JSON.stringify(this._lichter().map((l) => [l.entity, l.name, this._hass.states[l.entity]?.state]));
    if (schluessel === this._lichtSchluessel) return;
    this._lichtSchluessel = schluessel;
    const html = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    this.$('lichter').innerHTML = this._lichter()
      .map((l) => {
        const s = this._hass.states[l.entity];
        const z = s ? s.state : 'unavailable';
        const name = l.name || (s && s.attributes.friendly_name) || l.entity;
        return `<button data-licht="${html(l.entity)}" class="${z === 'on' ? 'an' : LEER.has(z) ? 'weg' : ''}">
          <ha-icon icon="${z === 'on' ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline'}"></ha-icon><span>${html(name)}</span></button>`;
      })
      .join('');
  }

  // Tippen und langes Drücken auf demselben Knopf.
  _langDruecken(knopf, tippen, lang) {
    let takt = null;
    let war = false;
    const ende = () => clearTimeout(takt);
    knopf.addEventListener('pointerdown', () => {
      war = false;
      takt = setTimeout(() => {
        war = true;
        lang();
      }, LANG_DRUECKEN_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => knopf.addEventListener(ev, ende));
    knopf.addEventListener('contextmenu', (e) => e.preventDefault());
    knopf.addEventListener('click', () => {
      if (war) war = false;
      else tippen();
    });
  }

  _zeigen() {
    if (!this.shadowRoot) return;
    const h = this._hass;
    this._anordnen();
    this._tuerZeigen();
    this._lichtZeigen();

    // Radio
    const radio = h.states[E.radio];
    const a = (radio && radio.attributes) || {};
    const spielt = radio && radio.state === 'playing';
    this._text('m-sender', a.station_name || a.media_title || 'Yapaia Beat');
    const titel = this._z(E.titel) || this._z(E.radiotext) || (spielt ? '' : 'Radio aus');
    this._text('m-titel', titel);
    this._text('m-art', [a.band === 'dab' ? 'DAB+' : a.band === 'fm' ? 'UKW' : '', a.program_type || ''].filter(Boolean).join(' · '));
    const logo = this.$('m-logo');
    const bild = a.logo || a.entity_picture || '';
    if (logo.getAttribute('src') !== bild) bild ? logo.setAttribute('src', bild) : logo.removeAttribute('src');
    this.$('m-spiel').firstElementChild.setAttribute('icon', spielt ? 'mdi:stop-circle-outline' : 'mdi:play-outline');
    const laut = h.states[this._lautZiel()];
    const tonAus = !!(laut && laut.attributes && laut.attributes.is_volume_muted);
    this.$('m-stumm').firstElementChild.setAttribute('icon', tonAus ? 'mdi:volume-off' : 'mdi:volume-high');
    this.$('m-stumm').title = tonAus ? 'Ton an' : 'Stumm';

    // Favoriten (wie die Kontakte im Vorbild): runde Senderlogos
    const favoriten = Array.isArray(a.favorites) ? a.favorites : [];
    const schluessel = favoriten.map((f) => `${f.id}|${f.logo}`).join(',') + `#${a.active_favorite || ''}`;
    if (schluessel !== this._favSchluessel) {
      this._favSchluessel = schluessel;
      const feld = this.$('favoriten');
      const vorher = feld.scrollLeft;
      feld.textContent = '';
      let seite = null;
      let aktivSeite = 0;
      favoriten.forEach((f, i) => {
        if (i % 4 === 0) {
          seite = document.createElement('div');
          seite.className = 'fav-seite';
          feld.appendChild(seite);
        }
        if (f.id === a.active_favorite) aktivSeite = Math.floor(i / 4);
        const b = document.createElement('button');
        b.className = `fav${f.id === a.active_favorite ? ' aktiv' : ''}`;
        b.title = f.name;
        if (f.logo) {
          const img = document.createElement('img');
          img.src = f.logo;
          img.alt = '';
          b.appendChild(img);
        } else {
          const ersatz = document.createElement('div');
          ersatz.className = 'ersatz';
          ersatz.textContent = String(f.name || '?').slice(0, 2).toUpperCase();
          b.appendChild(ersatz);
        }
        const name = document.createElement('span');
        name.textContent = `${f.name}${f.band === 'dab' ? ' ·D' : ''}`;
        b.appendChild(name);
        b.addEventListener('click', () => this._rufe('yapaia', 'beat_abspielen', { station_id: f.id }));
        seite.appendChild(b);
      });
      this._favSeiten(feld.children.length, aktivSeite, vorher);
    }

    // Navigation
    const anw = this._z(E.anweisung);
    const meter = Number(this._z(E.entfernung));
    const s = h.states[E.anweisung];
    this.$('n-icon').setAttribute('icon', anw ? (s.attributes && s.attributes.icon) || 'mdi:arrow-up' : 'mdi:navigation-outline');
    this._text(
      'n-weit',
      anw && Number.isFinite(meter) && this._z(E.entfernung) !== null
        ? meter >= 1000
          ? `${(meter / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`
          : `${Math.round(meter / 10) * 10} m`
        : '',
    );
    this._text('n-text', anw || 'Keine Navigation');
    this._spuren(
      anw && s.attributes ? s.attributes.anweisung_spuren : null,
      this._z(E.entfernung) === null ? NaN : meter,
      anw && s.attributes ? s.attributes.anweisung_typ : '',
    );
    this.$('s-nav').setAttribute('icon', anw ? 'mdi:navigation-variant' : 'mdi:navigation-variant-outline');

    // Tempolimit als Schild
    const limit = this._z(E.limit);
    const schild = this.$('schild');
    schild.hidden = limit === null;
    if (limit !== null) this._text('schild', String(Math.round(Number(limit))));
    const zuSchnell = this._z(E.zuSchnell) === 'on';
    schild.classList.toggle('warn', zuSchnell);

    // Leiste
    this._text('l-profil', this._z(E.profil) || 'Yapaia');
    const tempo = this._z(E.tempo);
    const tempoEl = this.$('l-tempo');
    tempoEl.classList.toggle('warn', zuSchnell);
    const tempoText = tempo === null ? '–' : String(Math.round(Number(tempo)));
    if (tempoEl.dataset.w !== tempoText) {
      tempoEl.dataset.w = tempoText;
      tempoEl.innerHTML = `${tempoText}<small>km/h</small>`;
    }
    const hoehe = this._z(E.hoehe);
    const hoeheEl = this.$('l-hoehe');
    const hoeheText = hoehe === null ? '–' : String(Math.round(Number(hoehe)));
    if (hoeheEl.dataset.w !== hoeheText) {
      hoeheEl.dataset.w = hoeheText;
      hoeheEl.innerHTML = `${hoeheText}<small>m ü. NN</small>`;
    }
    const stumm = this._z(E.stumm) === 'on';
    this.$('s-mikro').setAttribute('icon', stumm ? 'mdi:microphone-off' : 'mdi:microphone');
    this._netz();
    const sat = this._z(E.satellit);
    this.$('l-wagen').classList.toggle('hoert', sat === 'listening' || sat === 'processing' || sat === 'responding');

    this._eta();
  }

  // ─── Spracheingabe ─────────────────────────────────────────────────────────
  /** Der Sprachassistent von Home Assistant, sofort zuhörend (wie „Assist“ in der App). */
  _sprechen() {
    this.dispatchEvent(
      new CustomEvent('hass-action', {
        bubbles: true,
        composed: true,
        detail: { config: { tap_action: { action: 'assist', pipeline_id: 'last_used', start_listening: true } }, action: 'tap' },
      }),
    );
  }

  // ─── Netz-Anzeige ──────────────────────────────────────────────────────────
  _netzStand() {
    const h = this._hass;
    const internet = h && h.states[E.internet];
    if (!internet) return null;
    const a = internet.attributes || {};
    return {
      quelle: a.quelle || null,
      wlan: { ssid: a.wlan_ssid, balken: Number(a.wlan_balken) || 0, kanal: a.wlan_kanal, ip: a.wlan_ip,
        gateway: a.wlan_gateway, verbunden: a.wlan_verbunden, bssid: a.wlan_bssid, signal: this._z(E.wlanSignal) },
      balken: Number(this._z(E.balken)) || 0,
      typ: netzKurz(this._z(E.netztyp)),
      sim: this._z(E.aktiveSim),
      roaming: this._z(E.roaming) === 'on',
    };
  }

  _netzSymbol(n) {
    if (n.quelle === 'wlan') return { html: wlanSvg(n.wlan.balken), roaming: false, titel: `WLAN ${n.wlan.ssid || ''}` };
    if (n.quelle === 'mobil') {
      const text = [n.typ, n.sim ? `SIM${n.sim}` : ''].filter(Boolean).join(' ');
      return { html: `${balkenSvg(n.balken)}<span>${text}</span>`, roaming: n.roaming, titel: `Mobilfunk ${text}` };
    }
    if (n.quelle === 'kabel') return { html: '<ha-icon icon="mdi:ethernet"></ha-icon>', roaming: false, titel: 'Kabel' };
    if (n.quelle === 'tethering') return { html: '<ha-icon icon="mdi:cellphone-link"></ha-icon>', roaming: false, titel: 'Tethering' };
    return { html: '<ha-icon icon="mdi:web-off"></ha-icon>', roaming: false, titel: 'Kein Internet', weg: true };
  }

  _netz() {
    const knopf = this.$('netz');
    const n = this._netzStand();
    knopf.hidden = !n;
    if (!n) {
      this.$('netz-info').hidden = true;
      return;
    }
    const sym = this._netzSymbol(n);
    if (knopf.dataset.w !== sym.html) {
      knopf.dataset.w = sym.html;
      knopf.innerHTML = sym.html;
    }
    knopf.classList.toggle('roaming', sym.roaming);
    knopf.classList.toggle('weg', !!sym.weg);
    knopf.title = `${sym.titel} – Details`;
    if (!this.$('netz-info').hidden) this._netzInfo();
  }

  /** Das Fenster unter der Anzeige: WLAN- oder Mobilfunkwerte, live. */
  _netzInfo() {
    const box = this.$('netz-info');
    const n = this._netzStand();
    if (box.hidden || !n) return;
    const esc = (v) => String(v ?? '–').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const zeile = (k, v, cls = '') => (v === null || v === undefined || v === '' ? '' : `<dt>${k}</dt><dd class="${cls}">${esc(v)}</dd>`);
    const sym = this._netzSymbol(n);
    let html = `<div class="kopf"><span class="netz ${sym.roaming ? 'roaming' : ''}">${sym.html}</span>
      <span style="flex:1">${n.quelle === 'wlan' ? 'WLAN' : n.quelle === 'mobil' ? 'Mobilfunk' : esc(sym.titel)}</span>
      <button class="zu" data-zu title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div><dl>`;
    if (n.quelle === 'wlan') {
      const w = n.wlan;
      html += zeile('Netz', w.ssid) + zeile('Signal', w.signal !== null ? `${Math.round(Number(w.signal))} dBm` : null)
        + zeile('Kanal', w.kanal) + zeile('Verbunden seit', w.verbunden) + zeile('IP', w.ip) + zeile('Gateway', w.gateway)
        + zeile('BSSID', w.bssid);
    } else {
      const land = this._z(E.land);
      html += zeile('Anbieter', this._z(E.anbieter)) + zeile('Netz', [this._z(E.netztyp), this._z(E.baender)].filter(Boolean).join(' · '))
        + zeile('Aktive SIM', n.sim ? `SIM ${n.sim}` : null)
        + zeile('Land', land ? `${land}${n.roaming ? ' · Roaming' : ''}` : null, n.roaming ? 'rot' : '')
        + zeile('RSRP', this._z(E.rsrp) !== null ? `${this._z(E.rsrp)} dBm` : null)
        + zeile('RSRQ', this._z(E.rsrq) !== null ? `${this._z(E.rsrq)} dB` : null)
        + zeile('SINR', this._z(E.sinr) !== null ? `${this._z(E.sinr)} dB` : null);
    }
    html += '</dl>';
    if (n.quelle === 'mobil' && this._hass.states[E.sim]) {
      const gewaehlt = this._z(E.sim);
      const stand = this._z(E.umschaltung) || '';
      const laeuft = /^umschalten|läuft|wechsel/i.test(stand);
      html += `<div class="sims">${['SIM 1', 'SIM 2'].map((o) => `<button data-sim="${o}" class="${gewaehlt === o ? 'an' : ''}"
        ${gewaehlt === o || laeuft ? 'disabled' : ''}>${o}</button>`).join('')}</div>`;
      if (stand) html += `<div class="stand">Umschaltung: ${esc(stand)}</div>`;
    }
    if (box.dataset.w === html) return;
    box.dataset.w = html;
    box.innerHTML = html;
    box.querySelector('[data-zu]').addEventListener('click', () => (box.hidden = true));
    box.querySelectorAll('[data-sim]').forEach((b) =>
      b.addEventListener('click', () => {
        b.disabled = true;
        this._rufe('select', 'select_option', { entity_id: E.sim, option: b.dataset.sim });
      }),
    );
  }

  // ─── Sonderziele in der Nähe ───────────────────────────────────────────────
  // Wie „Unterwegs finden“ in Yapaia Go: Kategorie → die nächsten (voraus auf
  // der Route, sonst im Umkreis) → ein Klick zeigt den Ort auf der Karte, die
  // anderen daneben → der zweite Klick fügt ihn als Zwischenziel ein (ohne
  // Navigation: wird er das Ziel).
  _orteHinweis(text, fehler = false) {
    const el = this.$('orte-hinweis');
    el.textContent = text;
    el.classList.toggle('fehler', fehler);
  }

  _orteKarte(treffer, aktiv) {
    const w = this._kartenFenster();
    const api = w && w.__yapaiaEinbettung;
    if (!api || !(api.version >= 3)) return false;
    api.orte(treffer.map((t) => ({ lat: t.lat, lon: t.lon, name: t.name })), aktiv, (i) => this._orteWahl(i));
    this._orteAufKarte = treffer.length > 0;
    return true;
  }

  async _orteOeffnen() {
    this.$('suche').hidden = true;
    this.$('orte').hidden = false;
    this.shadowRoot.querySelector('.tv').classList.add('orte-offen');
    this._orte = null;
    this.$('orte-liste').textContent = '';
    const basis = this._goBasis();
    if (!basis) return this._orteHinweis('Die Karte von Yapaia Go ist noch nicht geladen.', true);
    if (!this._kategorien) {
      try {
        const r = await fetch(`${basis}api/v1/unterwegs/kategorien`, { credentials: 'same-origin' });
        this._kategorien = ((await r.json()).data || []).filter((k) => k && k.id);
      } catch (err) {
        return this._orteHinweis('Yapaia Go antwortet nicht.', true);
      }
    }
    const kat = this.$('orte-kat');
    kat.textContent = '';
    for (const k of this._kategorien) {
      const b = document.createElement('button');
      b.dataset.id = k.id;
      b.textContent = `${k.symbol || ''} ${k.name}`.trim();
      b.addEventListener('click', () => this._orteKategorie(k));
      kat.appendChild(b);
    }
    this._orteHinweis('Kategorie wählen.');
  }

  /** Schmale Leiste mit dem gewählten Ort, damit die Karte frei bleibt (wie die Vorschau in Go). */
  _orteVorschau(an) {
    const o = this._orte;
    this.$('orte').classList.toggle('vorschau', !!an && !!o && o.aktiv !== null);
    if (!an || !o || o.aktiv === null) return;
    const t = o.treffer[o.aktiv];
    const km = YapaiaCockpitSportCard._km;
    this.$('ov-name').textContent = `${o.aktiv + 1}/${o.treffer.length} · ${t.name}`;
    // kurz: in der Leiste ist neben dem Preis wenig Platz (Abstand zur Route steht in der Liste)
    this.$('ov-weit').textContent = t.voraus_m !== null && t.voraus_m !== undefined ? `in ${km(t.voraus_m)}` : km(t.abseits_m);
    this.$('ov-los').textContent = FAHRT.has(this._z(E.zustand) || '') ? '+ Zwischenziel' : 'Hinfahren';
    this._preisMarke(this.$('ov-preis'), t.preis);
  }

  /** Preis-Pille füllen (oder verstecken). */
  _preisMarke(el, preis) {
    el.hidden = !preis;
    if (!preis) return;
    el.className = `preis ${preis.frische}`;
    el.textContent = `${preis.text} €`;
    el.title = `${FRISCHE_TEXT[preis.frische]} (Tankerkönig)`;
  }

  /** Spritpreise zu den Tankstellen der Liste; ohne Tankerkönig einfach keine. */
  async _spritpreise(basis, orte) {
    try {
      if (this._sorte === undefined) {
        const r = await fetch(`${basis}api/v1/profiles`, { credentials: 'same-origin' });
        const d = await r.json();
        const liste = Array.isArray(d) ? d : d.data || [];
        const aktiv = liste.find((p) => p.is_active || p.active) || null;
        this._sorte = aktiv ? aktiv.fuel_type || null : null;
      }
      const sorte = this._sorte;
      const abfragen = new Map();
      const gegend = (t) => `${Math.round(t.lat * 20) / 20},${Math.round(t.lon * 20) / 20}`;
      for (const t of orte.treffer.slice(0, 12)) {
        const g = gegend(t);
        if (!abfragen.has(g)) {
          abfragen.set(g, fetch(`${basis}api/v1/tanken/preise?lat=${t.lat}&lon=${t.lon}&rad=6`, { credentials: 'same-origin' })
            .then((r) => (r.ok ? r.json() : null)).then((d) => (d && d.data) || null).catch(() => null));
        }
      }
      for (const t of orte.treffer.slice(0, 12)) {
        const daten = await abfragen.get(gegend(t));
        if (!daten || !Array.isArray(daten.stationen)) continue;
        let beste = null;
        let besteM = PREIS_MAX_M;
        for (const st of daten.stationen) {
          const m = YapaiaCockpitSportCard._abstand(t, st);
          if (m <= besteM) [beste, besteM] = [st, m];
        }
        if (!beste) continue;
        const angaben = sorte === 'diesel' ? [['Diesel', beste.diesel]]
          : sorte === 'benzin' ? [['E5', beste.e5], ['E10', beste.e10]]
          : [];
        const text = angaben.filter(([, e]) => Number.isFinite(e)).map(([n, e]) => `${n} ${preisText(e)}`).join(' · ');
        if (text) t.preis = { text, frische: preisFrische(daten.abgerufen, beste.offen) };
      }
      if (this._orte !== orte) return; // inzwischen andere Kategorie
      this._orteListe();
      if (orte.aktiv !== null) this._orteVorschau(this.$('orte').classList.contains('vorschau'));
    } catch (err) {
      /* ohne Tankerkönig keine Preise */
    }
  }

  _orteSchliessen() {
    this.$('orte').hidden = true;
    this.shadowRoot.querySelector('.tv').classList.remove('orte-offen');
    this.$('orte').classList.remove('vorschau');
    this._orte = null;
    if (this._orteAufKarte) this._orteKarte([], null);
  }

  async _orteKategorie(k) {
    this.$('orte-kat').querySelectorAll('button').forEach((b) => b.classList.toggle('an', b.dataset.id === k.id));
    this.$('orte-liste').textContent = '';
    this._orteHinweis(`Suche ${k.name} …`);
    const basis = this._goBasis();
    const nr = (this._orteNr = (this._orteNr || 0) + 1);
    try {
      const r = await fetch(`${basis}api/v1/unterwegs?kategorie=${encodeURIComponent(k.id)}&anzahl=8`, { credentials: 'same-origin' });
      const daten = (await r.json()).data || {};
      if (nr !== this._orteNr || this.$('orte').hidden) return;
      const treffer = (daten.treffer || []).filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lon));
      this._orte = { kategorie: k, treffer, aktiv: null, bezug: daten.bezug };
      this._orteVorschau(false);
      this._orteListe();
      if (!treffer.length) {
        this._orteHinweis(`Keine ${k.name} ${daten.bezug === 'route' ? 'voraus auf der Route' : 'in der Nähe'} gefunden.`);
        this._orteKarte([], null);
        return;
      }
      this._orteKarte(treffer, null);
      this._orteHinweis(`${daten.bezug === 'route' ? 'Voraus auf der Route' : 'Im Umkreis'} · antippen zeigt den Ort auf der Karte.`);
      if (k.id === 'fuel') this._spritpreise(basis, this._orte);
    } catch (err) {
      this._orteHinweis('Die Suche hat nicht geklappt.', true);
    }
  }

  _orteListe() {
    const o = this._orte;
    const liste = this.$('orte-liste');
    liste.textContent = '';
    if (!o) return;
    const km = YapaiaCockpitSportCard._km;
    const faehrt = FAHRT.has(this._z(E.zustand) || '');
    o.treffer.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = o.aktiv === i ? 'an' : '';
      const text = document.createElement('span');
      text.className = 'text';
      const name = document.createElement('span');
      name.textContent = t.name;
      const zeile2 = document.createElement('span');
      zeile2.className = 'zeile2';
      zeile2.textContent = t.voraus_m !== null && t.voraus_m !== undefined
        ? `in ${km(t.voraus_m)} · ${km(t.abseits_m)} abseits` : km(t.abseits_m);
      text.append(name, zeile2);
      b.appendChild(text);
      if (t.preis) {
        const pr = document.createElement('span');
        this._preisMarke(pr, t.preis);
        b.appendChild(pr);
      }
      if (o.aktiv === i) {
        const los = document.createElement('span');
        los.className = 'los';
        los.textContent = faehrt ? '+ Zwischenziel' : 'Hinfahren';
        b.appendChild(los);
      }
      b.addEventListener('click', () => this._orteWahl(i));
      liste.appendChild(b);
    });
  }

  _orteWahl(i) {
    const o = this._orte;
    if (!o || !o.treffer[i]) return;
    if (o.aktiv === i) {
      this._orteEinfuegen(o.treffer[i]);
      return;
    }
    o.aktiv = i;
    this._orteListe();
    const gezeigt = this._orteKarte(o.treffer, i);
    const faehrt = FAHRT.has(this._z(E.zustand) || '');
    // Mit Karte: die schmale Leiste, damit der markierte Ort sichtbar ist
    this._orteVorschau(gezeigt);
    this._orteHinweis(gezeigt ? '' : `Nochmal antippen: ${faehrt ? 'als Zwischenziel einfügen' : 'hinfahren'}.`);
  }

  async _orteEinfuegen(t) {
    this._orteHinweis(`${t.name} wird eingefügt …`);
    try {
      const r = await this._hass.callService('yapaia', 'go_zwischenziel_einfuegen',
        { ort: { latitude: t.lat, longitude: t.lon }, name: t.name }, undefined, false, true);
      const antwort = r && r.response ? Object.values(r.response)[0] : null;
      this._orteSchliessen();
      this._hinweisKurz(antwort && antwort.als === 'ziel' ? `Ziel: ${t.name}` : `Zwischenziel: ${t.name}`);
    } catch (err) {
      this._orteHinweis((err && err.message) || 'Einfügen hat nicht geklappt (Yapaia Go ab 0.50.0 nötig).', true);
    }
  }

  /** Kurze Bestätigung unten in der Mitte (nutzt die Lautstärke-Anzeige). */
  _hinweisKurz(text) {
    const el = this.$('l-laut');
    el.textContent = text;
    el.classList.add('sichtbar');
    clearTimeout(this._lautTakt);
    this._lautTakt = setTimeout(() => el.classList.remove('sichtbar'), 4000);
  }

  _eta() {
    const an = this._z(E.ankunft);
    const rest = this._z(E.restweg);
    const eta = this.$('eta');
    eta.hidden = an === null && rest === null;
    if (eta.hidden) return;
    const t = an ? new Date(an) : null;
    const gueltig = t && !Number.isNaN(t.getTime());
    const min = gueltig ? Math.max(0, Math.round((t.getTime() - Date.now()) / 60000)) : null;
    this._text('e-dauer', min === null ? '–' : min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`);
    this._text('e-km', rest === null ? '–' : `${Number(rest).toLocaleString('de-DE', { maximumFractionDigits: Number(rest) < 10 ? 1 : 0 })} km`);
    this._text('e-uhr', gueltig ? t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '');
    this._text('e-zustand', this._z(E.zustand) === 'paused' ? 'pausiert' : '');
    this._halte();
  }

  /**
   * Die offenen Halte -- Zwischenziele, dann das Ziel -- mit Ankunft und km.
   * Kommt als Attribut `halte` am Ziel-Sensor (ab Yapaia Go 0.52.0). Ältere
   * Fassungen kennen nur das Ziel; das steht dann allein da.
   */
  _halte() {
    const box = this.$('halte');
    if (!box || box.hidden || !this._hass) return;
    const s = this._hass.states[E.ziel];
    const roh = s && s.attributes && Array.isArray(s.attributes.halte) ? s.attributes.halte : null;
    const ziel = this._z(E.ziel);
    const halte = roh && roh.length
      ? roh
      : ziel || this._z(E.ankunft)
        ? [{ name: ziel, art: 'ziel', km: this._z(E.restweg), ankunft: this._z(E.ankunft) }]
        : [];
    const uhr = (iso) => {
      const t = iso ? new Date(iso) : null;
      return t && !Number.isNaN(t.getTime()) ? t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
    };
    const km = (k) => (k === null || k === undefined || k === '' || !Number.isFinite(Number(k))
      ? '–'
      : `${Number(k).toLocaleString('de-DE', { maximumFractionDigits: Number(k) < 10 ? 1 : 0 })} km`);
    const liste = this.$('halte-liste');
    liste.replaceChildren(...halte.map((h, i) => {
      const li = document.createElement('li');
      if (h.art === 'ziel') li.className = 'ziel';
      const icon = document.createElement('ha-icon');
      icon.setAttribute('icon', h.art === 'ziel' ? 'mdi:flag-checkered' : 'mdi:map-marker-outline');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = h.name || (h.art === 'ziel' ? 'Ziel' : `Zwischenziel ${i + 1}`);
      const k = document.createElement('span');
      k.className = 'km';
      k.textContent = km(h.km);
      const u = document.createElement('span');
      u.className = 'uhr';
      u.textContent = uhr(h.ankunft);
      li.append(icon, name, k, u);
      return li;
    }));
    const hinweis = this.$('halte-hinweis');
    hinweis.hidden = halte.length > 0 && roh !== null;
    hinweis.textContent = halte.length === 0
      ? 'Keine Navigation aktiv.'
      : 'Zwischenziele zeigt Yapaia Go ab Version 0.52.0.';
  }
}

if (!customElements.get('yapaia-cockpit-sport-card')) {
  customElements.define('yapaia-cockpit-sport-card', YapaiaCockpitSportCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'yapaia-cockpit-sport-card',
    name: 'Yapaia Cockpit Sport',
    description: 'Karte von Yapaia Go bildschirmfüllend mit Radio, Favoriten, Anweisung und Ankunft im Stil eines Auto-Infotainments.',
  });
}
