/**
 * Nivellierung – zeigt, wie schief das Wohnmobil steht: von der Seite (vorne/
 * hinten) und von hinten (links/rechts), dazu eine Libelle und wie viele
 * Millimeter man an welcher Seite unterlegen muss.
 *
 * Einbinden (Ressource, Typ JavaScript-Modul):
 *   /local/yapaia-dashboards/nivellierung-card.js
 *
 * Im Dashboard:
 *   type: custom:yapaia-nivellierung-card
 * Alles Weitere lässt sich im grafischen Editor einstellen (Sensoren,
 * Vorzeichen, Radstand, Spurweite, Toleranz).
 *
 * Vorzeichen: Positiv heißt hier „vorne höher“ bzw. „rechts höher“. Zeigt die
 * Anzeige verkehrt herum, im Editor „umkehren“ anhaken.
 */

const STANDARD = {
  name: "Nivellierung",
  pitch_entity: "sensor.heizung_neigung_vorne_hinten",
  roll_entity: "sensor.heizung_neigung_links_rechts",
  pitch_mm_entity: "",
  roll_mm_entity: "",
  invert_pitch: false,
  invert_roll: false,
  wheelbase: 3800,
  track: 2300,
  tolerance: 0.5,
  exaggeration: 4,
};

const FARBE = { ok: "#2e9d4f", fast: "#e69500", schief: "#d93a2b", aus: "#8a8f98" };

const zahl = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

class YapaiaNivellierungCard extends HTMLElement {
  static getStubConfig() {
    return { ...STANDARD };
  }

  static getConfigForm() {
    const sensor = { entity: { domain: "sensor" } };
    return {
      schema: [
        { name: "name", selector: { text: {} } },
        {
          type: "expandable",
          flatten: true,
          name: "",
          title: "Sensoren",
          expanded: true,
          schema: [
            { name: "pitch_entity", required: true, selector: sensor },
            { name: "roll_entity", required: true, selector: sensor },
            { name: "pitch_mm_entity", selector: sensor },
            { name: "roll_mm_entity", selector: sensor },
          ],
        },
        {
          type: "expandable",
          flatten: true,
          name: "",
          title: "Fahrzeug und Anzeige",
          schema: [
            {
              type: "grid",
              name: "",
              schema: [
                { name: "invert_pitch", selector: { boolean: {} } },
                { name: "invert_roll", selector: { boolean: {} } },
                { name: "wheelbase", selector: { number: { min: 1000, max: 8000, step: 10, mode: "box", unit_of_measurement: "mm" } } },
                { name: "track", selector: { number: { min: 1000, max: 3000, step: 10, mode: "box", unit_of_measurement: "mm" } } },
                { name: "tolerance", selector: { number: { min: 0.1, max: 3, step: 0.1, mode: "box", unit_of_measurement: "°" } } },
                { name: "exaggeration", selector: { number: { min: 1, max: 10, step: 1, mode: "slider" } } },
              ],
            },
          ],
        },
      ],
      computeLabel: (s) =>
        ({
          name: "Titel",
          pitch_entity: "Neigung vorne/hinten (°)",
          roll_entity: "Neigung links/rechts (°)",
          pitch_mm_entity: "Höhenunterschied vorne/hinten (mm, optional)",
          roll_mm_entity: "Höhenunterschied links/rechts (mm, optional)",
          invert_pitch: "Vorne/hinten umkehren",
          invert_roll: "Links/rechts umkehren",
          wheelbase: "Radstand",
          track: "Spurweite",
          tolerance: "Gilt als gerade bis",
          exaggeration: "Neigung in der Grafik überhöhen (×)",
        })[s.name],
      computeHelper: (s) =>
        ({
          pitch_mm_entity: "Leer lassen: wird aus Neigung und Radstand berechnet.",
          roll_mm_entity: "Leer lassen: wird aus Neigung und Spurweite berechnet.",
          invert_pitch: "Anhaken, wenn die Seitenansicht verkehrt herum kippt.",
          invert_roll: "Anhaken, wenn die Heckansicht verkehrt herum kippt.",
          exaggeration: "Kleine Neigungen sind sonst kaum zu sehen.",
        })[s.name],
    };
  }

  setConfig(config) {
    this._config = { ...STANDARD, ...config };
    this._key = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", min_columns: 6, rows: "auto" };
  }

  // Wert einer Achse: Winkel in Grad und Höhenunterschied in mm, beide schon
  // mit dem richtigen Vorzeichen (positiv = vorne bzw. rechts höher).
  _achse(winkelEntity, mmEntity, invert, basis) {
    const st = this._hass?.states;
    let grad = zahl(st?.[winkelEntity]?.state);
    if (grad === null) return null;
    if (invert) grad = -grad;
    let mm = mmEntity ? zahl(st?.[mmEntity]?.state) : null;
    if (mm !== null && invert) mm = -mm;
    if (mm === null) mm = Math.sin((grad * Math.PI) / 180) * basis;
    return { grad, mm };
  }

