"""Geräteerkennung und Zuordnung -- mit echten Ausgaben von v4l2-ctl."""

from yapaia.config import Kanal, Options
from yapaia.quellen import Geraet, eingaenge_aus, ist_aufnahme, zuordnen

USBTV_INFO = """Driver Info:
\tDriver name      : usbtv
\tCard type        : usbtv
\tBus info         : usb-0000:00:14.0-2
\tDriver version   : 6.18.52
\tCapabilities     : 0x85200001
\t\tVideo Capture
\t\tRead/Write
\t\tStreaming
\t\tExtended Pix Format
\t\tDevice Capabilities
\tDevice Caps      : 0x05200001
\t\tVideo Capture
\t\tRead/Write
\t\tStreaming
\t\tExtended Pix Format
Priority: 2
"""

UVC_META_INFO = """Driver Info:
\tDriver name      : uvcvideo
\tCard type        : USB Camera
\tCapabilities     : 0x84a00001
\t\tVideo Capture
\t\tMetadata Capture
\t\tStreaming
\t\tExtended Pix Format
\t\tDevice Capabilities
\tDevice Caps      : 0x04a00000
\t\tMetadata Capture
\t\tStreaming
\t\tExtended Pix Format
"""

INPUTS = """ioctl: VIDIOC_ENUMINPUT
\tInput       : 0
\tName        : Composite
\tType        : 0x00000002 (Camera)
\tAudioset    : 0x00000000
\tTuner       : 0x00000000
\tStandard    : 0x000000000000b0ff ( PAL NTSC )
\tStatus      : 0x00000000 (ok)

\tInput       : 1
\tName        : S-Video
\tType        : 0x00000002 (Camera)
"""


def test_aufnahme_nach_device_caps():
    assert ist_aufnahme(USBTV_INFO)
    # Der Metadaten-Knoten einer Webcam ist keine zweite Kamera.
    assert not ist_aufnahme(UVC_META_INFO)
    assert not ist_aufnahme("")


def test_eingaenge():
    assert eingaenge_aus(INPUTS) == ["Composite", "S-Video"]


def _opts(n=4, **kw):
    o = Options(**kw)
    o.kanaele = [Kanal(i, f"K{i}") for i in range(1, n + 1)]
    return o


def test_ein_geraet_vier_eingaenge():
    g = Geraet("/dev/video0", "stk1160", "stk1160", ["Composite0", "Composite1", "Composite2", "Composite3"])
    z, hinweise = zuordnen(_opts(), [g])
    assert {n: (q.geraet, q.eingang) for n, q in z.items()} == {
        1: ("/dev/video0", 0), 2: ("/dev/video0", 1), 3: ("/dev/video0", 2), 4: ("/dev/video0", 3),
    }
    assert hinweise == []


def test_zu_wenige_eingaenge_wird_gemeldet():
    g = Geraet("/dev/video0", "usbtv", "usbtv", ["Composite", "S-Video"])
    z, hinweise = zuordnen(_opts(), [g])
    assert set(z) == {1, 2}
    assert len(hinweise) == 2 and "Eingang 3" in hinweise[0]


def test_ein_geraet_je_kanal():
    gs = [Geraet(f"/dev/video{i}", "x", "x", ["in"]) for i in (0, 2, 4, 6)]
    z, _ = zuordnen(_opts(), gs)
    assert [z[n].geraet for n in (1, 2, 3, 4)] == ["/dev/video0", "/dev/video2", "/dev/video4", "/dev/video6"]
    assert all(q.eingang == 0 for q in z.values())


def test_eintrag_am_kanal_gewinnt():
    o = _opts(2)
    o.kanaele[1].geraet = "/dev/video9"
    o.kanaele[1].eingang = 3
    z, _ = zuordnen(o, [Geraet("/dev/video0", eingaenge=["a", "b"])])
    assert (z[1].geraet, z[1].eingang) == ("/dev/video0", 0)
    assert (z[2].geraet, z[2].eingang) == ("/dev/video9", 3)


def test_kein_grabber():
    z, hinweise = zuordnen(_opts(), [])
    assert z == {} and "durchgereicht" in hinweise[0]


def test_testbild_braucht_keine_hardware():
    z, hinweise = zuordnen(_opts(testbild=True), [])
    assert [(q.geraet, q.eingang) for q in z.values()] == [("test", 0), ("test", 1), ("test", 2), ("test", 3)]
    assert hinweise == []
