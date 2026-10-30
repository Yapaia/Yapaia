"""Welche Video-Grabber es gibt und welcher Kanal woher kommt.

─── WARUM ZWEI FÄLLE ───────────────────────────────────────────────────────
USB-Grabber mit vier Eingängen gibt es in zwei Bauarten, und das Gehäuse
verrät nicht, welche drinsteckt:

* **Ein Gerät, mehrere Eingänge** (z. B. usbtv/UTV007, stk1160, em28xx): Es
  gibt EIN `/dev/videoN`, und man wählt den Eingang. Gleichzeitig läuft nur
  einer -- vier Bilder auf einmal gibt dieser Chip unter Linux nicht her.
* **Ein Gerät je Eingang**: vier `/dev/videoN`, jedes mit einem Eingang. Dann
  laufen alle Kanäle gleichzeitig.

`zuordnen` entscheidet das aus dem, was der Treiber meldet. Wer es anders
braucht, trägt am Kanal `geraet` und `eingang` selbst ein.
"""

from __future__ import annotations

import glob
import logging
import re
import subprocess
from dataclasses import dataclass, field

from .config import Kanal, Options
from .texte import Meldung

_LOGGER = logging.getLogger(__name__)

TESTGERAET = "test"


@dataclass
class Geraet:
    pfad: str
    treiber: str = ""
    karte: str = ""
    eingaenge: list[str] = field(default_factory=list)
    # Ob der Treiber Fernsehnormen kennt (PAL/NTSC). Webcams (uvcvideo) nicht
    # -- dort darf ffmpeg keine setzen wollen, sonst bricht es ab.
    normen: bool = False

    @property
    def beschreibung(self) -> str:
        teile = [t for t in (self.karte, self.treiber) if t]
        return f"{' · '.join(dict.fromkeys(teile))} ({self.pfad})" if teile else self.pfad


def _v4l2(pfad: str, *args: str) -> str:
    try:
        return subprocess.run(
            ["v4l2-ctl", "-d", pfad, *args], capture_output=True, text=True, timeout=5, check=False
        ).stdout
    except (OSError, subprocess.SubprocessError) as err:
        _LOGGER.debug("v4l2-ctl %s %s: %s", pfad, args, err)
        return ""


def ist_aufnahme(info: str) -> bool:
    """Ob `v4l2-ctl --info` ein Bild-Aufnahmegerät beschreibt.

    Entscheidend sind die `Device Caps` (die des Knotens), nicht die
    `Capabilities` (die des ganzen Treibers): uvcvideo legt neben jedem Bild-
    einen Metadaten-Knoten an, der sonst als zweite Kamera durchginge."""
    teil = info.split("Device Caps", 1)
    caps = teil[1] if len(teil) > 1 else info
    caps = re.split(r"\n\S", caps, maxsplit=1)[0]
    return bool(re.search(r"^\s+Video Capture\s*$", caps, re.M))


def _feld(info: str, name: str) -> str:
    m = re.search(rf"^\s*{re.escape(name)}\s*:\s*(.+)$", info, re.M)
    return m.group(1).strip() if m else ""


def eingaenge_aus(text: str) -> list[str]:
    """Die Eingänge aus `v4l2-ctl --list-inputs`, in Reihenfolge."""
    return [m.group(1).strip() for m in re.finditer(r"^\s*Name\s*:\s*(.+)$", text, re.M)]


def geraete() -> list[Geraet]:
    """Alle Bild-Aufnahmegeräte, nach Nummer sortiert."""
    raus: list[Geraet] = []
    pfade = sorted(glob.glob("/dev/video*"), key=lambda p: int(re.sub(r"\D", "", p) or 0))
    for pfad in pfade:
        info = _v4l2(pfad, "--info")
        if not ist_aufnahme(info):
            continue
        raus.append(
            Geraet(
                pfad=pfad,
                treiber=_feld(info, "Driver name"),
                karte=_feld(info, "Card type"),
                eingaenge=eingaenge_aus(_v4l2(pfad, "--list-inputs")) or ["Eingang 1"],
                normen=bool(re.search(r"^\s*Name\s*:", _v4l2(pfad, "--list-standards"), re.M)),
            )
        )
    return raus


@dataclass
class Quelle:
    """Woher ein Kanal sein Bild bekommt."""

    geraet: str
    eingang: int


def zuordnen(opts: Options, gefunden: list[Geraet]) -> tuple[dict[int, Quelle], list[str]]:
    """Kanal → Quelle, dazu Hinweise für das Protokoll (was nicht passt).

    Reihenfolge:
    1. Am Kanal eingetragen (`geraet`, `eingang`) -- gilt immer.
    2. Testbild: ein gedachtes Gerät mit so vielen Eingängen wie Kanälen,
       damit sich auch das Umschalten ohne Hardware prüfen lässt.
    3. Mehrere Aufnahmegeräte: Kanal 1 → erstes Gerät, Kanal 2 → zweites …
    4. Ein Gerät: Kanal 1 → Eingang 0, Kanal 2 → Eingang 1 …
    """
    hinweise: list[str] = []  # Meldung (str mit Übersetzung)
    raus: dict[int, Quelle] = {}
    if opts.testbild:
        for i, k in enumerate(opts.kanaele):
            raus[k.nummer] = Quelle(k.geraet or TESTGERAET, k.eingang if k.eingang is not None else i)
        return raus, hinweise

    if opts.geraet and opts.geraet != "auto":
        kandidaten = [g for g in gefunden if g.pfad == opts.geraet] or [Geraet(opts.geraet)]
    else:
        kandidaten = gefunden
    nach_pfad = {g.pfad: g for g in gefunden}

    offen: list[Kanal] = []
    for k in opts.kanaele:
        if k.geraet:
            raus[k.nummer] = Quelle(k.geraet, k.eingang or 0)
        else:
            offen.append(k)

    if not offen:
        return raus, hinweise
    if not kandidaten:
        hinweise.append(Meldung("kein_grabber"))
        return raus, hinweise

    if len(kandidaten) > 1:
        for i, k in enumerate(offen):
            if i < len(kandidaten):
                raus[k.nummer] = Quelle(kandidaten[i].pfad, k.eingang or 0)
            else:
                hinweise.append(Meldung("kein_freies_geraet", name=k.name, anzahl=len(kandidaten)))
        return raus, hinweise

    g = kandidaten[0]
    anzahl = len(nach_pfad.get(g.pfad, g).eingaenge) or 1
    for i, k in enumerate(offen):
        eingang = k.eingang if k.eingang is not None else i
        if g.pfad in nach_pfad and eingang >= anzahl:
            hinweise.append(Meldung("eingang_fehlt", name=k.name, eingang=eingang + 1, geraet=g.beschreibung, anzahl=anzahl))
            continue
        raus[k.nummer] = Quelle(g.pfad, eingang)
    return raus, hinweise
