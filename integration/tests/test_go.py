"""Die Integration mit der ECHTEN Beschreibung von Yapaia Go.

`fixtures/go_beschreibung.json` erzeugt Go selbst; ein Go-Test
(`apps/core/src/yapaia/beschreibung.test.ts`) schlägt fehl, sobald die Datei
nicht mehr zu dem passt, was Go wirklich meldet.
"""

from __future__ import annotations

import json
from pathlib import Path

from homeassistant.core import HomeAssistant

from .test_integration import einrichten, warten

GO = json.loads((Path(__file__).parent / "fixtures" / "go_beschreibung.json").read_text())

WERTE = {
    "anweisung": "Rechts abbiegen auf Hauptstraße",
    "anweisung_symbol": "mdi:arrow-right-top",
    "anweisung_typ": "turn_right",
    "anweisung_strassen": ["Hauptstraße"],
    "anweisung_kreisel": None,
    "anweisung_entfernung": 350,
    "ankunft": "2026-10-11T18:42:00+02:00",
    "restweg": 132.4,
    "ziel": "Magdeburg",
    "ziel_eingabe": "Magdeburg",
    "ziel_breite": 52.13,
    "ziel_laenge": 11.62,
    "zustand": "navigating",
    "tempo": 87,
    "tempolimit": 100,
    "tempolimit_fahrzeug": 80,
    "zu_schnell": True,
    "grenze_kmh": 80,
    "grenze_quelle": "fahrzeug",
    "hoehe": 112,
    "standort": {"breite": 52.1, "laenge": 11.6, "genauigkeit": 5},
    "profile": ["Wohnmobil", "Pkw"],
    "profil": "Wohnmobil",
}


async def test_alle_go_entitaeten_mit_festen_ids(hass: HomeAssistant, modul_fabrik) -> None:
    m = await modul_fabrik(GO, dict(WERTE))
    await einrichten(hass, m)

    erwartet = {
        f"{e['plattform']}.yapaia_go_{e['schluessel']}" for e in GO["entitaeten"]
    }
    vorhanden = {s.entity_id for s in hass.states.async_all() if "yapaia_go_" in s.entity_id}
    assert erwartet <= vorhanden, erwartet - vorhanden

    anweisung = hass.states.get("sensor.yapaia_go_anweisung")
    assert anweisung.state == "Rechts abbiegen auf Hauptstraße"
    # Das Symbol folgt der Abbiegung; das Dashboard liest es als Attribut `icon`
    assert anweisung.attributes["icon"] == "mdi:arrow-right-top"
    assert anweisung.attributes["anweisung_strassen"] == ["Hauptstraße"]
    assert hass.states.get("binary_sensor.yapaia_go_zu_schnell").state == "on"
    assert hass.states.get("sensor.yapaia_go_tempolimit_fahrzeug").state == "80"
    assert hass.states.get("select.yapaia_go_profil").state == "Wohnmobil"
    assert hass.states.get("text.yapaia_go_ziel_eingabe").state == "Magdeburg"

    tracker = hass.states.get("device_tracker.yapaia_go_standort")
    assert tracker.attributes["latitude"] == 52.1 and tracker.attributes["longitude"] == 11.6
    assert tracker.attributes["gps_accuracy"] == 5

    # Ohne Abbiegung: festes Symbol; ohne Standort: unbekannt
    await m.senden({"typ": "zustand", "werte": {"anweisung": None, "anweisung_symbol": None, "standort": None}})
    await warten(lambda: hass.states.get("sensor.yapaia_go_anweisung").attributes.get("icon") == "mdi:navigation")
    assert hass.states.get("device_tracker.yapaia_go_standort").state == "unknown"


async def test_go_bedienen(hass: HomeAssistant, modul_fabrik) -> None:
    m = await modul_fabrik(GO, dict(WERTE))
    await einrichten(hass, m)
    await hass.services.async_call("button", "press", {"entity_id": "button.yapaia_go_pausieren"}, blocking=True)
    await hass.services.async_call(
        "text", "set_value", {"entity_id": "text.yapaia_go_ziel_eingabe", "value": "Leipzig"}, blocking=True
    )
    await hass.services.async_call("yapaia", "go_ziel_setzen", {"ziel": "Halle"}, blocking=True)
    assert m.aufrufe == [
        ("navigation_pausieren", {}),
        ("ziel_setzen", {"wert": "Leipzig"}),
        ("ziel_setzen", {"ziel": "Halle"}),
    ]
    assert hass.services.has_service("yapaia", "go_befehl")
