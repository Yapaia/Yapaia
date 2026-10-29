#!/usr/bin/env python3
"""Design-Schemata → Dateien für Integration, Karten und Home Assistant.

Quelle: design/schemata/<id>.json (Format: design/schema.json, Doku:
docs/design-schemata.md). Erzeugt in integration/custom_components/yapaia/design/:

  www/schemata.json   alle Schemata mit fertigen CSS-Variablen (--y-…) –
                      für Karten, Add-on-Oberflächen und die Integration
  themes/yapaia.yaml  ein Home-Assistant-Theme je Schema („Yapaia Retro“ …),
                      nur auf Wunsch des Anwenders aktiv

    python3 design/erzeugen.py           # Dateien schreiben
    python3 design/erzeugen.py --pruefen # nur prüfen (CI): Schemata gültig, Dateien aktuell?

Nur Standardbibliothek.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HIER = Path(__file__).resolve().parent
QUELLE = HIER / "schemata"
ZIEL = HIER.parent / "integration" / "custom_components" / "yapaia" / "design"

FARBEN = ["grund", "flaeche", "flaeche2", "rand", "text", "text_gedaempft", "akzent", "akzent_text",
          "akzent2", "ok", "warnung", "fehler", "info"]
SCHRIFTEN = ["anzeige", "text", "zahlen"]
FORM = {"radius": int, "radius_klein": int, "rand_breite": int, "schatten": str}
# Schriften ohne Anführungszeichen (generische Familien)
GENERISCH = {"system-ui", "ui-monospace", "ui-serif", "ui-sans-serif", "serif", "sans-serif", "monospace"}
FARBE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
ID = re.compile(r"^[a-z][a-z0-9-]{1,30}$")


class Fehler(Exception):
    pass


def pruefe(s: dict, datei: str) -> None:
    """Prüft ein Schema; wirft Fehler mit verständlicher Meldung."""
    def f(msg: str) -> None:
        raise Fehler(f"{datei}: {msg}")

    if not ID.match(str(s.get("id", ""))):
        f("„id“ fehlt oder ist ungültig (klein, a–z, 0–9, Bindestrich)")
    if Path(datei).stem != s["id"]:
        f(f"Dateiname muss {s['id']}.json heißen")
    for k in ("name", "beschreibung"):
        if not isinstance(s.get(k), str) or not s[k].strip():
            f(f"„{k}“ fehlt")
    if not isinstance(s.get("hell"), bool):
        f("„hell“ muss true oder false sein")
    farben = s.get("farben") or {}
    for k in FARBEN:
        if not FARBE.match(str(farben.get(k, ""))):
            f(f"Farbe „farben.{k}“ fehlt oder ist kein #rrggbb-Wert")
    extra = set(farben) - set(FARBEN)
    if extra:
        f(f"unbekannte Farben: {', '.join(sorted(extra))} (Liste in docs/design-schemata.md)")
    schrift = s.get("schrift") or {}
    for k in SCHRIFTEN:
        t = schrift.get(k) or {}
        if not isinstance(t.get("familie"), str) or not isinstance(t.get("gewicht"), int):
            f(f"„schrift.{k}“ braucht „familie“ (Text) und „gewicht“ (Zahl)")
    if not isinstance(schrift.get("ersatz"), str):
        f("„schrift.ersatz“ fehlt (Ersatzschriften, falls die eigentliche fehlt)")
    form = s.get("form") or {}
    for k, typ in FORM.items():
        if not isinstance(form.get(k), typ):
            f(f"„form.{k}“ fehlt oder hat den falschen Typ")
    if not isinstance(s.get("deko", {}), dict):
        f("„deko“ muss ein Objekt sein")


def familie(t: dict, ersatz: str) -> str:
    name = t["familie"]
    return f"{name if name in GENERISCH else json.dumps(name)}, {ersatz}"


def rgb(farbe: str) -> str:
    h = farbe.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return ", ".join(str(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def leuchtdichte(farbe: str) -> float:
    def kanal(c: int) -> float:
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(x) for x in rgb(farbe).split(", "))
    return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b)


def kontrast(a: str, b: str) -> float:
    la, lb = sorted((leuchtdichte(a), leuchtdichte(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def lesbar_auf(hintergrund: str, *kandidaten: str) -> str:
    """Die erste Schema-Farbe, die auf `hintergrund` gut lesbar ist (4,5 : 1),
    sonst die beste von ihnen oder Schwarz/Weiß, falls die klar besser sind."""
    for k in kandidaten:
        if kontrast(k, hintergrund) >= 4.5:
            return k
    return max([*kandidaten, "#000000", "#ffffff"], key=lambda k: kontrast(k, hintergrund))


def css_variablen(s: dict) -> dict[str, str]:
    """Die CSS-Variablen eines Schemas – das, was Oberflächen benutzen."""
    v: dict[str, str] = {}
    for k in FARBEN:
        v[f"--y-{k.replace('_', '-')}"] = s["farben"][k]
    # RGB-Tripel für halbdurchsichtige Flächen: rgba(var(--y-grund-rgb), .8).
    # color-mix() kennt die WebView des Autoradios (Chrome < 111) nicht.
    for k in ("grund", "flaeche", "flaeche2", "text", "akzent", "akzent_text"):
        v[f"--y-{k.replace('_', '-')}-rgb"] = rgb(s["farben"][k])
    for k in SCHRIFTEN:
        v[f"--y-schrift-{k}"] = familie(s["schrift"][k], s["schrift"]["ersatz"])
        v[f"--y-gewicht-{k}"] = str(s["schrift"][k]["gewicht"])
    v["--y-radius"] = f"{s['form']['radius']}px"
    v["--y-radius-klein"] = f"{s['form']['radius_klein']}px"
    v["--y-rand-breite"] = f"{s['form']['rand_breite']}px"
    v["--y-schatten"] = s["form"]["schatten"]
    deko = s.get("deko") or {}
    f = s["farben"]
    # Abgeleitet (immer da): Text auf dem zweiten Akzent, Seitenspalte und Text darauf
    v["--y-auf-akzent2"] = lesbar_auf(f["akzent2"], f["text"], f["grund"])
    seite = deko.get("seite") if isinstance(deko.get("seite"), str) else f["flaeche2"]
    v["--y-seite"] = seite
    v["--y-seite-text"] = lesbar_auf(seite, f["text"], f["grund"], f["flaeche"], f["akzent_text"])
    v["--y-seite-text-rgb"] = rgb(v["--y-seite-text"])
    for i, farbe in enumerate(deko.get("streifen") or [], 1):
        v[f"--y-streifen-{i}"] = farbe
    lcd = deko.get("lcd")
    if isinstance(lcd, dict):
        for k in ("grund", "text", "leuchten"):
            if lcd.get(k):
                v[f"--y-lcd-{k}"] = lcd[k]
    return v


def ha_theme(s: dict) -> dict[str, str]:
    """Home-Assistant-Theme: HA-Variablen aus den Tokens."""
    f = s["farben"]
    text = familie(s["schrift"]["text"], s["schrift"]["ersatz"])
    radius = f"{s['form']['radius_klein'] if s['form']['radius'] > 20 else s['form']['radius']}px"
    return {
        "primary-color": f["akzent"],
        "accent-color": f["akzent2"],
        "text-primary-color": f["akzent_text"],
        "primary-background-color": f["grund"],
        "secondary-background-color": f["flaeche2"],
        "card-background-color": f["flaeche"],
        "ha-card-background": f["flaeche"],
        "ha-card-border-radius": radius,
        "ha-card-border-color": f["rand"],
        "ha-card-border-width": f"{min(s['form']['rand_breite'], 2)}px",
        "primary-text-color": f["text"],
        "secondary-text-color": f["text_gedaempft"],
        "divider-color": f["rand"],
        "app-header-background-color": f["grund"],
        "app-header-text-color": f["text"],
        "sidebar-background-color": f["flaeche2"],
        "sidebar-text-color": f["text"],
        "sidebar-icon-color": f["text_gedaempft"],
        "sidebar-selected-icon-color": f["akzent"],
        "sidebar-selected-text-color": f["akzent"],
        "state-icon-color": f["text_gedaempft"],
        "state-icon-active-color": f["akzent2"],
        "success-color": f["ok"],
        "warning-color": f["warnung"],
        "error-color": f["fehler"],
        "info-color": f["info"],
        "primary-font-family": text,
        "paper-font-common-base_-_font-family": text,
    }


def laden() -> list[dict]:
    schemata = []
    for datei in sorted(QUELLE.glob("*.json")):
        try:
            s = json.loads(datei.read_text(encoding="utf-8"))
        except ValueError as err:
            raise Fehler(f"{datei.name}: kein gültiges JSON ({err})") from err
        s.pop("$schema", None)
        pruefe(s, datei.name)
        schemata.append(s)
    if not schemata:
        raise Fehler("keine Schemata in design/schemata/")
    return schemata


def yaml_wert(w: str) -> str:
    return json.dumps(w, ensure_ascii=False)


def erzeugen(schemata: list[dict]) -> dict[Path, str]:
    aus = [{**s, "css": css_variablen(s)} for s in schemata]
    dateien = {
        ZIEL / "www" / "schemata.json": json.dumps({"version": 1, "schemata": aus}, ensure_ascii=False, indent=1) + "\n",
    }
    zeilen = ["# Erzeugt von design/erzeugen.py – nicht von Hand ändern.",
              "# Home-Assistant-Themes der Yapaia-Design-Schemata (docs/design-schemata.md)."]
    for s in schemata:
        zeilen.append(f"{yaml_wert('Yapaia ' + s['name'])}:")
        for k, w in ha_theme(s).items():
            zeilen.append(f"  {k}: {yaml_wert(w)}")
    dateien[ZIEL / "themes" / "yapaia.yaml"] = "\n".join(zeilen) + "\n"
    return dateien


def main() -> int:
    pruefen = "--pruefen" in sys.argv
    try:
        dateien = erzeugen(laden())
    except Fehler as err:
        print(f"Fehler: {err}", file=sys.stderr)
        return 1
    veraltet = []
    for pfad, inhalt in dateien.items():
        alt = pfad.read_text(encoding="utf-8") if pfad.exists() else None
        if alt == inhalt:
            continue
        if pruefen:
            veraltet.append(str(pfad.relative_to(HIER.parent)))
        else:
            pfad.parent.mkdir(parents=True, exist_ok=True)
            pfad.write_text(inhalt, encoding="utf-8")
            print(f"geschrieben: {pfad.relative_to(HIER.parent)}")
    if veraltet:
        print("Veraltet – bitte `python3 design/erzeugen.py` ausführen: " + ", ".join(veraltet), file=sys.stderr)
        return 1
    if pruefen:
        print("Design-Schemata gültig, erzeugte Dateien aktuell.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
