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
import ctypes
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from .config import DATA_DIR
from .quellen import Geraet
from .texte import Meldung

_LOGGER = logging.getLogger(__name__)

HERSTELLER = "1c88"
OHNE_FIRMWARE = "0007"
DC60 = "003c"
EASYCAP002 = ("003e", "003f")
PFAD = "somagic"
FIRMWARE = DATA_DIR / "somagic_firmware.bin"
SUCHORDNER = Path("/share/yapaia-vision")
SYSFS = Path("/sys/bus/usb/devices")


def usb_kennung(sysfs: Path | None = None) -> str | None:
    """Die Produktkennung des ersten Somagic-Sticks (`0007`, `003c` …) oder `None`."""
    g = _sysfs_geraet(sysfs)
    try:
        return (g / "idProduct").read_text().strip() if g else None
    except OSError:
        return None


def geraet(kennung: str | None) -> Geraet | None:
    """Der Stick als Aufnahmegerät -- erst NACH dem Laden der Firmware.

    Die Kennung nach dem Laden kommt aus der FIRMWARE, nicht vom Stick: ein
    EasyCAP002 mit der Firmware aus `SmiUsbGrabber3C.sys` (der einzigen, die
    frei zu finden ist) meldet sich als `003c` wie ein DC60. Den Eingang
    wählt `somagic-capture -i` aber unabhängig von der Kennung (Register 0x02
    des SAA7113) -- deshalb gelten immer die vier Eingänge."""
    if kennung in EASYCAP002 or kennung == DC60:
        return Geraet(PFAD, "somagic", f"EasyCAP (SMI2021CBE, {HERSTELLER}:{kennung})",
                      [f"CVBS {i}" for i in range(1, 5)], normen=True)
    return None


def _sysfs_geraet(sysfs: Path | None = None) -> Path | None:
    for g in sorted((sysfs or SYSFS).glob("*")):
        try:
            if (g / "idVendor").read_text().strip() == HERSTELLER:
                return g
        except OSError:
            continue
    return None


def konfigurieren(kennung: str) -> str | None:
    """USB-Konfiguration setzen, falls der Kernel es nicht geschafft hat.

    Gesehen unter Proxmox (2026-10-16): Beim Einstecken meldet der Kernel
    „can't set config #1, error -32“, der Stick hat danach keine Schnittstelle
    und `somagic-init` scheitert mit „Failed to claim device interface“. Ein
    USB-Reset und danach `set_configuration(1)` über libusb hilft.
    Gibt einen Fehlertext zurück oder `None`."""
    g = _sysfs_geraet()
    try:
        if g is not None and (g / "bConfigurationValue").read_text().strip():
            return None
    except OSError:
        pass
    try:
        u = ctypes.CDLL("libusb-1.0.so.0")
    except OSError as err:
        return Meldung("libusb_fehlt", grund=str(err))
    u.libusb_open_device_with_vid_pid.restype = ctypes.c_void_p
    u.libusb_open_device_with_vid_pid.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_uint16]
    u.libusb_reset_device.argtypes = [ctypes.c_void_p]
    u.libusb_set_configuration.argtypes = [ctypes.c_void_p, ctypes.c_int]
    u.libusb_close.argtypes = [ctypes.c_void_p]
    u.libusb_exit.argtypes = [ctypes.c_void_p]
    u.libusb_error_name.restype = ctypes.c_char_p
    ctx = ctypes.c_void_p()
    if u.libusb_init(ctypes.byref(ctx)) != 0:
        return Meldung("libusb_start")
    try:
        h = u.libusb_open_device_with_vid_pid(ctx, int(HERSTELLER, 16), int(kennung, 16))
        if not h:
            return Meldung("stick_oeffnen")
        try:
            u.libusb_reset_device(h)
            r = u.libusb_set_configuration(h, 1)
            if r != 0:
                return Meldung("usb_konfiguration", grund=u.libusb_error_name(r).decode())
            _LOGGER.info("USB-Konfiguration nachträglich gesetzt (Reset)")
            return None
        finally:
            u.libusb_close(h)
    finally:
        u.libusb_exit(ctx)


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
            return False, Meldung("nicht_auspacken", datei=datei.name, grund=text.splitlines()[-1] if text else "?")
        kandidaten = _treiberdateien(tmp)
        if not kandidaten:
            shutil.rmtree(tmp, ignore_errors=True)
            return False, Meldung("kein_treiber", datei=datei.name)
    try:
        letzter = ""
        for k in kandidaten:
            ziel.parent.mkdir(parents=True, exist_ok=True)
            ok, letzter = _ausfuehren(["somagic-extract-firmware", "-f", str(ziel), str(k)])
            if ok and ziel.is_file():
                _LOGGER.info("Firmware aus %s gewonnen", k.name)
                return True, Meldung("firmware_uebernommen", datei=k.name)
        ziel.unlink(missing_ok=True)
        return False, Meldung("keine_firmware", grund=letzter.splitlines()[-1] if letzter else "?")
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
    return False, Meldung("firmware_noetig")


async def vorbereiten() -> tuple[Geraet | None, list[str]]:
    """Firmware laden, falls nötig, und den Stick als Gerät liefern."""
    kennung = usb_kennung()
    if kennung is None:
        return None, []
    _LOGGER.info("Somagic-Stick %s:%s gefunden", HERSTELLER, kennung)
    if kennung != OHNE_FIRMWARE:
        fehler = await asyncio.to_thread(konfigurieren, kennung)
        return geraet(kennung), [fehler] if fehler else []

    vorhanden, text = await asyncio.to_thread(firmware_suchen)
    if not vorhanden:
        return None, [text or Meldung("firmware_fehlt")]
    fehler = await asyncio.to_thread(konfigurieren, kennung)
    if fehler:
        return None, [fehler]
    ok, ausgabe = await asyncio.to_thread(_ausfuehren, ["somagic-init", "-f", str(FIRMWARE)])
    if not ok:
        return None, [Meldung("firmware_laden", grund=ausgabe.splitlines()[-1] if ausgabe else "?")]
    # Der Stick meldet sich mit neuer Kennung neu an.
    for _ in range(30):
        await asyncio.sleep(0.5)
        neu = usb_kennung()
        if neu and neu != OHNE_FIRMWARE:
            _LOGGER.info("Firmware geladen, Stick jetzt %s:%s", HERSTELLER, neu)
            return geraet(neu), []
    return None, [Meldung("stick_meldet_sich_nicht")]


def capture_befehl(norm: str, eingang: int) -> list[str]:
    """`somagic-capture` für einen Eingang (0-basiert) -- rohes UYVY auf stdout."""
    return ["somagic-capture", {"NTSC": "-n", "SECAM": "--secam"}.get(norm, "-p"), "-i", str(eingang + 1)]


def rohformat(norm: str) -> tuple[int, int, str]:
    """Breite, Höhe und Bildrate dessen, was somagic-capture liefert."""
    return (720, 480, "30000/1001") if norm == "NTSC" else (720, 576, "25")
