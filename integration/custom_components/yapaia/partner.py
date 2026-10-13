"""Partnerliste: jedes Modul erfährt, wer noch da ist (Abschnitt 8)."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import EVENT_HOMEASSISTANT_STOP, Platform
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.debounce import Debouncer

from .client import YapaiaFehler
from .const import CONF_TOKEN, CONF_URL, DOMAIN, SATELLIT_FAEHIGKEITEN, SATELLIT_HERSTELLER, SATELLIT_MODELL

_LOGGER = logging.getLogger(__name__)
_KEY = f"{DOMAIN}_partner"


def liste(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Alle Instanzen: eingerichtete Add-on-Module und erkannte Satelliten."""
    out: list[dict[str, Any]] = []
    for e in hass.config_entries.async_entries(DOMAIN):
        m = getattr(e, "runtime_data", None)
        if e.state is not ConfigEntryState.LOADED or m is None:
            continue
        out.append({
            "modul": m.modul, "instanz": m.instanz, "name": m.name,
            **({"url": e.data[CONF_URL], "token": e.data[CONF_TOKEN]} if CONF_URL in e.data else {}),
            "version": m.beschreibung.get("version"),
            "faehigkeiten": list(m.beschreibung.get("faehigkeiten") or []),
        })
    out.extend(satelliten(hass))
    return out


def geraete(dreg: dr.DeviceRegistry) -> list[dr.DeviceEntry]:
    """Alle Geräte. Ältere Home Assistant liefern beim Durchlaufen die IDs, neuere die Einträge."""
    return [dreg.async_get(g) if isinstance(g, str) else g for g in dreg.devices]


def satelliten(hass: HomeAssistant) -> list[dict[str, Any]]:
    """ESPHome-Geräte mit der Projektkennung `yapaia.satellite` (Abschnitt 3)."""
    dreg, ereg = dr.async_get(hass), er.async_get(hass)
    out = []
    for g in geraete(dreg):
        if (g.manufacturer or "").lower() != SATELLIT_HERSTELLER or (g.model or "").lower() != SATELLIT_MODELL:
            continue
        mac = next((v for (t, v) in g.connections if t == dr.CONNECTION_NETWORK_MAC), None)
        player = next(
            (x.entity_id for x in er.async_entries_for_device(ereg, g.id) if x.domain == Platform.MEDIA_PLAYER),
            None,
        )
        out.append({
            "modul": "satellite",
            "instanz": (mac or g.id).replace(":", "").lower(),
            "name": g.name_by_user or g.name,
            "media_player": player,
            "faehigkeiten": list(SATELLIT_FAEHIGKEITEN),
        })
    return out


async def _verteilen(hass: HomeAssistant) -> None:
    alle = liste(hass)
    for e in hass.config_entries.async_entries(DOMAIN):
        m = getattr(e, "runtime_data", None)
        if e.state is not ConfigEntryState.LOADED or m is None:
            continue
        andere = [p for p in alle if not (p["modul"] == m.modul and p["instanz"] == m.instanz)]
        try:
            await m.client.partner(andere)
        except YapaiaFehler as err:
            _LOGGER.debug("%s: Partnerliste nicht zugestellt (%s)", m.name, err)


@callback
def einrichten(hass: HomeAssistant) -> None:
    """Einmalig: Entprellung und Beobachtung des Geräteregisters (Satelliten)."""
    if _KEY in hass.data:
        return

    async def lauf() -> None:
        await _verteilen(hass)

    hass.data[_KEY] = Debouncer(hass, _LOGGER, cooldown=2, immediate=False, function=lauf)

    @callback
    def geaendert(event: Event) -> None:
        verteilen_bald(hass)

    hass.bus.async_listen(dr.EVENT_DEVICE_REGISTRY_UPDATED, geaendert)

    @callback
    def beenden(event: Event) -> None:
        # sonst läuft die Abklingzeit über das Ende von Home Assistant hinaus
        hass.data[_KEY].async_shutdown()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, beenden)


@callback
def verteilen_bald(hass: HomeAssistant) -> None:
    if (d := hass.data.get(_KEY)) is not None:
        hass.async_create_task(d.async_call())
