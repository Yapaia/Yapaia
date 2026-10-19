"""Kameras aus der Beschreibung (`plattform: camera`, z. B. Yapaia Vision).

Die Beschreibung nennt zwei Pfade am Modul: `bild` (ein JPEG) und `stream`
(MJPEG). Beides holt die Integration mit dem Token der Instanz und reicht es
durch -- der Browser spricht nie selbst mit dem Modul.
"""

from __future__ import annotations

from typing import Any

from aiohttp import web
from homeassistant.components.camera import Camera
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_aiohttp_proxy_web
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import YapaiaEntity, beschriebene


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    add([YapaiaKamera(entry.runtime_data, d) for d in beschriebene(entry.runtime_data, "camera")])


class YapaiaKamera(YapaiaEntity, Camera):
    plattform = "camera"
    _attr_frame_interval = 0.1

    def __init__(self, modul, d: dict[str, Any]) -> None:
        # Camera zuerst: es legt Zugangsschlüssel und Strom-Zustand an.
        # YapaiaEntity setzt danach Name, Kennung und Gerät.
        Camera.__init__(self)
        YapaiaEntity.__init__(self, modul, d)
        self.content_type = "image/jpeg"

    @property
    def is_streaming(self) -> bool:
        return bool(self.modul.werte.get(f"{self.schluessel}_live"))

    async def async_camera_image(self, width: int | None = None, height: int | None = None) -> bytes | None:
        pfad = self.d.get("bild")
        return await self.modul.client.bild(pfad) if pfad else None

    async def handle_async_mjpeg_stream(self, request: web.Request) -> web.StreamResponse | None:
        pfad = self.d.get("stream")
        if not pfad:
            return await super().handle_async_mjpeg_stream(request)
        return await async_aiohttp_proxy_web(self.hass, request, self.modul.client.strom(pfad))
