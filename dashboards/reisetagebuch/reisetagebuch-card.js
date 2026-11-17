/**
 * Reisetagebuch – Tagesansicht der aufgezeichneten Fahrten: Strecke, Fahrzeit,
 * Verbrauch, Route (nach Tempo gefärbt, Grenzen markiert), Fahrstil, Länder,
 * Fahrzeugwerte und Fahrtenliste. Blättern ◀ ▶ zwischen den Tagen.
 * Daten kommen von der Integration Yapaia (ab 0.9.0) über WebSocket
 * `yapaia/reisetagebuch/tage` und `…/tag`; alle Fahrzeugwerte (CAN) sind optional.
 *
 * Einbinden (Ressource, Typ JavaScript-Modul):
 *   /local/yapaia-dashboards/reisetagebuch-card.js
 *
 * Im Dashboard:
 *   type: custom:yapaia-reisetagebuch-card
 *   preis_l: 1.75      # Dieselpreis €/l für die Kostenschätzung
 */

// Yapaia Design (docs/design-schemata.md); ohne die Integration gelten die Rückfallfarben
const DESIGN = import("/yapaia_design/yapaia-design.js").then(() => window.YapaiaDesign.bereit).catch(() => null);
const DESIGN_QUELLE = null;

const STANDARD = { design: "auto", preis_l: 1.75 };
const SPEICHER = "yapaia-reisetagebuch-tag";

// Texte je Sprache (docs/sprachen.md): folgt der HA-Sprache, Deutsch oder sonst Englisch
const TEXTE = {
  de: {
    titel: "Reisetagebuch",
    automatisch: "Automatisch",
    l_design: "Design-Schema",
    l_preis_l: "Dieselpreis (€/l)",
    h_preis_l: "Für die geschätzten Kosten je Tag.",
    wochentage: "So,Mo,Di,Mi,Do,Fr,Sa",
    strecke: "Strecke",
    zeit: "Fahrzeit · Ø",
    verbrauch: "Verbrauch · Kosten",
    route: "Route",
    farbe_tempo: "Tempo",
    farbe_verbrauch: "Verbrauch",
    farbe_hoehe: "Höhe",
    keine_werte: "Für diesen Tag keine Werte aufgezeichnet",
    stil: "Fahrstil",
    tempomat: "Tempomat-Anteil",
    gaenge: "Gänge (Zeit)",
    laender: "Länder",
    fahrzeug: "Fahrzeug",
    fahrten: "Fahrten",
    stand: "Standzeit",
    pausen: "Pausen",
    gebremst: "× gebremst",
    geblinkt: "× geblinkt",
    grenze: "Grenze",
    kein_can: "Kein CAN-Bus aufgezeichnet – nur GPS und Go",
    quelle_can: "aus CAN-Bus (Candapter), GPS und Go",
    quelle_gps: "aus GPS und Go",
    stadt: "bis 50",
    land: "50–90",
    bahn: "über 90 km/h",
    aus_tacho: "laut Tacho",
    aus_gps: "laut GPS",
    geschaetzt: "Ø-Verbrauch × Strecke, geschätzt",
    tank: "Tank (roh)",
    einheit_offen: "Einheit noch offen",
    grenze_erkannt: "Grenze erkannt um {zeit}",
    temp: "Außen",
    hoehe: "Höhe",
    batt: "Bordnetz",
    kmstand: "Kilometerstand",
    vmax: "max",
    n_fahrten: "{n} Fahrten",
    leer: "Noch keine Fahrten aufgezeichnet.",
    leer_hinweis: "Sobald Yapaia eine Fahrt erkennt, erscheint sie hier.",
    fehler: "Reisetagebuch nicht verfügbar. Ist die Integration Yapaia ab Version 0.9.0 installiert?",
    laeuft: "Fahrt läuft …",
    vorheriger: "Vorheriger Tag",
    naechster: "Nächster Tag",
    laedt: "Lädt …",
    keine_spur: "Keine Route aufgezeichnet",
  },
  en: {
    titel: "Travel journal",
    automatisch: "Automatic",
    l_design: "Design scheme",
    l_preis_l: "Diesel price (€/l)",
    h_preis_l: "Used for the estimated cost per day.",
    wochentage: "Sun,Mon,Tue,Wed,Thu,Fri,Sat",
    strecke: "Distance",
    zeit: "Driving time · avg",
    verbrauch: "Fuel · cost",
    route: "Route",
    farbe_tempo: "Speed",
    farbe_verbrauch: "Fuel",
    farbe_hoehe: "Altitude",
    keine_werte: "No values recorded for this day",
    stil: "Driving style",
    tempomat: "Cruise control share",
    gaenge: "Gears (time)",
    laender: "Countries",
    fahrzeug: "Vehicle",
    fahrten: "Trips",
    stand: "stopped",
    pausen: "breaks",
    gebremst: "× braked",
    geblinkt: "× indicated",
    grenze: "Border",
    kein_can: "No CAN bus recorded – GPS and Go only",
    quelle_can: "from CAN bus (Candapter), GPS and Go",
    quelle_gps: "from GPS and Go",
    stadt: "up to 50",
    land: "50–90",
    bahn: "over 90 km/h",
    aus_tacho: "per odometer",
    aus_gps: "per GPS",
    geschaetzt: "average consumption × distance, estimated",
    tank: "Tank (raw)",
    einheit_offen: "unit not yet known",
    grenze_erkannt: "Border detected at {zeit}",
    temp: "Outside",
    hoehe: "Altitude",
    batt: "Electrical",
    kmstand: "Odometer",
    vmax: "max",
    n_fahrten: "{n} trips",
    leer: "No trips recorded yet.",
    leer_hinweis: "As soon as Yapaia detects a trip, it shows up here.",
    fehler: "Travel journal unavailable. Is the Yapaia integration version 0.9.0 or newer installed?",
    laeuft: "Trip in progress …",
    vorheriger: "Previous day",
    naechster: "Next day",
    laedt: "Loading …",
    keine_spur: "No route recorded",
  },
};
const spracheVon = (hass) =>
  String(hass?.locale?.language ?? hass?.language ?? document.querySelector("home-assistant")?.hass?.locale?.language ?? "en")
    .toLowerCase().startsWith("de") ? "de" : "en";
