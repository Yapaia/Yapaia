/**
 * Yapaia Design – Hilfe für Karten und Oberflächen (docs/design-schemata.md).
 *
 *   import("/yapaia_design/yapaia-design.js").then(() => window.YapaiaDesign.bereit);
 *   const s = window.YapaiaDesign.waehle(hass, { wahl: config.design, quelle: "select.yapaia_go_design" });
 *   window.YapaiaDesign.anwenden(element, s);   // setzt --y-… und data-y-… am Element
 *
 * Welches Schema gilt (synchron, aus den Zuständen in `hass` – ändert sich
 * eine Auswahl, zeichnet die Karte ohnehin neu):
 *   1. `wahl` – fest an der Karte eingestellt (eine Schema-ID; leer/„auto" = nicht gesetzt)
 *   2. `quelle` – Auswahl „Design" des zugehörigen Moduls (Attribut `gilt`)
 *   3. `select.yapaia_design_schema` – das Gesamt-Schema
 */
(() => {
  if (window.YapaiaDesign) return;
  const BASIS = "/yapaia_design";
  const GESAMT = "select.yapaia_design_schema";
  let liste = [];

  const bereit = fetch(`${BASIS}/schemata.json`)
    .then((r) => r.json())
    .then((j) => (liste = j.schemata))
    .catch(() => (liste = []));

  function waehle(hass, { wahl = null, quelle = null } = {}) {
    if (!liste.length) return null;
    const finde = (x) => liste.find((s) => s.id === x || s.name === x);
    const st = hass?.states ?? {};
    return (
      (wahl && wahl !== "auto" && finde(wahl)) ||
      (quelle && finde(st[quelle]?.attributes?.gilt)) ||
      finde(st[GESAMT]?.state) ||
      finde("retro") ||
      liste[0]
    );
  }

  function anwenden(el, s) {
    if (!el || !s) return;
    for (const [k, v] of Object.entries(s.css)) el.style.setProperty(k, v);
    const deko = s.deko || {};
    el.dataset.ySchema = s.id;
    el.dataset.yHell = String(s.hell);
    el.dataset.yStreifen = String(Array.isArray(deko.streifen) && deko.streifen.length > 0);
    el.dataset.yHoehenlinien = String(!!deko.hoehenlinien);
    el.dataset.yHolz = String(!!deko.holz);
    el.dataset.yLcd = String(!!deko.lcd);
    schriften();
  }

  function schriften() {
    const href = `${BASIS}/schriften/schriften.css`;
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }

  /** Auswahl für Karten-Editoren: auto + alle Schemata. */
  function optionen() {
    const de = String(document.querySelector("home-assistant")?.hass?.locale?.language ?? "en").startsWith("de");
    return [{ value: "auto", label: de ? "Automatisch (wie eingestellt)" : "Automatic (as set)" }, ...liste.map((s) => ({ value: s.id, label: s.name }))];
  }

  window.YapaiaDesign = { bereit, waehle, anwenden, schriften, optionen, liste: () => liste };
})();
