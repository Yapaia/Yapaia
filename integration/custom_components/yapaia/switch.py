"""Schalter: Zustand aus dem Modul, Bedienen über die beschriebenen Aktionen."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import YapaiaEntity, beschriebene


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    modul = entry.runtime_data
    neu: list = [YapaiaSwitch(modul, d) for d in beschriebene(modul, "switch")]
    if modul.beat is not None:
        from .beat.switch import entitaeten

        neu.extend(entitaeten(hass, modul.beat))
    add(neu)


class YapaiaSwitch(YapaiaEntity, SwitchEntity):
    plattform = "switch"

    @property
    def is_on(self) -> bool | None:
        v = self.wert
        return None if v is None else bool(v)

    async def async_turn_on(self, **kwargs: Any) -> None:
        if self.d.get("aktion_an"):
            await self._ausfuehren("aktion_an")
        else:
            await self._ausfuehren("aktion", {"wert": True})

    async def async_turn_off(self, **kwargs: Any) -> None:
        if self.d.get("aktion_aus"):
            await self._ausfuehren("aktion_aus")
        else:
            await self._ausfuehren("aktion", {"wert": False})
