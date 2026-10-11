"""Mediaplayer -- bisher nur über Spezial-Code (Beats Radio)."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    if entry.runtime_data.beat is not None:
        from .beat.media_player import entitaeten

        add(entitaeten(hass, entry.runtime_data.beat))
