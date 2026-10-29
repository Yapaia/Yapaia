#!/usr/bin/env python3
"""Lädt die Schriften der Design-Schemata einmalig von Google Fonts.

Sie liegen danach in der Integration (design/www/schriften/) und werden von
dort ausgeliefert -- im Wohnmobil gibt es nicht immer Internet. Alle stehen
unter der SIL Open Font License 1.1 (OFL.txt daneben).

    python3 design/schriften_holen.py

Nur nötig, wenn eine Schrift dazukommt (SCHRIFTEN unten ergänzen).
"""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path

ZIEL = Path(__file__).resolve().parent.parent / "integration" / "custom_components" / "yapaia" / "design" / "www" / "schriften"
# Familie → Achsen im css2-Format (variable Schriften: ein Bereich statt vieler Dateien)
SCHRIFTEN = {
    "Fraunces": "opsz,wght@9..144,400..900",
    "DM Sans": "wght@400..700",
    "Instrument Serif": "ital@0;1",
    "Inter": "wght@400..700",
}
# Nur westeuropäische Zeichen (latin, latin-ext): hält die Dateien klein
UNTERMENGEN = ("latin", "latin-ext")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def holen(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
        return r.read()


def main() -> None:
    ZIEL.mkdir(parents=True, exist_ok=True)
    css_aus = ["/* Erzeugt von design/schriften_holen.py – SIL Open Font License 1.1, siehe OFL.txt */"]
    for familie, achsen in SCHRIFTEN.items():
        css = holen(f"https://fonts.googleapis.com/css2?family={familie.replace(' ', '+')}:{achsen}&display=swap").decode()
        for teil, block in re.findall(r"/\* ([a-z-]+) \*/\s*(@font-face \{.*?\})", css, re.S):
            if teil not in UNTERMENGEN:
                continue
            url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
            stil = "italic" if "font-style: italic" in block else "normal"
            name = f"{familie.lower().replace(' ', '-')}-{stil}-{teil}.woff2"
            (ZIEL / name).write_bytes(holen(url))
            css_aus.append(block.replace(url, name))
            print(f"{name}: {(ZIEL / name).stat().st_size // 1024} KB")
    (ZIEL / "schriften.css").write_text("\n".join(css_aus) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
