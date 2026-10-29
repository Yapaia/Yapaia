"""Auswahlen des Designs: gesamt, HA-Design (Gerät „Yapaia Design“) und je Modul."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import EntityCategory
from homeassistant.util import slugify

from ..const import DOMAIN
from . import NICHT_AENDERN, WIE_GESAMT, Design

GERAET = DeviceInfo(identifiers={(DOMAIN, "design")}, name="Yapaia Design", manufacturer="Yapaia", model="design")


class _Basis(SelectEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, design: Design) -> None:
        self.design = design

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.design.hoeren(self.async_write_ha_state))


class GesamtSchema(_Basis):
    """Ein Schema für alles."""

    _attr_icon = "mdi:palette"
    _attr_unique_id = "yapaia_design_schema"
    _attr_translation_key = "schema"
    _attr_device_info = GERAET

    def __init__(self, design: Design) -> None:
        super().__init__(design)
        self.entity_id = "select.yapaia_design_schema"

    @property
    def options(self) -> list[str]:
        return self.design.namen()

    @property
    def current_option(self) -> str | None:
        return self.design.name(self.design.daten["gesamt"])

    async def async_select_option(self, option: str) -> None:
        await self.design.setze_gesamt(self.design.id_aus_name(option) or option)


class HaDesign(_Basis):
    """Auf Wunsch: Home Assistant selbst im passenden Theme (Standard: nicht ändern)."""

    _attr_icon = "mdi:home-assistant"
    _attr_unique_id = "yapaia_design_ha_design"
    _attr_translation_key = "ha_design"
    _attr_device_info = GERAET
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, design: Design) -> None:
        super().__init__(design)
        self.entity_id = "select.yapaia_design_ha_design"

    @property
    def options(self) -> list[str]:
        return [NICHT_AENDERN, WIE_GESAMT, *self.design.namen()]

    @property
    def current_option(self) -> str | None:
        w = self.design.daten["ha_design"]
        return NICHT_AENDERN if w is None else WIE_GESAMT if w == "gesamt" else self.design.name(w)

    async def async_select_option(self, option: str) -> None:
        wahl = None if option == NICHT_AENDERN else "gesamt" if option == WIE_GESAMT else self.design.id_aus_name(option)
        await self.design.setze_ha_design(wahl)


class ModulDesign(_Basis):
    """Am Gerät eines Moduls: eigenes Schema oder „Wie gesamt“."""

    _attr_icon = "mdi:palette-outline"
    _attr_translation_key = "design"
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, design: Design, kennung: str, geraet_name: str) -> None:
        super().__init__(design)
        self.kennung = kennung
        self._attr_unique_id = f"yapaia_{kennung}_design"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, kennung)})
        self.entity_id = f"select.{slugify(geraet_name)}_design"

    @property
    def options(self) -> list[str]:
        return [WIE_GESAMT, *self.design.namen()]

    @property
    def current_option(self) -> str | None:
        return self.design.name(self.design.eigenes(self.kennung)) or WIE_GESAMT

    @property
    def extra_state_attributes(self) -> dict[str, str]:
        return {"gilt": self.design.fuer(self.kennung)}

    async def async_select_option(self, option: str) -> None:
        await self.design.setze_modul(self.kennung, None if option == WIE_GESAMT else self.design.id_aus_name(option))
