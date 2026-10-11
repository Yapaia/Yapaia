"""Base entity."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import YapaiaCoordinator


class YapaiaEntity(CoordinatorEntity[YapaiaCoordinator]):
    _attr_has_entity_name = True

    def __init__(self, coordinator: YapaiaCoordinator, key: str, platform: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"yapaia_{coordinator.kennung}_{key}"
        self._attr_translation_key = key
        # predictable entity ids (media_player.yapaia_beat, sensor.yapaia_beat_station, …)
        self.entity_id = f"{platform}.yapaia_beat" + (f"_{key}" if key != "radio" else "")
        # das Gerät legt die allgemeine Integration an (Name, Version)
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, coordinator.kennung)})
