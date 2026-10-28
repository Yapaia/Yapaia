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

const FEHLER = {
  wrong_key: "Passwort falsch?",
  "wrong key": "Passwort falsch?",
  auth_failed: "Anmeldung abgelehnt – Passwort falsch?",
  not_found: "WLAN nicht mehr gefunden",
  dhcp_failed: "Keine IP-Adresse bekommen",
  timeout: "Keine Antwort vom WLAN",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const balken = (n) => {
  const b = Number.isFinite(n) ? n : 0;
  return `<span class="balken" title="${b} von 4">${[1, 2, 3, 4].map((i) => `<i class="${i <= b ? "an" : ""}" style="height:${i * 25}%"></i>`).join("")}</span>`;
};

class YapaiaWlanCard extends HTMLElement {
  static getStubConfig() {
    return { ...STANDARD };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "name", selector: { text: {} } },
        { name: "internet", required: true, selector: { entity: { domain: "sensor" } } },
        { name: "anmeldung", selector: { entity: { domain: "binary_sensor" } } },
        { name: "portal_url", selector: { text: {} } },
      ],
      computeLabel: (s) =>
        ({
          name: "Titel",
          internet: "Sensor „Internet über“ des Routers",
          anmeldung: "Sensor „WLAN-Anmeldung nötig“",
          portal_url: "Adresse zum Öffnen der Anmeldeseite",
        })[s.name],
      computeHelper: (s) =>
        ({
          portal_url: "Eine Seite ohne HTTPS, damit das Captive Portal sie abfangen kann.",
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
  }

  set hass(hass) {
    this._hass = hass;
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
      this._meldung = { art: "fehler", text: `Suche fehlgeschlagen: ${err.message ?? err}` };
    }
    this._sucht = false;
    this._listeZeichnen();
  }

  async _verbinden(ssid) {
    const netz = (this._netze ?? []).find((n) => n.ssid === ssid);
    if (!netz) return;
    if (netz.verschluesselt && !netz.gespeichert && !this._pw) {
      this._meldung = { art: "warn", text: "Bitte das Passwort eingeben." };
      this._listeZeichnen();
      return;
    }
    const daten = { ssid, merken: this._merken };
    if (this._pw) daten.passwort = this._pw;
    if (netz.bssid) daten.bssid = netz.bssid;
    this._meldung = { art: "info", text: `Verbinde mit „${ssid}“ …` };
    this._verbinde = { ssid, bis: Date.now() + WARTEN_S * 1000, gesehen: false };
    this._offen = null;
    this._pw = "";
    this._listeZeichnen();
    try {
      await this._dienst("wlan_verbinden", daten);
    } catch (err) {
      this._verbinde = null;
      this._meldung = { art: "fehler", text: `Verbinden fehlgeschlagen: ${err.message ?? err}` };
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
      this._meldung = { art: "info", text: "WLAN getrennt – Internet läuft jetzt über Mobilfunk (falls vorhanden)." };
    } catch (err) {
      this._meldung = { art: "fehler", text: `Trennen fehlgeschlagen: ${err.message ?? err}` };
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
        ? { art: "warn", text: `Mit „${v.ssid}“ verbunden – jetzt noch im Browser anmelden (siehe oben).` }
        : { art: "ok", text: `Mit „${v.ssid}“ verbunden.` };
      if (this._netze) this._netze = this._netze.map((n) => ({ ...n, verbunden: n.ssid === v.ssid, gespeichert: n.gespeichert || n.ssid === v.ssid }));
      this._listeZeichnen();
    } else if (abgelaufen || Date.now() > v.bis) {
      this._verbinde = null;
      const grund = FEHLER[s.fehler] ?? (s.fehler ? `Router meldet: ${s.fehler}` : "Der Router hat keine Verbindung gemeldet.");
      this._meldung = { art: "fehler", text: `„${v.ssid}“: ${grund}` };
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
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 16px; }
        .kopf { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .titel { font-size: 1.2em; font-weight: 500; }
        .zeile { display: flex; align-items: center; gap: 10px; }
        .klein { color: var(--secondary-text-color); font-size: 0.9em; }
        button { font: inherit; cursor: pointer; border-radius: 8px; padding: 6px 12px; border: 1px solid var(--divider-color);
                 background: var(--card-background-color); color: var(--primary-text-color); }
        button.haupt { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
        button:disabled { opacity: 0.5; cursor: default; }
        .status { margin: 12px 0; padding: 10px 12px; border-radius: 10px; background: var(--secondary-background-color); }
        .portal { margin: 12px 0; padding: 12px; border-radius: 10px; background: rgba(230,149,0,0.15); border: 1px solid #e69500; }
        .portal b { display: block; margin-bottom: 4px; }
        .portal button { margin-top: 8px; }
        .meldung { margin: 8px 0; padding: 8px 12px; border-radius: 8px; font-size: 0.95em; }
        .meldung.ok { background: rgba(46,157,79,0.15); }
        .meldung.warn { background: rgba(230,149,0,0.15); }
        .meldung.fehler { background: rgba(217,58,43,0.15); }
        .meldung.info { background: var(--secondary-background-color); }
        ul { list-style: none; margin: 8px 0 0; padding: 0; }
        li { border-top: 1px solid var(--divider-color); }
        .netz { display: flex; align-items: center; gap: 10px; padding: 10px 2px; cursor: pointer; }
        .netz .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .netz .name small { display: block; color: var(--secondary-text-color); }
        .marke { font-size: 0.75em; padding: 1px 6px; border-radius: 6px; background: var(--secondary-background-color); margin-left: 4px; }
        .marke.verbunden { background: rgba(46,157,79,0.2); }
        .form { padding: 0 2px 12px; display: grid; gap: 8px; }
        .form input[type=password], .form input[type=text] { font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--divider-color);
                 background: var(--card-background-color); color: var(--primary-text-color); }
        .form label { display: flex; align-items: center; gap: 6px; }
        .balken { display: inline-flex; align-items: flex-end; gap: 2px; height: 16px; width: 22px; }
        .balken i { width: 4px; background: var(--disabled-text-color, #bbb); border-radius: 1px; }
        .balken i.an { background: var(--primary-text-color); }
        .schloss { width: 20px; color: var(--secondary-text-color); --mdc-icon-size: 18px; }
      </style>
      <ha-card>
        <div class="kopf"><span class="titel"></span><button id="suchen" class="haupt">Suchen</button></div>
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
    const key = JSON.stringify([s, c.name]);
    if (key === this._statusKey) return;
    this._statusKey = key;
    this.shadowRoot.querySelector(".titel").textContent = c.name;
    let html;
    if (!s.da) {
      html = `<div class="status">Router nicht gefunden (${esc(c.internet)}). Ist die Integration „Yapaia“ mit dem GL.iNet-Router eingerichtet?</div>`;
    } else if (s.verbunden) {
      html = `<div class="status zeile">${balken(s.balken)}<div><b>${esc(s.ssid)}</b>
        <div class="klein">verbunden${s.seit ? ` seit ${esc(s.seit)}` : ""} · Internet über ${esc(s.quelle ?? "?")}</div></div>
        <span style="flex:1"></span><button id="trennen">Trennen</button></div>`;
    } else {
      html = `<div class="status">Mit keinem WLAN verbunden · Internet über ${esc(s.quelle && s.quelle !== "unknown" ? s.quelle : "–")}</div>`;
    }
    if (s.portal) {
      html += `<div class="portal"><b>Anmeldung im Browser nötig</b>
        Dieses WLAN verlangt eine Anmeldung auf einer Webseite (Captive Portal), etwa mit Zugangscode oder
        „Bedingungen akzeptieren“. Erst danach gibt es Internet.<br>
        Die Seite mit einem Gerät öffnen, das im WLAN des Wohnmobils ist – die Anmeldung gilt dann für alle Geräte.
        <br><button id="portal" class="haupt">Anmeldeseite öffnen</button></div>`;
    }
    this.shadowRoot.getElementById("status").innerHTML = html;
  }

  _listeZeichnen() {
    if (!this.shadowRoot) return;
    const knopf = this.shadowRoot.getElementById("suchen");
    knopf.disabled = this._sucht;
    knopf.textContent = this._sucht ? "Sucht …" : this._netze ? "Neu suchen" : "Suchen";
    let html = this._meldung ? `<div class="meldung ${this._meldung.art}">${esc(this._meldung.text)}</div>` : "";
    if (this._netze === null) {
      html += this._sucht ? "" : `<div class="klein">„Suchen“ zeigt die WLANs in der Umgebung. Die Suche dauert einige Sekunden.</div>`;
    } else if (this._netze.length === 0) {
      html += `<div class="klein">Keine WLANs gefunden.</div>`;
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
      n.verbunden ? `<span class="marke verbunden">verbunden</span>` : "",
      n.gespeichert && !n.verbunden ? `<span class="marke">gespeichert</span>` : "",
    ].join("");
    const info = [n.baender?.join(" + "), n.zugangspunkte > 1 ? `${n.zugangspunkte} Zugangspunkte` : "", n.verschluesselt ? "" : "offen"]
      .filter(Boolean)
      .join(" · ");
    let form = "";
    if (this._offen === n.ssid && !n.verbunden) {
      const pwFeld = n.verschluesselt
        ? `<input id="pw" type="password" autocomplete="off" placeholder="${n.gespeichert ? "Passwort (leer = gespeichertes)" : "Passwort"}">`
        : `<div class="klein">Offenes WLAN – auf Campingplätzen meist mit Anmeldeseite. Nach dem Verbinden zeigt die Karte, ob eine Anmeldung nötig ist.</div>`;
      form = `<div class="form">${pwFeld}
        <label><input id="merken" type="checkbox" ${this._merken ? "checked" : ""}> Im Router merken</label>
        <div><button class="haupt" data-verbinden="${esc(n.ssid)}" ${this._verbinde ? "disabled" : ""}>Verbinden</button>
        <button data-zu="1">Abbrechen</button></div></div>`;
    }
    return `<li><div class="netz" data-netz="${esc(n.ssid)}">
        <span class="schloss">${n.verschluesselt ? `<ha-icon icon="mdi:lock"></ha-icon>` : ""}</span>
        <span class="name">${esc(n.ssid)}${marken}<small>${esc(info)}</small></span>${balken(n.balken)}</div>${form}</li>`;
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
    description: "WLANs in der Umgebung suchen und den GL.iNet-Router damit verbinden – mit Hinweis auf Captive Portals.",
    preview: false,
  });
}
