"""Base entity for the GL.iNet Cellular integration."""

from __future__ import annotations

from homeassistant.helpers.device_registry import CONNECTION_NETWORK_MAC, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import GLiNetCoordinator


class GLiNetEntity(CoordinatorEntity[GLiNetCoordinator]):
    """Entity attached to the router device."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: GLiNetCoordinator, key: str) -> None:
        super().__init__(coordinator)
        entry = coordinator.config_entry
        info = coordinator.system_info
        self._attr_unique_id = f"{entry.unique_id or entry.entry_id}_{key}"
        self._attr_translation_key = key
        mac = info.get("mac")
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.unique_id or entry.entry_id)},
            connections={(CONNECTION_NETWORK_MAC, mac.lower())} if mac else set(),
            manufacturer="GL.iNet",
            model=info.get("model") or "GL-X3000",
            name=entry.title,
            sw_version=info.get("firmware_version"),
            hw_version=info.get("hardware_version"),
            configuration_url=coordinator.client.url.removesuffix("/rpc"),
        )
