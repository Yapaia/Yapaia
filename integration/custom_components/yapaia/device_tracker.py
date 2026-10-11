"""Standorte aus der Beschreibung (z. B. das Fahrzeug von Yapaia Go).

Der Wert ist ein Objekt `{"breite": …, "laenge": …, "genauigkeit": …}` oder
`null`, solange das Modul keinen Standort kennt.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.device_tracker import SourceType, TrackerEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import YapaiaEntity, beschriebene


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    add(YapaiaTracker(entry.runtime_data, d) for d in beschriebene(entry.runtime_data, "device_tracker"))


class YapaiaTracker(YapaiaEntity, TrackerEntity):
    plattform = "device_tracker"
    _attr_source_type = SourceType.GPS

    def _ort(self) -> dict[str, Any]:
        v = self.wert
        return v if isinstance(v, dict) else {}

    @property
    def latitude(self) -> float | None:
        v = self._ort().get("breite")
        return float(v) if isinstance(v, (int, float)) else None

    @property
    def longitude(self) -> float | None:
        v = self._ort().get("laenge")
        return float(v) if isinstance(v, (int, float)) else None

    @property
    def location_accuracy(self) -> float:
        v = self._ort().get("genauigkeit")
        return float(v) if isinstance(v, (int, float)) else 0
