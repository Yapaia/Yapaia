
from yapaia import texte

from yapaia.texte import Meldung, t, uebersetzen
from yapaia.vision import Vision


def test_t_de_en_und_vorgabe():
    assert t("de", "keine_datei") == "Keine Datei"
    assert t("en", "keine_datei") == "No file"
    assert t(None, "keine_datei") == "Keine Datei"
    assert t({"yapaia_sprache": "en"}, "aktion_unbekannt", name="x") == "Unknown action x"
    assert t({}, "aktion_unbekannt", name="x") == "Unbekannte Aktion x"


def test_schluessel_und_platzhalter_gleich():
    import string

    assert texte.TEXTE["de"].keys() == texte.TEXTE["en"].keys()
    for k, de in texte.TEXTE["de"].items():
        namen = lambda s: {x[1] for x in string.Formatter().parse(s) if x[1]}  # noqa: E731
        assert namen(de) == namen(texte.TEXTE["en"][k]), k


def test_meldung_ist_deutscher_text_und_uebersetzbar():
    m = Meldung("kein_freies_geraet", name="Tür", anzahl=1)
    assert m == "Tür: kein freies Aufnahmegerät mehr (nur 1 gefunden)"
    assert uebersetzen(m, "en") == "Tür: no free capture device left (only 1 found)"
    assert uebersetzen(m, None) == str(m) and uebersetzen("roh", "en") == "roh"
    verschachtelt = Meldung("neustart", text=Meldung("firmware_uebernommen", datei="a.sys"))
    assert uebersetzen(verschachtelt, "en") == "Firmware taken from a.sys. Vision is restarting …"


def test_status_uebersetzt_hinweise_und_fehler():
    from yapaia.config import load_options
    from pathlib import Path

    o = load_options(Path("/nonexistent"))
    v = Vision(o, [], [Meldung("firmware_fehlt")])
    assert v.status()["hinweise"][0] == "Firmware fehlt"
    en = v.status("en")["hinweise"]
    assert en[0] == "Firmware missing" and "No video grabber" in en[1]
    assert "Kein Video-Grabber" in v.status({"yapaia_sprache": "de"})["hinweise"][1]


def test_waehlen_fehler_uebersetzt():
    from pathlib import Path
    from yapaia.config import load_options

    v = Vision(load_options(Path("/nonexistent")), [], [])
    try:
        v.waehlen("gibtsnicht")
    except ValueError as err:
        assert str(err) == "Keinen Kanal „gibtsnicht“ gefunden"
        assert uebersetzen(err.args[0], "en") == "No channel “gibtsnicht” found"
