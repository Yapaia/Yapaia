"""Somagic SMI2021CBE (EasyCAP002 „4CH USB DVR“, EasyCAP DC60).

─── WARUM DAS EINEN EIGENEN WEG BRAUCHT ─────────────────────────────────────
Für diesen Chip gibt es keinen Treiber im Linux-Kernel -- auch nicht in Home
Assistant OS. Es gibt also kein `/dev/videoN`. Stattdessen sprechen die
Programme von easycap-somagic-linux (GPL) den Stick über libusb an:

* `somagic-init` lädt die Firmware. Ohne sie meldet sich der Stick als
  `1c88:0007` („no firmware“), danach als `1c88:003c` (DC60) oder
  `1c88:003e`/`1c88:003f` (EasyCAP002, vier Eingänge).
* `somagic-capture` liefert das Bild als rohes UYVY auf stdout; ffmpeg macht
  daraus JPEGs wie bei jedem anderen Grabber.

─── DIE FIRMWARE ───────────────────────────────────────────────────────────
Sie steckt im Windows-Treiber (`SmiUsbGrabber3E.sys` oder `…3F.sys`, auf der
CD zum Stick) und darf nicht mit Yapaia verteilt werden. Vision holt sie
deshalb aus einer Datei, die der Nutzer bereitstellt -- hochgeladen auf der
Seite des Add-ons oder abgelegt in `/share/yapaia-vision/` -- und prüft sie
mit `somagic-extract-firmware` (CRC). Ein Installationsprogramm (`Setup.exe`,
`.zip`, `.cab`) wird vorher mit 7-Zip ausgepackt.

─── PROXMOX ────────────────────────────────────────────────────────────────
Nach dem Laden der Firmware meldet sich der Stick mit einer NEUEN Kennung
neu an. Wer ihn in Proxmox nach Kennung (`1c88:0007`) durchreicht, verliert
ihn in diesem Moment -- er muss nach USB-Anschluss durchgereicht werden.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from .config import DATA_DIR
from .quellen import Geraet

_LOGGER = logging.getLogger(__name__)

HERSTELLER = "1c88"
OHNE_FIRMWARE = "0007"
DC60 = "003c"
EASYCAP002 = ("003e", "003f")
PFAD = "somagic"
FIRMWARE = DATA_DIR / "somagic_firmware.bin"
SUCHORDNER = Path("/share/yapaia-vision")
SYSFS = Path("/sys/bus/usb/devices")


def usb_kennung(sysfs: Path = SYSFS) -> str | None:
    """Die Produktkennung des ersten Somagic-Sticks (`0007`, `003f` …) oder `None`."""
    for geraet in sorted(sysfs.glob("*")):
        try:
            if (geraet / "idVendor").read_text().strip() == HERSTELLER:
                return (geraet / "idProduct").read_text().strip()
        except OSError:
            continue
    return None


def geraet(kennung: str | None) -> Geraet | None:
    """Der Stick als Aufnahmegerät -- erst NACH dem Laden der Firmware."""
    if kennung in EASYCAP002:
        return Geraet(PFAD, "somagic", "EasyCAP002 (SMI2021CBE)", [f"CVBS {i}" for i in range(1, 5)], normen=True)
    if kennung == DC60:
        return Geraet(PFAD, "somagic", "EasyCAP DC60 (SMI2021CBE)", ["CVBS", "S-Video"], normen=True)
    return None


def _ausfuehren(befehl: list[str], timeout: float = 60) -> tuple[bool, str]:
    try:
        r = subprocess.run(befehl, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError) as err:
        return False, str(err)
    return r.returncode == 0, (r.stderr or r.stdout).strip()


def _treiberdateien(ordner: Path) -> list[Path]:
    # 3F/3E (EasyCAP002) vor 3C (DC60); die Firmware ist für beide Modelle
    # gleich aufgebaut, somagic-init nimmt jede gültige.
    dateien = [p for p in ordner.rglob("*") if p.is_file() and p.name.lower().startswith("smiusbgrabber")]
    return sorted(dateien, key=lambda p: (p.suffix.lower() != ".sys", "3c" in p.name.lower(), str(p)))


def extrahieren(datei: Path, ziel: Path = FIRMWARE) -> tuple[bool, str]:
    """Firmware aus einem Treiber (`.sys`) oder einem Installationsprogramm holen."""
    kandidaten = [datei] if datei.suffix.lower() == ".sys" else []
    tmp: Path | None = None
    if not kandidaten:
        tmp = Path(tempfile.mkdtemp(prefix="somagic-"))
        ok, text = _ausfuehren(["7z", "x", "-y", f"-o{tmp}", str(datei)], timeout=120)
        if not ok:
            shutil.rmtree(tmp, ignore_errors=True)
            return False, f"{datei.name} lässt sich nicht auspacken: {text.splitlines()[-1] if text else '?'}"
        kandidaten = _treiberdateien(tmp)
        if not kandidaten:
            shutil.rmtree(tmp, ignore_errors=True)
            return False, f"In {datei.name} steckt kein SmiUsbGrabber-Treiber"
    try:
        letzter = ""
        for k in kandidaten:
            ziel.parent.mkdir(parents=True, exist_ok=True)
            ok, letzter = _ausfuehren(["somagic-extract-firmware", "-f", str(ziel), str(k)])
            if ok and ziel.is_file():
                _LOGGER.info("Firmware aus %s gewonnen", k.name)
                return True, f"Firmware aus {k.name} übernommen"
        ziel.unlink(missing_ok=True)
        return False, f"Keine gültige Firmware gefunden ({letzter.splitlines()[-1] if letzter else '?'})"
    finally:
        if tmp is not None:
            shutil.rmtree(tmp, ignore_errors=True)


def firmware_suchen() -> tuple[bool, str | None]:
    """Firmware vorhanden? Sonst in `/share/yapaia-vision/` nach einer Quelle suchen."""
    if FIRMWARE.is_file():
        return True, None
    if SUCHORDNER.is_dir():
        for datei in sorted(p for p in SUCHORDNER.iterdir() if p.is_file()):
            ok, text = extrahieren(datei)
            if ok:
                return True, text
            _LOGGER.warning("%s", text)
    return False, (
        "Der EasyCAP braucht die Firmware aus seinem Windows-Treiber: SmiUsbGrabber3F.sys oder "
        "SmiUsbGrabber3E.sys (auf der CD zum Stick, auch Setup.exe geht) auf der Seite von "
        "Yapaia Vision hochladen oder nach /share/yapaia-vision/ legen."
    )


async def vorbereiten() -> tuple[Geraet | None, list[str]]:
    """Firmware laden, falls nötig, und den Stick als Gerät liefern."""
    kennung = usb_kennung()
    if kennung is None:
        return None, []
    _LOGGER.info("Somagic-Stick %s:%s gefunden", HERSTELLER, kennung)
    if kennung != OHNE_FIRMWARE:
        return geraet(kennung), []

    vorhanden, text = await asyncio.to_thread(firmware_suchen)
    if not vorhanden:
        return None, [text or "Firmware fehlt"]
    ok, ausgabe = await asyncio.to_thread(_ausfuehren, ["somagic-init", "-f", str(FIRMWARE)])
    if not ok:
        return None, [f"Firmware ließ sich nicht laden: {ausgabe.splitlines()[-1] if ausgabe else '?'}"]
    # Der Stick meldet sich mit neuer Kennung neu an.
    for _ in range(30):
        await asyncio.sleep(0.5)
        neu = usb_kennung()
        if neu and neu != OHNE_FIRMWARE:
            _LOGGER.info("Firmware geladen, Stick jetzt %s:%s", HERSTELLER, neu)
            return geraet(neu), []
    return None, [
        "Firmware geladen, aber der Stick hat sich nicht neu gemeldet. Unter Proxmox: den Stick "
        "nach USB-Anschluss durchreichen, nicht nach Kennung (sie ändert sich dabei)."
    ]


def capture_befehl(norm: str, eingaenge: int, eingang: int) -> list[str]:
    """`somagic-capture` für einen Eingang (0-basiert) -- rohes UYVY auf stdout."""
    befehl = ["somagic-capture", {"NTSC": "-n", "SECAM": "--secam"}.get(norm, "-p")]
    if eingaenge > 2:
        befehl += ["-i", str(eingang + 1)]
    else:
        befehl.append("-s" if eingang == 1 else "-c")
    return befehl


def rohformat(norm: str) -> tuple[int, int, str]:
    """Breite, Höhe und Bildrate dessen, was somagic-capture liefert."""
    return (720, 480, "30000/1001") if norm == "NTSC" else (720, 576, "25")
