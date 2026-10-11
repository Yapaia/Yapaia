"""Ein nachgebautes Yapaia-Modul (echter HTTP/WebSocket-Server auf 127.0.0.1)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer

TOKEN = "geheim"


def beschreibung(modul: str = "go", instanz: str = "a1", name: str = "Yapaia Go", **extra: Any) -> dict[str, Any]:
    b = {
        "protokoll": 1,
        "modul": modul,
        "instanz": instanz,
        "name": name,
        "version": "0.43.0",
        "faehigkeiten": ["navigation"],
        "entitaeten": [
            {"schluessel": "ankunft", "plattform": "sensor", "name": {"de": "Ankunft", "en": "Arrival"},
             "geraeteklasse": "timestamp"},
            {"schluessel": "restweg", "plattform": "sensor", "name": {"de": "Restweg"},
             "geraeteklasse": "distance", "einheit": "km", "zustandsklasse": "measurement", "attribute": ["ziel"]},
            {"schluessel": "navigation", "plattform": "switch", "name": {"de": "Navigation"},
             "aktion_an": "navigation_fortsetzen", "aktion_aus": "navigation_beenden"},
            {"schluessel": "profil", "plattform": "select", "name": {"de": "Fahrzeugprofil"},
             "optionen_aus": "profile", "aktion": "profil_waehlen"},
            {"schluessel": "player", "plattform": "spezial", "spezial": "beat.player"},
        ],
        "aktionen": [
            {"name": "ziel_setzen", "titel": {"de": "Ziel setzen"},
             "felder": {"ziel": {"typ": "text", "pflicht": True}}},
        ],
        "ereignisse": [{"name": "ziel_erreicht", "titel": {"de": "Ziel erreicht"}}],
    }
    b.update(extra)
    return b


class FakeModul:
    def __init__(self, b: dict[str, Any], werte: dict[str, Any] | None = None) -> None:
        self.b = b
        self.werte = werte or {}
        self.aufrufe: list[tuple[str, dict[str, Any]]] = []
        self.partner: list[list[dict[str, Any]]] = []
        self.ws: set[web.WebSocketResponse] = set()
        self.antwort: dict[str, Any] = {"ok": True}
        self.server: TestServer | None = None
        app = web.Application()
        app.router.add_get("/yapaia/v1/beschreibung", self._beschreibung)
        app.router.add_get("/yapaia/v1/live", self._live)
        app.router.add_post("/yapaia/v1/aktion/{name}", self._aktion)
        app.router.add_post("/yapaia/v1/partner", self._partner)
        self.app = app

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.port}"

    def _ok(self, request: web.Request) -> bool:
        return request.headers.get("Authorization") == f"Bearer {TOKEN}"

    async def _beschreibung(self, request: web.Request) -> web.Response:
        if not self._ok(request):
            return web.json_response({"ok": False}, status=401)
        return web.json_response(self.b)

    async def _live(self, request: web.Request) -> web.WebSocketResponse:
        if not self._ok(request):
            raise web.HTTPUnauthorized()
        ws = web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)
        self.ws.add(ws)
        await ws.send_str(json.dumps({"typ": "zustand", "werte": self.werte}))
        try:
            async for _ in ws:
                pass
        finally:
            self.ws.discard(ws)
        return ws

    async def _aktion(self, request: web.Request) -> web.Response:
        if not self._ok(request):
            return web.json_response({"ok": False}, status=401)
        self.aufrufe.append((request.match_info["name"], await request.json()))
        return web.json_response(self.antwort, status=200 if self.antwort.get("ok") else 400)

    async def _partner(self, request: web.Request) -> web.Response:
        if not self._ok(request):
            return web.json_response({"ok": False}, status=401)
        self.partner.append((await request.json())["partner"])
        return web.json_response({"ok": True})

    async def senden(self, nachricht: dict[str, Any]) -> None:
        for ws in list(self.ws):
            await ws.send_str(json.dumps(nachricht))

    async def trennen(self) -> None:
        for ws in list(self.ws):
            await ws.close()

    async def verbunden(self, n: int = 1) -> None:
        for _ in range(200):
            if len(self.ws) >= n:
                return
            await asyncio.sleep(0.02)
        raise AssertionError("keine Live-Verbindung")


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


@pytest.fixture
async def modul_fabrik(hass, socket_enabled):
    server: list[TestServer] = []

    async def fabrik(b: dict[str, Any] | None = None, werte: dict[str, Any] | None = None) -> FakeModul:
        m = FakeModul(b or beschreibung(), werte)
        m.server = TestServer(m.app, host="127.0.0.1")
        await m.server.start_server()
        server.append(m.server)
        return m

    yield fabrik
    # Erst die Integration entladen (sie hält die Live-Verbindungen offen und
    # verbände sich sonst neu), dann die Server schließen.
    for entry in hass.config_entries.async_entries("yapaia"):
        await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    for s in server:
        await s.close()
