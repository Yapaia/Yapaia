"""Das Yapaia-Protokoll für Vision (docs/integration-protokoll.md).

Jeder Kanal wird eine Kamera in Home Assistant (`plattform: camera`): die
Integration holt Standbild und Live-Strom über die Pfade aus der Beschreibung,
mit dem Token dieser Instanz. Teilen sich Kanäle einen Grabber, kommt eine
Auswahl „Kanal“ dazu.
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

from .config import DATA_DIR, VERSION
from .texte import t, uebersetzen
from .vision import Vision

_LOGGER = logging.getLogger(__name__)

PROTOKOLL = 1
MODUL = "vision"
NAME = "Yapaia Vision"
API = "/yapaia/v1"
# Siehe docs/faehigkeiten.md.
FAEHIGKEITEN = ["kamera"]


class Identitaet:
    """Instanz-Kennung und Token: einmal erzeugt, in /data aufbewahrt."""

    def __init__(self, pfad: Path | None = None) -> None:
        self.pfad = pfad or DATA_DIR / "yapaia.json"
        daten: dict[str, Any] = {}
        with contextlib.suppress(OSError, ValueError):
            daten = json.loads(self.pfad.read_text())
        # Gab es die Kennung schon, lief Vision hier bereits (wichtig für `beschreibung_neu`).
        self.frisch = not daten.get("instanz")
        self.instanz = str(daten.get("instanz") or uuid.uuid4().hex[:12])
        self.token = str(daten.get("token") or secrets.token_urlsafe(32))
        if daten.get("instanz") != self.instanz or daten.get("token") != self.token:
            self.pfad.parent.mkdir(parents=True, exist_ok=True)
            self.pfad.write_text(json.dumps({"instanz": self.instanz, "token": self.token}))
            with contextlib.suppress(OSError):
                self.pfad.chmod(0o600)


def beschreibung(ident: Identitaet, vision: Vision) -> dict[str, Any]:
    entitaeten: list[dict[str, Any]] = []
    for k in vision.opts.kanaele:
        entitaeten.append(
            {
                # Schlüssel nach der NUMMER, nicht nach dem Namen: Umbenennen
                # im Add-on darf keine neue Entität erzeugen.
                "schluessel": f"kamera_{k.nummer}",
                "plattform": "camera",
                "name": {"de": k.name, "en": k.name},
                "symbol": "mdi:cctv",
                "bild": f"{API}/kamera/{k.nummer}/bild.jpg",
                "stream": f"{API}/kamera/{k.nummer}/stream.mjpeg",
                "attribute": [f"kamera_{k.nummer}_gewaehlt", f"kamera_{k.nummer}_live"],
            }
        )
    if vision.umschaltbar:
        entitaeten.append(
            {
                "schluessel": "kanal",
                "plattform": "select",
                "name": {"de": "Kanal", "en": "Channel"},
                "symbol": "mdi:video-switch",
                "optionen_aus": "kanal_optionen",
                "aktion": "kanal_waehlen",
            }
        )
    entitaeten += [
        {
            "schluessel": "aufnahme",
            "plattform": "binary_sensor",
            "name": {"de": "Aufnahme", "en": "Recording"},
            "geraeteklasse": "running",
            "kategorie": "diagnostic",
        },
        {
            "schluessel": "geraet",
            "plattform": "sensor",
            "name": {"de": "Grabber", "en": "Grabber"},
            "symbol": "mdi:usb",
            "kategorie": "diagnostic",
        },
        {
            "schluessel": "meldung",
            "plattform": "sensor",
            "name": {"de": "Meldung", "en": "Message"},
            "symbol": "mdi:alert-circle-outline",
            "kategorie": "diagnostic",
        },
    ]
    return {
        "protokoll": PROTOKOLL,
        "modul": MODUL,
        "instanz": ident.instanz,
        "name": NAME,
        "version": VERSION,
        "hersteller": "Yapaia",
        "faehigkeiten": FAEHIGKEITEN,
        "entitaeten": entitaeten,
        "aktionen": [
            {
                "name": "kanal_waehlen",
                "titel": {"de": "Kanal wählen", "en": "Select channel"},
                "beschreibung": {
                    "de": "Schaltet den Grabber auf diesen Kanal (Name oder Nummer), z. B. „Rückfahrkamera“.",
                    "en": "Switches the grabber to this channel (name or number).",
                },
                "felder": {"kanal": {"typ": "text", "pflicht": True, "titel": {"de": "Kanal", "en": "Channel"}}},
            }
        ],
        "ereignisse": [],
    }


def _fingerabdruck(ident: Identitaet, vision: Vision) -> str:
    return hashlib.sha256(json.dumps(beschreibung(ident, vision), sort_keys=True).encode()).hexdigest()


def beschreibung_neu(ident: Identitaet, vision: Vision) -> bool:
    """Hat sich die Beschreibung seit dem letzten Lauf geändert (Update mit
    neuer Aktion oder Entität)?

    Die Integration liest die Beschreibung nur beim Einrichten. Nach einem
    Update kennt sie eine neue Aktion deshalb erst nach einem Neustart von
    Home Assistant – außer Vision sagt es ihr (`beschreibung_geaendert`, siehe
    `_live`). Beim allerersten Start gibt es nichts zu melden: die Integration
    wird erst danach eingerichtet und liest dann ohnehin frisch. Fehlt nur der
    Fingerabdruck (Update von einer Version, die ihn noch nicht schrieb; auch: Kanal umbenannt), gilt
    die Beschreibung als geändert."""
    pfad = ident.pfad.with_name("yapaia-beschreibung.sha256")
    neu = _fingerabdruck(ident, vision)
    alt = None
    with contextlib.suppress(OSError):
        alt = pfad.read_text().strip()
    if alt != neu:
        with contextlib.suppress(OSError):
            pfad.write_text(neu)
    return alt != neu and not (alt is None and ident.frisch)


def zustand(vision: Vision, sprache: Any = None) -> dict[str, Any]:
    st = vision.status(sprache)
    werte: dict[str, Any] = {
        "aufnahme": st["aufnahme"],
        "geraet": st["geraet"],
        "kanal": st["gewaehlt"],
        "kanal_optionen": [k.name for k in vision.umschaltbar],
        "meldung": next((k["fehler"] for k in st["kanaele"] if k["fehler"]), None)
        or (st["hinweise"][0] if st["hinweise"] else None),
    }
    for k in st["kanaele"]:
        werte[f"kamera_{k['nummer']}_gewaehlt"] = k["gewaehlt"]
        werte[f"kamera_{k['nummer']}_live"] = k["live"]
    return werte


@web.middleware
async def nur_mit_token(request: web.Request, handler):
    if request.path.startswith(API + "/"):
        ident: Identitaet = request.app["yapaia_identitaet"]
        if request.headers.get("Authorization") != f"Bearer {ident.token}":
            return web.json_response({"ok": False, "fehler": t(request.app, "token")}, status=401)
    return await handler(request)


async def _beschreibung(request: web.Request) -> web.Response:
    return web.json_response(beschreibung(request.app["yapaia_identitaet"], request.app["vision"]))


async def _live(request: web.Request) -> web.WebSocketResponse:
    vision: Vision = request.app["vision"]
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    queue = vision.abonnieren()
    letzter = zustand(vision, request.app)
    await ws.send_str(json.dumps({"typ": "zustand", "werte": letzter}, ensure_ascii=False))
    if request.app["yapaia_beschreibung_neu"]:
        # einmal: die Integration lädt daraufhin neu und verbindet sich wieder
        request.app["yapaia_beschreibung_neu"] = False
        await ws.send_str(json.dumps({"typ": "beschreibung_geaendert"}))

    async def senden() -> None:
        nonlocal letzter
        while True:
            await queue.get()
            neu = zustand(vision, request.app)
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
        vision.abmelden(queue)
    return ws


async def _aktion(request: web.Request) -> web.Response:
    name = request.match_info["name"]
    if name != "kanal_waehlen":
        return web.json_response({"ok": False, "fehler": t(request.app, "aktion_unbekannt", name=name)}, status=404)
    try:
        daten = await request.json()
    except ValueError:
        daten = None
    # `kanal` von der Aktion, `wert` von der Auswahl-Entität
    wert = (daten.get("kanal") or daten.get("wert")) if isinstance(daten, dict) else None
    try:
        k = request.app["vision"].waehlen(wert)
    except ValueError as err:
        return web.json_response({"ok": False, "fehler": uebersetzen(err.args[0], request.app) if err.args else str(err)}, status=400)
    return web.json_response({"ok": True, "ergebnis": {"kanal": k.name}})


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


DESIGN_DATEI = DATA_DIR / "design.json"


def design_laden() -> dict[str, Any] | None:
    """Das zuletzt von der Integration geschickte Design (§8a), auch nach Neustart."""
    with contextlib.suppress(OSError, ValueError):
        daten = json.loads(DESIGN_DATEI.read_text())
        if isinstance(daten, dict) and isinstance(daten.get("schema"), dict):
            return daten
    return None


async def _design(request: web.Request) -> web.Response:
    """Das Design-Schema von der Integration (docs/integration-protokoll.md §8a)."""
    try:
        daten = await request.json()
    except ValueError:
        return web.json_response({"ok": False, "fehler": "kein JSON"}, status=400)
    if not isinstance(daten, dict) or not isinstance(daten.get("schema"), dict):
        return web.json_response({"ok": False, "fehler": "schema fehlt"}, status=400)
    request.app["yapaia_design"] = daten
    with contextlib.suppress(OSError):
        DESIGN_DATEI.parent.mkdir(parents=True, exist_ok=True)
        DESIGN_DATEI.write_text(json.dumps(daten))
    _LOGGER.info("Design: %s", daten["schema"].get("name"))
    return web.json_response({"ok": True})


SPRACHE_DATEI = DATA_DIR / "sprache.json"


def sprache_laden() -> str | None:
    """Die zuletzt von der Integration geschickte HA-Sprache ("de"/"en"), auch nach Neustart."""
    with contextlib.suppress(OSError, ValueError):
        daten = json.loads(SPRACHE_DATEI.read_text())
        if isinstance(daten, dict) and daten.get("sprache") in ("de", "en"):
            return daten["sprache"]
    return None


async def _sprache(request: web.Request) -> web.Response:
    """Die HA-Sprache von der Integration (docs/integration-protokoll.md §8b)."""
    try:
        daten = await request.json()
    except ValueError:
        return web.json_response({"ok": False, "fehler": "kein JSON"}, status=400)
    if not isinstance(daten, dict) or not isinstance(daten.get("sprache"), str):
        return web.json_response({"ok": False, "fehler": "sprache fehlt"}, status=400)
    sprache = daten["sprache"] if daten["sprache"] in ("de", "en") else "en"
    request.app["yapaia_sprache"] = sprache
    with contextlib.suppress(OSError):
        SPRACHE_DATEI.parent.mkdir(parents=True, exist_ok=True)
        SPRACHE_DATEI.write_text(json.dumps({"sprache": sprache}))
    _LOGGER.info("Sprache: %s", sprache)
    return web.json_response({"ok": True})


def einbinden(app: web.Application, ident: Identitaet) -> None:
    """Braucht `app["vision"]`. Die Kamerapfade unter `API` legt `web.py` an;
    die Middleware schützt sie mit dem Token wie alles andere hier."""
    app["yapaia_identitaet"] = ident
    app["yapaia_partner"] = []
    app["yapaia_design"] = design_laden()
    app["yapaia_sprache"] = sprache_laden()
    app["yapaia_beschreibung_neu"] = beschreibung_neu(ident, app["vision"])
    app.middlewares.insert(0, nur_mit_token)
    app.router.add_get(f"{API}/beschreibung", _beschreibung)
    app.router.add_get(f"{API}/live", _live)
    app.router.add_post(API + "/aktion/{name}", _aktion)
    app.router.add_post(f"{API}/partner", _partner)
    app.router.add_post(f"{API}/design", _design)
    app.router.add_post(f"{API}/sprache", _sprache)
