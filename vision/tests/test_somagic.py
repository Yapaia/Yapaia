"""Somagic SMI2021CBE (EasyCAP002): Erkennung, Befehle, Kette somagic-capture → ffmpeg."""

from __future__ import annotations

import asyncio
import sys

from yapaia import aufnahme, somagic
from yapaia.aufnahme import ffmpeg_befehl, vorstufe
from yapaia.config import Kanal, Options
from yapaia.quellen import Quelle, zuordnen
from yapaia.vision import Vision


def _sysfs(tmp_path, *geraete):
    for i, (vendor, product) in enumerate(geraete):
        d = tmp_path / f"2-{i}"
        d.mkdir()
        (d / "idVendor").write_text(vendor + "\n")
        (d / "idProduct").write_text(product + "\n")
    return tmp_path


def test_kennung_aus_sysfs(tmp_path):
    # So meldet sich der Stick in Home Assistant OS (lsusb: 1c88:0007).
    s = _sysfs(tmp_path, ("1d6b", "0002"), ("1c88", "0007"))
    assert somagic.usb_kennung(s) == "0007"
    (tmp_path / "leer").mkdir()
    assert somagic.usb_kennung(tmp_path / "leer") is None


def test_geraet_erst_mit_firmware():
    assert somagic.geraet("0007") is None
    g = somagic.geraet("003f")
    assert g.pfad == "somagic" and g.eingaenge == ["CVBS 1", "CVBS 2", "CVBS 3", "CVBS 4"] and g.normen
    # Mit der Firmware aus SmiUsbGrabber3C.sys meldet sich auch der
    # EasyCAP002 als 003c -- die vier Eingänge bleiben.
    assert somagic.geraet("003c").eingaenge == g.eingaenge


def test_vier_kanaele_auf_vier_eingaenge():
    o = Options()
    o.kanaele = [Kanal(i, f"K{i}") for i in range(1, 5)]
    z, hinweise = zuordnen(o, [somagic.geraet("003f")])
    assert [(z[n].geraet, z[n].eingang) for n in range(1, 5)] == [("somagic", i) for i in range(4)]
    assert hinweise == []


def test_capture_befehl():
    assert somagic.capture_befehl("PAL", 0) == ["somagic-capture", "-p", "-i", "1"]
    assert somagic.capture_befehl("NTSC", 3) == ["somagic-capture", "-n", "-i", "4"]


def test_ffmpeg_liest_rohes_uyvy():
    o = Options()
    g = somagic.geraet("003f")
    q = Quelle("somagic", 2)
    b = ffmpeg_befehl(o, q, Kanal(3, "Heck"), g, None)
    assert b[b.index("-f") + 1] == "rawvideo" and b[b.index("-pix_fmt") + 1] == "uyvy422"
    assert b[b.index("-video_size") + 1] == "720x576" and b[b.index("-i") + 1] == "-"
    assert b[b.index("-vf") + 1] == "yadif,fps=25"
    assert vorstufe(o, q, g) == ["somagic-capture", "-p", "-i", "3"]
    # NTSC liefert 720x480; die gewünschte Größe bleibt -- also skalieren.
    b = ffmpeg_befehl(Options(norm="NTSC"), q, Kanal(3, "Heck"), g, None)
    assert b[b.index("-video_size") + 1] == "720x480" and "scale=720:576" in b[b.index("-vf") + 1]


def test_konfiguriert_ist_nichts_zu_tun(tmp_path, monkeypatch):
    g = tmp_path / "2-5"
    g.mkdir()
    (g / "idVendor").write_text("1c88\n")
    (g / "idProduct").write_text("0007\n")
    (g / "bConfigurationValue").write_text("1\n")
    monkeypatch.setattr(somagic, "SYSFS", tmp_path)
    assert somagic.konfigurieren("0007") is None


def test_firmware_fehlt_mit_hinweis(tmp_path, monkeypatch):
    monkeypatch.setattr(somagic, "FIRMWARE", tmp_path / "fw.bin")
    monkeypatch.setattr(somagic, "SUCHORDNER", tmp_path / "share")
    ok, text = somagic.firmware_suchen()
    assert not ok and "SmiUsbGrabber3F.sys" in text


def test_kette_vorstufe_und_ffmpeg(monkeypatch):
    """Vorstufe schreibt in eine Pipe, „ffmpeg“ liest sie -- wie somagic-capture | ffmpeg."""
    schreiber = r"""
import sys, time
n = 0
while True:
    n += 1
    sys.stdout.buffer.write(b"\xff\xd8S" + sys.argv[1].encode() + b"-%d\xff\xd9" % n); sys.stdout.buffer.flush(); time.sleep(0.01)
"""
    durch = "import sys, shutil; shutil.copyfileobj(sys.stdin.buffer, sys.stdout.buffer, 1)"
    monkeypatch.setattr(aufnahme, "vorstufe", lambda o, q, g: [sys.executable, "-c", schreiber, str(q.eingang + 1)])
    monkeypatch.setattr(aufnahme, "ffmpeg_befehl", lambda o, q, k, g, t: [sys.executable, "-u", "-c", durch])

    async def ablauf():
        o = Options()
        o.kanaele = [Kanal(1, "Rückfahrkamera"), Kanal(2, "Tür")]
        v = Vision(o, gefunden=[somagic.geraet("003f")])
        e = v.erfassung(1)
        erstes = await e.standbild(1)
        # Die ersten Bilder nach dem Start (Farbe noch nicht eingerastet) kommen nicht heraus.
        assert erstes.startswith(b"\xff\xd8S1-") and int(erstes[5:-2]) > aufnahme.ANLAUF_BILDER
        v.waehlen("Tür")
        for _ in range(150):
            if e.letzte.get(2):
                break
            await asyncio.sleep(0.02)
        assert e.letzte[2].startswith(b"\xff\xd8S2-")
        await v.stoppen()

    asyncio.run(ablauf())
