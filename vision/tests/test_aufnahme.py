"""Aufnahme, Umschalten und HTTP -- mit einem Ersatz für ffmpeg.

Der Ersatz schreibt JPEG-Rahmen (FFD8 … FFD9), in denen der Eingang steht.
So lässt sich prüfen, welcher Kanal gerade WIRKLICH läuft. Den echten
ffmpeg-Lauf mit Testbild prüft der Image-Bau (.github/workflows/vision.yml).
"""

from __future__ import annotations

import asyncio
import sys

import pytest
from aiohttp.test_utils import TestClient, TestServer

from yapaia import aufnahme, protokoll
from yapaia.aufnahme import JpegZerleger, ffmpeg_befehl
from yapaia.config import Kanal, Options
from yapaia.quellen import Geraet, Quelle
from yapaia.vision import Vision
from yapaia.web import create_app

ERSATZ = r"""
import sys, time
eingang = sys.argv[1]
while True:
    sys.stdout.buffer.write(b"\xff\xd8K" + eingang.encode() + b"\xff\xd9")
    sys.stdout.buffer.flush()
    time.sleep(0.02)
"""


@pytest.fixture
def ersatz_ffmpeg(monkeypatch):
    def befehl(opts, quelle, kanal, geraet, textdatei):
        return [sys.executable, "-c", ERSATZ, str(quelle.eingang)]

    monkeypatch.setattr(aufnahme, "ffmpeg_befehl", befehl)


def _opts(**kw) -> Options:
    o = Options(testbild=True, **kw)
    o.kanaele = [Kanal(1, "Rückfahrkamera"), Kanal(2, "Tür"), Kanal(3, "Heck")]
    return o


# ─── Zerlegen ────────────────────────────────────────────────────────────
def test_jpeg_zerleger_ueber_grenzen_hinweg():
    z = JpegZerleger()
    assert z.fuettern(b"muell\xff\xd8ab") == []
    assert z.fuettern(b"c\xff\xd9\xff\xd8x") == [b"\xff\xd8abc\xff\xd9"]
    assert z.fuettern(b"y\xff\xd9") == [b"\xff\xd8xy\xff\xd9"]


# ─── ffmpeg-Aufruf ───────────────────────────────────────────────────────
def test_ffmpeg_grabber_mit_eingang_und_norm():
    o = Options()
    g = Geraet("/dev/video0", "usbtv", "usbtv", ["Composite", "S-Video"], normen=True)
    b = ffmpeg_befehl(o, Quelle("/dev/video0", 1), Kanal(2, "Tür"), g, None)
    assert b[b.index("-standard") + 1] == "PAL"
    assert b[b.index("-channel") + 1] == "1"
    assert b[b.index("-i") + 1] == "/dev/video0"
    assert b[b.index("-vf") + 1] == "yadif,fps=25"
    assert b[-1] == "-"


def test_ffmpeg_webcam_ohne_norm_und_eingang():
    # uvcvideo kennt keine Fernsehnorm; ffmpeg bräche mit -standard ab.
    o = Options(entflechten=False, bilder_pro_sekunde=10)
    g = Geraet("/dev/video2", "uvcvideo", "Cam", ["Camera 1"], normen=False)
    b = ffmpeg_befehl(o, Quelle("/dev/video2", 0), Kanal(1, "x"), g, None)
    assert "-standard" not in b and "-channel" not in b
    assert b[b.index("-vf") + 1] == "fps=10"


def test_ffmpeg_testbild(tmp_path):
    b = ffmpeg_befehl(Options(), Quelle("test", 0), Kanal(1, "x"), None, tmp_path / "t.txt")
    assert "lavfi" in b and any("testsrc2=size=720x576" in t for t in b)
    assert f"textfile={tmp_path / 't.txt'}" in b[b.index("-vf") + 1]


# ─── Umschalten ──────────────────────────────────────────────────────────
def test_standbild_und_umschalten(ersatz_ffmpeg):
    async def ablauf():
        v = Vision(_opts(), gefunden=[])
        e = v.erfassung(1)
        assert e is v.erfassung(3) and e.gewaehlt == 1
        assert await e.standbild(1) == b"\xff\xd8K0\xff\xd9"
        # Ein Standbild eines anderen Kanals schaltet NICHT um.
        assert await e.standbild(2) is None and e.gewaehlt == 1
        # Ausdrücklich wählen schon.
        v.waehlen("Tür")
        assert e.gewaehlt == 2
        for _ in range(100):
            if e.letzte.get(2):
                break
            await asyncio.sleep(0.02)
        assert e.letzte[2] == b"\xff\xd8K1\xff\xd9"
        # Das letzte Bild von Kanal 1 bleibt erhalten.
        assert await e.standbild(1) == b"\xff\xd8K0\xff\xd9"
        await v.stoppen()

    asyncio.run(ablauf())


