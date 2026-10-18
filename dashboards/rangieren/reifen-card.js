/**
 * Reifendruck – Wohnmobil von oben, an jedem Rad Druck, Temperatur und
 * Batterie des Sensors. Farbe nach Abweichung vom Solldruck, dazu wie alt der
 * letzte Wert ist (die Sensoren senden meist nur während der Fahrt).
 *
 * Einbinden (Ressource, Typ JavaScript-Modul):
 *   /local/yapaia-dashboards/reifen-card.js
 *
 * Im Dashboard:
 *   type: custom:yapaia-reifen-card
 * Alles Weitere lässt sich im grafischen Editor einstellen (Sensoren je Rad,
 * Solldruck vorne/hinten, Toleranzen, Batterie-Warnschwelle).
 */

const RAEDER = [
  { k: "fl", name: "Vorne links" },
  { k: "fr", name: "Vorne rechts" },
  { k: "rl", name: "Hinten links" },
  { k: "rr", name: "Hinten rechts" },
];

const STANDARD = {
  name: "Reifendruck",
  ...Object.fromEntries(
    RAEDER.flatMap(({ k }) => [
      [`${k}_pressure`, `sensor.btcollector_${k}_pressure`],
      [`${k}_temperature`, `sensor.btcollector_${k}_temperature`],
      [`${k}_battery`, `sensor.btcollector_${k}_voltage`],
    ]),
  ),
  target_front: 4.5,
  target_rear: 5.0,
  tolerance_warn: 0.3,
  tolerance_alarm: 0.6,
  battery_low: 2.5,
  stale_hours: 12,
};

const FARBE = { ok: "#2e9d4f", fast: "#e69500", schief: "#d93a2b", aus: "#8a8f98" };

const zahl = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (v, stellen) => (v === null ? "–" : v.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen }));

