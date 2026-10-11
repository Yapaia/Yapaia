"""Eine eingerichtete Modul-Instanz: Beschreibung, Zustände, Live-Verbindung."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr

from .client import YapaiaClient
from .const import DOMAIN, EREIGNIS, RECONNECT_MAX_S

_LOGGER = logging.getLogger(__name__)


def text(werte: Any, sprache: str) -> str:
    """Anzeigetext aus {"de": …, "en": …}: HA-Sprache, sonst en, sonst der erste."""
    if isinstance(werte, str):
        return werte
    if not isinstance(werte, dict) or not werte:
        return ""
    return str(werte.get(sprache[:2]) or werte.get("en") or next(iter(werte.values())))


class YapaiaModul:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: YapaiaClient, beschreibung: dict[str, Any]) -> None:
        self.hass = hass
        self.entry = entry
        self.client = client
        self.beschreibung = beschreibung
        self.modul: str = beschreibung["modul"]
        self.instanz: str = beschreibung["instanz"]
        self.werte: dict[str, Any] = {}
        self.verbunden = False
        self.geraet_id: str | None = None
        self._hoerer: set[Callable[[], None]] = set()
        # Spezial-Teile (z. B. der Beat-Koordinator), sofern beschrieben
        self.beat: Any = None
        self._task: asyncio.Task | None = None

    # ------------------------------------------------------------------
    @property
    def kennung(self) -> str:
        return f"{self.modul}_{self.instanz}"

    @property
    def name(self) -> str:
        return str(self.beschreibung.get("name") or f"Yapaia {self.modul}")

    @property
    def sprache(self) -> str:
        return self.hass.config.language or "en"

    def entitaeten(self) -> list[dict[str, Any]]:
        return [e for e in self.beschreibung.get("entitaeten", []) if isinstance(e, dict) and e.get("schluessel")]

    def spezial(self) -> set[str]:
        return {
            str(e.get("spezial"))
            for e in self.beschreibung.get("entitaeten", [])
            if isinstance(e, dict) and e.get("plattform") == "spezial" and e.get("spezial")
        }

    def aktionen(self) -> list[dict[str, Any]]:
        return [a for a in self.beschreibung.get("aktionen", []) if isinstance(a, dict) and a.get("name")]

    def ereignisse(self) -> list[dict[str, Any]]:
        return [e for e in self.beschreibung.get("ereignisse", []) if isinstance(e, dict) and e.get("name")]

    # ------------------------------------------------------------------
    @callback
    def hoeren(self, fn: Callable[[], None]) -> Callable[[], None]:
        self._hoerer.add(fn)
        return lambda: self._hoerer.discard(fn)

    @callback
    def _melden(self) -> None:
        for fn in list(self._hoerer):
            fn()

    def geraet_eintragen(self) -> None:
        reg = dr.async_get(self.hass)
        b = self.beschreibung
        geraet = reg.async_get_or_create(
            config_entry_id=self.entry.entry_id,
            identifiers={(DOMAIN, self.kennung)},
            name=self.name,
            manufacturer=b.get("hersteller") or "Yapaia",
            model=self.modul,
            sw_version=b.get("version"),
            configuration_url=b.get("konfiguration_url") if str(b.get("konfiguration_url", "")).startswith("http") else None,
        )
        self.geraet_id = geraet.id

    # ------------------------------------------------------------------
    def starten(self) -> None:
        self._task = self.entry.async_create_background_task(self.hass, self._live(), f"{DOMAIN}_{self.kennung}_live")

    async def stoppen(self) -> None:
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)

    async def _live(self) -> None:
        pause = 1
        while True:
            try:
                async for nachricht in self.client.live():
                    if not self.verbunden:
                        self.verbunden = True
                        pause = 1
                        _LOGGER.debug("%s verbunden", self.kennung)
                    self._verarbeiten(nachricht)
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001 – jede Störung heißt: neu verbinden
                _LOGGER.debug("%s Live-Verbindung: %s", self.kennung, err)
            if self.verbunden:
                self.verbunden = False
                self._melden()
            await asyncio.sleep(pause)
            pause = min(pause * 2, RECONNECT_MAX_S)

    @callback
    def _verarbeiten(self, n: dict[str, Any]) -> None:
        typ = n.get("typ")
        if typ == "zustand" and isinstance(n.get("werte"), dict):
            self.werte.update(n["werte"])
            self._melden()
        elif typ == "ereignis" and n.get("name"):
            self.hass.bus.async_fire(
                EREIGNIS,
                {
                    "modul": self.modul,
                    "instanz": self.instanz,
                    "geraet_id": self.geraet_id,
                    "name": n["name"],
                    "daten": n.get("daten") or {},
                },
            )
        elif typ == "beschreibung_geaendert":
            _LOGGER.info("%s: Beschreibung geändert – lade neu", self.kennung)
            self.hass.config_entries.async_schedule_reload(self.entry.entry_id)
