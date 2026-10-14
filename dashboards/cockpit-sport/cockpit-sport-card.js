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
  pause: 'button.yapaia_go_pausieren',
  weiter: 'button.yapaia_go_fortsetzen',
  beenden: 'button.yapaia_go_beenden',
  zustand: 'sensor.yapaia_go_zustand',
  radio: 'media_player.yapaia_beat',
  titel: 'sensor.yapaia_beat_now_playing',
  radiotext: 'sensor.yapaia_beat_radiotext',
  stumm: 'switch.yapaia_satellite_mikrofon_stumm',
  satellit: 'assist_satellite.yapaia_satellite_assist_satellit',
};
const LEER = new Set(['unknown', 'unavailable', 'none', '', undefined, null]);

// ─── ANORDNUNG ───────────────────────────────────────────────────────────────
// Jedes Objekt lässt sich verschieben und vergrößern, getrennt für Ruhe und
// Navigation -- unabhängig von Yapaia Go selbst. Gespeichert je Gerät (wie in
// Go): ein Tablet im Fahrzeug und ein Telefon in der Hand brauchen Verschiedenes.
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
const FAHRT = new Set(['navigating', 'off_route', 'paused']);
const MASSSTAB_MIN = 0.5;
const MASSSTAB_MAX = 2;

function anordnungLesen() {
  const leer = { ruhe: {}, fahrt: {} };
  try {
    const w = JSON.parse(localStorage.getItem(ANORDNUNG) || 'null');
    if (!w || typeof w !== 'object') return leer;
    const pruefe = (m) => {
      const raus = {};
      for (const [id, p] of Object.entries((w && w[m]) || {})) {
        if (p && [p.dx, p.dy, p.s].every(Number.isFinite)) raus[id] = { dx: p.dx, dy: p.dy, s: p.s };
      }
      return raus;
    };
    return { ruhe: pruefe('ruhe'), fahrt: pruefe('fahrt') };
  } catch (err) {
    return leer;
  }
}

