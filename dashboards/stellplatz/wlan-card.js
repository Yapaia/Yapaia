/**
 * WLAN – WLANs in der Umgebung suchen und den GL.iNet-Router (Yapaia Router)
 * als Repeater mit einem davon verbinden, etwa dem WLAN eines Campingplatzes.
 * Verlangt das WLAN eine Anmeldung im Browser (Captive Portal), sagt die
 * Karte das und bietet die Anmeldeseite an.
 *
 * Einbinden (Ressource, Typ JavaScript-Modul):
 *   /local/yapaia-dashboards/wlan-card.js
 *
 * Im Dashboard:
 *   type: custom:yapaia-wlan-card
 * Braucht die Integration „Yapaia“ mit einem GL.iNet-Router (Router-Modul ab 0.4.0):
 * Aktionen yapaia.router_wlan_suchen / _verbinden / _trennen.
 */

// Yapaia Design (docs/design-schemata.md); ohne die Integration gelten die HA-Farben
const DESIGN = import("/yapaia_design/yapaia-design.js").then(() => window.YapaiaDesign.bereit).catch(() => null);
const DESIGN_QUELLE = "select.yapaia_router_design";

const STANDARD = {
  name: "WLAN",
  internet: "sensor.yapaia_router_internet",
  anmeldung: "binary_sensor.yapaia_router_wlan_anmeldung",
  // Eine Seite ohne HTTPS: nur so kann das Portal die Anfrage abfangen und
  // seine Anmeldeseite zeigen.
  portal_url: "http://neverssl.com",
};

// Wie lange nach „Verbinden“ auf die Bestätigung des Routers gewartet wird
const WARTEN_S = 60;

// Router-Fehlercode -> Textschlüssel
const FEHLER = {
  wrong_key: "fehler_wrong_key",
  "wrong key": "fehler_wrong_key",
  auth_failed: "fehler_auth_failed",
  not_found: "fehler_not_found",
  dhcp_failed: "fehler_dhcp_failed",
  timeout: "fehler_timeout",
};

