"""Cellular connection binary sensor."""

from __future__ import annotations

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import GLiNetConfigEntry
from .entity import GLiNetEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GLiNetConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([GLiNetConnected(entry.runtime_data, "connected")])


class GLiNetConnected(GLiNetEntity, BinarySensorEntity):
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY

    @property
    def is_on(self) -> bool | None:
        return self.coordinator.data.connected
