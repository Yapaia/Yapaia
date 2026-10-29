// Lädt die Schriften der Yapaia-Design-Schemata in Home Assistant (nur wenn
// der Anwender das HA-Design gewählt hat; siehe design/__init__.py).
(() => {
  const href = "/yapaia_design/schriften/schriften.css";
  if (!document.querySelector(`link[href="${href}"]`)) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }
})();