// Texte je Sprache (docs/sprachen.md): folgt der HA-Sprache, Deutsch oder sonst Englisch
const TEXTE = {
  de: {
    auto: "Automatisch",
    design: "Design-Schema",
    titel: "Titel",
    internet_sensor: "Sensor „Internet über“ des Routers",
    anmeldung_sensor: "Sensor „WLAN-Anmeldung nötig“",
    portal_adresse: "Adresse zum Öffnen der Anmeldeseite",
    portal_hilfe: "Eine Seite ohne HTTPS, damit das Captive Portal sie abfangen kann.",
    fehler_wrong_key: "Passwort falsch?",
    fehler_auth_failed: "Anmeldung abgelehnt – Passwort falsch?",
    fehler_not_found: "WLAN nicht mehr gefunden",
    fehler_dhcp_failed: "Keine IP-Adresse bekommen",
    fehler_timeout: "Keine Antwort vom WLAN",
    von_4: "{n} von 4",
    suche_fehlgeschlagen: "Suche fehlgeschlagen: {fehler}",
    passwort_eingeben: "Bitte das Passwort eingeben.",
    verbinde_mit: "Verbinde mit „{ssid}“ …",
    verbinden_fehlgeschlagen: "Verbinden fehlgeschlagen: {fehler}",
    getrennt: "WLAN getrennt – Internet läuft jetzt über Mobilfunk (falls vorhanden).",
    trennen_fehlgeschlagen: "Trennen fehlgeschlagen: {fehler}",
    verbunden_anmelden: "Mit „{ssid}“ verbunden – jetzt noch im Browser anmelden (siehe oben).",
    verbunden_mit: "Mit „{ssid}“ verbunden.",
    router_meldet: "Router meldet: {fehler}",
    keine_verbindung: "Der Router hat keine Verbindung gemeldet.",
    netz_grund: "„{ssid}“: {grund}",
    suchen: "Suchen",
    router_nicht_gefunden: "Router nicht gefunden ({entitaet}). Ist die Integration „Yapaia“ mit dem GL.iNet-Router eingerichtet?",
    verbunden: "verbunden",
    verbunden_seit: "verbunden seit {seit}",
    internet_ueber: "Internet über {quelle}",
    trennen: "Trennen",
    nicht_verbunden: "Mit keinem WLAN verbunden",
    portal_titel: "Anmeldung im Browser nötig",
    portal_text1: "Dieses WLAN verlangt eine Anmeldung auf einer Webseite (Captive Portal), etwa mit Zugangscode oder „Bedingungen akzeptieren“. Erst danach gibt es Internet.",
    portal_text2: "Die Seite mit einem Gerät öffnen, das im WLAN des Wohnmobils ist – die Anmeldung gilt dann für alle Geräte.",
    portal_oeffnen: "Anmeldeseite öffnen",
    sucht: "Sucht …",
    neu_suchen: "Neu suchen",
    suchen_hinweis: "„Suchen“ zeigt die WLANs in der Umgebung. Die Suche dauert einige Sekunden.",
    keine_wlans: "Keine WLANs gefunden.",
    gespeichert: "gespeichert",
    zugangspunkte: "{n} Zugangspunkte",
    offen: "offen",
    passwort_gespeichert: "Passwort (leer = gespeichertes)",
    passwort: "Passwort",
    offenes_wlan: "Offenes WLAN – auf Campingplätzen meist mit Anmeldeseite. Nach dem Verbinden zeigt die Karte, ob eine Anmeldung nötig ist.",
    im_router_merken: "Im Router merken",
    verbinden: "Verbinden",
    abbrechen: "Abbrechen",
    kartenbeschreibung: "WLANs in der Umgebung suchen und den GL.iNet-Router damit verbinden – mit Hinweis auf Captive Portals.",
  },
  en: {
    auto: "Automatic",
    design: "Design scheme",
    titel: "Title",
    internet_sensor: "Router sensor “Internet via”",
    anmeldung_sensor: "Sensor “Wi-Fi login required”",
    portal_adresse: "Address to open the login page",
    portal_hilfe: "A page without HTTPS, so the captive portal can intercept it.",
    fehler_wrong_key: "Wrong password?",
    fehler_auth_failed: "Login rejected – wrong password?",
    fehler_not_found: "Wi-Fi no longer found",
    fehler_dhcp_failed: "Could not get an IP address",
    fehler_timeout: "No response from the Wi-Fi",
    von_4: "{n} of 4",
    suche_fehlgeschlagen: "Scan failed: {fehler}",
    passwort_eingeben: "Please enter the password.",
    verbinde_mit: "Connecting to “{ssid}” …",
    verbinden_fehlgeschlagen: "Connecting failed: {fehler}",
    getrennt: "Wi-Fi disconnected – internet now runs over mobile data (if available).",
    trennen_fehlgeschlagen: "Disconnecting failed: {fehler}",
    verbunden_anmelden: "Connected to “{ssid}” – now log in in the browser (see above).",
    verbunden_mit: "Connected to “{ssid}”.",
    router_meldet: "Router reports: {fehler}",
    keine_verbindung: "The router did not report a connection.",
    netz_grund: "“{ssid}”: {grund}",
    suchen: "Scan",
    router_nicht_gefunden: "Router not found ({entitaet}). Is the “Yapaia” integration set up with the GL.iNet router?",
    verbunden: "connected",
    verbunden_seit: "connected since {seit}",
    internet_ueber: "Internet via {quelle}",
    trennen: "Disconnect",
    nicht_verbunden: "Not connected to any Wi-Fi",
    portal_titel: "Browser login required",
    portal_text1: "This Wi-Fi requires a login on a web page (captive portal), e.g. with an access code or “accept terms”. Internet is only available afterwards.",
    portal_text2: "Open the page on a device that is on the motorhome's Wi-Fi – the login then applies to all devices.",
    portal_oeffnen: "Open login page",
    sucht: "Scanning …",
    neu_suchen: "Scan again",
    suchen_hinweis: "“Scan” shows the Wi-Fi networks nearby. The scan takes a few seconds.",
    keine_wlans: "No Wi-Fi networks found.",
    gespeichert: "saved",
    zugangspunkte: "{n} access points",
    offen: "open",
    passwort_gespeichert: "Password (empty = saved one)",
    passwort: "Password",
    offenes_wlan: "Open Wi-Fi – at campsites usually with a login page. After connecting, the card shows whether a login is needed.",
    im_router_merken: "Remember in router",
    verbinden: "Connect",
    abbrechen: "Cancel",
    kartenbeschreibung: "Scan nearby Wi-Fi networks and connect the GL.iNet router to one – with captive portal notice.",
  },
};
const spracheVon = (hass) =>
  String(hass?.locale?.language ?? hass?.language ?? document.querySelector("home-assistant")?.hass?.locale?.language ?? "en")
    .toLowerCase().startsWith("de") ? "de" : "en";
