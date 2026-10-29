"""Beat spricht das Yapaia-Protokoll (docs/integration-protokoll.md)."""

import asyncio
import json


from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from yapaia import ha, protokoll


class FakeRadio:
    def __init__(self):
        self.queues = set()
        self.st = {"state": "playing", "station": {"name": "SWR3"}}

    def status(self):
        return dict(self.st)

    def subscribe(self):
        q = asyncio.Queue()
        self.queues.add(q)
        return q

    def unsubscribe(self, q):
        self.queues.discard(q)

    def melden(self):
        for q in self.queues:
            q.put_nowait(json.dumps(self.st))


def _app(tmp_path, radio):
    app = web.Application()
    app["radio"] = radio
    protokoll.einbinden(app, protokoll.Identitaet(tmp_path / "yapaia.json"))
    return app


def run(coro):
    return asyncio.run(coro)


def test_identitaet_bleibt_ueber_neustarts(tmp_path):
    a = protokoll.Identitaet(tmp_path / "yapaia.json")
    b = protokoll.Identitaet(tmp_path / "yapaia.json")
    assert a.instanz == b.instanz and a.token == b.token
    assert len(a.token) >= 32


def test_ohne_token_401_mit_token_beschreibung(tmp_path):
    async def go():
        app = _app(tmp_path, FakeRadio())
        token = app["yapaia_identitaet"].token
        async with TestClient(TestServer(app)) as c:
            r = await c.get("/yapaia/v1/beschreibung")
            assert r.status == 401
            r = await c.get("/yapaia/v1/beschreibung", headers={"Authorization": "Bearer falsch"})
            assert r.status == 401
            r = await c.get("/yapaia/v1/beschreibung", headers={"Authorization": f"Bearer {token}"})
            b = await r.json()
            assert b["protokoll"] == 1 and b["modul"] == "beat" and b["name"] == "Yapaia Beat"
            assert {"plattform": "spezial", "spezial": "beat", "schluessel": "radio"} in b["entitaeten"]
            assert "ansage.einmischen" in b["faehigkeiten"]

    run(go())


def test_live_voller_zustand_dann_aenderungen(tmp_path):
    async def go():
        radio = FakeRadio()
        app = _app(tmp_path, radio)
        token = app["yapaia_identitaet"].token
        async with TestClient(TestServer(app)) as c:
            ws = await c.ws_connect("/yapaia/v1/live", headers={"Authorization": f"Bearer {token}"})
            erst = json.loads((await ws.receive()).data)
            assert erst == {"typ": "zustand", "werte": {"zustand": "playing", "sender": "SWR3"}}
            radio.st["station"] = {"name": "DASDING"}
            radio.melden()
            neu = json.loads((await asyncio.wait_for(ws.receive(), 2)).data)
            assert neu == {"typ": "zustand", "werte": {"sender": "DASDING"}}
            await ws.close()

    run(go())


def test_partnerliste_wird_angenommen(tmp_path):
    async def go():
        app = _app(tmp_path, FakeRadio())
        token = app["yapaia_identitaet"].token
        kopf = {"Authorization": f"Bearer {token}"}
        async with TestClient(TestServer(app)) as c:
            r = await c.post("/yapaia/v1/partner", json={"partner": [{"modul": "go", "name": "Yapaia Go"}]}, headers=kopf)
            assert r.status == 200
            assert app["yapaia_partner"] == [{"modul": "go", "name": "Yapaia Go"}]
            r = await c.post("/yapaia/v1/aktion/gibtsnicht", json={}, headers=kopf)
            assert r.status == 404 and (await r.json())["ok"] is False

    run(go())


def test_discovery_meldet_sich_als_yapaia_modul():
    c = ha.discovery_config("a0d7b954-yapaia-beat", 8099, "abc", "tok", "1.14.0")
    assert c == {"modul": "beat", "instanz": "abc", "name": "Yapaia Beat", "host": "a0d7b954-yapaia-beat",
                 "port": 8099, "token": "tok", "protokoll": 1, "version": "1.14.0"}


# ---------------------------------------------------------------- installation
def _integration(pfad, version):
    pfad.mkdir(parents=True)
    (pfad / "manifest.json").write_text(json.dumps({"domain": "yapaia", "version": version}))
    (pfad / "__init__.py").write_text(f"# {version}")


