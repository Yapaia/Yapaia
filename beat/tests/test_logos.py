import asyncio

from yapaia.logos import LogoManager, _best_match, _ranked, _read_all


def test_best_match_prefers_exact_name_and_real_logo():
    candidates = [
        {"name": "SWR3 Elchradio", "favicon": "https://x/elch.png", "clickcount": 5000},
        {"name": "SWR3", "favicon": "https://x/favicon.ico", "clickcount": 10},
        {"name": "SWR 3", "favicon": "https://x/swr3.png", "clickcount": 900},
        {"name": "Radio Something", "favicon": "https://x/other.png", "clickcount": 99999},
    ]
    assert _best_match("swr3", candidates)["favicon"] == "https://x/swr3.png"


def test_best_match_rejects_unrelated():
    assert _best_match("dasding", [{"name": "Antenne Bayern", "favicon": "https://x/a.png"}]) is None


def test_placeholder_svg(tmp_path):
    lm = LogoManager(tmp_path, online=False, country="DE")
    svg = lm.placeholder({"id": "fm-d318", "name": "SWR3", "band": "fm"}).decode()
    assert svg.startswith("<svg") and "SWR" in svg and "FM" in svg


def test_custom_logo_has_priority(tmp_path):
    lm = LogoManager(tmp_path, online=False, country="DE")
    (tmp_path / "fm-d318.png").write_bytes(b"cached")
    lm.save_custom("fm-d318", b"custom", "image/png")
    assert lm.path("fm-d318").read_bytes() == b"custom"
    lm.remove_custom("fm-d318")
    assert lm.path("fm-d318").read_bytes() == b"cached"


def test_unterkanal_bekommt_nicht_das_logo_wenn_es_den_sender_gibt():
    """Gemeldet: falsche Logos. „Beats Radio“ selbst hat bei radio-browser kein
    Logo, nur „Beats Radio - Nu Disco“ -- das war dann das Logo."""
    found = [
        {"name": "Beats Radio", "favicon": ""},
        {"name": "Beats Radio - Nu Disco", "favicon": "https://x/nudisco.jpg"},
    ]
    assert _ranked("beatsradio", found) == []
    # gibt es den Sender gar nicht genau so, darf ein ähnlicher Name helfen
    assert _ranked("beatsradio", found[1:])[0]["favicon"] == "https://x/nudisco.jpg"


def test_logo_wird_ganz_gelesen_nicht_nur_das_erste_stueck():
    """Gemeldet: richtige Logos fehlen. `content.read(n)` lieferte nur das
    erste Netzwerkstück -- das halbe Bild wurde (zu Recht) verworfen."""

    class Content:
        async def iter_chunked(self, n):
            for part in (b"\x89PNG", b"x" * 70000, b"IEND\xaeB`\x82"):
                yield part

    class Resp:
        content = Content()

    data = asyncio.run(_read_all(Resp(), 3_000_000))
    assert data.startswith(b"\x89PNG") and data.endswith(b"IEND\xaeB`\x82")
    assert asyncio.run(_read_all(Resp(), 1000)) is None  # zu groß


def test_livestream_oder_region_ist_derselbe_sender():
    found = [
        {"name": "Radio BOB!", "favicon": ""},
        {"name": "RADIO BOB! Classic Rock", "favicon": "https://x/classic.png"},
        {"name": "Radio Bob! Livestream Hessen", "favicon": "https://x/hessen.png", "clickcount": 21},
        {"name": "RADIO BOB! Livestream National", "favicon": "https://x/national.jpg", "clickcount": 14},
    ]
    assert [c["favicon"] for c in _ranked("radiobob", found)] == ["https://x/hessen.png", "https://x/national.jpg"]
