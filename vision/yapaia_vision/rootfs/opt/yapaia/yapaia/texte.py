"""Meldungen des Add-ons auf Deutsch und Englisch.

Eine `Meldung` ist ein `str` (deutscher Text, so landet sie im Log und in
Vergleichen) und merkt sich Schlüssel und Werte. Erst bei der Antwort wird
sie in die gemerkte Sprache übersetzt (`t`, `uebersetzen`); ohne Sprache
oder bei "de" bleibt es Deutsch.
"""

from __future__ import annotations

from typing import Any

TEXTE: dict[str, dict[str, str]] = {
    "de": {
        "kein_grabber": "Kein Video-Grabber gefunden – ist er an Home Assistant durchgereicht?",
        "kein_freies_geraet": "{name}: kein freies Aufnahmegerät mehr (nur {anzahl} gefunden)",
        "eingang_fehlt": "{name}: Eingang {eingang} gibt es an {geraet} nicht (nur {anzahl})",
        "kanal_unbekannt": "Keinen Kanal „{wert}“ gefunden",
        "kanal_ohne_geraet": "{name} hat kein Gerät",
        "nicht_startbar": "{befehl} nicht startbar: {grund}",
        "kein_bild": "{pfad}: seit {sekunden} s kein Bild – Kamera angeschlossen?",
        "ffmpeg_ohne_bild": "{pfad}: ffmpeg endete ohne Bild ({grund})",
        "libusb_fehlt": "libusb fehlt: {grund}",
        "libusb_start": "libusb startet nicht",
        "stick_oeffnen": "Stick lässt sich nicht öffnen",
        "usb_konfiguration": "USB-Konfiguration scheitert: {grund}",
        "nicht_auspacken": "{datei} lässt sich nicht auspacken: {grund}",
        "kein_treiber": "In {datei} steckt kein SmiUsbGrabber-Treiber",
        "firmware_uebernommen": "Firmware aus {datei} übernommen",
        "keine_firmware": "Keine gültige Firmware gefunden ({grund})",
        "firmware_noetig": (
            "Der EasyCAP braucht die Firmware aus seinem Windows-Treiber: SmiUsbGrabber3F.sys oder "
            "SmiUsbGrabber3E.sys (auf der CD zum Stick, auch Setup.exe geht) auf der Seite von "
            "Yapaia Vision hochladen oder nach /share/yapaia-vision/ legen."
        ),
        "firmware_fehlt": "Firmware fehlt",
        "firmware_laden": "Firmware ließ sich nicht laden: {grund}",
        "stick_meldet_sich_nicht": (
            "Firmware geladen, aber der Stick hat sich nicht neu gemeldet. Unter Proxmox: den Stick "
            "nach USB-Anschluss durchreichen oder zusätzlich die neue Kennung 1c88:003c (bzw. 003e/003f) "
            "an die VM geben -- mit der Firmware meldet er sich unter ihr neu an."
        ),
        "token": "Token fehlt oder falsch",
        "aktion_unbekannt": "Unbekannte Aktion {name}",
        "keine_datei": "Keine Datei",
        "datei_zu_gross": "Datei zu groß",
        "neustart": "{text}. Vision startet neu …",
    },
    "en": {
        "kein_grabber": "No video grabber found – is it passed through to Home Assistant?",
        "kein_freies_geraet": "{name}: no free capture device left (only {anzahl} found)",
        "eingang_fehlt": "{name}: {geraet} has no input {eingang} (only {anzahl})",
        "kanal_unbekannt": "No channel “{wert}” found",
        "kanal_ohne_geraet": "{name} has no device",
        "nicht_startbar": "{befehl} cannot be started: {grund}",
        "kein_bild": "{pfad}: no picture for {sekunden} s – is the camera connected?",
        "ffmpeg_ohne_bild": "{pfad}: ffmpeg ended without a picture ({grund})",
        "libusb_fehlt": "libusb is missing: {grund}",
        "libusb_start": "libusb does not start",
        "stick_oeffnen": "Cannot open the stick",
        "usb_konfiguration": "USB configuration failed: {grund}",
        "nicht_auspacken": "{datei} cannot be unpacked: {grund}",
        "kein_treiber": "{datei} contains no SmiUsbGrabber driver",
        "firmware_uebernommen": "Firmware taken from {datei}",
        "keine_firmware": "No valid firmware found ({grund})",
        "firmware_noetig": (
            "The EasyCAP needs the firmware from its Windows driver: SmiUsbGrabber3F.sys or "
            "SmiUsbGrabber3E.sys (on the stick's CD, Setup.exe works too). Upload it on the "
            "Yapaia Vision page or put it in /share/yapaia-vision/."
        ),
        "firmware_fehlt": "Firmware missing",
        "firmware_laden": "Firmware could not be loaded: {grund}",
        "stick_meldet_sich_nicht": (
            "Firmware loaded, but the stick did not reappear. On Proxmox: pass the stick through as "
            "a USB port, or additionally give the VM the new ID 1c88:003c (or 003e/003f) -- "
            "with the firmware loaded it reappears under that ID."
        ),
        "token": "Token missing or wrong",
        "aktion_unbekannt": "Unknown action {name}",
        "keine_datei": "No file",
        "datei_zu_gross": "File too large",
        "neustart": "{text}. Vision is restarting …",
    },
}


class Meldung(str):
    """Deutscher Text, dazu Schlüssel und Werte für die Übersetzung."""

    schluessel: str
    werte: dict[str, Any]

    def __new__(cls, schluessel: str, **werte: Any) -> Meldung:
        self = super().__new__(cls, TEXTE["de"][schluessel].format(**werte))
        self.schluessel = schluessel
        self.werte = werte
        return self


def _sprache(quelle: Any) -> str:
    if hasattr(quelle, "get"):  # web.Application / Request.app
        quelle = quelle.get("yapaia_sprache")
    return quelle if quelle in TEXTE else "de"


def _werte(werte: dict[str, Any], sprache: str) -> dict[str, Any]:
    return {k: uebersetzen(v, sprache) for k, v in werte.items()}


def uebersetzen(text: Any, sprache: Any = None) -> Any:
    """Eine `Meldung` in die Sprache übersetzen; alles andere bleibt unverändert."""
    if isinstance(text, Meldung):
        s = _sprache(sprache)
        return TEXTE[s][text.schluessel].format(**_werte(text.werte, s))
    return text


def t(app_oder_sprache: Any, schluessel: str, **werte: Any) -> str:
    """Text zu `schluessel` in der Sprache der App (`app["yapaia_sprache"]`) oder "de"/"en"."""
    s = _sprache(app_oder_sprache)
    return TEXTE[s][schluessel].format(**_werte(werte, s))
