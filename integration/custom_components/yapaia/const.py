"""Konstanten der Yapaia-Integration (siehe docs/integration-protokoll.md)."""

from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "yapaia"

# Höchste Protokollversion, die diese Integration versteht.
PROTOKOLL = 1

API = "/yapaia/v1"

CONF_MODUL = "modul"
CONF_INSTANZ = "instanz"
CONF_TOKEN = "token"
CONF_URL = "url"

EREIGNIS = "yapaia_ereignis"

# Plattformen, die sich allgemein beschreiben lassen (Abschnitt 5).
PLATTFORMEN: dict[str, Platform] = {
    "sensor": Platform.SENSOR,
    "binary_sensor": Platform.BINARY_SENSOR,
    "switch": Platform.SWITCH,
    "select": Platform.SELECT,
    "number": Platform.NUMBER,
    "button": Platform.BUTTON,
    "text": Platform.TEXT,
}

# ESPHome-Projektkennung der Satelliten (Abschnitt 3): `yapaia.satellite`
# erscheint in Home Assistant als Hersteller „yapaia“, Modell „satellite“.
SATELLIT_HERSTELLER = "yapaia"
SATELLIT_MODELL = "satellite"
SATELLIT_FAEHIGKEITEN = ["sprache.eingabe", "sprache.ausgabe"]

RECONNECT_MAX_S = 60
