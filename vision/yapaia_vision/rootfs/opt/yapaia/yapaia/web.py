"""HTTP: die Seite des Add-ons (Ingress) und die Kamerabilder.

Dieselben Bilder unter zwei Wegen:

* `/api/kamera/<n>/…` für die eigene Seite (über Ingress, also hinter der
  Anmeldung von Home Assistant),
* `/yapaia/v1/kamera/<n>/…` für die Integration, mit Token (protokoll.py).
"""

from __future__ import annotations

import asyncio
import contextlib
import os
from pathlib import Path

from aiohttp import web

from . import protokoll, somagic
from .config import APP_DIR, DATA_DIR, VERSION
from .texte import t, uebersetzen
from .vision import Vision

GRENZE = "yapaiabild"


def _nummer(request: web.Request) -> int:
    try:
        return int(request.match_info["nummer"])
    except ValueError as err:
        raise web.HTTPNotFound() from err


async def bild(request: web.Request) -> web.Response:
    vision: Vision = request.app["vision"]
    nummer = _nummer(request)
    e = vision.erfassung(nummer)
    if e is None:
        raise web.HTTPNotFound(text="Kanal ohne Gerät")
    daten = await e.standbild(nummer)
    if daten is None:
        # 503 statt eines Platzhalters: Home Assistant zeigt dann „nicht
        # verfügbar“ -- ein erfundenes Bild sähe aus wie eine Kamera.
        raise web.HTTPServiceUnavailable(text="Noch kein Bild")
    return web.Response(body=daten, content_type="image/jpeg", headers={"Cache-Control": "no-store"})


async def strom(request: web.Request) -> web.StreamResponse:
    """MJPEG: `multipart/x-mixed-replace`, versteht jeder Browser und Home Assistant."""
    vision: Vision = request.app["vision"]
    nummer = _nummer(request)
    e = vision.erfassung(nummer)
    if e is None:
        raise web.HTTPNotFound(text="Kanal ohne Gerät")
    antwort = web.StreamResponse(
        headers={
            "Content-Type": f"multipart/x-mixed-replace; boundary={GRENZE}",
            "Cache-Control": "no-store",
        }
    )
    await antwort.prepare(request)
    q = e.abonnieren(nummer)
    try:
        while True:
            daten = await q.get()
            await antwort.write(
                f"--{GRENZE}\r\nContent-Type: image/jpeg\r\nContent-Length: {len(daten)}\r\n\r\n".encode()
                + daten
                + b"\r\n"
            )
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    finally:
        e.abmelden(nummer, q)
    with contextlib.suppress(ConnectionResetError, RuntimeError):
        await antwort.write_eof()
    return antwort


async def status(request: web.Request) -> web.Response:
    st = request.app["vision"].status(request.app)
    st["version"] = VERSION
    return web.json_response(st)


async def waehlen(request: web.Request) -> web.Response:
    try:
        daten = await request.json()
    except ValueError:
        daten = {}
    try:
        k = request.app["vision"].waehlen(daten.get("kanal") if isinstance(daten, dict) else None)
    except ValueError as err:
        return web.json_response({"ok": False, "fehler": uebersetzen(err.args[0], request.app) if err.args else str(err)}, status=400)
    return web.json_response({"ok": True, "kanal": k.name})


async def firmware(request: web.Request) -> web.Response:
    """Treiberdatei hochladen (`SmiUsbGrabber3F.sys`, `Setup.exe` …).

    Danach startet Vision neu: der Stick bekommt die Firmware und meldet sich
    mit neuer Kennung, und alles wird frisch zugeordnet."""
    try:
        teile = await request.multipart()
        teil = await teile.next()
    except (ValueError, AssertionError):
        teil = None
    if teil is None or not getattr(teil, "filename", None):
        return web.json_response({"ok": False, "fehler": t(request.app, "keine_datei")}, status=400)
    ordner = DATA_DIR / "hochgeladen"
    ordner.mkdir(parents=True, exist_ok=True)
    datei = ordner / Path(teil.filename).name
    groesse = 0
    with datei.open("wb") as f:
        while chunk := await teil.read_chunk(1 << 20):
            groesse += len(chunk)
            if groesse > 200 * 1024 * 1024:
                datei.unlink(missing_ok=True)
                return web.json_response({"ok": False, "fehler": t(request.app, "datei_zu_gross")}, status=413)
            f.write(chunk)
    try:
        ok, text = await asyncio.to_thread(somagic.extrahieren, datei)
    finally:
        datei.unlink(missing_ok=True)
    if not ok:
        return web.json_response({"ok": False, "fehler": uebersetzen(text, request.app)}, status=400)
    # s6 startet den Dienst neu (Ende mit 0 hält den Container nicht an).
    asyncio.get_running_loop().call_later(1, os._exit, 0)
    return web.json_response({"ok": True, "text": t(request.app, "neustart", text=text)})


async def seite(request: web.Request) -> web.FileResponse:
    return web.FileResponse(APP_DIR / "www" / "index.html", headers={"Cache-Control": "no-cache"})



async def design(request: web.Request) -> web.Response:
    """Das Design-Schema der Integration für die eigene Seite (oder {} ohne)."""
    return web.json_response(request.app.get("yapaia_design") or {}, headers={"Cache-Control": "no-cache"})

async def sprache(request: web.Request) -> web.Response:
    """Die HA-Sprache der Integration für die eigene Seite (null ohne)."""
    return web.json_response({"sprache": request.app.get("yapaia_sprache")}, headers={"Cache-Control": "no-cache"})


def create_app(vision: Vision, ident: protokoll.Identitaet) -> web.Application:
    app = web.Application(client_max_size=200 * 1024 * 1024)
    app["vision"] = vision
    app.router.add_get("/", seite)
    app.router.add_get("/api/status", status)
    app.router.add_get("/api/design", design)
    app.router.add_get("/api/sprache", sprache)
    app.router.add_post("/api/kanal", waehlen)
    app.router.add_post("/api/firmware", firmware)
    for basis in ("/api", protokoll.API):
        app.router.add_get(basis + "/kamera/{nummer}/bild.jpg", bild)
        app.router.add_get(basis + "/kamera/{nummer}/stream.mjpeg", strom)
    protokoll.einbinden(app, ident)
    return app