def _setup(tmp_path, monkeypatch, gebuendelt="0.2.0"):
    src = tmp_path / "image" / "yapaia"
    _integration(src, gebuendelt)
    ha_conf = tmp_path / "ha"
    ha_conf.mkdir()
    monkeypatch.setattr(ha, "INTEGRATION_SRC", src)
    monkeypatch.setattr(ha, "HA_CONFIG", ha_conf)
    return ha_conf / "custom_components"


def test_installiert_wenn_sie_fehlt(tmp_path, monkeypatch):
    cc = _setup(tmp_path, monkeypatch)
    assert ha.install_integration() == "installiert"
    assert json.loads((cc / "yapaia" / "manifest.json").read_text())["version"] == "0.2.0"
    assert ha.install_integration() is None  # gleiche Version: nichts zu tun


def test_neuere_version_gewinnt_aeltere_wird_nicht_eingespielt(tmp_path, monkeypatch):
    cc = _setup(tmp_path, monkeypatch, gebuendelt="0.2.0")
    _integration(cc / "yapaia", "0.10.0")  # z. B. von Go schon neuer installiert
    assert ha.install_integration() is None
    assert json.loads((cc / "yapaia" / "manifest.json").read_text())["version"] == "0.10.0"


def test_aktualisiert_aeltere(tmp_path, monkeypatch):
    cc = _setup(tmp_path, monkeypatch, gebuendelt="0.2.0")
    _integration(cc / "yapaia", "0.1.0")
    assert ha.install_integration() == "aktualisiert"
    assert (cc / "yapaia" / "__init__.py").read_text() == "# 0.2.0"


def test_alte_beat_integration_wird_ersetzt(tmp_path, monkeypatch):
    cc = _setup(tmp_path, monkeypatch)
    (cc / "yapaia_beat").mkdir(parents=True)
    assert ha.install_integration() == "ersetzt"
    assert not (cc / "yapaia_beat").exists() and (cc / "yapaia").exists()


def test_ohne_gebuendelte_integration_nichts(tmp_path, monkeypatch):
    monkeypatch.setattr(ha, "INTEGRATION_SRC", tmp_path / "fehlt")
    monkeypatch.setattr(ha, "HA_CONFIG", tmp_path)
    assert ha.install_integration() is None




def test_design_wird_gemerkt(tmp_path, monkeypatch):
    """§8a: das Schema der Integration, auch über Neustarts."""
    monkeypatch.setattr(protokoll, "DESIGN_DATEI", tmp_path / "design.json")

    async def go():
        app = _app(tmp_path, FakeRadio())
        assert app["yapaia_design"] is None
        kopf = {"Authorization": f"Bearer {app['yapaia_identitaet'].token}"}
        daten = {"schema": {"id": "retro", "css": {"--y-grund": "#F4ECDC"}}, "eigenes": False}
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/yapaia/v1/design", json=daten)).status == 401
            assert (await c.post("/yapaia/v1/design", json={"x": 1}, headers=kopf)).status == 400
            assert (await c.post("/yapaia/v1/design", json=daten, headers=kopf)).status == 200
        assert app["yapaia_design"] == daten
        assert protokoll.design_laden() == daten

    run(go())


def test_sprache_wird_gemerkt(tmp_path, monkeypatch):
    """§8b: die HA-Sprache der Integration (de, sonst en), auch über Neustarts."""
    monkeypatch.setattr(protokoll, "SPRACHE_DATEI", tmp_path / "sprache.json")

    async def go():
        app = _app(tmp_path, FakeRadio())
        assert app["yapaia_sprache"] is None
        kopf = {"Authorization": f"Bearer {app['yapaia_identitaet'].token}"}
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/yapaia/v1/sprache", json={"sprache": "de"})).status == 401
            assert (await c.post("/yapaia/v1/sprache", json={"sprache": 1}, headers=kopf)).status == 400
            assert (await c.post("/yapaia/v1/sprache", json={"sprache": "de"}, headers=kopf)).status == 200
            assert (await c.post("/yapaia/v1/sprache", json={"sprache": "fr"}, headers=kopf)).status == 200
            assert app["yapaia_sprache"] == "en"
        assert protokoll.sprache_laden() == "en"

    run(go())
