"""Automatic station following on/off."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant

from .coordinator import YapaiaCoordinator
from .entity import YapaiaEntity


def entitaeten(hass: HomeAssistant, coordinator: YapaiaCoordinator) -> list:
    return [YapaiaFollowSwitch(coordinator), YapaiaMuteSwitch(coordinator), YapaiaLocalOutputSwitch(coordinator)]


class YapaiaFollowSwitch(YapaiaEntity, SwitchEntity):
    _attr_icon = "mdi:map-marker-path"

    def __init__(self, coordinator: YapaiaCoordinator) -> None:
        super().__init__(coordinator, "auto_follow", "switch")

    @property
    def is_on(self) -> bool:
        return bool((self.coordinator.data or {}).get("auto_follow"))

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.coordinator.command("/api/settings", {"auto_follow": True})

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.command("/api/settings", {"auto_follow": False})


class YapaiaMuteSwitch(YapaiaEntity, SwitchEntity):
    _attr_icon = "mdi:volume-off"

    def __init__(self, coordinator: YapaiaCoordinator) -> None:
        super().__init__(coordinator, "mute", "switch")

    @property
    def is_on(self) -> bool:
        return bool((self.coordinator.data or {}).get("muted"))

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.coordinator.command("/api/volume", {"muted": True})

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.command("/api/volume", {"muted": False})


class YapaiaLocalOutputSwitch(YapaiaEntity, SwitchEntity):
    """Sound from the speakers of the Home Assistant host (Mini-PC)."""

    _attr_icon = "mdi:speaker"

    def __init__(self, coordinator: YapaiaCoordinator) -> None:
        super().__init__(coordinator, "local_output", "switch")

    @property
    def available(self) -> bool:
        return super().available and bool((self.coordinator.data or {}).get("local_audio"))

    @property
    def is_on(self) -> bool:
        return bool((self.coordinator.data or {}).get("local_output", True))

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.coordinator.command("/api/settings", {"local_output": True})

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.command("/api/settings", {"local_output": False})
