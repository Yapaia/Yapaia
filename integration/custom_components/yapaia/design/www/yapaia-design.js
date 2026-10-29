/**
 * Yapaia Design – Hilfe für Karten und Oberflächen (docs/design-schemata.md).
 *
 *   await import("/yapaia_design/yapaia-design.js");
 *   const schema = await window.YapaiaDesign.schema(hass, "go_ab12" | null, wahl?);
 *   window.YapaiaDesign.anwenden(element, schema);   // setzt --y-… auf dem Element
 *   const weg = window.YapaiaDesign.beobachten(hass, () => neu zeichnen);
 *
 * `wahl`: ein fest eingestelltes Schema (id) der Karte; leer/„auto" = was die
 * Integration für dieses Modul bzw. gesamt vorgibt.
 */
(() => {
  if (window.YapaiaDesign) return;
  const BASIS = "/yapaia_design";
  let schemataPromise = null;
  let standPromise = null;

  const schemata = () =>
    (schemataPromise ??= fetch(`${BASIS}/schemata.json`).then((r) => r.json()).then((j) => j.schemata));

  const stand = (hass) =>
    (standPromise ??= hass.connection.sendMessagePromise({ type: "yapaia/design" }).catch(() => null));

  async function schema(hass, modul = null, wahl = null) {
    const alle = await schemata();
    let id = wahl && wahl !== "auto" ? wahl : null;
    if (!id && hass) {
      const s = await stand(hass);
      id = (modul && s?.module?.[modul]) || s?.gesamt;
    }
    return alle.find((x) => x.id === id) ?? alle.find((x) => x.id === "retro") ?? alle[0];
  }

  function anwenden(el, s) {
    if (!el || !s) return;
    for (const [k, v] of Object.entries(s.css)) el.style.setProperty(k, v);
    el.dataset.ySchema = s.id;
    el.dataset.yHell = String(s.hell);
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

  function beobachten(hass, fn) {
    let weg = null;
    hass.connection
      .subscribeEvents(() => {
        standPromise = null;
        fn();
      }, "yapaia_design_geaendert")
      .then((u) => (weg = u))
      .catch(() => {});
    return () => weg?.();
  }

  window.YapaiaDesign = { schema, schemata, anwenden, schriften, beobachten };
})();
