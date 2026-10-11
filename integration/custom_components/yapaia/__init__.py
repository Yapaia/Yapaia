"""Yapaia: eine Integration für alle Yapaia-Module (docs/integration-protokoll.md)."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError, ConfigEntryNotReady
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from . import aktionen, partner
from .client import YapaiaClient, YapaiaFehler
from .const import CONF_TOKEN, CONF_URL, PLATTFORMEN, PROTOKOLL
from .modul import YapaiaModul

_LOGGER = logging.getLogger(__name__)

type YapaiaConfigEntry = ConfigEntry[YapaiaModul]


async def async_setup_entry(hass: HomeAssistant, entry: YapaiaConfigEntry) -> bool:
    client = YapaiaClient(async_get_clientsession(hass), entry.data[CONF_URL], entry.data[CONF_TOKEN])
    try:
        beschreibung = await client.beschreibung()
    except YapaiaFehler as err:
        raise ConfigEntryNotReady(f"{entry.title}: {err}") from err

    version = beschreibung.get("protokoll")
    if not isinstance(version, int) or version > PROTOKOLL:
        raise ConfigEntryError(
            f"{entry.title} spricht Protokoll {version}, diese Integration kennt höchstens {PROTOKOLL} – "
            "bitte die Yapaia-Integration aktualisieren"
        )

    modul = YapaiaModul(hass, entry, client, beschreibung)
    for e in modul.entitaeten():
        p = e.get("plattform")
        if p not in PLATTFORMEN:
            # `spezial` und Unbekanntes: weglassen, der Rest läuft (Abschnitt 5)
            _LOGGER.warning("%s: Entität %s (%s) wird von dieser Integration nicht unterstützt",
                            modul.name, e.get("schluessel"), e.get("spezial") or p)
    entry.runtime_data = modul
    modul.geraet_eintragen()

    await hass.config_entries.async_forward_entry_setups(entry, list(PLATTFORMEN.values()))
    aktionen.registrieren(hass, modul)
    modul.starten()
    partner.einrichten(hass)
    partner.verteilen_bald(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: YapaiaConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, list(PLATTFORMEN.values()))
    if ok:
        await entry.runtime_data.stoppen()
        aktionen.aufraeumen(hass, entry)
        partner.verteilen_bald(hass)
    return ok
