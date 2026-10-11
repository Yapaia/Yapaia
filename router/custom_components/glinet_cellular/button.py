"""Reconnect and reboot buttons."""

from __future__ import annotations

from homeassistant.components.button import ButtonDeviceClass, ButtonEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import GLiNetError
from .coordinator import GLiNetConfigEntry
from .entity import GLiNetEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GLiNetConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data
    async_add_entities(
        [
            GLiNetReconnectButton(coordinator, "reconnect"),
            GLiNetRebootButton(coordinator, "reboot"),
        ]
    )


class GLiNetReconnectButton(GLiNetEntity, ButtonEntity):
    _attr_device_class = ButtonDeviceClass.RESTART

    async def async_press(self) -> None:
        bus = self.coordinator.data.bus
        if not bus:
            raise HomeAssistantError("Modem bus unknown, cannot reconnect")
        try:
            await self.coordinator.client.reconnect(bus)
        except GLiNetError as err:
            raise HomeAssistantError(f"Reconnect failed: {err}") from err
        await self.coordinator.async_request_refresh()


class GLiNetRebootButton(GLiNetEntity, ButtonEntity):
    _attr_device_class = ButtonDeviceClass.RESTART
    _attr_entity_category = EntityCategory.CONFIG
    _attr_entity_registry_enabled_default = False

    async def async_press(self) -> None:
        try:
            await self.coordinator.client.reboot()
        except GLiNetError as err:
            raise HomeAssistantError(f"Reboot failed: {err}") from err
