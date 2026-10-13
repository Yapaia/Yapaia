"""Sprachbefehle fürs Radio (yapaia/befehl.py)."""

import asyncio

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from yapaia import befehl, protokoll


class FakeAudio:
    volume = 50


class FakeStore:
    favorites = ["dab-swr3"]


class FakeRadio:
    def __init__(self):
        self.audio = FakeAudio()
        self.store = FakeStore()
        self.stations = [
            {"id": "fm-swr3", "band": "fm", "name": "SWR3"},
            {"id": "dab-swr3", "band": "dab", "name": "SWR3"},
            {"id": "fm-dasding", "band": "fm", "name": "DASDING"},
            {"id": "fm-bob", "band": "fm", "name": "RADIO BOB!"},
            {"id": "fm-regenbogen", "band": "fm", "name": "Regenbogen", "custom_name": "Radio Regenbogen aus Mannheim"},
            {"id": "dab-1live", "band": "dab", "name": "1LIVE"},
        ]
        self.players = [
            {"entity_id": "media_player.yapaia_satellite", "name": "Yapaia Satellite", "ma": False},
            {"entity_id": "media_player.sonos_wohnzimmer", "name": "Sonos Wohnzimmer", "ma": False},
        ]
        self.station = None
        self.state = "idle"
        self.speaker = None
        self.local = True
        self.rufe = []

    def sorted_stations(self):
        return list(self.stations)

    def status(self):
        st = self.station
        return {"state": self.state, "station": {"name": st.get("custom_name") or st["name"]} if st else None}

    async def play(self, sid):
        self.station = next(s for s in self.stations if s["id"] == sid)
        self.state = "playing"
        self.rufe.append(("play", sid))

    async def stop(self):
        self.state = "idle"
        self.rufe.append(("stop",))

    async def step(self, richtung):
        self.rufe.append(("step", richtung))

    def set_volume(self, volume=None, muted=None):
        self.audio.volume = max(0, min(100, volume))

    def set_speaker(self, entity):
        self.speaker = entity

    async def set_local_output(self, an):
        self.local = an


def sag(radio, satz):
    return asyncio.run(befehl.ausfuehren(radio, satz))


def test_sender_nach_namen_favorit_zuerst():
    r = FakeRadio()
    assert sag(r, "Spiel SWR3") == "SWR3 läuft."
    # zwei Sender heißen SWR3 -- der Favorit gewinnt
    assert r.rufe == [("play", "dab-swr3")]


def test_schreibweisen_der_spracherkennung():
    for satz in ("Spiele SWR 3.", "spiel bitte den Sender SWR drei", "Schalte um auf S W R 3", "Radio SWR3"):
        r = FakeRadio()
        sag(r, satz)
        assert r.rufe == [("play", "dab-swr3")], satz
    r = FakeRadio()
    sag(r, "Spiel eins live")
    assert r.rufe == [("play", "dab-1live")]
    r = FakeRadio()
    sag(r, "Spiel Radio Bob")
    assert r.rufe == [("play", "fm-bob")]


def test_verhoerer_der_spracherkennung():
    # am Board so angekommen: „Spiel DASDING“ → „Spielt das Ding.“
    for satz, sid in (("Spielt das Ding.", "fm-dasding"), ("Spiele Radiobob", "fm-bob"), ("Spiel das Dink", "fm-dasding"), ("Spiel Radio Bop", "fm-bob")):
        r = FakeRadio()
        sag(r, satz)
        assert r.rufe == [("play", sid)], satz
    # aber nicht irgendeinen Sender für etwas ganz anderes
    r = FakeRadio()
    assert sag(r, "Spiel Pizza Adio").startswith("Den Sender")
    assert r.rufe == []


def test_band_wird_beachtet():
    r = FakeRadio()
    sag(r, "Spiel SWR3 auf UKW")
    assert r.rufe == [("play", "fm-swr3")]


def test_sendername_mit_aus_stoppt_nicht():
    r = FakeRadio()
    assert sag(r, "Spiel Radio Regenbogen aus Mannheim") == "Radio Regenbogen aus Mannheim läuft."
    assert r.rufe == [("play", "fm-regenbogen")]


def test_unbekannter_sender_wird_benannt():
    r = FakeRadio()
    assert sag(r, "Spiel Antenne Bayern") == "Den Sender „antenne bayern“ kenne ich nicht."
    assert r.rufe == []


def test_stoppen():
    for satz in ("Stoppe die Musik", "Radio aus", "Mach das Radio aus", "Musik stoppen", "Stopp das Radio"):
        r = FakeRadio()
        assert sag(r, satz) == "Radio aus.", satz
        assert r.rufe == [("stop",)], satz


def test_radio_an_macht_weiter():
    r = FakeRadio()
    r.station = r.stations[2]
    assert sag(r, "Mach das Radio an") == "Es läuft DASDING."
    assert r.rufe == [("play", "fm-dasding")]
    r = FakeRadio()
    sag(r, "Radio an")
    assert r.rufe == [("step", 1)]


def test_sender_weiter_und_zurueck():
    r = FakeRadio()
    sag(r, "Nächster Sender")
    sag(r, "Einen Sender zurück")
    assert r.rufe == [("step", 1), ("step", -1)]


def test_lautstaerke():
    r = FakeRadio()
    assert sag(r, "Radio lauter") == "Lautstärke 60 Prozent."
    assert sag(r, "Mach die Musik leiser") == "Lautstärke 50 Prozent."
    assert sag(r, "Radio Lautstärke 30") == "Lautstärke 30 Prozent."


