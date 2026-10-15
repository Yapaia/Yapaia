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

const STANDARD = {
  name: "Rückfahrkamera",
  entity: "",
  mirror: false,
  aspect_ratio: "16:9",
  placeholder: "Rückfahrkamera ist noch nicht in Home Assistant eingebunden",
};

class YapaiaKameraCard extends HTMLElement {
  static getStubConfig() {
    return { ...STANDARD };
  }

  static getConfigForm() {
    return {
      schema: [
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
      computeLabel: (s) =>
        ({
          name: "Titel",
          entity: "Kamera",
          aspect_ratio: "Seitenverhältnis",
          mirror: "Bild spiegeln",
          placeholder: "Text ohne Kamera",
        })[s.name],
      computeHelper: (s) =>
        ({
          entity: "Leer lassen, solange die Kamera noch fehlt.",
          mirror: "Für Rückfahrkameras, die seitenverkehrt liefern.",
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
    const key = JSON.stringify([c, bereit, token]);
    if (key === this._key || !this.isConnected) return;
    this._key = key;

    const [w, h] = String(c.aspect_ratio || "16:9").split(":").map(Number);
    const verhaeltnis = w && h ? `${w} / ${h}` : "16 / 9";
    const text = !c.entity ? c.placeholder : !st ? `${c.entity} gibt es nicht` : "Kamera nicht erreichbar";
    const bild = bereit
      ? `<img src="/api/camera_proxy_stream/${encodeURIComponent(c.entity)}?token=${encodeURIComponent(token)}" alt="${c.name || ""}">`
      : `<div class="platzhalter">
           <ha-icon icon="mdi:camera-off-outline"></ha-icon>
           <div>${text}</div>
         </div>`;

    this.shadowRoot.innerHTML = `
      <style>
        ha-card { overflow:hidden; }
        h2 { margin:0; padding:12px 16px; font-size:20px; font-weight:500; color:var(--primary-text-color); }
        .rahmen { aspect-ratio:${verhaeltnis}; background:#111; position:relative; }
        img { width:100%; height:100%; object-fit:contain; display:block; ${c.mirror ? "transform:scaleX(-1);" : ""} }
        .platzhalter { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:12px; color:#c8ccd2; text-align:center; padding:16px; font-size:16px;
          background: repeating-linear-gradient(135deg, #1b1d21 0 18px, #212429 18px 36px); }
        .platzhalter ha-icon { --mdc-icon-size:64px; opacity:.7; }
      </style>
      <ha-card>
        ${c.name ? `<h2>${c.name}</h2>` : ""}
        <div class="rahmen">${bild}</div>
      </ha-card>`;
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
