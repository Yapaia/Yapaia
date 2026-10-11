"""Auswahlen: Optionen fest oder aus einem Zustandsschlüssel."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import YapaiaEntity, beschriebene


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    modul = entry.runtime_data
    neu: list = [YapaiaSelect(modul, d) for d in beschriebene(modul, "select")]
    if modul.beat is not None:
        from .beat.select import entitaeten

        neu.extend(entitaeten(hass, modul.beat))
    add(neu)


class YapaiaSelect(YapaiaEntity, SelectEntity):
    plattform = "select"

    @property
    def options(self) -> list[str]:
        if self.d.get("optionen_aus"):
            liste = self.modul.werte.get(self.d["optionen_aus"])
        else:
            liste = self.d.get("optionen")
        return [str(o) for o in liste] if isinstance(liste, list) else []

    @property
    def current_option(self) -> str | None:
        v = self.wert
        return None if v is None else str(v)

    async def async_select_option(self, option: str) -> None:
        await self._ausfuehren("aktion", {"wert": option})
