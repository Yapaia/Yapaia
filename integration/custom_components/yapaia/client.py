"""HTTP/WebSocket-Zugang zu einer Modul-Instanz."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import aiohttp

from .const import API


class YapaiaFehler(Exception):
    """Das Modul hat abgelehnt oder ist nicht erreichbar."""


class YapaiaClient:
    def __init__(self, session: aiohttp.ClientSession, url: str, token: str) -> None:
        self.url = url.rstrip("/")
        self._session = session
        self._kopf = {"Authorization": f"Bearer {token}"}

    async def beschreibung(self) -> dict[str, Any]:
        try:
            async with self._session.get(
                f"{self.url}{API}/beschreibung", headers=self._kopf, timeout=aiohttp.ClientTimeout(total=10)
            ) as r:
                if r.status == 401:
                    raise YapaiaFehler("Token abgelehnt")
                r.raise_for_status()
                return await r.json()
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            raise YapaiaFehler(f"nicht erreichbar: {err}") from err

    async def aktion(self, name: str, daten: dict[str, Any]) -> dict[str, Any]:
        try:
            async with self._session.post(
                f"{self.url}{API}/aktion/{name}", json=daten, headers=self._kopf,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as r:
                antwort = await r.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            raise YapaiaFehler(f"nicht erreichbar: {err}") from err
        if not isinstance(antwort, dict) or not antwort.get("ok", r.status < 400):
            fehler = antwort.get("fehler") if isinstance(antwort, dict) else None
            raise YapaiaFehler(fehler or f"HTTP {r.status}")
        return antwort

    async def partner(self, liste: list[dict[str, Any]]) -> None:
        try:
            async with self._session.post(
                f"{self.url}{API}/partner", json={"partner": liste}, headers=self._kopf,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as r:
                r.raise_for_status()
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise YapaiaFehler(f"nicht erreichbar: {err}") from err

    async def live(self) -> AsyncIterator[dict[str, Any]]:
        """Nachrichten der Live-Verbindung, bis sie abreißt."""
        async with self._session.ws_connect(f"{self.url}{API}/live", headers=self._kopf, heartbeat=30) as ws:
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        daten = json.loads(msg.data)
                    except ValueError:
                        continue
                    if isinstance(daten, dict):
                        yield daten
                elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSED):
                    break
