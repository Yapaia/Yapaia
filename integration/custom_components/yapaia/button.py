"""Knöpfe: lösen die beschriebene Aktion aus."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import YapaiaEntity, beschriebene


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    add(YapaiaButton(entry.runtime_data, d) for d in beschriebene(entry.runtime_data, "button"))


class YapaiaButton(YapaiaEntity, ButtonEntity):
    plattform = "button"

    async def async_press(self) -> None:
        await self._ausfuehren("aktion")
