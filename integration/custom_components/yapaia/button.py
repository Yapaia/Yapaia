"""Knöpfe: lösen die beschriebene Aktion aus."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import YapaiaEntity, beschriebene


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    modul = entry.runtime_data
    neu: list = [YapaiaButton(modul, d) for d in beschriebene(modul, "button")]
    if modul.beat is not None:
        from .beat.button import entitaeten

        neu.extend(entitaeten(hass, modul.beat))
    add(neu)


class YapaiaButton(YapaiaEntity, ButtonEntity):
    plattform = "button"

    async def async_press(self) -> None:
        await self._ausfuehren("aktion")
