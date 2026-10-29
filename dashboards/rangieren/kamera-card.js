/**
 * Kamera – Livebild einer Kamera (z. B. Rückfahrkamera). Solange keine Kamera
 * eingetragen oder sie nicht erreichbar ist, steht ein Platzhalter da.
 *
 * Einbinden (Ressource, Typ JavaScript-Modul):
 *   /local/yapaia-dashboards/kamera-card.js
 *
 * Im Dashboard:
 *   type: custom:yapaia-kamera-card
 *   entity: camera.rueckfahrkamera   # optional
 * Alles lässt sich im grafischen Editor einstellen.
 */

// Yapaia Design (docs/design-schemata.md); ohne die Integration gelten die HA-Farben
const DESIGN = import("/yapaia_design/yapaia-design.js").then(() => window.YapaiaDesign.bereit).catch(() => null);
const DESIGN_QUELLE = null;

const STANDARD = {
  name: null, // ohne Angabe: Titel in der HA-Sprache (TEXTE.titel); "" = kein Titel
  entity: "",
  mirror: false,
  aspect_ratio: "16:9",
  placeholder: null, // ohne Angabe: TEXTE.ohne_kamera
};

// Texte je Sprache (docs/sprachen.md): folgt der HA-Sprache, Deutsch oder sonst Englisch
const TEXTE = {
  de: {
    ohne_kamera: "Rückfahrkamera ist noch nicht in Home Assistant eingebunden",
    titel: "Rückfahrkamera",
    automatisch: "Automatisch",
    l_design: "Design-Schema",
    l_name: "Titel",
    l_entity: "Kamera",
    l_aspect_ratio: "Seitenverhältnis",
    l_mirror: "Bild spiegeln",
    l_placeholder: "Text ohne Kamera",
    h_entity: "Leer lassen, solange die Kamera noch fehlt.",
    h_mirror: "Für Rückfahrkameras, die seitenverkehrt liefern.",
    nicht_vorhanden: "{entity} gibt es nicht",
    nicht_erreichbar: "Kamera nicht erreichbar",
  },
  en: {
    ohne_kamera: "Reversing camera is not set up in Home Assistant yet",
    titel: "Reversing camera",
    automatisch: "Automatic",
    l_design: "Design scheme",
    l_name: "Title",
    l_entity: "Camera",
    l_aspect_ratio: "Aspect ratio",
    l_mirror: "Mirror image",
    l_placeholder: "Text without camera",
    h_entity: "Leave empty while the camera is still missing.",
    h_mirror: "For rear cameras that deliver a mirrored image.",
    nicht_vorhanden: "{entity} does not exist",
    nicht_erreichbar: "Camera not reachable",
  },
};
const spracheVon = (hass) =>
  String(hass?.locale?.language ?? hass?.language ?? document.querySelector("home-assistant")?.hass?.locale?.language ?? "en")
    .toLowerCase().startsWith("de") ? "de" : "en";
const t = (hass, schluessel, werte = {}) =>
  String(TEXTE[spracheVon(hass)]?.[schluessel] ?? TEXTE.en[schluessel] ?? schluessel).replace(/\{(\w+)\}/g, (_, k) => werte[k] ?? "");
// Zahlen, Datum, Uhrzeit im Format der HA-Sprache
const gebiet = (hass) => hass?.locale?.language ?? hass?.language ?? "de-DE";

