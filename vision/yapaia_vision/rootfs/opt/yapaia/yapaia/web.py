"""HTTP: die Seite des Add-ons (Ingress) und die Kamerabilder.

Dieselben Bilder unter zwei Wegen:

* `/api/kamera/<n>/…` für die eigene Seite (über Ingress, also hinter der
  Anmeldung von Home Assistant),
* `/yapaia/v1/kamera/<n>/…` für die Integration, mit Token (protokoll.py).
"""

from __future__ import annotations

import asyncio
import contextlib

from aiohttp import web

from . import protokoll
from .config import APP_DIR, VERSION
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
    st = request.app["vision"].status()
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
        return web.json_response({"ok": False, "fehler": str(err)}, status=400)
    return web.json_response({"ok": True, "kanal": k.name})


async def seite(request: web.Request) -> web.FileResponse:
    return web.FileResponse(APP_DIR / "www" / "index.html", headers={"Cache-Control": "no-cache"})


def create_app(vision: Vision, ident: protokoll.Identitaet) -> web.Application:
    app = web.Application()
    app["vision"] = vision
    app.router.add_get("/", seite)
    app.router.add_get("/api/status", status)
    app.router.add_post("/api/kanal", waehlen)
    for basis in ("/api", protokoll.API):
        app.router.add_get(basis + "/kamera/{nummer}/bild.jpg", bild)
        app.router.add_get(basis + "/kamera/{nummer}/stream.mjpeg", strom)
    protokoll.einbinden(app, ident)
    return app
