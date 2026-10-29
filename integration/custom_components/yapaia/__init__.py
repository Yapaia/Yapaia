"""Yapaia: eine Integration für alle Yapaia-Module (docs/integration-protokoll.md)."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError, ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import ConfigType

from . import aktionen, partner
from .client import YapaiaClient, YapaiaFehler
from .const import ALLE_PLATTFORMEN, CONF_MODUL, CONF_TOKEN, CONF_URL, DOMAIN, PLATTFORMEN, PROTOKOLL, SPEZIAL
from .modul import YapaiaModul

_LOGGER = logging.getLogger(__name__)

type YapaiaConfigEntry = ConfigEntry[YapaiaModul]


CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Einmal je Start: gemeinsames Design (design/) und Sprache (sprache.py)."""
    from . import design, sprache

    await design.einrichten(hass)
    sprache.einrichten(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: YapaiaConfigEntry) -> bool:
    if entry.data.get(CONF_MODUL) == "design":
        # Gerät „Yapaia Design“: nur Auswahlen, kein Modul (keine runtime_data,
        # damit Partnerliste und Aktionen es nicht für ein Modul halten)
        from . import design

        await design.einrichten(hass)
        await hass.config_entries.async_forward_entry_setups(entry, [Platform.SELECT])
        return True
    if entry.data.get(CONF_MODUL) == "router":
        return await _router_einrichten(hass, entry)
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
        if p == "spezial" and e.get("spezial") in SPEZIAL:
            continue
        if p not in PLATTFORMEN:
            # `spezial` und Unbekanntes: weglassen, der Rest läuft (Abschnitt 5)
            _LOGGER.warning("%s: Entität %s (%s) wird von dieser Integration nicht unterstützt",
                            modul.name, e.get("schluessel"), e.get("spezial") or p)
    entry.runtime_data = modul
    modul.geraet_eintragen()

    if "beat" in modul.spezial():
        from . import beat

        try:
            modul.beat = await beat.einrichten(hass, entry, modul.kennung, entry.data[CONF_URL])
        except Exception as err:  # noqa: BLE001 – Beat nicht erreichbar: später erneut
            raise ConfigEntryNotReady(f"{entry.title}: {err}") from err

    await hass.config_entries.async_forward_entry_setups(entry, ALLE_PLATTFORMEN)
    aktionen.registrieren(hass, modul)
    modul.starten()
    partner.einrichten(hass)
    partner.verteilen_bald(hass)
    return True


async def _router_einrichten(hass: HomeAssistant, entry: YapaiaConfigEntry) -> bool:
    """Ein GL.iNet-Router: spricht das Protokoll nicht selbst, das Modul tut es für ihn."""
    from . import router

    modul = await router.einrichten(hass, entry)
    entry.runtime_data = modul
    modul.geraet_eintragen()
    await hass.config_entries.async_forward_entry_setups(entry, ALLE_PLATTFORMEN)
    aktionen.registrieren(hass, modul)
    modul.starten()

    async def geaendert(hass: HomeAssistant, entry: YapaiaConfigEntry) -> None:
        # Einstellungen gelten sofort, ohne Neuladen (auch die Automatik)
        modul.bald_abfragen()

    entry.async_on_unload(entry.add_update_listener(geaendert))
    partner.einrichten(hass)
    partner.verteilen_bald(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: YapaiaConfigEntry) -> bool:
    if entry.data.get(CONF_MODUL) == "design":
        return await hass.config_entries.async_unload_platforms(entry, [Platform.SELECT])
    ok = await hass.config_entries.async_unload_platforms(entry, ALLE_PLATTFORMEN)
    if ok:
        await entry.runtime_data.stoppen()
        aktionen.aufraeumen(hass, entry)
        partner.verteilen_bald(hass)
    return ok
