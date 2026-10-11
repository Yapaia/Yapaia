"""Sensoren aus der Beschreibung."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .entity import YapaiaEntity, beschriebene


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    modul = entry.runtime_data
    neu: list = [YapaiaSensor(modul, d) for d in beschriebene(modul, "sensor")]
    if modul.beat is not None:
        from .beat.sensor import entitaeten

        neu.extend(entitaeten(hass, modul.beat))
    add(neu)


class YapaiaSensor(YapaiaEntity, SensorEntity):
    plattform = "sensor"

    def __init__(self, modul, d: dict[str, Any]) -> None:
        super().__init__(modul, d)
        if d.get("geraeteklasse"):
            try:
                self._attr_device_class = SensorDeviceClass(d["geraeteklasse"])
            except ValueError:
                pass
        if d.get("zustandsklasse"):
            try:
                self._attr_state_class = SensorStateClass(d["zustandsklasse"])
            except ValueError:
                pass
        self._attr_native_unit_of_measurement = d.get("einheit")

    @property
    def native_value(self) -> Any:
        v = self.wert
        if self.device_class == SensorDeviceClass.TIMESTAMP and isinstance(v, str):
            return dt_util.parse_datetime(v)
        return None if isinstance(v, (dict, list)) else v
