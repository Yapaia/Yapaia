"""Alle Kanäle, ihre Geräte und der Zustand für Home Assistant."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from . import quellen
from .aufnahme import Erfassung
from .config import Kanal, Options
from .quellen import Geraet, Quelle

_LOGGER = logging.getLogger(__name__)


class Vision:
    def __init__(
        self,
        opts: Options,
        gefunden: list[Geraet] | None = None,
        hinweise: list[str] | None = None,
        firmware_fehlt: bool = False,
    ) -> None:
        self.opts = opts
        self.gefunden = quellen.geraete() if gefunden is None else gefunden
        # Hinweise von vorher (Somagic: Firmware fehlt …) zuerst -- sie
        # erklären, warum danach „kein Grabber gefunden“ folgt.
        self.firmware_fehlt = firmware_fehlt
        self.zuordnung, eigene = quellen.zuordnen(opts, self.gefunden)
        self.hinweise = [*(hinweise or []), *eigene]
        for h in self.hinweise:
            _LOGGER.warning("%s", h)
        nach_pfad = {g.pfad: g for g in self.gefunden}
        gruppen: dict[str, list[tuple[Kanal, Quelle]]] = {}
        for k in opts.kanaele:
            q = self.zuordnung.get(k.nummer)
            if q is not None:
                gruppen.setdefault(q.geraet, []).append((k, q))
        self.erfassungen: dict[str, Erfassung] = {
            pfad: Erfassung(opts, pfad, liste, nach_pfad.get(pfad), self._melden) for pfad, liste in gruppen.items()
        }
        self._abos: set[asyncio.Queue[None]] = set()
        for g in self.gefunden:
            _LOGGER.info("Grabber: %s, Eingänge: %s", g.beschreibung, ", ".join(g.eingaenge))
        for k in opts.kanaele:
            q = self.zuordnung.get(k.nummer)
            _LOGGER.info("Kanal %d „%s“ → %s", k.nummer, k.name, f"{q.geraet} Eingang {q.eingang + 1}" if q else "—")

    # ─── Kanäle ────────────────────────────────────────────────────────────
    def kanal(self, wert: Any) -> Kanal | None:
        """Ein Kanal nach Nummer („1“) oder Name („Rückfahrkamera“)."""
        text = str(wert or "").strip()
        for k in self.opts.kanaele:
            if text == str(k.nummer) or text.casefold() == k.name.casefold():
                return k
        return None

    def erfassung(self, nummer: int) -> Erfassung | None:
        q = self.zuordnung.get(nummer)
        return self.erfassungen.get(q.geraet) if q else None

    @property
    def umschaltbar(self) -> list[Kanal]:
        """Kanäle, die sich ein Gerät mit anderen teilen -- nur sie brauchen eine Wahl."""
        raus: list[Kanal] = []
        for e in self.erfassungen.values():
            if len(e.kanaele) > 1:
                raus.extend(k for k, _ in e.kanaele.values())
        return raus

    def waehlen(self, wert: Any) -> Kanal:
        k = self.kanal(wert)
        if k is None:
            raise ValueError(f"Keinen Kanal „{wert}“ gefunden")
        e = self.erfassung(k.nummer)
        if e is None:
            raise ValueError(f"{k.name} hat kein Gerät")
        e.waehlen(k.nummer)
        return k

    async def stoppen(self) -> None:
        for e in self.erfassungen.values():
            await e.stoppen()

    # ─── Zustand ───────────────────────────────────────────────────────────
    def geraet_text(self) -> str:
        if self.opts.testbild:
            return "Testbild"
        if not self.gefunden:
            return "kein Grabber gefunden"
        return "; ".join(g.beschreibung for g in self.gefunden)

    def gewaehlt(self) -> str | None:
        """Der gewählte Kanal des ersten Geräts mit mehreren Kanälen."""
        for e in self.erfassungen.values():
            if len(e.kanaele) > 1:
                return e.kanaele[e.gewaehlt][0].name
        return None

    def status(self) -> dict[str, Any]:
        kanaele = []
        for k in self.opts.kanaele:
            q = self.zuordnung.get(k.nummer)
            e = self.erfassung(k.nummer)
            kanaele.append(
                {
                    "nummer": k.nummer,
                    "name": k.name,
                    "geraet": q.geraet if q else None,
                    "eingang": q.eingang + 1 if q else None,
                    "gewaehlt": bool(e and e.gewaehlt == k.nummer),
                    "live": bool(e and e.gewaehlt == k.nummer and e.laeuft),
                    "zuschauer": e.zuschauer(k.nummer) if e else 0,
                    "fehler": e.fehler if e else None,
                }
            )
        return {
            "geraet": self.geraet_text(),
            "geraete": [
                {"pfad": g.pfad, "treiber": g.treiber, "karte": g.karte, "eingaenge": g.eingaenge, "normen": g.normen}
                for g in self.gefunden
            ],
            "testbild": self.opts.testbild,
            "firmware_fehlt": self.firmware_fehlt,
            "gewaehlt": self.gewaehlt(),
            "aufnahme": any(e.laeuft for e in self.erfassungen.values()),
            "hinweise": self.hinweise,
            "kanaele": kanaele,
        }

    # ─── Änderungen melden ─────────────────────────────────────────────────
    def abonnieren(self) -> asyncio.Queue[None]:
        q: asyncio.Queue[None] = asyncio.Queue(maxsize=1)
        self._abos.add(q)
        return q

    def abmelden(self, q: asyncio.Queue[None]) -> None:
        self._abos.discard(q)

    def _melden(self) -> None:
        for q in self._abos:
            if not q.full():
                q.put_nowait(None)
