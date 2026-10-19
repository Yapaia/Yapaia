"""Add-on-Optionen (``/data/options.json``) mit vernünftigen Vorgaben."""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

_LOGGER = logging.getLogger(__name__)

DATA_DIR = Path(os.environ.get("YAPAIA_DATA", "/data"))
APP_DIR = Path(os.environ.get("YAPAIA_APP", "/opt/yapaia"))
VERSION = os.environ.get("YAPAIA_VERSION", "dev")


@dataclass
class Kanal:
    """Ein Kamera-Eingang, so wie der Nutzer ihn benennt.

    `geraet` und `eingang` sind optional: ohne sie ordnet `quellen.zuordnen`
    selbst zu (siehe dort)."""

    nummer: int
    name: str
    geraet: str | None = None
    eingang: int | None = None


@dataclass
class Options:
    log_level: str = "info"
    # Ohne Grabber: ein erzeugtes Bild je Kanal, damit sich alles bis Home
    # Assistant prüfen lässt.
    testbild: bool = False
    # `auto` = das erste Aufnahmegerät, sonst z. B. `/dev/video0`.
    geraet: str = "auto"
    # Analoge Kameras in Europa senden PAL. Ein falscher Standard gibt ein
    # rollendes oder schwarz-weißes Bild.
    norm: str = "PAL"
    aufloesung: str = "720x576"
    bilder_pro_sekunde: int = 25
    # JPEG-Qualität wie bei ffmpeg: 2 = beste, 31 = kleinste.
    qualitaet: int = 5
    # Analoge Kameras senden Halbbilder. Ohne Entflechten zeigt jede Bewegung
    # Kammzacken -- beim Rückwärtsfahren also immer.
    entflechten: bool = True
    # So lange läuft die Aufnahme weiter, nachdem niemand mehr zusieht.
    nachlauf_s: int = 60
    # Die Aufnahme läuft immer -- das Bild der Rückfahrkamera ist dann sofort
    # da statt nach einer Sekunde.
    immer_an: bool = False
    install_integration: bool = True
    kanaele: list[Kanal] = field(default_factory=list)

    @property
    def breite_hoehe(self) -> tuple[int, int]:
        m = re.fullmatch(r"(\d{2,4})x(\d{2,4})", self.aufloesung.strip())
        return (int(m.group(1)), int(m.group(2))) if m else (720, 576)


STANDARD_KANAELE = [Kanal(1, "Rückfahrkamera"), Kanal(2, "Kamera 2"), Kanal(3, "Kamera 3"), Kanal(4, "Kamera 4")]


def _kanaele(raw: Any) -> list[Kanal]:
    if not isinstance(raw, list) or not raw:
        return [Kanal(k.nummer, k.name) for k in STANDARD_KANAELE]
    raus: list[Kanal] = []
    for i, k in enumerate(raw, start=1):
        if not isinstance(k, dict):
            continue
        name = str(k.get("name") or f"Kamera {i}").strip() or f"Kamera {i}"
        geraet = str(k.get("geraet") or "").strip() or None
        eingang = k.get("eingang")
        raus.append(
            Kanal(i, name, geraet, int(eingang) if isinstance(eingang, (int, float)) and eingang >= 0 else None)
        )
    return raus or [Kanal(k.nummer, k.name) for k in STANDARD_KANAELE]


def load_options(pfad: Path | None = None) -> Options:
    path = pfad or DATA_DIR / "options.json"
    opts = Options()
    try:
        raw = json.loads(path.read_text())
    except FileNotFoundError:
        _LOGGER.warning("%s fehlt, nehme die Vorgaben", path)
        raw = {}
    except ValueError as err:
        _LOGGER.error("%s nicht lesbar: %s", path, err)
        raw = {}
    for name in (
        "log_level", "testbild", "geraet", "norm", "aufloesung", "bilder_pro_sekunde",
        "qualitaet", "entflechten", "nachlauf_s", "immer_an", "install_integration",
    ):  # fmt: skip
        if name in raw and raw[name] is not None:
            try:
                setattr(opts, name, type(getattr(opts, name))(raw[name]))
            except (TypeError, ValueError):
                _LOGGER.warning("Ungültiger Wert für %s: %r", name, raw[name])
    opts.kanaele = _kanaele(raw.get("kanaele"))
    return opts
