"""Die Integration mit der ECHTEN Beschreibung von Yapaia Vision.

`fixtures/vision_beschreibung.json` erzeugt Vision selbst; ein Vision-Test
(`vision/tests/test_aufnahme.py`) schlägt fehl, sobald die Datei nicht mehr
zu dem passt, was Vision wirklich meldet.
"""

from __future__ import annotations

import json
from pathlib import Path

from homeassistant.components.camera import async_get_image
from homeassistant.core import HomeAssistant

from .test_integration import einrichten

VISION = json.loads((Path(__file__).parent / "fixtures" / "vision_beschreibung.json").read_text())

WERTE = {
    "aufnahme": True,
    "geraet": "usbtv · USBTV007 (/dev/video0)",
    "kanal": "Rückfahrkamera",
    "kanal_optionen": ["Rückfahrkamera", "Kamera 2", "Kamera 3", "Kamera 4"],
    "meldung": None,
    **{f"kamera_{n}_gewaehlt": n == 1 for n in range(1, 5)},
    **{f"kamera_{n}_live": n == 1 for n in range(1, 5)},
}

JPEG = b"\xff\xd8 rueckfahrkamera \xff\xd9"


async def test_kameras_mit_bild_und_kanalwahl(hass: HomeAssistant, modul_fabrik) -> None:
    m = await modul_fabrik(VISION, dict(WERTE))
    m.bilder["1"] = JPEG
    await einrichten(hass, m, "Yapaia Vision")

    erwartet = {f"{e['plattform']}.yapaia_vision_{e['schluessel']}" for e in VISION["entitaeten"]}
    vorhanden = {s.entity_id for s in hass.states.async_all() if "yapaia_vision_" in s.entity_id}
    assert erwartet <= vorhanden, erwartet - vorhanden

    kamera = hass.states.get("camera.yapaia_vision_kamera_1")
    assert kamera.attributes["friendly_name"].endswith("Rückfahrkamera")
    assert kamera.state == "streaming"
    assert hass.states.get("camera.yapaia_vision_kamera_2").state == "idle"

    # Das Standbild kommt mit dem Token vom Modul
    bild = await async_get_image(hass, "camera.yapaia_vision_kamera_1")
    assert bild.content == JPEG and bild.content_type == "image/jpeg"

    # Die Auswahl ruft die Aktion des Moduls
    kanal = hass.states.get("select.yapaia_vision_kanal")
    assert kanal.state == "Rückfahrkamera" and kanal.attributes["options"][1] == "Kamera 2"
    await hass.services.async_call(
        "select", "select_option", {"entity_id": "select.yapaia_vision_kanal", "option": "Kamera 2"}, blocking=True
    )
    assert m.aufrufe[-1] == ("kanal_waehlen", {"wert": "Kamera 2"})
