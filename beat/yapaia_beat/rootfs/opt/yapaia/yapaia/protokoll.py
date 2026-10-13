"""Das Yapaia-Protokoll für Beat (docs/integration-protokoll.md).

Beat meldet sich bei der zentralen Integration „Yapaia“ an und beschreibt sich
dort als ein Gerät mit `spezial: beat`: Mediaplayer, Lautsprecher-Weiterleitung,
Logos, Slideshow und Ansagen erledigt der Beat-Teil der Integration über Beats
eigene Schnittstelle (`/api/...`). Über das Protokoll laufen Anmeldung,
Verfügbarkeit und die Partnerliste.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import logging
import secrets
import uuid
from pathlib import Path
from typing import Any

from aiohttp import WSMsgType, web

from . import befehl
from .config import DATA_DIR, VERSION

_LOGGER = logging.getLogger(__name__)

PROTOKOLL = 1
MODUL = "beat"
NAME = "Yapaia Beat"
API = "/yapaia/v1"
# Beat mischt Ansagen ins Programm; Home Assistant rendert dafür die Stimme
# (Aktion `yapaia.beat_ansage`, siehe docs/faehigkeiten.md).
FAEHIGKEITEN = ["radio", "ansage.einmischen"]


class Identitaet:
    """Instanz-Kennung und Token: einmal erzeugt, in /data aufbewahrt."""

    def __init__(self, pfad: Path | None = None) -> None:
        self.pfad = pfad or DATA_DIR / "yapaia.json"
        daten: dict[str, Any] = {}
        with contextlib.suppress(OSError, ValueError):
            daten = json.loads(self.pfad.read_text())
        # Gab es die Kennung schon, lief Beat hier bereits (wichtig für `beschreibung_neu`).
        self.frisch = not daten.get("instanz")
        self.instanz = str(daten.get("instanz") or uuid.uuid4().hex[:12])
        self.token = str(daten.get("token") or secrets.token_urlsafe(32))
        if daten.get("instanz") != self.instanz or daten.get("token") != self.token:
            self.pfad.parent.mkdir(parents=True, exist_ok=True)
            self.pfad.write_text(json.dumps({"instanz": self.instanz, "token": self.token}))
            with contextlib.suppress(OSError):
                self.pfad.chmod(0o600)


def beschreibung(ident: Identitaet) -> dict[str, Any]:
    return {
        "protokoll": PROTOKOLL,
        "modul": MODUL,
        "instanz": ident.instanz,
        "name": NAME,
        "version": VERSION,
        "hersteller": "Yapaia",
        "faehigkeiten": FAEHIGKEITEN,
        "entitaeten": [{"schluessel": "radio", "plattform": "spezial", "spezial": "beat"}],
        "aktionen": [
            {
                "name": "befehl",
                "titel": {"de": "Sprachbefehl", "en": "Voice command"},
                "beschreibung": {
                    "de": "Ein Satz wie „Spiel SWR3“, „Radio aus“ oder „Wechsle die Ausgabe auf Wohnzimmer“. "
                    "Die Antwort kommt als Ergebnis zurück.",
                    "en": 'A sentence such as "Spiel SWR3". The reply is returned as the result.',
                },
                "felder": {"text": {"typ": "text", "pflicht": True, "titel": {"de": "Satz", "en": "Sentence"}}},
            }
        ],
        "ereignisse": [],
    }


def _fingerabdruck(ident: Identitaet) -> str:
    return hashlib.sha256(json.dumps(beschreibung(ident), sort_keys=True).encode()).hexdigest()


def beschreibung_neu(ident: Identitaet) -> bool:
    """Hat sich die Beschreibung seit dem letzten Lauf geändert (Update mit
    neuer Aktion oder Entität)?

    Die Integration liest die Beschreibung nur beim Einrichten. Nach einem
    Update kennt sie eine neue Aktion deshalb erst nach einem Neustart von
    Home Assistant – außer Beat sagt es ihr (`beschreibung_geaendert`, siehe
    `_live`). Beim allerersten Start gibt es nichts zu melden: die Integration
    wird erst danach eingerichtet und liest dann ohnehin frisch. Fehlt nur der
    Fingerabdruck (Update von einer Version, die ihn noch nicht schrieb), gilt
    die Beschreibung als geändert."""
    pfad = ident.pfad.with_name("yapaia-beschreibung.sha256")
    neu = _fingerabdruck(ident)
    alt = None
    with contextlib.suppress(OSError):
        alt = pfad.read_text().strip()
    if alt != neu:
        with contextlib.suppress(OSError):
            pfad.write_text(neu)
    return alt != neu and not (alt is None and ident.frisch)


def zustand(status: dict[str, Any]) -> dict[str, Any]:
    """Was über die Live-Verbindung geht. Die Einzelheiten holt der Beat-Teil
    der Integration selbst (`/api/ws`); hier nur, woran man den Betrieb sieht."""
    station = status.get("station") or {}
    return {"zustand": status.get("state"), "sender": station.get("name")}


@web.middleware
async def nur_mit_token(request: web.Request, handler):
    if request.path.startswith(API + "/"):
        ident: Identitaet = request.app["yapaia_identitaet"]
        if request.headers.get("Authorization") != f"Bearer {ident.token}":
            return web.json_response({"ok": False, "fehler": "Token fehlt oder falsch"}, status=401)
    return await handler(request)


async def _beschreibung(request: web.Request) -> web.Response:
    return web.json_response(beschreibung(request.app["yapaia_identitaet"]))


async def _live(request: web.Request) -> web.WebSocketResponse:
    radio = request.app["radio"]
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    queue = radio.subscribe()
    letzter = zustand(radio.status())
    await ws.send_str(json.dumps({"typ": "zustand", "werte": letzter}, ensure_ascii=False))
    if request.app["yapaia_beschreibung_neu"]:
        # einmal: die Integration lädt daraufhin neu und verbindet sich wieder
        request.app["yapaia_beschreibung_neu"] = False
        await ws.send_str(json.dumps({"typ": "beschreibung_geaendert"}))

    async def senden() -> None:
        nonlocal letzter
        while True:
            neu = zustand(json.loads(await queue.get()))
            diff = {k: v for k, v in neu.items() if letzter.get(k) != v}
            if diff:
                letzter = neu
                await ws.send_str(json.dumps({"typ": "zustand", "werte": diff}, ensure_ascii=False))

    task = asyncio.create_task(senden())
    try:
        async for msg in ws:
            if msg.type == WSMsgType.ERROR:
                break
    finally:
        task.cancel()
        radio.unsubscribe(queue)
    return ws


async def _aktion(request: web.Request) -> web.Response:
    name = request.match_info["name"]
    if name != "befehl":
        return web.json_response({"ok": False, "fehler": f"Unbekannte Aktion {name}"}, status=404)
    try:
        daten = await request.json()
    except ValueError:
        daten = None
    text = str(daten.get("text") or "").strip() if isinstance(daten, dict) else ""
    if not text:
        return web.json_response({"ok": False, "fehler": "text fehlt"}, status=400)
    try:
        antwort = await befehl.ausfuehren(request.app["radio"], text)
    except Exception as err:  # noqa: BLE001 -- die Antwort wird gesprochen, auch wenn das Radio gerade nicht kann
        _LOGGER.warning("Sprachbefehl „%s“ gescheitert: %s", text, err)
        antwort = f"Das hat nicht geklappt: {err}"
    _LOGGER.info("Sprachbefehl „%s“ → %s", text, antwort)
    return web.json_response({"ok": True, "ergebnis": {"antwort": antwort}})


async def _partner(request: web.Request) -> web.Response:
    try:
        daten = await request.json()
    except ValueError:
        return web.json_response({"ok": False, "fehler": "kein JSON"}, status=400)
    liste = daten.get("partner") if isinstance(daten, dict) else None
    if not isinstance(liste, list):
        return web.json_response({"ok": False, "fehler": "partner fehlt"}, status=400)
    request.app["yapaia_partner"] = liste
    _LOGGER.info("Yapaia-Partner: %s", ", ".join(f"{p.get('name')} ({p.get('modul')})" for p in liste) or "keine")
    return web.json_response({"ok": True})


def einbinden(app: web.Application, ident: Identitaet) -> None:
    app["yapaia_identitaet"] = ident
    app["yapaia_partner"] = []
    app["yapaia_beschreibung_neu"] = beschreibung_neu(ident)
    app.middlewares.insert(0, nur_mit_token)
    app.router.add_get(f"{API}/beschreibung", _beschreibung)
    app.router.add_get(f"{API}/live", _live)
    app.router.add_post(API + "/aktion/{name}", _aktion)
    app.router.add_post(f"{API}/partner", _partner)
