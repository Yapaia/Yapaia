"""Gemeinsame Grundlage aller beschriebenen Entitäten."""

from __future__ import annotations

from typing import Any

from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.util import slugify
from homeassistant.helpers.entity import Entity, EntityCategory

from .client import YapaiaFehler
from .const import DOMAIN
from .modul import YapaiaModul, text


class YapaiaEntity(Entity):
    _attr_has_entity_name = True
    _attr_should_poll = False
    # Plattform der Entität, von jeder Unterklasse gesetzt
    plattform: str = ""

    def __init__(self, modul: YapaiaModul, d: dict[str, Any]) -> None:
        self.modul = modul
        self.d = d
        self.schluessel: str = d["schluessel"]
        self._attr_unique_id = f"yapaia_{modul.kennung}_{self.schluessel}"
        self._attr_name = text(d.get("name"), modul.sprache) or self.schluessel
        self._attr_icon = d.get("symbol")
        if d.get("kategorie") in ("config", "diagnostic"):
            self._attr_entity_category = EntityCategory(d["kategorie"])
        self._attr_entity_registry_enabled_default = d.get("standard_aktiv", True) is not False
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, modul.kennung)})
        # Entity-ID aus Gerätename und festem Schlüssel -- NICHT aus dem
        # angezeigten Namen, der von der HA-Sprache abhängt: sonst hieße
        # dieselbe Entität bei Englisch `…_arrival`, bei Deutsch `…_ankunft`.
        # Nur ein Vorschlag: vom Nutzer umbenannte IDs bleiben, wie sie sind.
        self.entity_id = f"{self.plattform}.{slugify(modul.name)}_{slugify(self.schluessel)}"

    @property
    def available(self) -> bool:
        return self.modul.verbunden

    @property
    def icon(self) -> str | None:
        # `symbol_aus`: das Symbol kommt aus einem Zustandsschlüssel (z. B. der
        # Pfeil der nächsten Abbiegung), sonst das feste `symbol`.
        if self.d.get("symbol_aus"):
            v = self.modul.werte.get(self.d["symbol_aus"])
            if isinstance(v, str) and v:
                return v
        return self._attr_icon

    @property
    def wert(self) -> Any:
        return self.modul.werte.get(self.schluessel)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        keys = self.d.get("attribute") or []
        return {k: self.modul.werte.get(k) for k in keys} or None

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.modul.hoeren(self.async_write_ha_state))

    async def _ausfuehren(self, feld: str, daten: dict[str, Any] | None = None) -> None:
        name = self.d.get(feld)
        if not name:
            raise HomeAssistantError(f"{self.entity_id}: keine Aktion „{feld}“ beschrieben")
        try:
            await self.modul.client.aktion(name, daten or {})
        except YapaiaFehler as err:
            raise HomeAssistantError(f"{self.modul.name}: {err}") from err


def beschriebene(modul: YapaiaModul, plattform: str) -> list[dict[str, Any]]:
    return [e for e in modul.entitaeten() if e.get("plattform") == plattform]
