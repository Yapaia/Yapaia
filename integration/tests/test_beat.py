"""Der Beat-Teil der Integration (`spezial: beat`) im echten Home Assistant."""

from __future__ import annotations

import json

from aiohttp import web
from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er

from custom_components.yapaia.const import DOMAIN

from .conftest import TOKEN, beschreibung, geraet_finden

STATUS = {
    "state": "playing",
    "playing": True,
    "station": {"id": "fm-d3d5", "name": "SWR3", "logo_url": "api/logo/fm-d3d5?v=2", "band": "fm"},
    "band": "fm",
    "frequency": 98.3,
    "volume": 60,
    "muted": False,
    "favorites": [{"id": "fm-d3d5", "name": "SWR3", "band": "fm"}],
    "active_favorite": "fm-d3d5",
    "players": [],
    "music_assistant": False,
    "auto_follow": True,
    "local_output": True,
    "scan": {"running": False},
    "follow": {},
}


def beat_beschreibung() -> dict:
    return beschreibung(
        modul="beat", instanz="b1", name="Yapaia Beat",
        entitaeten=[{"schluessel": "radio", "plattform": "spezial", "spezial": "beat"}],
        aktionen=[], ereignisse=[], faehigkeiten=["radio", "ansage.einmischen"],
    )


def beat_api(m) -> None:
    """Beats eigene Schnittstelle (/api/...), wie das Add-on sie anbietet."""
    m.befehle = []

    async def status(request):
        return web.json_response(STATUS)

    async def ws(request):
        w = web.WebSocketResponse()
        await w.prepare(request)
        await w.send_str(json.dumps(STATUS))
        async for _ in w:
            pass
        return w

    async def befehl(request):
        m.befehle.append((request.path, await request.json()))
        return web.json_response({"ok": True})

    async def logo(request):
        return web.Response(body=b"\x89PNG", content_type="image/png")

    m.app.router.add_get("/api/status", status)
    m.app.router.add_get("/api/ws", ws)
    m.app.router.add_post("/api/play", befehl)
    m.app.router.add_post("/api/settings", befehl)
    m.app.router.add_get("/api/logo/{sid}", logo)


async def beat_einrichten(hass: HomeAssistant, modul_fabrik):
    from aiohttp.test_utils import TestServer

    from .conftest import FakeModul

    m = FakeModul(beat_beschreibung())
    beat_api(m)
    m.server = TestServer(m.app, host="127.0.0.1")
    await m.server.start_server()
    entry = MockConfigEntry(domain=DOMAIN, title="Yapaia Beat", unique_id="beat_b1",
                            data={"url": m.url, "token": TOKEN, "modul": "beat", "instanz": "b1"})
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state.name == "LOADED", (entry.state, entry.reason)
    return m, entry


async def test_beat_entitaeten_mit_den_bisherigen_namen(hass: HomeAssistant, modul_fabrik) -> None:
    m, entry = await beat_einrichten(hass, modul_fabrik)
    try:
        geraet = geraet_finden(hass, "beat_b1")
        assert geraet is not None and geraet.name == "Yapaia Beat"
        # dieselben Entity-IDs wie mit der alten Integration yapaia_beat
        assert hass.states.get("media_player.yapaia_beat").state == "playing"
        assert hass.states.get("sensor.yapaia_beat_station").state == "SWR3"
        assert hass.states.get("select.yapaia_beat_favorite").state == "SWR3"
        assert hass.states.get("switch.yapaia_beat_auto_follow").state == "on"
        # alle am selben Gerät
        ids = {e.device_id for e in er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id)}
        assert ids == {geraet.id}
    finally:
        await hass.config_entries.async_unload(entry.entry_id)
        await m.server.close()


async def test_beat_aktionen_heissen_jetzt_yapaia_beat(hass: HomeAssistant, modul_fabrik) -> None:
    m, entry = await beat_einrichten(hass, modul_fabrik)
    try:
        for name in ("beat_ansage", "beat_abspielen", "beat_suchlauf", "beat_favorit", "beat_ausgabe"):
            assert hass.services.has_service(DOMAIN, name), name
        await hass.services.async_call(DOMAIN, "beat_abspielen", {"station_id": "fm-d3d5"}, blocking=True)
        await hass.services.async_call("switch", "turn_off", {"entity_id": "switch.yapaia_beat_auto_follow"}, blocking=True)
        assert ("/api/play", {"id": "fm-d3d5"}) in m.befehle
        assert ("/api/settings", {"auto_follow": False}) in m.befehle
    finally:
        await hass.config_entries.async_unload(entry.entry_id)
        await m.server.close()


async def test_karte_und_logo_sind_erreichbar(hass: HomeAssistant, modul_fabrik, hass_client_no_auth) -> None:
    m, entry = await beat_einrichten(hass, modul_fabrik)
    try:
        client = await hass_client_no_auth()
        r = await client.get("/yapaia/beat/yapaia-beat-card.js")
        assert r.status == 200 and "yapaia-beat-card" in await r.text()
        r = await client.get("/api/yapaia/beat/logo/fm-d3d5")
        assert r.status == 200 and (await r.read()).startswith(b"\x89PNG")
    finally:
        await hass.config_entries.async_unload(entry.entry_id)
        await m.server.close()


async def test_kartenversion_folgt_der_integration() -> None:
    import re
    from pathlib import Path

    basis = Path(__file__).parents[1] / "custom_components" / "yapaia"
    version = json.loads((basis / "manifest.json").read_text())["version"]
    karte = (basis / "beat" / "www" / "yapaia-beat-card.js").read_text()
    assert re.search(r'const CARD_VERSION = "([^"]+)"', karte).group(1) == version
