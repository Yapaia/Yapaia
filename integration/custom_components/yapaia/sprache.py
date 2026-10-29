"""Sprache: Yapaia folgt der Sprache von Home Assistant (Protokoll §8b).

Die Integration schickt jedem Modul die HA-Sprache (``POST /yapaia/v1/sprache``)
beim Verbinden und nach jeder Änderung; ändert sich die HA-Sprache, lädt sie
ihre Einträge neu, damit auch die Namen der Entitäten folgen.
"""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.const import EVENT_CORE_CONFIG_UPDATE
from homeassistant.core import Event, HomeAssistant, callback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

SPRACHEN = ("de", "en")
RUECKFALL = "en"
DATEN = f"{DOMAIN}_sprache"


def sprache(hass: HomeAssistant) -> str:
    """HA-Sprache als unterstützter Code (``de``/``en``), sonst Englisch."""
    code = (hass.config.language or RUECKFALL)[:2].lower()
    return code if code in SPRACHEN else RUECKFALL


async def senden(hass: HomeAssistant, modul: Any) -> None:
    """Einem Modul die Sprache schicken (wirft nie)."""
    client = getattr(modul, "client", None)
    if not hasattr(client, "sprache"):
        return
    try:
        if not await client.sprache({"sprache": sprache(hass)}):
            _LOGGER.debug("%s kennt /sprache noch nicht", modul.kennung)
    except Exception as err:  # noqa: BLE001 – ein Modul ohne Verbindung bekommt sie beim nächsten Verbinden
        _LOGGER.debug("%s: Sprache nicht zugestellt (%s)", getattr(modul, "kennung", "?"), err)


@callback
def senden_bald(hass: HomeAssistant, modul: Any) -> None:
    hass.async_create_background_task(senden(hass, modul), f"{DOMAIN}_sprache_{getattr(modul, 'kennung', '')}")


@callback
def einrichten(hass: HomeAssistant) -> None:
    """Einmal je HA-Start: auf Sprachwechsel hören."""
    if DATEN in hass.data:
        return
    hass.data[DATEN] = sprache(hass)

    @callback
    def _geaendert(_: Event) -> None:
        neu = sprache(hass)
        if neu == hass.data[DATEN]:
            return
        hass.data[DATEN] = neu
        _LOGGER.debug("HA-Sprache jetzt %s – Einträge neu laden", neu)
        # Neu laden: Entitätsnamen folgen der Sprache, Module bekommen sie beim Verbinden
        for e in hass.config_entries.async_entries(DOMAIN):
            hass.config_entries.async_schedule_reload(e.entry_id)

    hass.bus.async_listen(EVENT_CORE_CONFIG_UPDATE, _geaendert)