const STIL = `
  :host { display: block; height: 100%; }
  [hidden] { display: none !important; }
  .tv {
    position: relative; overflow: hidden; container-type: inline-size;
    height: var(--cockpit-hoehe, calc(100vh - var(--header-height, 56px)));
    min-height: 420px; background: #0a0d14; color: #f2f3f5;
    font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --kupfer: #c9895b; --dunkel: rgba(22, 24, 30, 0.92);
    --u: clamp(9px, 1.25cqw, 17px);
  }
  .karte { position: absolute; inset: calc(var(--u) * 4.4) 0 calc(var(--u) * 5.6) 0; }
  yapaia-map-card { display: block; height: 100%;
    --ha-card-border-radius: 0; --ha-card-border-width: 0; --ha-card-box-shadow: none; }
  .oben, .leiste { position: absolute; left: 0; right: 0; display: flex; align-items: center; z-index: 3; }
  .oben { top: 0; height: calc(var(--u) * 4.4); padding: 0 calc(var(--u) * 1.4); gap: calc(var(--u) * 0.9);
    background: linear-gradient(#0a0d14, #10141d); }
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

  .kachel { position: absolute; left: calc(var(--u) * 1.6); z-index: 2; width: clamp(230px, 31cqw, 460px);
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
  .favoriten { display: flex; gap: calc(var(--u) * 0.5); }
  .fav { background: none; border: 0; color: #fff; cursor: pointer; padding: 0; width: calc(var(--u) * 5.1);
    font-size: calc(var(--u) * 1); text-align: center; }
  .fav img, .fav .ersatz { width: calc(var(--u) * 4.4); height: calc(var(--u) * 4.4); border-radius: 50%;
    object-fit: cover; background: #fff; display: grid; place-items: center; margin: 0 auto calc(var(--u) * 0.4);
    color: #14703d; font-weight: 700; font-size: calc(var(--u) * 1.5); border: 2px solid transparent; box-sizing: border-box; }
  .fav.aktiv img, .fav.aktiv .ersatz { border-color: #fff; box-shadow: 0 0 0 2px var(--kupfer); }
  .fav span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .nav { position: absolute; z-index: 2; top: calc(var(--u) * 5.6); right: calc(var(--u) * 5.6);
    width: clamp(260px, 36cqw, 560px); background: var(--dunkel); border-radius: calc(var(--u) * 0.5);
    padding: calc(var(--u) * 0.9) calc(var(--u) * 1.3); box-shadow: 0 calc(var(--u) * 0.4) calc(var(--u) * 1) rgba(0, 0, 0, 0.4); }
  .nav .zeile { display: flex; align-items: center; gap: calc(var(--u) * 1); --mdc-icon-size: calc(var(--u) * 2.6); }
  .nav .weit { font-size: calc(var(--u) * 1.9); font-weight: 600; white-space: nowrap; }
  .nav .text { font-size: calc(var(--u) * 1.55); min-width: 0; overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .nav .ziel { margin-top: calc(var(--u) * 0.6); padding-top: calc(var(--u) * 0.6); border-top: 1px solid rgba(255, 255, 255, 0.18);
    font-size: calc(var(--u) * 1.2); opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kompass { position: absolute; z-index: 2; top: calc(var(--u) * 5.6); right: calc(var(--u) * 1.4); }
  .schild { position: absolute; z-index: 2; top: calc(var(--u) * 12.6); right: calc(var(--u) * 1.4);
    width: calc(var(--u) * 4.6); height: calc(var(--u) * 4.6); border-radius: 50%; background: #fff; color: #111;
    border: calc(var(--u) * 0.55) solid #d5231e; box-sizing: border-box; display: grid; place-items: center;
    font-size: calc(var(--u) * 1.75); font-weight: 700; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); }
  .schild.warn { animation: puls 0.8s ease-in-out infinite alternate; }
  @keyframes puls { to { transform: scale(1.12); box-shadow: 0 0 0 calc(var(--u) * 0.6) rgba(213, 35, 30, 0.45); } }

  .eta { position: absolute; z-index: 2; left: 50%; transform: translateX(-10%); bottom: calc(var(--u) * 7);
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
    background: linear-gradient(#10141d, #07090e); border-top: 1px solid #232937; }
  .auto { color: var(--kupfer); font-size: calc(var(--u) * 1.25); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    max-width: 18cqw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
    min-width: 3.2em; text-align: center; color: var(--kupfer); }
  .laut.sichtbar { opacity: 1; }
  .kompass ha-icon { transition: transform 0.4s; }
  .kompass .knopf.kurs { background: var(--kupfer); color: #14161b; }
  .kompass .knopf.frei { background: #fff; color: #1565c0; }
  .kompass .knopf.frei ha-icon { transform: none !important; }

  .suche { position: absolute; z-index: 5; left: 50%; transform: translateX(-50%); top: calc(var(--u) * 6.2);
    width: clamp(300px, 46cqw, 640px); background: var(--dunkel); border-radius: calc(var(--u) * 0.7);
    box-shadow: 0 calc(var(--u) * 0.8) calc(var(--u) * 2.4) rgba(0, 0, 0, 0.55); padding: calc(var(--u) * 1);
    border-top: 2px solid var(--kupfer); }
  .suche .feld { display: flex; align-items: center; gap: calc(var(--u) * 0.8); --mdc-icon-size: calc(var(--u) * 1.9); }
  .suche input { flex: 1; min-width: 0; background: #0c0f16; color: #fff; border: 1px solid #343b4b;
    border-radius: calc(var(--u) * 0.5); padding: calc(var(--u) * 0.8) calc(var(--u) * 1); font-size: calc(var(--u) * 1.6); outline: none; }
  .suche input:focus { border-color: var(--kupfer); }
  .suche .zu { background: none; border: 0; color: #fff; cursor: pointer; padding: 0; }
  .treffer { margin-top: calc(var(--u) * 0.6); max-height: 46cqh; overflow-y: auto; }
  .treffer button { display: flex; align-items: center; gap: calc(var(--u) * 0.9); width: 100%; text-align: left; background: none;
    border: 0; border-top: 1px solid rgba(255, 255, 255, 0.1); color: #fff; cursor: pointer;
    padding: calc(var(--u) * 0.8) calc(var(--u) * 0.3); font-size: calc(var(--u) * 1.4); --mdc-icon-size: calc(var(--u) * 1.6); }
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
  .bearbeiten .schild[hidden], .bearbeiten .eta[hidden] { display: flex !important; }

  @container (max-width: 700px) { .gruen, .lupe { display: none; } .nav { right: calc(var(--u) * 1.4); top: calc(var(--u) * 19); }
    .kompass { display: none; } .eta { transform: translateX(-50%); } }
`;