  _stufe(grad) {
    if (grad === null) return "aus";
    const a = Math.abs(grad);
    const tol = Number(this._config.tolerance) || 0.5;
    return a <= tol ? "ok" : a <= tol * 4 ? "fast" : "schief";
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config;
    const p = this._achse(c.pitch_entity, c.pitch_mm_entity, c.invert_pitch, Number(c.wheelbase) || 3800);
    const r = this._achse(c.roll_entity, c.roll_mm_entity, c.invert_roll, Number(c.track) || 2300);
    const key = JSON.stringify([c, p, r]);
    if (key === this._key) return;
    this._key = key;

    const tol = Number(c.tolerance) || 0.5;
    const uebe = Number(c.exaggeration) || 4;
    const sicht = (g) => Math.max(-14, Math.min(14, (g || 0) * uebe));
    const sp = this._stufe(p?.grad ?? null);
    const sr = this._stufe(r?.grad ?? null);
    const gesamt = !p || !r ? "aus" : sp === "ok" && sr === "ok" ? "ok" : sp === "schief" || sr === "schief" ? "schief" : "fast";

    const fmtGrad = (a) => (a ? `${a.grad >= 0 ? "+" : "−"}${Math.abs(a.grad).toFixed(1)}°` : "–");
    const fmtMm = (a) => (a ? `${Math.round(Math.abs(a.mm))} mm` : "");
    // Positiv = vorne höher → hinten unterlegen.
    const tippP = !p ? "Kein Wert" : Math.abs(p.grad) <= tol ? "Vorne/hinten gerade" : `${p.mm > 0 ? "Hinten" : "Vorne"} ${Math.round(Math.abs(p.mm))} mm anheben`;
    const tippR = !r ? "Kein Wert" : Math.abs(r.grad) <= tol ? "Links/rechts gerade" : `${r.mm > 0 ? "Links" : "Rechts"} ${Math.round(Math.abs(r.mm))} mm anheben`;

    // Libelle: volle Auslenkung bei 3°; die Blase wandert zur höheren Seite.
    const voll = 3;
    const bx = Math.max(-1, Math.min(1, (r?.grad || 0) / voll)) * 34;
    const by = Math.max(-1, Math.min(1, (p?.grad || 0) / voll)) * -34;

    const seite = `
      <svg viewBox="0 0 300 150" class="bild" aria-label="Seitenansicht">
        <line x1="4" y1="131" x2="296" y2="131" class="boden"/>
        <g transform="rotate(${sicht(p?.grad)} 150 131)">
          <line x1="4" y1="131" x2="296" y2="131" class="waage"/>
          <path class="karosse" d="M284 112 L284 34 Q284 22 272 22 L104 22 Q94 22 88 30 L58 62 L26 74 Q16 78 15 88 L14 106 Q14 112 20 112 Z"/>
          <path class="glas" d="M92 32 L62 62 L100 62 L100 32 Z"/>
          <rect class="glas" x="150" y="34" width="56" height="24" rx="3"/>
          <line class="fuge" x1="104" y1="30" x2="104" y2="110"/>
          <line class="fuge" x1="216" y1="30" x2="216" y2="110"/>
          <rect class="licht-v" x="15" y="80" width="10" height="8" rx="2"/>
          <rect class="licht-h" x="279" y="86" width="5" height="14" rx="1"/>
          <circle class="rad" cx="62" cy="114" r="17"/><circle class="felge" cx="62" cy="114" r="7"/>
          <circle class="rad" cx="236" cy="114" r="17"/><circle class="felge" cx="236" cy="114" r="7"/>
        </g>
        <text x="20" y="146" class="klein">vorne</text><text x="280" y="146" class="klein" text-anchor="end">hinten</text>
      </svg>`;

    const heck = `
      <svg viewBox="0 0 200 150" class="bild" aria-label="Heckansicht">
        <line x1="4" y1="131" x2="196" y2="131" class="boden"/>
        <g transform="rotate(${-sicht(r?.grad)} 100 131)">
          <line x1="4" y1="131" x2="196" y2="131" class="waage"/>
          <rect class="rad" x="34" y="98" width="26" height="33" rx="5"/>
          <rect class="rad" x="140" y="98" width="26" height="33" rx="5"/>
          <path class="karosse" d="M30 112 L30 34 Q30 20 44 20 L156 20 Q170 20 170 34 L170 112 Z"/>
          <line class="fuge" x1="100" y1="24" x2="100" y2="104"/>
          <rect class="glas" x="42" y="30" width="52" height="30" rx="3"/>
          <rect class="glas" x="106" y="30" width="52" height="30" rx="3"/>
          <rect class="licht-h" x="31" y="64" width="7" height="26" rx="2"/>
          <rect class="licht-h" x="162" y="64" width="7" height="26" rx="2"/>
          <rect class="stoss" x="26" y="104" width="148" height="10" rx="3"/>
        </g>
        <text x="10" y="146" class="klein">links</text><text x="190" y="146" class="klein" text-anchor="end">rechts</text>
      </svg>`;

    const libelle = `
      <svg viewBox="0 0 100 100" class="libelle" aria-label="Libelle">
        <circle cx="50" cy="50" r="46" class="glasrund"/>
        <circle cx="50" cy="50" r="${Math.max(6, (tol / voll) * 34 + 8)}" class="ziel"/>
        <line x1="4" y1="50" x2="96" y2="50" class="kreuz"/><line x1="50" y1="4" x2="50" y2="96" class="kreuz"/>
        <circle cx="${50 + bx}" cy="${50 + by}" r="8" class="blase" style="fill:${FARBE[gesamt]}"/>
      </svg>`;

    const titelText = { ok: "Steht im Wasser", fast: "Fast gerade", schief: "Steht schief", aus: "Keine Neigungswerte" }[gesamt];

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding:16px; container-type:inline-size; }
        .kopf { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
        .wert small { font-size:18px; font-weight:500; }
        .kopf h2 { margin:0; font-size:20px; font-weight:500; flex:1; color:var(--primary-text-color); }
        .status { padding:4px 12px; border-radius:16px; color:#fff; font-weight:600; font-size:14px; }
        .ansichten { display:grid; grid-template-columns: 3fr 2fr; gap:12px; }
        .ansicht { text-align:center; }
        .bild { width:100%; height:auto; display:block; }
        .wert { font-size:28px; white-space:nowrap; font-weight:600; font-variant-numeric:tabular-nums; }
        .tipp { font-size:15px; color:var(--secondary-text-color); min-height:20px; }
        .unten { display:flex; align-items:center; gap:16px; margin-top:8px; }
        .libelle { width:96px; height:96px; flex:none; }
        .hinweis { font-size:13px; color:var(--secondary-text-color); }
        .boden { stroke:var(--secondary-text-color); stroke-width:2; }
        .waage { stroke:var(--secondary-text-color); stroke-width:1; stroke-dasharray:4 4; opacity:.5; }
        .karosse { fill:var(--card-background-color, #fff); stroke:var(--primary-text-color); stroke-width:2.5; stroke-linejoin:round; }
        .glas { fill:#9cc3e6; stroke:var(--primary-text-color); stroke-width:1.5; opacity:.85; }
        .fuge { stroke:var(--primary-text-color); stroke-width:1; opacity:.45; }
        .rad { fill:#2b2d31; }
        .felge { fill:#b9bdc4; }
        .stoss { fill:#3a3d42; }
        .licht-h { fill:#d93a2b; }
        .licht-v { fill:#f4d35e; }
        .klein { font-size:13px; font-weight:500; fill:var(--secondary-text-color); }
        .glasrund { fill:color-mix(in srgb, var(--primary-color) 10%, transparent); stroke:var(--secondary-text-color); stroke-width:2; }
        .ziel { fill:none; stroke:${FARBE.ok}; stroke-width:1.5; stroke-dasharray:3 3; }
        .kreuz { stroke:var(--secondary-text-color); stroke-width:.7; opacity:.5; }
        .blase { opacity:.85; transition: cx .6s, cy .6s; }
        @container (max-width: 520px) { .ansichten { grid-template-columns: 1fr; gap:20px; } .bild { max-width:340px; margin:0 auto; } }
      </style>
      <ha-card>
        <div class="kopf">
          <h2>${c.name || ""}</h2>
          <span class="status" style="background:${FARBE[gesamt]}">${titelText}</span>
        </div>
        <div class="ansichten">
          <div class="ansicht">
            ${seite}
            <div class="wert" style="color:${FARBE[sp]}">${fmtGrad(p)} <small>· ${fmtMm(p)}</small></div>
            <div class="tipp">${tippP}</div>
          </div>
          <div class="ansicht">
            ${heck}
            <div class="wert" style="color:${FARBE[sr]}">${fmtGrad(r)} <small>· ${fmtMm(r)}</small></div>
            <div class="tipp">${tippR}</div>
          </div>
        </div>
        <div class="unten">
          ${libelle}
          <div class="hinweis">Grafik ${uebe}-fach überhöht. Gerade gilt bis ±${tol.toFixed(1)}°.
            Die Blase wandert zur höheren Seite.</div>
        </div>
      </ha-card>`;
  }
}

if (!customElements.get("yapaia-nivellierung-card")) customElements.define("yapaia-nivellierung-card", YapaiaNivellierungCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((k) => k.type === "yapaia-nivellierung-card")) {
  window.customCards.push({
    type: "yapaia-nivellierung-card",
    name: "Yapaia Nivellierung",
    description: "Wohnmobil von der Seite und von hinten, kippt mit der gemessenen Neigung.",
    preview: true,
  });
}