const t = (hass, schluessel, werte = {}) =>
  String(TEXTE[spracheVon(hass)]?.[schluessel] ?? TEXTE.en[schluessel] ?? schluessel).replace(/\{(\w+)\}/g, (_, k) => werte[k] ?? "");
// Zahlen, Datum, Uhrzeit im Format der HA-Sprache
const gebiet = (hass) => hass?.locale?.language ?? hass?.language ?? "de-DE";

const zahl = (v) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const nf = (hass, v, stellen = 0) =>
  zahl(v) === null ? "–" : zahl(v).toLocaleString(gebiet(hass), { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const hm = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")} h`;
const uhr = (iso) => (typeof iso === "string" ? iso.slice(11, 16) : "");
const esc = (s) => String(s ?? "–").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const paar = (v) => (Array.isArray(v) && v.length >= 2 && zahl(v[0]) !== null && zahl(v[1]) !== null ? v : null);
const summe = (liste, f) => liste.reduce((s, x) => s + (zahl(f(x)) ?? 0), 0);
const LAND_KURZ = { Deutschland: "DE", Schweiz: "CH", Frankreich: "FR", Österreich: "AT", Italien: "IT", Germany: "DE", Switzerland: "CH", France: "FR", Austria: "AT", Italy: "IT" };

// Spurpunkt: [lat, lon, km/h, Höhe m, l/100 km] – Höhe und Verbrauch können fehlen (null)
const FARBMODI = ["tempo", "verbrauch", "hoehe"];
const SPALTE = { tempo: 2, verbrauch: 4, hoehe: 3 };
const VERBRAUCH_STUFEN = [6, 9, 12, 16];
// Verlauf in Schemafarben (color-mix), niedrig → hoch
const verlauf = (anteil) => {
  const a = Math.max(0, Math.min(1, anteil));
  if (a < 0.5) return `color-mix(in srgb, var(--y-akzent2, #ffd166) ${Math.round(a * 200)}%, var(--y-ok, #3ecf8e))`;
  return `color-mix(in srgb, var(--y-fehler, #ff6b5e) ${Math.round((a - 0.5) * 200)}%, var(--y-akzent2, #ffd166))`;
};
const tempoFarbe = (v) => (v < 50 ? "var(--y-info, #7c3aed)" : v < 90 ? "var(--y-akzent, #c9895b)" : "var(--y-ok, #3ecf8e)");
const GANG_FARBE = { 1: "#5aa9ff", 2: "#4a8fd6", 3: "#4876a8", 4: "#9a6f3c", 5: "#c98a3e", 6: "var(--y-akzent2, #ffd166)", N: "var(--y-rand, #343b4b)", R: "var(--y-fehler, #ff6b5e)" };

class YapaiaReisetagebuchCard extends HTMLElement {
  static getStubConfig() {
    return { ...STANDARD };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "design", selector: { select: { mode: "dropdown", options: window.YapaiaDesign?.optionen() ?? [{ value: "auto", label: t(null, "automatisch") }] } } },
        { name: "preis_l", selector: { number: { min: 0.5, max: 4, step: 0.01, mode: "box", unit_of_measurement: "€/l" } } },
      ],
      computeLabel: (s) => ({ design: t(null, "l_design"), preis_l: t(null, "l_preis_l") })[s.name],
      computeHelper: (s) => ({ preis_l: t(null, "h_preis_l") })[s.name],
    };
  }

  setConfig(config) {
    this._config = { ...STANDARD, ...config };
    this._key = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    DESIGN.then(() => {
      this._key = null;
      this._render();
    });
    this._render();
  }

  set hass(hass) {
    const erst = !this._hass;
    this._hass = hass;
    if (erst) this._start();
    this._render();
  }

  connectedCallback() {
    if (this._hass && !this._abo) this._start();
  }

  disconnectedCallback() {
    this._ende();
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: "full", min_columns: 6, rows: "auto" };
  }

  _start() {
    this._abmelden = false;
    this._ladeTage();
    if (this._abo || !this._hass?.connection?.subscribeEvents) return;
    this._abo = Promise.resolve(
      this._hass.connection.subscribeEvents((ev) => {
        this._ladeTage(ev?.data?.datum);
      }, "yapaia_reisetagebuch_geaendert"),
    ).catch(() => null);
  }

  _ende() {
    const abo = this._abo;
    this._abo = null;
    this._hass_alt = null;
    if (abo) abo.then((f) => typeof f === "function" && f()).catch(() => {});
  }

  async _ladeTage(geaendert) {
    try {
      const r = await this._hass.callWS({ type: "yapaia/reisetagebuch/tage" });
      this._fehler = false;
      this._tage = Array.isArray(r?.tage) ? r.tage : [];
      this._laeuft = !!r?.laeuft;
      const daten = this._tage.map((x) => x.datum);
      if (!this._tag || !daten.includes(this._tag)) {
        let gemerkt = null;
        try { gemerkt = localStorage.getItem(SPEICHER); } catch (e) { /* ohne Speicher */ }
        this._tag = gemerkt && daten.includes(gemerkt) ? gemerkt : daten.at(-1) ?? null;
        this._fahrten = null;
      } else if (geaendert === this._tag || geaendert === undefined) {
        // Anzeige des gewählten Tages auffrischen
      }
      if (this._tag && (this._fahrten === null || this._fahrten === undefined || geaendert === this._tag)) await this._ladeTag();
    } catch (e) {
      this._fehler = true;
    }
    this._key = null;
    this._render();
  }

  async _ladeTag() {
    const tag = this._tag;
    try {
      const r = await this._hass.callWS({ type: "yapaia/reisetagebuch/tag", datum: tag });
      if (tag === this._tag) this._fahrten = Array.isArray(r?.fahrten) ? r.fahrten : [];
    } catch (e) {
      if (tag === this._tag) this._fahrten = [];
    }
  }

  async _blaettern(schritt) {
    const daten = (this._tage ?? []).map((x) => x.datum);
    const i = daten.indexOf(this._tag) + schritt;
    if (i < 0 || i >= daten.length) return;
    this._tag = daten[i];
    try { localStorage.setItem(SPEICHER, this._tag); } catch (e) { /* ohne Speicher */ }
    this._fahrten = null;
    this._key = null;
    this._render();
    await this._ladeTag();
    this._key = null;
    this._render();
  }

  _routeSvg(h, fahrten) {
    const mitSpur = fahrten.filter((f) => Array.isArray(f.spur) && f.spur.length > 1);
    if (!mitSpur.length) return `<div class="leer">${t(h, "keine_spur")}</div>`;
    const pts = mitSpur.flatMap((f) => f.spur);
    const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p[1] * k), ys = pts.map((p) => -p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const W = 800, H = 440, P = 36;
    const s = Math.min((W - 2 * P) / (maxX - minX || 1e-4), (H - 2 * P) / (maxY - minY || 1e-4));
    const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
    const X = (p) => ((p[1] * k - minX) * s + ox).toFixed(1);
    const Y = (p) => ((-p[0] - minY) * s + oy).toFixed(1);
    const hat = (m) => m === "tempo" || pts.some((p) => Array.isArray(p) && zahl(p[SPALTE[m]]) !== null);
    // gewählte Färbung ohne Werte an diesem Tag: Tempo zeigen (Wahl bleibt gemerkt)
    const modus = hat(this._farbmodus()) ? this._farbmodus() : "tempo";
    const spalte = SPALTE[modus];
    const werte = pts.map((p) => zahl(p[spalte])).filter((v) => v !== null);
    const vmin = werte.length ? Math.min(...werte) : 0, vmax = werte.length ? Math.max(...werte) : 1;
    const farbe = (p) => {
      const v = zahl(p[spalte]);
      if (modus === "tempo") return tempoFarbe(v ?? 0);
      if (v === null) return "var(--y-rand, #343b4b)";
      if (modus === "verbrauch") return verlauf(VERBRAUCH_STUFEN.filter((g) => v >= g).length / VERBRAUCH_STUFEN.length);
      return verlauf((v - vmin) / (vmax - vmin || 1));
    };
    let out = "";
    for (const f of mitSpur) {
      const sp = f.spur;
      for (let i = 0; i < sp.length - 1; i++) {
        out += `<line x1="${X(sp[i])}" y1="${Y(sp[i])}" x2="${X(sp[i + 1])}" y2="${Y(sp[i + 1])}" stroke="${farbe(sp[i])}" stroke-width="5" stroke-linecap="round"/>`;
      }
      for (const g of Array.isArray(f.grenzen) ? f.grenzen : []) {
        const pos = paar(g?.pos);
        if (!pos) continue;
        const x = +X(pos), y = +Y(pos);
        const text = g.von && g.nach ? `${t(h, "grenze")} ${LAND_KURZ[g.von] ?? g.von} → ${LAND_KURZ[g.nach] ?? g.nach}` : t(h, "grenze");
        out += `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="var(--y-text, #f2f3f5)" stroke-dasharray="3 3" stroke-width="2"/>
          <text x="${x - 16}" y="${y - 12}" text-anchor="end" fill="var(--y-text-gedaempft, #a9adb8)" font-size="16">${esc(text)}${g.zeit ? " · " + uhr(g.zeit) : ""}</text>`;
      }
      const a = sp[0], e = sp.at(-1);
      out += `<circle cx="${X(a)}" cy="${Y(a)}" r="8" fill="var(--y-text, #f2f3f5)"/><circle cx="${X(e)}" cy="${Y(e)}" r="8" fill="var(--y-akzent, #c9895b)"/>`;
    }
    const a = mitSpur[0].spur[0], e = mitSpur.at(-1).spur.at(-1);
    const lbl = (p, txt) => {
      const x = +X(p), rechts = x > W / 2;
      return `<text x="${x + (rechts ? -14 : 14)}" y="${+Y(p) + 5}" fill="var(--y-text, #f2f3f5)" font-size="17" text-anchor="${rechts ? "end" : "start"}">${esc(txt)}</text>`;
    };
    out += lbl(a, mitSpur[0].von);
    if (Math.hypot(X(a) - X(e), Y(a) - Y(e)) > 40) out += lbl(e, mitSpur.at(-1).nach);
    const knoepfe = `<div class="modi" role="group">${FARBMODI.map((m) =>
      `<button class="modus${m === modus ? " an" : ""}" data-modus="${m}" ${hat(m) ? "" : "disabled"} aria-pressed="${m === modus}">${t(h, "farbe_" + m)}</button>`).join("")}</div>`;
    const nf1 = (v) => Math.round(v).toLocaleString(h?.language === "en" ? "en-GB" : "de-DE");
    const strich = (c, txt) => `<span><i style="background:${c}"></i>${txt}</span>`;
    let legende;
    if (modus === "tempo") {
      legende = strich("var(--y-info, #7c3aed)", t(h, "stadt")) + strich("var(--y-akzent, #c9895b)", t(h, "land")) + strich("var(--y-ok, #3ecf8e)", t(h, "bahn"));
    } else if (!werte.length) {
      legende = `<span>${t(h, "keine_werte")}</span>`;
    } else if (modus === "verbrauch") {
      const g = VERBRAUCH_STUFEN;
      legende = [`< ${g[0]}`, `${g[0]}–${g[1]}`, `${g[1]}–${g[2]}`, `${g[2]}–${g[3]}`, `> ${g[3]} l/100 km`]
        .map((txt, i) => strich(verlauf(i / g.length), txt)).join("");
    } else {
      legende = strich(verlauf(0), `${nf1(vmin)} m`) + strich(verlauf(0.5), `${nf1((vmin + vmax) / 2)} m`) + strich(verlauf(1), `${nf1(vmax)} m`);
    }
    return `${knoepfe}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t(h, "route"))}">${out}</svg>
      <div class="legende">${legende}</div>`;
  }

  _farbmodus() {
    if (!this._modus) {
      let m = null;
      try { m = localStorage.getItem(SPEICHER + "-farbe"); } catch (e) { /* ohne Speicher */ }
      this._modus = FARBMODI.includes(m) ? m : "tempo";
    }
    return this._modus;
  }

  _setzeModus(m) {
    if (!FARBMODI.includes(m) || m === this._modus) return;
    this._modus = m;
    try { localStorage.setItem(SPEICHER + "-farbe", m); } catch (e) { /* ohne Speicher */ }
    this._key = null;
    this._render();
  }

  _gaengeBalken(h, g) {
    const summeG = Object.values(g).reduce((a, b) => a + b, 0) || 1;
    const keys = Object.keys(g).filter((k) => g[k] > 0.2);
    return `<div class="balken">${keys.map((k) => `<div style="width:${(g[k] / summeG) * 100}%;background:${GANG_FARBE[k] ?? "var(--y-info, #7c3aed)"}" title="${esc(k)}: ${nf(h, g[k], 1)} min"></div>`).join("")}</div>
      <div class="lab">${keys.map((k) => `<span>${esc(k)}: ${Math.round((g[k] / summeG) * 100)} %</span>`).join("")}</div>`;
  }

  _inhalt(h, fs) {
    const preis = zahl(this._config.preis_l) ?? STANDARD.preis_l;
    const can = fs.filter((f) => f.quelle === "can");
    const kmVon = (f) => zahl(f.km_tacho) ?? zahl(f.km_gps) ?? 0;
    const km = summe(fs, kmVon);
    // Fahrzeit ohne Pausen (ältere Fahrten ohne fahr_min: Dauer − Standzeit)
    const min = summe(fs, (f) => zahl(f.fahr_min) ?? Math.max(0, (zahl(f.dauer_min) ?? 0) - (zahl(f.steh_min) ?? 0)));
    const steh = summe(fs, (f) => f.steh_min);
    const pause = summe(fs, (f) => zahl(f.pause_min) ?? zahl(f.steh_min) ?? 0);
    const orte = fs.length ? [fs[0].von, ...fs.map((f) => f.nach)].filter((o, i, a) => o && o !== a[i - 1]) : [];
    const kmQuelle = fs.every((f) => zahl(f.km_tacho) !== null) ? t(h, "aus_tacho") : fs.some((f) => zahl(f.km_tacho) !== null) ? `${t(h, "aus_tacho")} / GPS` : t(h, "aus_gps");

    // Verbrauch
    let verbr = `<div class="gross">–</div><div class="unter leer">${t(h, "kein_can")}</div>`;
    const mitVerbr = can.filter((f) => zahl(f.verbrauch_l100) !== null);
    if (mitVerbr.length) {
      const l = summe(mitVerbr, (f) => (f.verbrauch_l100 * kmVon(f)) / 100);
      const kmV = summe(mitVerbr, kmVon);
      const schnitt = kmV ? (l / kmV) * 100 : null;
      const tankA = paar(mitVerbr[0].tank_roh), tankE = paar(mitVerbr.at(-1).tank_roh);
      const tank = tankA && tankE ? ` · ${t(h, "tank")} ${nf(h, tankA[0])} → ${nf(h, tankE[1])}` : "";
      verbr = `<div class="gross">~${nf(h, l, 1)} l · ~${nf(h, l * preis)} €</div>
        <div class="unter">Ø ${nf(h, schnitt, 1)} l/100 km${tank}</div>
        <div class="hinweis">${t(h, "geschaetzt")}${tank ? `; ${t(h, "tank")}: ${t(h, "einheit_offen")}` : ""}</div>`;
    }

    // Fahrstil
    let stil = `<div class="leer">${t(h, "kein_can")}</div>`;
    if (can.length) {
      const gm = {};
      for (const f of can) for (const [k, v] of Object.entries(f.gaenge_min ?? {})) gm[k] = (gm[k] || 0) + (zahl(v) ?? 0);
      const mitTm = can.filter((f) => zahl(f.tempomat_anteil) !== null && zahl(f.dauer_min));
      const dauerTm = summe(mitTm, (f) => f.dauer_min);
      const tm = dauerTm ? summe(mitTm, (f) => f.tempomat_anteil * f.dauer_min) / dauerTm : null;
      const brems = can.filter((f) => zahl(f.bremsungen) !== null), blink = can.filter((f) => zahl(f.blinker) !== null);
      const drz = can.map((f) => zahl(f.drehzahl_max)).filter((v) => v !== null), vm = can.map((f) => zahl(f.vmax)).filter((v) => v !== null);
      stil = (tm !== null ? `<div>${t(h, "tempomat")}: <b>${Math.round(tm * 100)} %</b></div>
        <div class="balken"><div style="width:${tm * 100}%;background:var(--y-ok, #3ecf8e)"></div></div>` : "") +
        (Object.keys(gm).length ? `<div style="margin-top:14px">${t(h, "gaenge")}</div>${this._gaengeBalken(h, gm)}` : "") +
        `<div class="chips">
          ${brems.length ? `<span class="chip">${summe(brems, (f) => f.bremsungen)}${t(h, "gebremst")}</span>` : ""}
          ${blink.length ? `<span class="chip">${summe(blink, (f) => f.blinker)}${t(h, "geblinkt")}</span>` : ""}
          ${drz.length ? `<span class="chip">${t(h, "vmax")} ${nf(h, Math.max(...drz))} U/min</span>` : ""}
          ${vm.length ? `<span class="chip">${t(h, "vmax")} ${nf(h, Math.max(...vm))} km/h</span>` : ""}
          <span class="chip">${t(h, "stand")} ${nf(h, steh)} min</span>
        </div>`;
    }

    // Länder
    const lk = {};
    for (const f of fs) {
      if (f.laender && typeof f.laender === "object") for (const [l, v] of Object.entries(f.laender)) lk[l] = (lk[l] || 0) + (zahl(v) ?? 0);
      else if (f.land_start) lk[f.land_start] = (lk[f.land_start] || 0) + kmVon(f);
    }
    const grenzen = fs.flatMap((f) => (Array.isArray(f.grenzen) ? f.grenzen : [])).filter((g) => g?.zeit);
    const laender = `<div class="gross mittel">${Object.entries(lk).map(([l, v]) => `${esc(LAND_KURZ[l] || l)} ${nf(h, v)} km`).join(" · ") || "–"}</div>
      ${grenzen.map((g) => `<div class="hinweis">${t(h, "grenze_erkannt", { zeit: uhr(g.zeit) })}${g.von && g.nach ? ` (${esc(g.von)} → ${esc(g.nach)})` : ""}</div>`).join("")}`;

    // Fahrzeug
    const zeilen = [];
    const hs = fs.map((f) => paar(f.hoehe)).filter(Boolean);
    if (hs.length) zeilen.push(`${t(h, "hoehe")}: ${nf(h, Math.min(...hs.map((x) => x[0])))}–${nf(h, Math.max(...hs.map((x) => x[1])))} m`);
    const tp = can.map((f) => paar(f.temp)).filter(Boolean);
    if (tp.length) zeilen.push(`${t(h, "temp")}: ${nf(h, Math.min(...tp.map((x) => x[0])))}–${nf(h, Math.max(...tp.map((x) => x[1])))} °C`);
    const bt = can.map((f) => paar(f.batterie)).filter(Boolean);
    if (bt.length) zeilen.push(`${t(h, "batt")}: ${nf(h, Math.min(...bt.map((x) => x[0])), 1)}–${nf(h, Math.max(...bt.map((x) => x[1])), 1)} V`);
    const ks = can.map((f) => paar(f.km_stand)).filter(Boolean);
    if (ks.length) zeilen.push(`${t(h, "kmstand")}: ${nf(h, ks[0][0])} → ${nf(h, ks.at(-1)[1])}`);
    const fahrzeug = zeilen.map((z) => `<div class="zeile">${z}</div>`).join("") + (can.length ? "" : `<div class="hinweis">${t(h, "kein_can")}</div>`);

    const liste = `<table class="fahrten">${fs.map((f) => `<tr><td class="z">${uhr(f.start)}–${uhr(f.ende)}</td><td>${esc(f.von)} → ${esc(f.nach)}</td><td class="z">${nf(h, kmVon(f), 1)} km</td></tr>`).join("")}</table>`;

    return `
      <section class="karte"><div class="t">${t(h, "strecke")}</div><div class="gross">${nf(h, km)} km</div><div class="unter">${orte.map(esc).join(" → ")}</div><div class="hinweis">${kmQuelle}</div></section>
      <section class="karte"><div class="t">${t(h, "zeit")}</div><div class="gross">${hm(min)}${min > 0 ? ` · ${nf(h, km / (min / 60))} km/h` : ""}</div><div class="unter">${t(h, "pausen")} ${hm(pause)} · ${t(h, "n_fahrten", { n: fs.length })}</div></section>
      <section class="karte"><div class="t">${t(h, "verbrauch")}</div>${verbr}</section>
      <section class="karte breit2"><div class="t">${t(h, "route")}</div>${this._routeSvg(h, fs)}</section>
      <section class="karte"><div class="t">${t(h, "stil")}</div>${stil}</section>
      <section class="karte"><div class="t">${t(h, "laender")}</div>${laender}</section>
      <section class="karte"><div class="t">${t(h, "fahrzeug")}</div>${fahrzeug}</section>
      <section class="karte"><div class="t">${t(h, "fahrten")}</div>${liste}</section>`;
  }

  _render() {
    const h = this._hass;
    if (!this._config || !h || !this.shadowRoot) return;
    const yschema = window.YapaiaDesign?.waehle(h, { wahl: this._config.design, quelle: DESIGN_QUELLE }) ?? null;
    const key = JSON.stringify([yschema?.id, spracheVon(h), this._config, this._fehler, this._laeuft, this._tag, this._tage, this._fahrten]);
    if (key === this._key) return;
    this._key = key;

    const tage = (this._tage ?? []).map((x) => x.datum);
    const i = tage.indexOf(this._tag);
    let titel = t(h, "titel");
    if (this._tag) {
      const d = new Date(this._tag + "T12:00");
      titel += ` · ${t(h, "wochentage").split(",")[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
    }
    let inhalt;
    if (this._fehler) inhalt = `<div class="karte leerzustand">${t(h, "fehler")}</div>`;
    else if (this._tage === undefined) inhalt = `<div class="karte leerzustand">${t(h, "laedt")}</div>`;
    else if (!tage.length) inhalt = `<div class="karte leerzustand"><div class="gross mittel">${t(h, "leer")}</div><div class="unter">${t(h, "leer_hinweis")}</div></div>`;
    else if (!this._fahrten) inhalt = `<div class="karte leerzustand">${t(h, "laedt")}</div>`;
    else if (!this._fahrten.length) inhalt = `<div class="karte leerzustand">${t(h, "leer")}</div>`;
    else inhalt = this._inhalt(h, this._fahrten);
    const can = (this._fahrten ?? []).some((f) => f.quelle === "can");
    const quelle = this._fahrten?.length ? t(h, can ? "quelle_can" : "quelle_gps") : "";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { background:var(--y-grund, var(--ha-card-background, var(--card-background-color, #0a0d14))); color:var(--y-text, var(--primary-text-color, #f2f3f5));
          font-family:var(--y-schrift-text, inherit); border-radius:var(--y-radius-klein, var(--ha-card-border-radius, 12px)); box-shadow:var(--y-schatten, var(--ha-card-box-shadow, none)); padding:16px; box-sizing:border-box; }
        * { box-sizing:border-box; }
        header { display:flex; align-items:center; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
        h2 { font-family:var(--y-schrift-anzeige, inherit); font-size:clamp(20px,3vw,28px); margin:0; flex:1; min-width:180px; font-weight:600; }
        .laeuft { background:var(--y-ok, #3ecf8e); color:#fff; border-radius:999px; padding:4px 12px; font-size:13px; font-weight:600; }
        .nav { display:flex; gap:8px; }
        button { background:var(--y-flaeche2, rgba(127,127,127,.15)); color:var(--y-text, var(--primary-text-color, #f2f3f5)); border:1px solid var(--y-rand, rgba(127,127,127,.35));
          border-radius:var(--y-radius-klein, 6px); font-size:20px; min-width:48px; min-height:44px; cursor:pointer; font-family:inherit; }
        button:disabled { opacity:.3; cursor:default; }
        .quelle { color:var(--y-text-gedaempft, #a9adb8); font-size:13px; width:100%; }
        .grid { display:grid; gap:14px; grid-template-columns:repeat(3, minmax(0, 1fr)); }
        .karte { background:var(--y-flaeche, #14161b); border:1px solid var(--y-rand, #343b4b); border-radius:var(--y-radius, 10px); padding:16px 18px; min-width:0; }
        .leerzustand { grid-column:1 / -1; color:var(--y-text-gedaempft, #a9adb8); }
        .t { font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--y-text-gedaempft, #a9adb8); margin-bottom:6px; }
        .gross { font-family:var(--y-schrift-anzeige, inherit); font-size:clamp(24px,2.8vw,36px); font-weight:700; line-height:1.1; font-variant-numeric:tabular-nums; }
        .gross.mittel { font-size:clamp(20px,2.4vw,30px); color:var(--y-text, var(--primary-text-color, #f2f3f5)); }
        .unter { color:var(--y-text-gedaempft, #a9adb8); font-size:14px; margin-top:4px; }
        .breit2 { grid-column:span 2; }
        .leer { color:var(--y-text-gedaempft, #a9adb8); font-style:italic; }
        .zeile { font-size:17px; margin:3px 0; }
        svg { width:100%; height:auto; display:block; }
        .balken { display:flex; height:18px; border-radius:9px; overflow:hidden; background:var(--y-flaeche2, rgba(127,127,127,.15)); margin:6px 0 4px; }
        .balken div { height:100%; }
        .lab { font-size:13px; color:var(--y-text-gedaempft, #a9adb8); display:flex; justify-content:space-between; gap:6px; flex-wrap:wrap; }
        .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
        .chip { background:var(--y-flaeche2, rgba(127,127,127,.15)); border-radius:999px; padding:6px 12px; font-size:14px; }
        .fahrten { width:100%; border-collapse:collapse; font-size:14px; }
        .fahrten td { padding:6px 4px; border-top:1px solid var(--y-rand, #343b4b); }
        .fahrten td.z { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
        .modi { display:inline-flex; gap:0; margin-bottom:8px; border:1px solid var(--y-rand, #343b4b); border-radius:var(--y-radius-klein, 6px); overflow:hidden; }
        .modi .modus { background:transparent; color:var(--y-text-gedaempft, #a9adb8); border:0; border-radius:0; min-height:36px; padding:0 14px; font-size:14px; cursor:pointer; min-width:0; }
        .modi .modus + .modus { border-left:1px solid var(--y-rand, #343b4b); }
        .modi .modus.an { background:var(--y-akzent, #c9895b); color:var(--y-akzent-text, #0a0d14); }
        .modi .modus:disabled { opacity:.35; cursor:default; }
        .legende { display:flex; gap:14px; font-size:13px; color:var(--y-text-gedaempft, #a9adb8); flex-wrap:wrap; margin-top:6px; }
        .legende i { display:inline-block; width:14px; height:4px; border-radius:2px; margin-right:5px; vertical-align:middle; }
        .hinweis { font-size:12px; color:var(--y-text-gedaempft, #a9adb8); margin-top:6px; }
        @media (max-width:900px) { .grid { grid-template-columns:minmax(0, 1fr); } .breit2 { grid-column:auto; } }
      </style>
      <ha-card>
        <header>
          <h2>${esc(titel)}</h2>
          ${this._laeuft ? `<span class="laeuft">${t(h, "laeuft")}</span>` : ""}
          ${tage.length ? `<div class="nav"><button id="zurueck" aria-label="${t(h, "vorheriger")}" ${i <= 0 ? "disabled" : ""}>◀</button><button id="vor" aria-label="${t(h, "naechster")}" ${i < 0 || i >= tage.length - 1 ? "disabled" : ""}>▶</button></div>` : ""}
          ${quelle ? `<div class="quelle">${quelle}</div>` : ""}
        </header>
        <main class="grid">${inhalt}</main>
      </ha-card>`;
    this.shadowRoot.getElementById("zurueck")?.addEventListener("click", () => this._blaettern(-1));
    this.shadowRoot.getElementById("vor")?.addEventListener("click", () => this._blaettern(1));
    this.shadowRoot.querySelectorAll("button[data-modus]").forEach((b) => b.addEventListener("click", () => this._setzeModus(b.dataset.modus)));
    window.YapaiaDesign?.anwenden(this.shadowRoot.querySelector("ha-card"), yschema);
  }
}

if (!customElements.get("yapaia-reisetagebuch-card")) customElements.define("yapaia-reisetagebuch-card", YapaiaReisetagebuchCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((k) => k.type === "yapaia-reisetagebuch-card")) {
  window.customCards.push({
    type: "yapaia-reisetagebuch-card",
    name: "Yapaia Reisetagebuch",
    description: "Fahrten Tag für Tag: Strecke, Route, Verbrauch, Fahrstil, Länder.",
    preview: true,
  });
}