const alter = (iso) => {
  if (!iso) return null;
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 48) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tagen`;
};

class YapaiaReifenCard extends HTMLElement {
  static getStubConfig() {
    return { ...STANDARD };
  }

  static getConfigForm() {
    const sensor = { entity: { domain: "sensor" } };
    const bar = (min, max, step) => ({ number: { min, max, step, mode: "box", unit_of_measurement: "bar" } });
    return {
      schema: [
        { name: "name", selector: { text: {} } },
        ...RAEDER.map(({ k, name }) => ({
          type: "expandable",
          flatten: true,
          name: "",
          title: `Sensoren ${name}`,
          schema: [
            { name: `${k}_pressure`, required: true, selector: sensor },
            { name: `${k}_temperature`, selector: sensor },
            { name: `${k}_battery`, selector: sensor },
          ],
        })),
        {
          type: "expandable",
          flatten: true,
          name: "",
          title: "Solldruck und Warnungen",
          expanded: true,
          schema: [
            {
              type: "grid",
              name: "",
              schema: [
                { name: "target_front", selector: bar(1, 8, 0.1) },
                { name: "target_rear", selector: bar(1, 8, 0.1) },
                { name: "tolerance_warn", selector: bar(0.1, 2, 0.1) },
                { name: "tolerance_alarm", selector: bar(0.1, 3, 0.1) },
                { name: "battery_low", selector: { number: { min: 1, max: 3.5, step: 0.1, mode: "box", unit_of_measurement: "V" } } },
                { name: "stale_hours", selector: { number: { min: 1, max: 168, step: 1, mode: "box", unit_of_measurement: "h" } } },
              ],
            },
          ],
        },
      ],
      computeLabel: (s) => {
        const rad = RAEDER.find(({ k }) => s.name.startsWith(`${k}_`));
        if (rad) return { pressure: "Druck", temperature: "Temperatur (optional)", battery: "Batteriespannung (optional)" }[s.name.slice(3)];
        return {
          name: "Titel",
          target_front: "Solldruck vorne",
          target_rear: "Solldruck hinten",
          tolerance_warn: "Gelb ab Abweichung",
          tolerance_alarm: "Rot ab Abweichung",
          battery_low: "Sensorbatterie schwach unter",
          stale_hours: "Werte gelten als alt nach",
        }[s.name];
      },
      computeHelper: (s) =>
        ({
          target_front: "Laut Reifenaufkleber oder Fahrzeughandbuch (kalt gemessen).",
          stale_hours: "Die Sensoren senden meist nur während der Fahrt.",
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

  _rad({ k, name }) {
    const c = this._config;
    const st = (id) => (id && this._hass ? this._hass.states[id] : undefined);
    const p = st(c[`${k}_pressure`]);
    const druck = zahl(p?.state);
    const temp = zahl(st(c[`${k}_temperature`])?.state);
    const batt = zahl(st(c[`${k}_battery`])?.state);
    const soll = k.startsWith("f") ? zahl(c.target_front) : zahl(c.target_rear);
    const diff = druck !== null && soll !== null ? druck - soll : null;
    let stufe = "aus";
    if (diff !== null) {
      const a = Math.abs(diff);
      stufe = a >= c.tolerance_alarm ? "schief" : a >= c.tolerance_warn ? "fast" : "ok";
    }
    const zeit = druck !== null ? p.last_changed || p.last_updated : null;
    const alt = zeit ? Date.now() - new Date(zeit).getTime() > c.stale_hours * 3600000 : false;
    const battSchwach = batt !== null && batt < c.battery_low;
    let tipp = "";
    if (diff !== null && stufe !== "ok") tipp = diff < 0 ? `${fmt(-diff, 1)} bar zu wenig` : `${fmt(diff, 1)} bar zu viel`;
    return { k, name, druck, temp, batt, soll, stufe, zeit, alt, battSchwach, tipp };
  }

  _render() {
    if (!this._config || !this.shadowRoot) return;
    const c = this._config;
    const raeder = RAEDER.map((r) => this._rad(r));
    const key = JSON.stringify([c, raeder.map((r) => [r.druck, r.temp, r.batt, r.zeit && alter(r.zeit)])]);
    if (key === this._key) return;
    this._key = key;

    const rang = { aus: 0, ok: 1, fast: 2, schief: 3 };
    const mitWert = raeder.filter((r) => r.stufe !== "aus");
    const gesamt = mitWert.length ? mitWert.reduce((a, r) => (rang[r.stufe] > rang[a] ? r.stufe : a), "ok") : "aus";
    const statusText = {
      ok: mitWert.length < 4 ? "In Ordnung (nicht alle Räder)" : "Alles in Ordnung",
      fast: "Druck prüfen",
      schief: "Druck stimmt nicht",
      aus: "Keine Werte",
    }[gesamt];
    const schwach = raeder.filter((r) => r.battSchwach).map((r) => r.name);

    // Draufsicht: Fahrtrichtung nach oben. Räder an den Ecken, Farbe = Stufe.
    const reifen = { fl: [18, 50], fr: [102, 50], rl: [18, 206], rr: [102, 206] };
    const svg = `
      <svg viewBox="0 0 120 260" class="auto" role="img" aria-label="Wohnmobil von oben">
        ${raeder
          .map(({ k, stufe }) => {
            const [x, y] = reifen[k];
            return `<rect x="${x - 7}" y="${y - 17}" width="14" height="34" rx="4" class="reifen" style="fill:${FARBE[stufe]}"/>`;
          })
          .join("")}
        <path d="M30 26 Q30 8 60 8 Q90 8 90 26 L94 44 L94 240 Q94 250 84 250 L36 250 Q26 250 26 240 L26 44 Z" class="karosse"/>
        <path d="M34 30 Q60 20 86 30 L84 46 Q60 40 36 46 Z" class="glas"/>
        <line x1="26" y1="64" x2="94" y2="64" class="fuge"/>
        <rect x="44" y="96" width="32" height="22" rx="3" class="fuge"/>
        <rect x="44" y="176" width="32" height="22" rx="3" class="fuge"/>
      </svg>`;

    const plakette = (r) => `
      <div class="rad ${r.k}">
        <div class="radname">${r.name}</div>
        <div class="druck" style="color:${FARBE[r.stufe]}">${fmt(r.druck, 1)}<small> bar</small></div>
        <div class="soll">${r.tipp || (r.soll !== null ? `Soll ${fmt(r.soll, 1)} bar` : "")}</div>
        <div class="neben">
          <span><ha-icon icon="mdi:thermometer"></ha-icon>${r.temp === null ? "–" : `${fmt(r.temp, 0)} °C`}</span>
          <span class="${r.battSchwach ? "warn" : ""}"><ha-icon icon="${r.battSchwach ? "mdi:battery-alert-variant-outline" : "mdi:battery-outline"}"></ha-icon>${r.batt === null ? "–" : `${fmt(r.batt, 1)} V`}</span>
        </div>
        <div class="zeit ${r.alt ? "alt" : ""}">${r.zeit ? alter(r.zeit) : "noch kein Wert"}</div>
      </div>`;

    const [fl, fr, rl, rr] = raeder;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding:16px; }
        .kopf { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
        .kopf h2 { margin:0; font-size:20px; font-weight:500; flex:1; color:var(--primary-text-color); }
        .status { padding:4px 12px; border-radius:16px; color:#fff; font-weight:600; font-size:14px; white-space:nowrap; }
        .feld { display:grid; grid-template-columns: 1fr minmax(70px, 120px) 1fr; max-width:560px; margin:0 auto; grid-template-rows: auto auto; gap:8px 12px; align-items:center; }
        .auto { grid-column:2; grid-row:1 / span 2; width:100%; height:auto; display:block; }
        .fl { grid-column:1; grid-row:1; text-align:right; }
        .rl { grid-column:1; grid-row:2; text-align:right; }
        .fr { grid-column:3; grid-row:1; }
        .rr { grid-column:3; grid-row:2; }
        .rad { display:flex; flex-direction:column; gap:2px; }
        .fl .neben, .rl .neben { justify-content:flex-end; }
        .radname { font-size:13px; color:var(--secondary-text-color); }
        .druck { font-size:30px; font-weight:600; line-height:1.1; font-variant-numeric:tabular-nums; white-space:nowrap; }
        .druck small { font-size:15px; font-weight:500; }
        .soll { font-size:13px; color:var(--secondary-text-color); min-height:17px; }
        .neben { display:flex; gap:10px; flex-wrap:wrap; font-size:14px; color:var(--primary-text-color); }
        .neben span { display:inline-flex; align-items:center; gap:2px; white-space:nowrap; }
        .neben ha-icon { --mdc-icon-size:16px; color:var(--secondary-text-color); }
        .neben .warn, .neben .warn ha-icon { color:${FARBE.fast}; }
        .zeit { font-size:12px; color:var(--secondary-text-color); }
        .zeit.alt { color:${FARBE.fast}; }
        .karosse { fill:var(--card-background-color, #fff); stroke:var(--primary-text-color); stroke-width:2.5; stroke-linejoin:round; }
        .glas { fill:#9cc3e6; stroke:var(--primary-text-color); stroke-width:1.5; opacity:.85; }
        .fuge { fill:none; stroke:var(--primary-text-color); stroke-width:1; opacity:.35; }
        .reifen { stroke:var(--primary-text-color); stroke-width:1.5; }
        .hinweis { margin-top:12px; font-size:13px; color:var(--secondary-text-color); }
        .hinweis.warn { color:${FARBE.fast}; }
      </style>
      <ha-card>
        <div class="kopf">
          <h2>${c.name || ""}</h2>
          <span class="status" style="background:${FARBE[gesamt]}">${statusText}</span>
        </div>
        <div class="feld">
          ${svg}
          ${plakette(fl)}${plakette(fr)}${plakette(rl)}${plakette(rr)}
        </div>
        ${schwach.length ? `<div class="hinweis warn">Sensorbatterie schwach: ${schwach.join(", ")}</div>` : ""}
        <div class="hinweis">Soll vorne ${fmt(zahl(c.target_front), 1)} bar, hinten ${fmt(zahl(c.target_rear), 1)} bar.
          Die Sensoren senden meist nur während der Fahrt.</div>
      </ha-card>`;
  }
}

if (!customElements.get("yapaia-reifen-card")) customElements.define("yapaia-reifen-card", YapaiaReifenCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((k) => k.type === "yapaia-reifen-card")) {
  window.customCards.push({
    type: "yapaia-reifen-card",
    name: "Yapaia Reifendruck",
    description: "Wohnmobil von oben mit Druck, Temperatur und Sensorbatterie an jedem Rad.",
    preview: true,
  });
}