const t = (hass, schluessel, werte = {}) =>
  String(TEXTE[spracheVon(hass)]?.[schluessel] ?? TEXTE.en[schluessel] ?? schluessel).replace(/\{(\w+)\}/g, (_, k) => werte[k] ?? "");
// Zahlen, Datum, Uhrzeit im Format der HA-Sprache
const gebiet = (hass) => hass?.locale?.language ?? hass?.language ?? "de-DE";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const balken = (n, hass) => {
  const b = Number.isFinite(n) ? n : 0;
  return `<span class="balken" title="${t(hass, "von_4", { n: b })}">${[1, 2, 3, 4].map((i) => `<i class="${i <= b ? "an" : ""}" style="height:${i * 25}%"></i>`).join("")}</span>`;
};

class YapaiaWlanCard extends HTMLElement {
  static getStubConfig() {
    return { ...STANDARD };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "design", selector: { select: { mode: "dropdown", options: window.YapaiaDesign?.optionen() ?? [{ value: "auto", label: t(null, "auto") }] } } },
        { name: "name", selector: { text: {} } },
        { name: "internet", required: true, selector: { entity: { domain: "sensor" } } },
        { name: "anmeldung", selector: { entity: { domain: "binary_sensor" } } },
        { name: "portal_url", selector: { text: {} } },
      ],
      computeLabel: (s) =>
        ({
          design: t(null, "design"),
          name: t(null, "titel"),
          internet: t(null, "internet_sensor"),
          anmeldung: t(null, "anmeldung_sensor"),
          portal_url: t(null, "portal_adresse"),
        })[s.name],
      computeHelper: (s) =>
        ({
          portal_url: t(null, "portal_hilfe"),
        })[s.name],
    };
  }

  setConfig(config) {
    this._config = { ...STANDARD, ...config };
    this._netze = null; // null = noch nicht gesucht
    this._sucht = false;
    this._offen = null; // aufgeklapptes WLAN
    this._pw = "";
    this._merken = true;
    this._meldung = null; // {art: ok|warn|fehler|info, text}
    this._verbinde = null; // {ssid, bis}
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (e) => this._klick(e));
      this.shadowRoot.addEventListener("input", (e) => {
        if (e.target.id === "pw") this._pw = e.target.value;
      });
      this.shadowRoot.addEventListener("change", (e) => {
        if (e.target.id === "merken") this._merken = e.target.checked;
      });
      this.shadowRoot.addEventListener("keydown", (e) => {
        if (e.target.id === "pw" && e.key === "Enter") this._verbinden(this._offen);
      });
    }
    this._geruest();
    DESIGN.then(() => {
      this._yschema = undefined;
      if (this._hass) this.hass = this._hass;
    });
  }

  set hass(hass) {
    this._hass = hass;
    const sprache = spracheVon(hass);
    if (sprache !== this._sprache) {
      this._sprache = sprache;
      this._geruest();
    }
    const yschema = window.YapaiaDesign?.waehle(hass, { wahl: this._config.design, quelle: DESIGN_QUELLE }) ?? null;
    if (yschema?.id !== this._yschema) {
      this._yschema = yschema?.id;
      window.YapaiaDesign?.anwenden(this.shadowRoot?.querySelector("ha-card"), yschema);
    }
    this._verbindungPruefen();
    this._statusZeichnen();
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  // ---- Router fragen ------------------------------------------------------

  async _dienst(name, daten = {}) {
    const antwort = await this._hass.connection.sendMessagePromise({
      type: "call_service",
      domain: "yapaia",
      service: `router_${name}`,
      service_data: daten,
      return_response: true,
    });
    // Antwort je Router-Gerät: {"Yapaia Router": {...}} – es gibt einen
    const je = antwort?.response ?? {};
    return Object.values(je)[0] ?? {};
  }

  async _suchen() {
    this._sucht = true;
    this._meldung = null;
    this._listeZeichnen();
    try {
      const r = await this._dienst("wlan_suchen");
      this._netze = r.netze ?? [];
    } catch (err) {
      this._meldung = { art: "fehler", text: t(this._hass, "suche_fehlgeschlagen", { fehler: err.message ?? err }) };
    }
    this._sucht = false;
    this._listeZeichnen();
  }

  async _verbinden(ssid) {
    const netz = (this._netze ?? []).find((n) => n.ssid === ssid);
    if (!netz) return;
    if (netz.verschluesselt && !netz.gespeichert && !this._pw) {
      this._meldung = { art: "warn", text: t(this._hass, "passwort_eingeben") };
      this._listeZeichnen();
      return;
    }
    const daten = { ssid, merken: this._merken };
    if (this._pw) daten.passwort = this._pw;
    if (netz.bssid) daten.bssid = netz.bssid;
    this._meldung = { art: "info", text: t(this._hass, "verbinde_mit", { ssid }) };
    this._verbinde = { ssid, bis: Date.now() + WARTEN_S * 1000, gesehen: false };
    this._offen = null;
    this._pw = "";
    this._listeZeichnen();
    try {
      await this._dienst("wlan_verbinden", daten);
    } catch (err) {
      this._verbinde = null;
      this._meldung = { art: "fehler", text: t(this._hass, "verbinden_fehlgeschlagen", { fehler: err.message ?? err }) };
      this._listeZeichnen();
      return;
    }
    // Falls keine Zustandsänderung mehr kommt: nach Ablauf trotzdem auflösen
    clearTimeout(this._uhr);
    this._uhr = setTimeout(() => this._verbindungPruefen(true), WARTEN_S * 1000 + 500);
  }

  async _trennen() {
    try {
      await this._dienst("wlan_trennen");
      this._meldung = { art: "info", text: t(this._hass, "getrennt") };
    } catch (err) {
      this._meldung = { art: "fehler", text: t(this._hass, "trennen_fehlgeschlagen", { fehler: err.message ?? err }) };
    }
    this._listeZeichnen();
  }

  /** Während „Verbinde …“: hat der Router die Verbindung gemeldet? */
  _verbindungPruefen(abgelaufen = false) {
    const v = this._verbinde;
    if (!v || !this._hass) return;
    const s = this._status();
    if (s.ssid === v.ssid && s.verbunden) {
      this._verbinde = null;
      this._meldung = s.portal
        ? { art: "warn", text: t(this._hass, "verbunden_anmelden", { ssid: v.ssid }) }
        : { art: "ok", text: t(this._hass, "verbunden_mit", { ssid: v.ssid }) };
      if (this._netze) this._netze = this._netze.map((n) => ({ ...n, verbunden: n.ssid === v.ssid, gespeichert: n.gespeichert || n.ssid === v.ssid }));
      this._listeZeichnen();
    } else if (abgelaufen || Date.now() > v.bis) {
      this._verbinde = null;
      const grund = FEHLER[s.fehler]
        ? t(this._hass, FEHLER[s.fehler])
        : s.fehler ? t(this._hass, "router_meldet", { fehler: s.fehler }) : t(this._hass, "keine_verbindung");
      this._meldung = { art: "fehler", text: t(this._hass, "netz_grund", { ssid: v.ssid, grund }) };
      this._listeZeichnen();
    }
  }

  // ---- Zustand aus den Entitäten -----------------------------------------

  _status() {
    const c = this._config;
    const inet = this._hass?.states[c.internet];
    const a = inet?.attributes ?? {};
    const anm = c.anmeldung ? this._hass?.states[c.anmeldung] : null;
    return {
      da: Boolean(inet),
      quelle: inet?.state,
      ssid: a.wlan_ssid ?? null,
      verbunden: Boolean(a.wlan_ssid),
      balken: a.wlan_balken,
      seit: a.wlan_verbunden,
      portal: anm?.state === "on",
      fehler: anm?.attributes?.wlan_fehler ?? null,
    };
  }

  // ---- Zeichnen -----------------------------------------------------------

  _geruest() {
    this._yschema = undefined;
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { background: var(--y-flaeche, var(--ha-card-background, var(--card-background-color, #fff))); color: var(--y-text, var(--primary-text-color));
          font-family: var(--y-schrift-text, inherit); border-radius: var(--y-radius-klein, var(--ha-card-border-radius, 12px)); box-shadow: var(--y-schatten, var(--ha-card-box-shadow, none)); }
        ha-card { padding: 16px; }
        .kopf { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .titel { font-size: 1.2em; font-weight: 500; }
        .zeile { display: flex; align-items: center; gap: 10px; }
        .klein { color: var(--y-text-gedaempft, var(--secondary-text-color)); font-size: 0.9em; }
        button { font: inherit; cursor: pointer; border-radius: 8px; padding: 6px 12px; border: 1px solid var(--y-rand, var(--divider-color));
                 background: var(--y-flaeche, var(--card-background-color)); color: var(--y-text, var(--primary-text-color)); }
        button.haupt { background: var(--y-akzent, var(--primary-color)); color: var(--y-akzent-text, var(--text-primary-color, #fff)); border-color: var(--y-akzent, var(--primary-color)); }
        button:disabled { opacity: 0.5; cursor: default; }
        .status { margin: 12px 0; padding: 10px 12px; border-radius: 10px; background: var(--y-flaeche2, var(--secondary-background-color)); }
        .portal { margin: 12px 0; padding: 12px; border-radius: 10px; background: rgba(230,149,0,0.15); border: 1px solid #e69500; }
        .portal b { display: block; margin-bottom: 4px; }
        .portal button { margin-top: 8px; }
        .meldung { margin: 8px 0; padding: 8px 12px; border-radius: 8px; font-size: 0.95em; }
        .meldung.ok { background: rgba(46,157,79,0.15); }
        .meldung.warn { background: rgba(230,149,0,0.15); }
        .meldung.fehler { background: rgba(217,58,43,0.15); }
        .meldung.info { background: var(--y-flaeche2, var(--secondary-background-color)); }
        ul { list-style: none; margin: 8px 0 0; padding: 0; }
        li { border-top: 1px solid var(--y-rand, var(--divider-color)); }
        .netz { display: flex; align-items: center; gap: 10px; padding: 10px 2px; cursor: pointer; }
        .netz .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .netz .name small { display: block; color: var(--y-text-gedaempft, var(--secondary-text-color)); }
        .marke { font-size: 0.75em; padding: 1px 6px; border-radius: 6px; background: var(--y-flaeche2, var(--secondary-background-color)); margin-left: 4px; }
        .marke.verbunden { background: rgba(46,157,79,0.2); }
        .form { padding: 0 2px 12px; display: grid; gap: 8px; }
        .form input[type=password], .form input[type=text] { font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--y-rand, var(--divider-color));
                 background: var(--y-flaeche, var(--card-background-color)); color: var(--y-text, var(--primary-text-color)); }
        .form label { display: flex; align-items: center; gap: 6px; }
        .balken { display: inline-flex; align-items: flex-end; gap: 2px; height: 16px; width: 22px; }
        .balken i { width: 4px; background: var(--disabled-text-color, #bbb); border-radius: 1px; }
        .balken i.an { background: var(--y-text, var(--primary-text-color)); }
        .schloss { width: 20px; color: var(--y-text-gedaempft, var(--secondary-text-color)); --mdc-icon-size: 18px; }
      </style>
      <ha-card>
        <div class="kopf"><span class="titel"></span><button id="suchen" class="haupt">${t(this._hass, "suchen")}</button></div>
        <div id="status"></div>
        <div id="liste"></div>
      </ha-card>`;
    this._statusKey = null;
    this._listeZeichnen();
  }

  _statusZeichnen() {
    if (!this._hass || !this.shadowRoot) return;
    const c = this._config;
    const s = this._status();
    const key = JSON.stringify([s, c.name, spracheVon(this._hass)]);
    if (key === this._statusKey) return;
    this._statusKey = key;
    this.shadowRoot.querySelector(".titel").textContent = c.name;
    let html;
    if (!s.da) {
      html = `<div class="status">${esc(t(this._hass, "router_nicht_gefunden", { entitaet: c.internet }))}</div>`;
    } else if (s.verbunden) {
      html = `<div class="status zeile">${balken(s.balken, this._hass)}<div><b>${esc(s.ssid)}</b>
        <div class="klein">${s.seit ? esc(t(this._hass, "verbunden_seit", { seit: s.seit })) : t(this._hass, "verbunden")} · ${esc(t(this._hass, "internet_ueber", { quelle: s.quelle ?? "?" }))}</div></div>
        <span style="flex:1"></span><button id="trennen">${t(this._hass, "trennen")}</button></div>`;
    } else {
      html = `<div class="status">${t(this._hass, "nicht_verbunden")} · ${esc(t(this._hass, "internet_ueber", { quelle: s.quelle && s.quelle !== "unknown" ? s.quelle : "–" }))}</div>`;
    }
    if (s.portal) {
      html += `<div class="portal"><b>${t(this._hass, "portal_titel")}</b>
        ${t(this._hass, "portal_text1")}<br>
        ${t(this._hass, "portal_text2")}
        <br><button id="portal" class="haupt">${t(this._hass, "portal_oeffnen")}</button></div>`;
    }
    this.shadowRoot.getElementById("status").innerHTML = html;
  }

  _listeZeichnen() {
    if (!this.shadowRoot) return;
    const knopf = this.shadowRoot.getElementById("suchen");
    knopf.disabled = this._sucht;
    knopf.textContent = this._sucht ? t(this._hass, "sucht") : this._netze ? t(this._hass, "neu_suchen") : t(this._hass, "suchen");
    let html = this._meldung ? `<div class="meldung ${this._meldung.art}">${esc(this._meldung.text)}</div>` : "";
    if (this._netze === null) {
      html += this._sucht ? "" : `<div class="klein">${t(this._hass, "suchen_hinweis")}</div>`;
    } else if (this._netze.length === 0) {
      html += `<div class="klein">${t(this._hass, "keine_wlans")}</div>`;
    } else {
      html += `<ul>${this._netze.map((n) => this._eintrag(n)).join("")}</ul>`;
    }
    this.shadowRoot.getElementById("liste").innerHTML = html;
    const pw = this.shadowRoot.getElementById("pw");
    if (pw) {
      pw.value = this._pw;
      pw.focus();
    }
  }

  _eintrag(n) {
    const marken = [
      n.verbunden ? `<span class="marke verbunden">${t(this._hass, "verbunden")}</span>` : "",
      n.gespeichert && !n.verbunden ? `<span class="marke">${t(this._hass, "gespeichert")}</span>` : "",
    ].join("");
    const info = [n.baender?.join(" + "), n.zugangspunkte > 1 ? t(this._hass, "zugangspunkte", { n: n.zugangspunkte }) : "", n.verschluesselt ? "" : t(this._hass, "offen")]
      .filter(Boolean)
      .join(" · ");
    let form = "";
    if (this._offen === n.ssid && !n.verbunden) {
      const pwFeld = n.verschluesselt
        ? `<input id="pw" type="password" autocomplete="off" placeholder="${t(this._hass, n.gespeichert ? "passwort_gespeichert" : "passwort")}">`
        : `<div class="klein">${t(this._hass, "offenes_wlan")}</div>`;
      form = `<div class="form">${pwFeld}
        <label><input id="merken" type="checkbox" ${this._merken ? "checked" : ""}> ${t(this._hass, "im_router_merken")}</label>
        <div><button class="haupt" data-verbinden="${esc(n.ssid)}" ${this._verbinde ? "disabled" : ""}>${t(this._hass, "verbinden")}</button>
        <button data-zu="1">${t(this._hass, "abbrechen")}</button></div></div>`;
    }
    return `<li><div class="netz" data-netz="${esc(n.ssid)}">
        <span class="schloss">${n.verschluesselt ? `<ha-icon icon="mdi:lock"></ha-icon>` : ""}</span>
        <span class="name">${esc(n.ssid)}${marken}<small>${esc(info)}</small></span>${balken(n.balken, this._hass)}</div>${form}</li>`;
  }

  _klick(e) {
    const ziel = e.target.closest("button, .netz");
    if (!ziel) return;
    if (ziel.id === "suchen") return void this._suchen();
    if (ziel.id === "trennen") return void this._trennen();
    if (ziel.id === "portal") return void window.open(this._config.portal_url, "_blank", "noopener");
    if (ziel.dataset.verbinden !== undefined) return void this._verbinden(ziel.dataset.verbinden);
    if (ziel.dataset.zu) {
      this._offen = null;
      this._pw = "";
      return void this._listeZeichnen();
    }
    if (ziel.dataset.netz !== undefined) {
      const ssid = ziel.dataset.netz;
      this._offen = this._offen === ssid ? null : ssid;
      this._pw = "";
      this._meldung = null;
      this._listeZeichnen();
    }
  }
}

if (!customElements.get("yapaia-wlan-card")) customElements.define("yapaia-wlan-card", YapaiaWlanCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((k) => k.type === "yapaia-wlan-card")) {
  window.customCards.push({
    type: "yapaia-wlan-card",
    name: "Yapaia WLAN",
    description: t(null, "kartenbeschreibung"),
    preview: false,
  });
}