class YapaiaKameraCard extends HTMLElement {
  static getStubConfig() {
    return { ...STANDARD };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "design", selector: { select: { mode: "dropdown", options: window.YapaiaDesign?.optionen() ?? [{ value: "auto", label: t(null, "automatisch") }] } } },
        { name: "name", selector: { text: {} } },
        { name: "entity", selector: { entity: { domain: "camera" } } },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "aspect_ratio", selector: { select: { mode: "dropdown", options: ["16:9", "4:3", "3:2", "1:1"] } } },
            { name: "mirror", selector: { boolean: {} } },
          ],
        },
        { name: "placeholder", selector: { text: {} } },
      ],
      computeLabel: (s) => {
        const k = { design: "l_design", name: "l_name", entity: "l_entity", aspect_ratio: "l_aspect_ratio", mirror: "l_mirror", placeholder: "l_placeholder" }[s.name];
        return k ? t(null, k) : undefined;
      },
      computeHelper: (s) => {
        const k = { entity: "h_entity", mirror: "h_mirror" }[s.name];
        return k ? t(null, k) : undefined;
      },
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
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: "full", min_columns: 6, rows: "auto" };
  }

  disconnectedCallback() {
    // Den MJPEG-Strom beim Verlassen der Ansicht schließen.
    const img = this.shadowRoot?.querySelector("img");
    if (img) img.src = "";
    this._key = null;
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    if (!this._config || !this.shadowRoot) return;
    const c = this._config;
    const st = c.entity ? this._hass?.states?.[c.entity] : undefined;
    const token = st?.attributes?.access_token;
    const bereit = st && token && !["unavailable", "unknown"].includes(st.state);
    const yschema = window.YapaiaDesign?.waehle(this._hass, { wahl: this._config.design, quelle: DESIGN_QUELLE }) ?? null;
    const key = JSON.stringify([yschema?.id, spracheVon(this._hass), c, bereit, token]);
    if (key === this._key || !this.isConnected) return;
    this._key = key;

    const [w, h] = String(c.aspect_ratio || "16:9").split(":").map(Number);
    const verhaeltnis = w && h ? `${w} / ${h}` : "16 / 9";
    const text = !c.entity ? (c.placeholder ?? t(this._hass, "ohne_kamera")) : !st ? t(this._hass, "nicht_vorhanden", { entity: c.entity }) : t(this._hass, "nicht_erreichbar");
    const bild = bereit
      ? `<img src="/api/camera_proxy_stream/${encodeURIComponent(c.entity)}?token=${encodeURIComponent(token)}" alt="${c.name ?? t(this._hass, "titel")}">`
      : `<div class="platzhalter">
           <ha-icon icon="mdi:camera-off-outline"></ha-icon>
           <div>${text}</div>
         </div>`;

    this.shadowRoot.innerHTML = `
      <style>
        ha-card { background: var(--y-flaeche, var(--ha-card-background, var(--card-background-color, #fff))); color: var(--y-text, var(--primary-text-color));
          font-family: var(--y-schrift-text, inherit); border-radius: var(--y-radius-klein, var(--ha-card-border-radius, 12px)); box-shadow: var(--y-schatten, var(--ha-card-box-shadow, none)); }
        ha-card { overflow:hidden; }
        h2 { margin:0; padding:12px 16px; font-size:20px; font-weight:500; color:var(--y-text, var(--primary-text-color)); }
        .rahmen { aspect-ratio:${verhaeltnis}; background:#111; position:relative; }
        img { width:100%; height:100%; object-fit:contain; display:block; ${c.mirror ? "transform:scaleX(-1);" : ""} }
        .platzhalter { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:12px; color:#c8ccd2; text-align:center; padding:16px; font-size:16px;
          background: repeating-linear-gradient(135deg, #1b1d21 0 18px, #212429 18px 36px); }
        .platzhalter ha-icon { --mdc-icon-size:64px; opacity:.7; }
      </style>
      <ha-card>
        ${(c.name ?? t(this._hass, "titel")) ? `<h2>${c.name ?? t(this._hass, "titel")}</h2>` : ""}
        <div class="rahmen">${bild}</div>
      </ha-card>`;
    window.YapaiaDesign?.anwenden(this.shadowRoot.querySelector("ha-card"), yschema);
  }
}

if (!customElements.get("yapaia-kamera-card")) customElements.define("yapaia-kamera-card", YapaiaKameraCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((k) => k.type === "yapaia-kamera-card")) {
  window.customCards.push({
    type: "yapaia-kamera-card",
    name: "Yapaia Kamera",
    description: "Livebild einer Kamera, mit Platzhalter solange sie fehlt.",
    preview: true,
  });
}
