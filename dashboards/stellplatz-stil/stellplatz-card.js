/**
 * Stellplatz – eine Karte für das ganze Dashboard, in drei Stilen:
 *   retro    – Retro-Camper: Sahne, Rost, Senf, schräge Streifen, Fraunces
 *   magazin  – Outdoor-Magazin: Waldgrün, Höhenlinien, Instrument Serif
 *   mix      – Retro-Farben im Magazin-Aufbau
 *
 * Zeigt Heizung (Truma), Warmwasser, Batterie, Solar, Gas/Wasser, Licht,
 * Aufbautür, Radio (Yapaia Beat), WLAN (Yapaia Router), Wetter und Sonne.
 *
 * Einbinden (Ressource, Typ JavaScript-Modul):
 *   /local/yapaia-dashboards/stellplatz-card.js
 *
 * Im Dashboard (am besten als einzige Karte einer Ansicht vom Typ „Panel“):
 *   type: custom:yapaia-stellplatz-card
 *   stil: retro | magazin | mix
 * Alle Entitäten lassen sich im grafischen Editor einstellen.
 *
 * Schriften kommen von Google Fonts; ohne Internet springen Georgia bzw. die
 * Systemschrift ein.
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
  titel: "Stellplatz",
  ort: "",
  // Ort aus einer Entität: Attribut „locality“ (z. B. Geocoded Location der
  // Companion-App), sonst ihr Zustand
  ort_entity: "sensor.autoradio_geocoded_location",
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

// Truma-Warmwasser: Solltemperatur ↔ Modus
const WASSER_MODI = [
  ["eco", "Eco", 40],
  ["heiss", "Heiß", 60],
  ["boost", "Boost", 80],
];

const WETTER = {
  "clear-night": "klare Nacht", cloudy: "bewölkt", exceptional: "Unwetter", fog: "Nebel", hail: "Hagel",
  lightning: "Gewitter", "lightning-rainy": "Gewitter mit Regen", partlycloudy: "teils bewölkt", pouring: "Starkregen",
  rainy: "Regen", snowy: "Schnee", "snowy-rainy": "Schneeregen", sunny: "sonnig", windy: "windig", "windy-variant": "windig, bewölkt",
};

const SCHRIFTEN =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,900&family=DM+Sans:wght@400;500;700&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap";

const zahl = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const de = (n, st = 0) => (n === null || n === undefined ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: st, maximumFractionDigits: st }));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uhrzeit = (iso) => (iso ? new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "–");

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
  static getStubConfig() {
    return { stil: "retro" };
  }

  static getConfigForm() {
    const e = (domain) => ({ entity: { domain } });
    return {
      schema: [
        { name: "stil", required: true, selector: { select: { mode: "box", options: [
          { value: "retro", label: "Retro-Camper" }, { value: "magazin", label: "Outdoor-Magazin" }, { value: "mix", label: "Mix" }] } } },
        { type: "grid", name: "", schema: [{ name: "titel", selector: { text: {} } }, { name: "ort", selector: { text: {} } }] },
        { name: "ort_entity", selector: { entity: { domain: "sensor" } } },
        { type: "expandable", flatten: true, name: "", title: "Heizung", schema: [
          { name: "raum", selector: e("climate") }, { name: "wasser", selector: e("climate") }] },
        { type: "expandable", flatten: true, name: "", title: "Batterie und Solar", schema: [
          { name: "soc", selector: e("sensor") }, { name: "soc_2", selector: e("sensor") },
          { name: "spannung", selector: e("sensor") }, { name: "spannung_2", selector: e("sensor") },
          { name: "strom", selector: e("sensor") }, { name: "strom_2", selector: e("sensor") },
          { name: "restlaufzeit", selector: e("sensor") }, { name: "leistung", selector: e("sensor") }, { name: "leistung_2", selector: e("sensor") },
          { name: "kapazitaet_ah", selector: { number: { min: 10, max: 2000, step: 10, mode: "box", unit_of_measurement: "Ah" } } },
          { name: "pv", selector: e("sensor") }, { name: "ertrag", selector: e("sensor") }] },
        { type: "expandable", flatten: true, name: "", title: "Vorräte", schema: [
          { name: "gas_1", selector: e("sensor") }, { name: "gas_2", selector: e("sensor") }, { name: "frischwasser", selector: e("sensor") },
          { type: "grid", name: "", schema: [
            { name: "wasser_leer_v", selector: { number: { min: 0, max: 10, step: 0.01, mode: "box", unit_of_measurement: "V" } } },
            { name: "wasser_voll_v", selector: { number: { min: 0, max: 10, step: 0.01, mode: "box", unit_of_measurement: "V" } } }] }] },
        { type: "expandable", flatten: true, name: "", title: "Tür, Radio, Internet, Wetter", schema: [
          { name: "tuer", selector: e("lock") }, { name: "radio", selector: e("media_player") },
          { name: "internet", selector: e("sensor") }, { name: "wetter", selector: e("weather") }, { name: "sonne", selector: e("sun") }] },
        { name: "lichter", selector: { object: {} } },
      ],
      computeLabel: (s) => ({
        stil: "Stil", titel: "Titel", ort: "Ort fest eintragen (sonst aus der Entität)", ort_entity: "Ort aus Entität", raum: "Heizung Raum", wasser: "Warmwasser",
        soc: "Ladestand Batterie 1", soc_2: "Ladestand Batterie 2 (optional)", spannung: "Spannung Batterie 1", spannung_2: "Spannung Batterie 2 (optional)", strom: "Strom Batterie 1",
        strom_2: "Strom Batterie 2 (optional)", restlaufzeit: "Restlaufzeit (Tage)", leistung: "Leistung Batterie 1 (optional, sonst Spannung × Strom)",
        leistung_2: "Leistung Batterie 2 (optional)", kapazitaet_ah: "Kapazität aller Batterien", pv: "Solarleistung", ertrag: "Solarertrag heute",
        gas_1: "Gas 1", gas_2: "Gas 2", frischwasser: "Frischwasser", wasser_leer_v: "Wasser leer bei", wasser_voll_v: "Wasser voll bei",
        tuer: "Aufbautür", radio: "Radio", internet: "Router „Internet über“", wetter: "Wetter", sonne: "Sonne",
        lichter: "Lichter (Liste aus entity und name)",
      })[s.name],
      computeHelper: (s) => ({
        wasser_leer_v: "Ohne beide Werte zeigt die Karte die Spannung des Drucksensors.",
        kapazitaet_ah: "Für die Schätzung, wann die Batterie wieder voll ist.",
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
    if (!document.querySelector(`link[href="${SCHRIFTEN}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = SCHRIFTEN;
      document.head.appendChild(l);
    }
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
      uhr: jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      wochentag: jetzt.toLocaleDateString("de-DE", { weekday: "long" }),
      datum: jetzt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }),
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
        text: WETTER[wetter.state] || wetter.state,
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
    if (std >= 48) return `${Math.round(std / 24)} Tagen`;
    const h = Math.floor(std);
    const m = Math.round((std - h) * 60 / 5) * 5;
    return h ? `${h} Std${m ? ` ${m} Min` : ""}` : `${Math.max(5, m)} Min`;
  }

  _vollUm(std) {
    return new Date(Date.now() + std * 3600e3).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  /** „−24 W“ / „+120 W“ */
  _wText(b) {
    return b.w === null ? "–" : `${b.w > 0.5 ? "+" : b.w < -0.5 ? "−" : ""}${de(Math.abs(b.w))} W`;
  }

  /** Kurzer Satz zur Batterie (Retro: unten in der Kachel). */
  _battZeile(b) {
    if (b.richtung === "laden") {
      if (b.voll) return "voll · lädt";
      return b.vollIn !== null ? `voll in ca. ${this._dauer(b.vollIn)} (gegen ${this._vollUm(b.vollIn)})` : "lädt gerade";
    }
    return b.rest === null ? "Restlaufzeit unbekannt" : `${this._restText(b)} Restlaufzeit`;
  }

  /** Satz zur Batterie im Magazin-Stil. */
  _battSatz(b) {
    if (b.richtung === "laden") {
      const voll = b.voll ? " Sie ist voll." : b.vollIn !== null ? ` Voll in ca. <b>${this._dauer(b.vollIn)}</b>, gegen ${this._vollUm(b.vollIn)}.` : "";
      return `Die Batterie <b>lädt mit ${de(Math.abs(b.w ?? 0))} W</b>.${voll}`;
    }
    const zieht = b.richtung === "entladen" ? `Gerade werden <b>${de(Math.abs(b.w))} W</b> verbraucht. ` : "Gerade fließt kaum Strom. ";
    return `${zieht}${b.rest === null ? "" : `Reicht noch <b>${esc(this._restText(b))}</b>.`}`;
  }

  _restText(b) {
    if (b.rest === null) return "unbekannt";
    const tage = Math.floor(b.rest);
    const std = Math.round((b.rest - tage) * 24);
    return tage > 0 ? `${tage} ${tage === 1 ? "Tag" : "Tage"} ${std} Std` : `${std} Std`;
  }

  _gasText(v) {
    return v === null ? "–" : v >= 99 ? "voll" : `${de(v)} %`;
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
    return [...WASSER_MODI.map(([k, n]) => [k, n]), ["aus", "Aus"]]
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
    if (this._tuerBestaetigen > Date.now()) return d.tuer.zu ? "Nochmal tippen: entriegeln" : "Nochmal tippen: verriegeln";
    return { locked: "verriegelt", unlocked: "offen", locking: "verriegelt …", unlocking: "entriegelt …", jammed: "klemmt!" }[d.tuer.zustand] ?? d.tuer.zustand;
  }

  _raumText(d) {
    const r = d.raum;
    if (!r) return "–";
    if (!r.an) return `aus · innen ${de(r.ist, 1)}°`;
    return `innen ${de(r.ist, 1)}° · ${r.heizt ? "heizt" : "hält"}`;
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
          <div class="chiptext"><b>${esc(d.wlan?.ssid ?? "kein WLAN")}</b><small>Internet über ${esc(d.wlan?.quelle ?? "–")}</small></div>
          ${d.wetter ? `<span class="trenner"></span><span class="ic senf">${ICON.sonne}</span><span class="chiptemp">${de(d.wetter.temp)}°</span>` : ""}
        </div>
      </header>
      <main>
        <section class="k heizung">
          <div class="spalte">
            <div class="label">Heizung · Raum</div>
            <div class="riesig">${r?.an ? `${de(r.soll, 1)}°` : "aus"}</div>
            <div>${esc(this._raumText(d))}</div>
          </div>
          <div class="rund">
            <button data-a="raum" data-id="+" aria-label="Wärmer">+</button>
            <button data-a="raum" data-id="-" aria-label="Kälter">−</button>
            <button data-a="raum" data-id="an" aria-label="Heizung an/aus" class="${r?.an ? "aktiv" : ""}">${ICON.power}</button>
          </div>
          <div class="linie"></div>
          <div class="spalte schmal">
            <div class="label">Wasser</div>
            <div class="gross">${d.wasser?.soll ? `${de(d.wasser.soll)}°` : "aus"}</div>
            <div class="modi">${this._wasserKnoepfe(d)}</div>
          </div>
        </section>
        <section class="k hell">
          <div class="label braun">Batterie</div>
          <div class="batt">
            <div class="akku"><i style="height:${b.soc ?? 0}%"></i></div>
            <div><div class="gross">${b.soc === null ? "–" : `${de(b.soc)}%`}</div>
              <div class="leistung ${b.richtung ?? ""}">${this._wText(b)}<small>${{ laden: "lädt", entladen: "entlädt", ruhe: "Ruhe" }[b.richtung] ?? ""}</small></div>
              <small>${de(b.volt, 1)} V · ${b.strom === null ? "–" : `${b.strom > 0 ? "+" : ""}${de(b.strom, 1)} A`}</small></div>
          </div>
          <div class="battzeile"><b>${esc(this._battZeile(b))}</b></div>
        </section>
        <section class="k dunkel">
          <div class="kopf"><span class="label senf">Solar</span><span class="ic senf gross-ic">${ICON.sonne}</span></div>
          <div class="gross">${de(d.solar.w)}<span class="einheit"> W</span></div>
          <div>heute <b>${de(d.solar.kwh, 1)} kWh</b></div>
        </section>
        <section class="k hell">
          <div class="label braun">Licht</div>
          <div class="lichter">${this._lichtKnoepfe(d)}</div>
        </section>
        <section class="k hell">
          <div class="label braun">Vorräte</div>
          <div class="tanks">
            ${[["Gas 1", d.gas[0], "rost"], ["Gas 2", d.gas[1], "rost"], ["Wasser", d.fw.pct, "teal"]].map(([n, v, f], i) => `
              <div class="tank"><div class="saeule"><i class="${f}" style="height:${v ?? 0}%"></i></div>
              <span>${n}<br>${i === 2 ? this._fwText(d.fw) : this._gasText(v)}</span></div>`).join("")}
          </div>
        </section>
        <section class="k senfk">
          <div class="label">Aufbautür</div>
          <button class="tuerknopf" data-a="tuer" aria-label="Aufbautür">${d.tuer?.zu ? ICON.schloss : ICON.offen}</button>
          <div class="tuertext">${esc(this._tuerText(d))}</div>
        </section>
        <section class="k dunkel radio">
          <div class="label senf">Radio</div>
          <div><div class="sender">${esc(d.radio?.sender ?? "Radio")}</div><small class="hellbraun">${esc(d.radio?.titel || (d.radio?.sender ? "" : "Sender wählen"))}</small></div>
          <div class="steuer">
            <button data-a="radio" data-id="previous" aria-label="Voriger Sender">${ICON.zurueck}</button>
            <button class="pp" data-a="radio" data-id="play_pause" aria-label="Wiedergabe">${d.radio?.spielt ? ICON.pause : ICON.play}</button>
            <button data-a="radio" data-id="next" aria-label="Nächster Sender">${ICON.vor}</button>
          </div>
        </section>
      </main>
    </div>`;
  }

  // ---- Stil C: Outdoor-Magazin -------------------------------------------------

  _magazin(d, mix = false) {
    const b = d.batt;
    const r = d.raum;
    const wetterZeile = d.wetter ? `${esc(d.wetter.text)}${d.wetter.wind !== null ? `,<br>Wind ${de(d.wetter.wind)} km/h` : ""}` : "";
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
            <div><div class="mini">${d.sonne.oben ? "Sonnenuntergang" : "Sonnenaufgang"}</div><div class="zeit">${uhrzeit(d.sonne.oben ? d.sonne.unter : d.sonne.auf)}</div></div>
            <div><div class="mini">Uhrzeit</div><div class="zeit">${d.uhr}</div></div></div>` : ""}
          <div class="netz"><span class="ic">${ICON.wlan}</span><div><b>${esc(d.wlan?.ssid ?? "Kein WLAN")}</b><small>Internet über ${esc(d.wlan?.quelle ?? "–")}</small></div></div>
        </div>
      </aside>
      <main>
        <div class="leiste"><span class="rubrik"><i>Heute im Mobil</i></span><span>${esc(d.datum)} · ${d.uhr}</span></div>
        <section class="${mix ? "karte energie" : ""}">
          <div class="mini">Energie</div>
          <div class="zahl">${b.soc === null ? "–" : de(b.soc)}<span>%</span></div>
          <div class="balken"><i style="width:${b.soc ?? 0}%"></i></div>
          <div class="leistung-gross ${b.richtung ?? ""}">${this._wText(b)}<span>${{ laden: "lädt", entladen: "Verbrauch", ruhe: "Ruhe" }[b.richtung] ?? ""}</span></div>
          <p>${this._battSatz(b)}
             ${d.solar.w ? `Die Sonne liefert <b class="akz">${de(d.solar.w)} W</b>, heute ${de(d.solar.kwh, 1)} kWh.` : `Heute ${de(d.solar.kwh, 1)} kWh von der Sonne.`}</p>
        </section>
        <section class="${mix ? "karte waerme" : ""}">
          <div class="mini">Wärme</div>
          <div class="zahl">${r?.an ? `${de(r.soll, 1)}°` : "aus"}</div>
          <div class="plusminus">
            <button data-a="raum" data-id="-" aria-label="Kälter">−</button>
            <button data-a="raum" data-id="+" aria-label="Wärmer" class="voll">+</button>
            <button data-a="raum" data-id="an" aria-label="Heizung an/aus" class="${r?.an ? "aktiv" : ""}">${ICON.power}</button>
          </div>
          <p>${r ? (r.an ? `Innen ${de(r.ist, 1)}°, die Truma ${r.heizt ? "heizt" : "hält die Temperatur"}.` : `Heizung aus, innen ${de(r.ist, 1)}°.`) : ""}
             Warmwasser <b>${d.wasser?.soll ? `${de(d.wasser.soll)}°` : "aus"}</b>.</p>
          <div class="modi">${this._wasserKnoepfe(d)}</div>
        </section>
        <section class="${mix ? "karte vorraete" : ""}">
          <div class="mini">Vorräte</div>
          ${[["Gas 1", this._gasText(d.gas[0]), d.gas[0], "akzb"], ["Gas 2", this._gasText(d.gas[1]), d.gas[1], "akzb"], ["Frischwasser", this._fwText(d.fw), d.fw.pct, "blau"]]
            .map(([n, t, v, f]) => `<div class="vorrat"><div class="vz"><span class="vn">${n}</span><b>${t}</b></div><div class="vl"><i class="${f}" style="width:${v ?? 0}%"></i></div></div>`).join("")}
        </section>
        <section class="licht-bereich ${mix ? "karte" : "linieoben"}">
          <div class="vz"><div class="mini">Licht</div><button class="link" data-a="alle_aus">Alles aus</button></div>
          <div class="pillen">${this._lichtKnoepfe(d)}</div>
        </section>
        <section class="tuer-bereich ${mix ? "karte senfk" : "linieoben"}">
          <button class="tuerknopf" data-a="tuer" aria-label="Aufbautür">${d.tuer?.zu ? ICON.schloss : ICON.offen}</button>
          <div><div class="mini">Aufbautür</div><div class="tuertext">${esc(this._tuerText(d))}</div></div>
        </section>
        <section class="radio-bereich">
          <button class="pp" data-a="radio" data-id="play_pause" aria-label="Wiedergabe">${d.radio?.spielt ? ICON.pause : ICON.play}</button>
          <div class="rt"><div class="mini">${d.radio?.spielt ? "Läuft gerade" : "Radio"}${d.radio?.sender ? ` · ${esc(d.radio.sender)}` : ""}</div><div class="titel">${esc(d.radio?.titel || d.radio?.sender || "Sender wählen")}</div></div>
          <div class="favs">${this._radioFavoriten(d)}</div>
        </section>
      </main>
    </div>`;
  }

  // ---- Zeichnen ----------------------------------------------------------------

  _zeichnen() {
    if (!this._config || !this.shadowRoot) return;
    if (!this._hass) {
      this.shadowRoot.innerHTML = `<style>${STIL}</style><ha-card></ha-card>`;
      return;
    }
    const d = this._daten();
    const key = JSON.stringify([d, this._config.stil, this._tuerBestaetigen > Date.now()]);
    if (key === this._key) return;
    this._key = key;
    const stil = this._config.stil;
    const html = stil === "magazin" ? this._magazin(d) : stil === "mix" ? this._magazin(d, true) : this._retro(d);
    this.shadowRoot.innerHTML = `<style>${STIL}</style><ha-card>${html}</ha-card>`;
  }

  // ---- Bedienen ----------------------------------------------------------------

  _dienst(domain, service, data) {
    return this._hass.callService(domain, service, data).catch((err) => {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: `Fehler: ${err.message ?? err}` }, bubbles: true, composed: true }));
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
.retro { --sahne: #F4ECDC; --papier: #FBF6EC; --braun: #3B2A20; --rost: #C8551F; --senf: #E3A72F; --hellbraun: #8A5A3B; --teal: #5E8C8A;
  background: var(--sahne); color: var(--braun); font-family: "DM Sans", system-ui, sans-serif; padding: 26px 30px; display: flex; flex-direction: column; gap: 18px; }
.retro .streifen { position: absolute; right: -60px; top: 34px; width: 52%; display: flex; flex-direction: column; gap: 8px; transform: skewX(-24deg); }
.retro .streifen i { height: 18px; background: var(--braun); }
.retro .streifen i:nth-child(2) { background: var(--rost); }
.retro .streifen i:nth-child(3) { background: var(--senf); }
.retro header { position: relative; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.retro .dach { font-size: 15px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--hellbraun); }
.retro h1 { margin: 0; font-family: "Fraunces", Georgia, serif; font-weight: 900; font-size: 76px; line-height: .9; letter-spacing: -.02em; }
.retro h1.lang { font-size: 58px; }
.retro h1.sehrlang { font-size: 44px; }
.retro .chip { display: flex; gap: 12px; align-items: center; background: var(--papier); border: 2px solid var(--braun); border-radius: 999px; padding: 10px 18px 10px 14px; margin-top: 90px; }
.retro .chiptext { display: flex; flex-direction: column; }
.retro .chiptext small { color: var(--hellbraun); font-size: 13px; }
.retro .trenner { width: 2px; height: 32px; background: #E0D3BC; }
.retro .chiptemp { font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 22px; }
.retro .senf { color: var(--senf); }
.retro main { flex: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: minmax(250px, 1fr); gap: 18px; }
.retro .k { border-radius: 32px; padding: 22px 24px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; min-width: 0; }
.retro .hell { background: var(--papier); border: 2px solid var(--braun); }
.retro .dunkel { background: var(--braun); color: var(--sahne); }
.retro .senfk { background: var(--senf); }
.retro .label { font-size: 14px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
.retro .label.braun { color: var(--hellbraun); }
.retro .gross { font-family: "Fraunces", Georgia, serif; font-weight: 900; font-size: 64px; line-height: .9; }
.retro .einheit { font-size: 30px; }
.retro .riesig { font-family: "Fraunces", Georgia, serif; font-weight: 900; font-size: 108px; line-height: .85; }
.retro .heizung { grid-column: span 2; background: var(--rost); color: var(--papier); flex-direction: row; align-items: stretch; gap: 24px; }
.retro .heizung .spalte { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.retro .heizung .schmal { flex: 0 0 170px; }
.retro .heizung .label { opacity: .85; }
.retro .rund { display: flex; flex-direction: column; gap: 10px; justify-content: center; }
.retro .rund button { width: 60px; height: 60px; border-radius: 50%; border: 2px solid var(--papier); background: transparent; color: var(--papier); font-size: 32px; display: flex; align-items: center; justify-content: center; }
.retro .rund button svg { width: 24px; height: 24px; }
.retro .rund button.aktiv { background: var(--papier); color: var(--rost); }
.retro .linie { width: 2px; background: rgba(251,246,236,.35); }
.retro .modi { display: flex; flex-wrap: wrap; gap: 6px; }
.retro .modus { padding: 6px 11px; border-radius: 999px; border: 2px solid rgba(251,246,236,.6); background: transparent; color: var(--papier); font-weight: 700; font-size: 14px; }
.retro .modus.an { background: var(--papier); color: var(--rost); border-color: var(--papier); }
.retro .batt { display: flex; align-items: center; gap: 18px; }
.retro .batt small { color: var(--hellbraun); font-size: 15px; }
.retro .akku { width: 58px; height: 118px; border: 3px solid var(--braun); border-radius: 12px; position: relative; display: flex; flex-direction: column; justify-content: flex-end; padding: 5px; flex: none; }
.retro .akku::before { content: ""; position: absolute; top: -10px; left: 17px; width: 18px; height: 7px; background: var(--braun); border-radius: 3px 3px 0 0; }
.retro .akku i { background: var(--senf); border-radius: 6px; }
.retro .leistung { font-family: "Fraunces", Georgia, serif; font-weight: 900; font-size: 26px; margin: 4px 0 2px; display: flex; align-items: baseline; gap: 6px; }
.retro .leistung small { font-family: "DM Sans", system-ui, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--hellbraun); }
.retro .leistung.laden { color: #2F7A4F; }
.retro .leistung.entladen { color: var(--rost); }
.retro .battzeile { font-size: 15px; }
.retro .kopf { display: flex; justify-content: space-between; align-items: center; }
.retro .gross-ic { width: 34px; height: 34px; }
.retro .lichter { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; flex: 1; }
.retro .licht { border-radius: 16px; border: 2px solid var(--braun); background: transparent; color: var(--braun); font-weight: 700; font-size: 15px; text-align: left; padding: 8px 12px; min-height: 44px; }
.retro .licht.an { background: var(--senf); border-color: var(--senf); }
.retro .tanks { flex: 1; display: flex; gap: 14px; }
.retro .tank { flex: 1; display: flex; flex-direction: column; gap: 8px; align-items: center; min-width: 0; }
.retro .tank span { font-weight: 700; font-size: 14px; text-align: center; }
.retro .saeule { flex: 1; width: 100%; min-height: 90px; border: 2px solid var(--braun); border-radius: 16px; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
.retro .saeule .rost { background: var(--rost); }
.retro .saeule .teal { background: var(--teal); }
.retro .tuerknopf { align-self: center; width: 124px; height: 124px; border-radius: 50%; border: 3px solid var(--braun); background: var(--papier); color: var(--braun); display: flex; align-items: center; justify-content: center; }
.retro .tuerknopf svg { width: 52px; height: 52px; }
.retro .tuertext { text-align: center; font-family: "Fraunces", Georgia, serif; font-weight: 900; font-size: 26px; }
.retro .sender { font-family: "Fraunces", Georgia, serif; font-weight: 900; font-size: 38px; line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.retro .hellbraun { color: #D8C7AE; font-size: 15px; }
.retro .steuer { display: flex; gap: 12px; align-items: center; }
.retro .steuer button { width: 48px; height: 48px; border-radius: 50%; border: 2px solid #6B4A36; background: transparent; color: var(--sahne); display: flex; align-items: center; justify-content: center; }
.retro .steuer button svg { width: 20px; height: 20px; }
.retro .steuer .pp { width: 64px; height: 64px; border: none; background: var(--rost); color: var(--papier); }
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
.magazin, .mix { display: flex; flex-wrap: wrap; font-family: "Inter", system-ui, sans-serif; }
.magazin { --grund: #F7F5EF; --tinte: #1C2620; --grau: #56645A; --linie: #CFC8B8; --spur: #E3DED2; --seite: #1F3A2E; --seitetext: #EEF2EA; --seitegrau: #B9CBB6;
  --akzent: #D9893A; --blau: #3F6E8C; --schrift: "Instrument Serif", Georgia, serif; --zahlgewicht: 400; }
.mix { --grund: #F4ECDC; --tinte: #3B2A20; --grau: #8A5A3B; --linie: #DCCDB4; --spur: #E9DCC4; --seite: #3B2A20; --seitetext: #F4ECDC; --seitegrau: #D8C7AE;
  --akzent: #E3A72F; --rost: #C8551F; --blau: #5E8C8A; --schrift: "Fraunces", Georgia, serif; --zahlgewicht: 900; }
.magazin, .mix { background: var(--grund); color: var(--tinte); }
aside { flex: 0 0 380px; background: var(--seite); color: var(--seitetext); padding: 34px 34px 28px; display: flex; flex-direction: column; justify-content: space-between; gap: 24px; position: relative; overflow: hidden; }
aside .topo { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--seitetext); opacity: .09; }
aside > div { position: relative; }
aside .dach { font-size: 13px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: var(--seitegrau); }
aside h1 { margin: 6px 0 0; font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 60px; line-height: .95; overflow-wrap: anywhere; }
.magazin aside h1 { font-style: italic; }
aside h1.lang { font-size: 46px; }
aside h1.sehrlang { font-size: 36px; }
aside .unten { display: flex; flex-direction: column; gap: 18px; }
aside .wetter { display: flex; align-items: baseline; gap: 14px; }
aside .temp { font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 112px; line-height: .8; }
aside .wetter span:last-child { font-size: 17px; color: var(--seitegrau); }
aside .zwei { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid rgba(238,242,234,.25); }
aside .zwei > div { padding: 12px 0; }
aside .zwei > div + div { border-left: 1px solid rgba(238,242,234,.25); padding-left: 18px; }
aside .mini { color: var(--seitegrau); letter-spacing: .1em; font-size: 11px; }
aside .zeit { font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 34px; }
aside .netz { display: flex; align-items: center; gap: 12px; background: rgba(238,242,234,.1); border-radius: 14px; padding: 12px 14px; }
aside .netz > div { display: flex; flex-direction: column; }
aside .netz small { font-size: 13px; color: var(--seitegrau); }
.mix aside .streifen { position: absolute; left: -40px; right: -40px; top: 40%; display: flex; flex-direction: column; gap: 7px; transform: skewY(-8deg); opacity: .95; }
.mix aside .streifen i { height: 14px; background: var(--rost); }
.mix aside .streifen i:nth-child(2) { background: var(--akzent); }
.mix aside .streifen i:nth-child(3) { background: var(--seitetext); opacity: .85; }
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
.akz { color: var(--akzent); }
.leistung-gross { display: flex; align-items: baseline; gap: 8px; font-family: var(--schrift); font-weight: var(--zahlgewicht); font-size: 34px; line-height: 1; }
.leistung-gross span { font-family: "Inter", system-ui, sans-serif; font-weight: 600; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--grau); }
.leistung-gross.laden { color: #2F7A4F; }
.leistung-gross.entladen { color: #B4532A; }
.mix .leistung-gross.entladen { color: var(--rost); }
.mix .energie .akz { color: var(--rost); }
.magazin .akz { color: #B8692A; }
.plusminus { display: flex; gap: 10px; }
.plusminus button { flex: 1; height: 48px; border-radius: 24px; border: 1.5px solid var(--tinte); background: transparent; color: var(--tinte); font-size: 22px; display: flex; align-items: center; justify-content: center; }
.plusminus button.voll { background: var(--tinte); color: var(--grund); }
.plusminus button svg { width: 20px; height: 20px; }
.plusminus button.aktiv { background: var(--akzent); border-color: var(--akzent); color: var(--tinte); }
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
.pillen .licht.an { background: var(--akzent); border-color: var(--akzent); }
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
.mix .fav { border-color: rgba(244,236,220,.3); }
.mix .fav.an { border-color: var(--akzent); color: var(--akzent); }
/* Mix: Retro-Karten im Magazin-Raster */
.mix .karte { border-radius: 28px; padding: 20px 22px; }
.mix .energie, .mix .vorraete, .mix .licht-bereich { background: #FBF6EC; border: 2px solid var(--tinte); }
.mix .waerme { background: var(--rost); color: #FBF6EC; }
.mix .waerme .mini, .mix .waerme p { color: #FBF6EC; }
.mix .waerme .plusminus button { border-color: #FBF6EC; color: #FBF6EC; }
.mix .waerme .plusminus button.voll { background: #FBF6EC; color: var(--rost); }
.mix .waerme .plusminus button.aktiv { background: var(--akzent); border-color: var(--akzent); color: var(--tinte); }
.mix .waerme .modus { border-color: rgba(251,246,236,.5); color: #FBF6EC; }
.mix .waerme .modus.an { background: #FBF6EC; color: var(--rost); border-color: #FBF6EC; }
.mix .senfk { background: var(--akzent); }
.mix .senfk .mini { color: var(--tinte); }
.mix .senfk .tuerknopf { background: #FBF6EC; color: var(--tinte); border: 3px solid var(--tinte); }
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
`;

if (!customElements.get("yapaia-stellplatz-card")) customElements.define("yapaia-stellplatz-card", YapaiaStellplatzCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((k) => k.type === "yapaia-stellplatz-card")) {
  window.customCards.push({
    type: "yapaia-stellplatz-card",
    name: "Yapaia Stellplatz",
    description: "Ganzes Stellplatz-Dashboard in einer Karte – Stil Retro-Camper, Outdoor-Magazin oder Mix.",
    preview: false,
  });
}
