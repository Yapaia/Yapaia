"""Binärsensoren aus der Beschreibung."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import YapaiaEntity, beschriebene


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    add(YapaiaBinary(entry.runtime_data, d) for d in beschriebene(entry.runtime_data, "binary_sensor"))


class YapaiaBinary(YapaiaEntity, BinarySensorEntity):
    plattform = "binary_sensor"

    def __init__(self, modul, d) -> None:
        super().__init__(modul, d)
        try:
            self._attr_device_class = BinarySensorDeviceClass(d["geraeteklasse"]) if d.get("geraeteklasse") else None
        except ValueError:
            pass

    @property
    def is_on(self) -> bool | None:
        v = self.wert
        return None if v is None else bool(v)