const HTML = `
  <div class="tv">
    <div class="karte"></div>
    <div class="oben">
      <button class="knopf rund" data-nav="/yapaia-cockpit/cockpit" title="Cockpit"><ha-icon icon="mdi:view-dashboard"></ha-icon></button>
      <button class="knopf rund" data-nav="/lovelace" title="Übersicht"><ha-icon icon="mdi:apps"></ha-icon></button>
      <button class="knopf kupfer" data-app="yapaia_go" title="Yapaia Go"><ha-icon icon="mdi:rv-truck"></ha-icon></button>
      <button class="knopf tuerkis" data-app="yapaia_beat" title="Yapaia Beat"><ha-icon icon="mdi:radio"></ha-icon></button>
      <button class="knopf rahmen" data-nav="/config/dashboard" title="Einstellungen"><ha-icon icon="mdi:plus"></ha-icon></button>
      <button class="knopf rund" id="anpassen" title="Dashboard anpassen"><ha-icon icon="mdi:arrow-expand-all"></ha-icon></button>
      <div class="mitte"><div class="griff"></div></div>
      <div class="status">
        <ha-icon id="s-mikro" icon="mdi:microphone"></ha-icon>
        <ha-icon id="s-nav" icon="mdi:navigation-variant-outline"></ha-icon>
        <ha-icon icon="mdi:wifi"></ha-icon>
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
      <div class="label">Favoriten</div>
      <div class="favoriten" id="favoriten"></div>
    </div></div>

    <div class="nav">
      <div class="zeile"><ha-icon id="n-icon" icon="mdi:navigation-outline"></ha-icon><span class="weit" id="n-weit"></span><span class="text" id="n-text"></span></div>
      <div class="ziel" id="n-ziel"></div>
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
    <div class="eta" id="eta" hidden>
      <ha-icon icon="mdi:flag-checkered"></ha-icon>
      <div class="raster"><b id="e-dauer"></b><b id="e-km"></b><span id="e-uhr"></span><span id="e-zustand"></span></div>
      <button id="e-ende" title="Navigation beenden"><ha-icon icon="mdi:close"></ha-icon></button>
    </div>

    <div class="leiste">
      <span class="auto" id="l-profil"></span>
      <span class="wert" id="l-tempo"></span>
      <div class="symbole">
        <button id="l-mikro" title="Mikrofon stumm"><ha-icon icon="mdi:microphone-outline"></ha-icon></button>
        <button id="l-pause" title="Navigation pausieren / fortsetzen"><ha-icon icon="mdi:pause-circle-outline"></ha-icon></button>
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

  setConfig(config) {
    this._config = config || {};
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
    this._beobachter = new ResizeObserver(() => this._kartePassen());
    const feld = this.shadowRoot && this.shadowRoot.querySelector('.karte');
    if (feld) this._beobachter.observe(feld);
    this._zeit();
  }

  disconnectedCallback() {
    clearInterval(this._uhr);
    clearInterval(this._nadel);
    if (this._beobachter) this._beobachter.disconnect();
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
        [E.anweisung]: ['Rechts abbiegen auf Speyerer Straße', { icon: 'mdi:arrow-right-top' }],
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
    this.$('l-pause').addEventListener('click', () => {
      const pausiert = this._z(E.zustand) === 'paused';
      this._rufe('button', 'press', { entity_id: pausiert ? E.weiter : E.pause });
    });
    this.$('l-mikro').addEventListener('click', () => this._rufe('switch', 'toggle', { entity_id: E.stumm }));
    this.$('m-stumm').addEventListener('click', () => this._stumm());
    this.$('anpassen').addEventListener('click', () => this._anpassen(this._bearbeiten ? null : this._modus()));
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

  _anordnen() {
    if (!this._werte) this._werte = anordnungLesen();
    const werte = this._werte[this._modus()] || {};
    for (const [id, sel] of OBJEKTE) {
      const el = this.shadowRoot.querySelector(sel);
      if (!el) continue;
      const p = werte[id];
      const an = p && (p.dx || p.dy || p.s !== 1);
      el.style.translate = an ? `${p.dx}px ${p.dy}px` : '';
      el.style.scale = an ? String(p.s) : '';
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
    const runter = (art) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = (this._werte[this._bearbeiten] || {})[id] || { dx: 0, dy: 0, s: 1 };
      start = { x: e.clientX, y: e.clientY, p: { ...p }, art };
    };
    const bewegen = (e) => {
      if (!start) return;
      e.preventDefault();
      e.stopPropagation();
      const ddx = e.clientX - start.x;
      const ddy = e.clientY - start.y;
      const p = start.p;
      const neu =
        start.art === 'ziehen'
          ? { ...p, dx: Math.round(p.dx + ddx), dy: Math.round(p.dy + ddy) }
          : { ...p, s: Math.round(Math.min(MASSSTAB_MAX, Math.max(MASSSTAB_MIN, p.s + (ddx + ddy) / 400)) * 100) / 100 };
      this._werte[this._bearbeiten] = { ...this._werte[this._bearbeiten], [id]: neu };
      this._anordnen();
    };
    const hoch = (e) => {
      if (!start) return;
      e.stopPropagation();
      start = null;
      this._speichern();
    };
    for (const [ziel, art] of [[rahmen, 'ziehen'], [rahmen.lastElementChild, 'groesse']]) {
      ziel.addEventListener('pointerdown', runter(art));
      ziel.addEventListener('pointermove', bewegen);
      ziel.addEventListener('pointerup', hoch);
      ziel.addEventListener('pointercancel', hoch);
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
    this._zielSetzen({ ort: { latitude: t.latlng.lat, longitude: t.latlng.lon }, name }, name);
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
      liste.textContent = '';
      this._treffer = [];
      this._trefferFuer = q;
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
        const b = document.createElement('button');
        const icon = document.createElement('ha-icon');
        icon.setAttribute('icon', 'mdi:map-marker-outline');
        const text = document.createElement('span');
        text.className = 'text';
        const name = document.createElement('span');
        name.textContent = t.name || t.label;
        text.append(name);
        const teile = [t.address, t.locality].filter((x) => typeof x === 'string' && x.trim());
        const zweite = teile.length ? teile.join(', ') : t.label && t.label.trim() !== (t.name || '').trim() ? t.label : '';
        if (zweite) {
          const z = document.createElement('span');
          z.className = 'zeile2';
          z.textContent = zweite;
          text.append(z);
        }
        const art = document.createElement('span');
        art.className = 'art';
        art.textContent = t._m !== undefined ? YapaiaCockpitSportCard._km(t._m) : '';
        b.append(icon, text, art);
        b.addEventListener('click', () => this._waehle(t));
        liste.appendChild(b);
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

  _zeigen() {
    if (!this.shadowRoot) return;
    const h = this._hass;
    this._anordnen();

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
    const favoriten = Array.isArray(a.favorites) ? a.favorites.slice(0, 4) : [];
    const schluessel = favoriten.map((f) => `${f.id}|${f.logo}`).join(',') + `#${a.active_favorite || ''}`;
    if (schluessel !== this._favSchluessel) {
      this._favSchluessel = schluessel;
      const feld = this.$('favoriten');
      feld.textContent = '';
      for (const f of favoriten) {
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
        feld.appendChild(b);
      }
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
    const ziel = this._z(E.ziel);
    this._text('n-ziel', ziel ? `Ziel: ${ziel}` : 'Ziel ansagen: „Okay Nabu – fahre mich nach …“');
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
    this.$('l-mikro').classList.toggle('an', stumm);
    this.$('l-mikro').firstElementChild.setAttribute('icon', stumm ? 'mdi:microphone-off' : 'mdi:microphone-outline');
    this.$('s-mikro').setAttribute('icon', stumm ? 'mdi:microphone-off' : 'mdi:microphone');
    const pausiert = this._z(E.zustand) === 'paused';
    this.$('l-pause').firstElementChild.setAttribute('icon', pausiert ? 'mdi:play-circle-outline' : 'mdi:pause-circle-outline');
    const sat = this._z(E.satellit);
    this.$('l-wagen').classList.toggle('hoert', sat === 'listening' || sat === 'processing' || sat === 'responding');

    this._eta();
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
