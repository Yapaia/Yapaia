"""Textfelder: Zustand aus dem Modul, Eingabe über die beschriebene Aktion."""

from __future__ import annotations

from homeassistant.components.text import TextEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import YapaiaEntity, beschriebene


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    add(YapaiaText(entry.runtime_data, d) for d in beschriebene(entry.runtime_data, "text"))


class YapaiaText(YapaiaEntity, TextEntity):
    plattform = "text"

    @property
    def native_value(self) -> str | None:
        v = self.wert
        return None if v is None else str(v)

    async def async_set_value(self, value: str) -> None:
        await self._ausfuehren("aktion", {"wert": value})