def test_zusehen_schaltet_nur_wenn_niemand_sonst_zusieht(ersatz_ffmpeg):
    async def ablauf():
        v = Vision(_opts(), gefunden=[])
        e = v.erfassung(1)
        q1 = e.abonnieren(1)
        assert await asyncio.wait_for(q1.get(), 5) == b"\xff\xd8K0\xff\xd9"
        # Kanal 1 hat einen Zuschauer -- wer Kanal 3 öffnet, schaltet nicht um.
        q3 = e.abonnieren(3)
        assert e.gewaehlt == 1
        e.abmelden(3, q3)
        e.abmelden(1, q1)
        # Jetzt sieht niemand zu: Kanal 3 öffnen schaltet um.
        q3 = e.abonnieren(3)
        assert e.gewaehlt == 3
        assert await asyncio.wait_for(q3.get(), 5) == b"\xff\xd8K2\xff\xd9"
        e.abmelden(3, q3)
        await v.stoppen()

    asyncio.run(ablauf())


def test_unbekannter_kanal():
    v = Vision(_opts(), gefunden=[])
    with pytest.raises(ValueError):
        v.waehlen("Garage")
    assert v.kanal("2").name == "Tür" and v.kanal("rückfahrkamera").nummer == 1


# ─── HTTP und Protokoll ──────────────────────────────────────────────────
def test_http(ersatz_ffmpeg, tmp_path):
    async def ablauf():
        v = Vision(_opts(), gefunden=[])
        ident = protokoll.Identitaet(tmp_path / "yapaia.json")
        async with TestClient(TestServer(create_app(v, ident))) as c:
            kopf = {"Authorization": f"Bearer {ident.token}"}
            # Protokoll nur mit Token
            assert (await c.get("/yapaia/v1/beschreibung")).status == 401
            assert (await c.get("/yapaia/v1/kamera/1/bild.jpg")).status == 401
            b = await (await c.get("/yapaia/v1/beschreibung", headers=kopf)).json()
            kameras = [e for e in b["entitaeten"] if e["plattform"] == "camera"]
            assert [e["schluessel"] for e in kameras] == ["kamera_1", "kamera_2", "kamera_3"]
            assert kameras[0]["name"]["de"] == "Rückfahrkamera"
            assert kameras[0]["stream"] == "/yapaia/v1/kamera/1/stream.mjpeg"
            assert any(e["schluessel"] == "kanal" for e in b["entitaeten"])

            r = await c.get("/yapaia/v1/kamera/1/bild.jpg", headers=kopf)
            assert r.status == 200 and r.content_type == "image/jpeg"
            assert await r.read() == b"\xff\xd8K0\xff\xd9"

            # Wählen wie die Auswahl-Entität (`wert`)
            r = await c.post("/yapaia/v1/aktion/kanal_waehlen", json={"wert": "Heck"}, headers=kopf)
            assert (await r.json())["ok"] is True
            assert v.gewaehlt() == "Heck"
            r = await c.post("/yapaia/v1/aktion/kanal_waehlen", json={"kanal": "Garage"}, headers=kopf)
            assert r.status == 400

            # Live-Strom: der erste Teil ist ein JPEG von Kanal 3
            r = await c.get("/api/kamera/3/stream.mjpeg")
            assert r.headers["Content-Type"].startswith("multipart/x-mixed-replace")
            daten = b""
            while b"\xff\xd9" not in daten:
                daten += await asyncio.wait_for(r.content.read(256), 5)
            assert b"Content-Type: image/jpeg" in daten and b"\xff\xd8K2\xff\xd9" in daten
            r.close()

            st = await (await c.get("/api/status")).json()
            assert st["testbild"] is True and st["gewaehlt"] == "Heck"
        await v.stoppen()

    asyncio.run(ablauf())


def test_zustand_fuer_die_integration():
    v = Vision(_opts(), gefunden=[])
    z = protokoll.zustand(v)
    assert z["kanal"] == "Rückfahrkamera"
    assert z["kanal_optionen"] == ["Rückfahrkamera", "Tür", "Heck"]
    assert z["kamera_1_gewaehlt"] is True and z["kamera_2_gewaehlt"] is False
    assert z["geraet"] == "Testbild" and z["meldung"] is None


def test_ohne_grabber_meldet_es():
    o = Options()
    o.kanaele = [Kanal(1, "Rückfahrkamera")]
    v = Vision(o, gefunden=[])
    z = protokoll.zustand(v)
    assert z["geraet"] == "kein Grabber gefunden"
    assert "durchgereicht" in z["meldung"]


def test_beschreibung_passt_zur_datei_der_integration(tmp_path):
    """integration/tests/fixtures/vision_beschreibung.json ist Vision's echte
    Beschreibung (Vorgaben, Testbild). Schlägt das fehl, die Datei neu erzeugen:
    `python -c` mit dem Code unten und `json.dumps(…, indent=2, ensure_ascii=False)`."""
    import json
    from pathlib import Path

    (tmp_path / "yapaia.json").write_text(json.dumps({"instanz": "a1", "token": "x"}))
    ident = protokoll.Identitaet(tmp_path / "yapaia.json")
    o = Options(testbild=True)
    from yapaia.config import STANDARD_KANAELE

    o.kanaele = list(STANDARD_KANAELE)
    echt = protokoll.beschreibung(ident, Vision(o, gefunden=[]))
    echt["version"] = "0.0.0"
    datei = Path(__file__).resolve().parents[2] / "integration" / "tests" / "fixtures" / "vision_beschreibung.json"
    assert json.loads(datei.read_text()) == echt
