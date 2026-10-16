import json

from yapaia.config import load_options


def test_vorgaben_ohne_datei(tmp_path):
    o = load_options(tmp_path / "fehlt.json")
    assert o.norm == "PAL" and o.breite_hoehe == (720, 576)
    assert [k.name for k in o.kanaele][0] == "Rückfahrkamera"


def test_kanaele_aus_den_optionen(tmp_path):
    p = tmp_path / "options.json"
    p.write_text(json.dumps({
        "testbild": True, "aufloesung": "720x480",
        "kanaele": [{"name": "Rückfahrkamera"}, {"name": "Tür", "eingang": 3}, {"name": " ", "geraet": "/dev/video2"}],
    }))
    o = load_options(p)
    assert o.testbild is True and o.breite_hoehe == (720, 480)
    assert [(k.nummer, k.name, k.geraet, k.eingang) for k in o.kanaele] == [
        (1, "Rückfahrkamera", None, None), (2, "Tür", None, 3), (3, "Kamera 3", "/dev/video2", None),
    ]
