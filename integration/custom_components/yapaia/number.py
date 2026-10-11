"""Zahlen mit Grenzen aus der Beschreibung."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import YapaiaEntity, beschriebene


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    add(YapaiaNumber(entry.runtime_data, d) for d in beschriebene(entry.runtime_data, "number"))


class YapaiaNumber(YapaiaEntity, NumberEntity):
    plattform = "number"

    def __init__(self, modul, d) -> None:
        super().__init__(modul, d)
        self._attr_native_min_value = float(d.get("min", 0))
        self._attr_native_max_value = float(d.get("max", 100))
        self._attr_native_step = float(d.get("schritt", 1))
        self._attr_native_unit_of_measurement = d.get("einheit")

    @property
    def native_value(self) -> float | None:
        v = self.wert
        return float(v) if isinstance(v, (int, float)) else None

    async def async_set_native_value(self, value: float) -> None:
        await self._ausfuehren("aktion", {"wert": value})
