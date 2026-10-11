"""Active SIM selector."""

from __future__ import annotations

from typing import Any

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import GLiNetConfigEntry
from .entity import GLiNetEntity

OPTIONS = {"sim1": 1, "sim2": 2}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GLiNetConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([GLiNetSimSelect(entry.runtime_data, "sim_select")])


class GLiNetSimSelect(GLiNetEntity, SelectEntity):
    _attr_options = list(OPTIONS)
    _attr_icon = "mdi:sim"

    @property
    def current_option(self) -> str | None:
        sim = self.coordinator.pending_sim or self.coordinator.data.active_sim
        return f"sim{sim}" if sim in OPTIONS.values() else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "reported_sim": self.coordinator.data.active_sim,
            "switch_pending": self.coordinator.pending_sim is not None,
            "slot_config": self.coordinator.data.slot_config,
        }

    async def async_select_option(self, option: str) -> None:
        if (
            self.coordinator.pending_sim is None
            and OPTIONS[option] == self.coordinator.data.active_sim
        ):
            return
        await self.coordinator.async_switch_sim(OPTIONS[option])