def test_was_laeuft():
    r = FakeRadio()
    assert sag(r, "Was läuft gerade?") == "Das Radio ist aus."
    sag(r, "Spiel DASDING")
    assert sag(r, "Welcher Sender läuft?") == "Es läuft DASDING."


def test_ausgabe_wechseln():
    r = FakeRadio()
    assert sag(r, "Wechsle die Ausgabe auf Wohnzimmer") == "Das Radio läuft jetzt über Sonos Wohnzimmer."
    assert (r.speaker, r.local) == ("media_player.sonos_wohnzimmer", False)
    assert sag(r, "Wechsel auf die Audioausgabe Yapaia Satellite") == "Das Radio läuft jetzt über Yapaia Satellite."
    assert r.speaker == "media_player.yapaia_satellite"
    assert sag(r, "Ausgabe auf Mini-PC") == "Das Radio läuft jetzt über Mini-PC."
    assert (r.speaker, r.local) == (None, True)
    assert sag(r, "Wechsle die Ausgabe auf Küche").startswith("Diese Ausgabe kenne ich nicht.")


def test_ausgabe_ohne_das_wort_ausgabe():
    r = FakeRadio()
    assert sag(r, "Wechsle auf Wohnzimmer") == "Das Radio läuft jetzt über Sonos Wohnzimmer."
    assert r.rufe == []


def test_automation_ruft_die_aktion_und_spricht_die_antwort():
    k = befehl.automation_konfig()
    assert k["triggers"][0]["trigger"] == "conversation"
    assert "(spiel|spiele|spielt|spiel mal|spiele mal) {befehl}" in k["triggers"][0]["command"]
    # ein nacktes „lauter“ oder „stopp“ gehört dem Sprachassistenten selbst
    assert not {"lauter", "leiser", "stopp", "stop"} & set(k["triggers"][0]["command"])
    assert k["actions"][0]["action"] == "yapaia.beat_befehl"
    assert k["actions"][0]["data"] == {"text": "{{ trigger.sentence }}"}
    assert "antwort" in k["actions"][1]["set_conversation_response"]


def test_aktion_ueber_das_protokoll(tmp_path):
    async def go():
        radio = FakeRadio()
        app = web.Application()
        app["radio"] = radio
        protokoll.einbinden(app, protokoll.Identitaet(tmp_path / "yapaia.json"))
        kopf = {"Authorization": f"Bearer {app['yapaia_identitaet'].token}"}
        async with TestClient(TestServer(app)) as c:
            b = await (await c.get("/yapaia/v1/beschreibung", headers=kopf)).json()
            assert [a["name"] for a in b["aktionen"]] == ["befehl"]
            r = await c.post("/yapaia/v1/aktion/befehl", json={"text": "Spiel DASDING"}, headers=kopf)
            assert await r.json() == {"ok": True, "ergebnis": {"antwort": "DASDING läuft."}}
            assert radio.rufe == [("play", "fm-dasding")]
            assert (await c.post("/yapaia/v1/aktion/befehl", json={}, headers=kopf)).status == 400
            assert (await c.post("/yapaia/v1/aktion/gibtsnicht", json={}, headers=kopf)).status == 404

    asyncio.run(go())


def test_neue_beschreibung_wird_der_integration_einmal_gemeldet(tmp_path):
    """Nach einem Update mit neuer Aktion lädt die Integration neu -- ohne
    Neustart von Home Assistant."""

    class Still(FakeRadio):
        def subscribe(self):
            return asyncio.Queue()

        def unsubscribe(self, q):
            pass

    async def nachrichten(app):
        kopf = {"Authorization": f"Bearer {app['yapaia_identitaet'].token}"}
        async with TestClient(TestServer(app)) as c:
            ws = await c.ws_connect("/yapaia/v1/live", headers=kopf)
            erste = [(await ws.receive_json())["typ"]]
            try:
                erste.append((await asyncio.wait_for(ws.receive_json(), 0.2))["typ"])
            except asyncio.TimeoutError:
                pass
            # eine zweite Verbindung (nach dem Neuladen) bekommt es nicht noch einmal
            ws2 = await c.ws_connect("/yapaia/v1/live", headers=kopf)
            zweite = [(await ws2.receive_json())["typ"]]
            try:
                zweite.append((await asyncio.wait_for(ws2.receive_json(), 0.2))["typ"])
            except asyncio.TimeoutError:
                pass
            return erste, zweite

    def app():
        a = web.Application()
        a["radio"] = Still()
        protokoll.einbinden(a, protokoll.Identitaet(tmp_path / "yapaia.json"))
        return a

    # erster Start überhaupt: nichts zu melden
    assert asyncio.run(nachrichten(app())) == (["zustand"], ["zustand"])
    # Update von einer Version ohne Fingerabdruck: Kennung da, Fingerabdruck fehlt
    (tmp_path / "yapaia-beschreibung.sha256").unlink()
    assert asyncio.run(nachrichten(app())) == (["zustand", "beschreibung_geaendert"], ["zustand"])
    # unveränderter Neustart: auch nichts
    assert asyncio.run(nachrichten(app())) == (["zustand"], ["zustand"])
    # nach einem Update steht dort der Fingerabdruck der alten Beschreibung
    (tmp_path / "yapaia-beschreibung.sha256").write_text("alt")
    assert asyncio.run(nachrichten(app())) == (["zustand", "beschreibung_geaendert"], ["zustand"])
