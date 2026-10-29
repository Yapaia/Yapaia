"""Yapaia Design: Schemata, Auswahl gesamt/je Modul, HA-Design nur auf Wunsch."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from pytest_homeassistant_custom_component.common import async_capture_events

from homeassistant.components.persistent_notification import _async_get_or_create_notifications
from homeassistant.core import HomeAssistant

from custom_components.yapaia import design
from custom_components.yapaia.const import DOMAIN

from .glinet import FakeRouter
from .test_router import einrichten

REPO = Path(__file__).resolve().parents[2]


def test_schemata_gueltig_und_erzeugte_dateien_aktuell() -> None:
    """Wer ein Schema ändert, muss `python3 design/erzeugen.py` laufen lassen."""
    r = subprocess.run([sys.executable, str(REPO / "design" / "erzeugen.py"), "--pruefen"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_alle_schemata_haben_dieselben_css_variablen() -> None:
    """Karten verlassen sich darauf, dass jedes Schema die Grund-Variablen liefert."""
    schemata = json.loads((REPO / "integration/custom_components/yapaia/design/www/schemata.json").read_text())["schemata"]
    assert {s["id"] for s in schemata} >= {"sport", "retro", "magazin", "mix", "beat-modern", "beat-retro"}
    grund = {k for k in schemata[0]["css"] if not k.startswith(("--y-streifen", "--y-seite", "--y-lcd"))}
    for s in schemata:
        assert grund <= set(s["css"]), s["id"]


async def test_geraet_design_und_auswahl_je_modul(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    await einrichten(hass)
    await hass.async_block_till_done()
    eintraege = [e for e in hass.config_entries.async_entries(DOMAIN) if e.data.get("modul") == "design"]
    assert len(eintraege) == 1

    gesamt = hass.states.get("select.yapaia_design_schema")
    assert gesamt is not None and gesamt.state == "Retro"
    assert "Beat Retro" in gesamt.attributes["options"]
    assert hass.states.get("select.yapaia_design_ha_design").state == "Nicht ändern"
    modul = hass.states.get("select.yapaia_router_design")
    assert modul.state == "Wie gesamt" and modul.attributes["gilt"] == "retro"

    ereignisse = async_capture_events(hass, design.EREIGNIS)
    await hass.services.async_call("select", "select_option",
                                   {"entity_id": "select.yapaia_design_schema", "option": "Magazin"}, blocking=True)
    await hass.services.async_call("select", "select_option",
                                   {"entity_id": "select.yapaia_router_design", "option": "Sport"}, blocking=True)
    await hass.async_block_till_done()
    d = design.holen(hass)
    assert d.daten["gesamt"] == "magazin"
    assert d.fuer("router_9483c4aabbcc") == "sport"
    assert d.fuer("go_irgendwas") == "magazin"
    assert hass.states.get("select.yapaia_router_design").attributes["gilt"] == "sport"
    assert len(ereignisse) == 2

    # zurück auf „Wie gesamt“
    await hass.services.async_call("select", "select_option",
                                   {"entity_id": "select.yapaia_router_design", "option": "Wie gesamt"}, blocking=True)
    assert d.fuer("router_9483c4aabbcc") == "magazin"


async def test_websocket(hass: HomeAssistant, hass_ws_client, patch_router: FakeRouter) -> None:
    await einrichten(hass)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "yapaia/design", "modul": "go_x"})
    antwort = await ws.receive_json()
    assert antwort["success"] and antwort["result"]["gesamt"] == "retro" and antwort["result"]["gilt"] == "retro"
    await ws.send_json({"id": 2, "type": "yapaia/design/setzen", "modul": "go_x", "schema": "beat-modern"})
    antwort = await ws.receive_json()
    assert antwort["success"] and antwort["result"]["module"] == {"go_x": "beat-modern"}
    await ws.send_json({"id": 3, "type": "yapaia/design/setzen", "gesamt": "gibtsnicht"})
    assert not (await ws.receive_json())["success"]


async def test_ha_design_nur_auf_wunsch(hass: HomeAssistant, patch_router: FakeRouter, tmp_path) -> None:
    hass.config.config_dir = str(tmp_path)
    await einrichten(hass)
    # Standard: nichts angefasst, kein Theme geschrieben
    assert not (tmp_path / "themes" / "yapaia.yaml").exists()
    await hass.services.async_call("select", "select_option",
                                   {"entity_id": "select.yapaia_design_ha_design", "option": "Wie gesamt"}, blocking=True)
    await hass.async_block_till_done()
    theme = (tmp_path / "themes" / "yapaia.yaml").read_text()
    assert '"Yapaia Retro":' in theme
    # Ohne Frontend lädt HA keine Themes → Hinweis, wie man es einschaltet
    assert f"{DOMAIN}_design_theme" in _async_get_or_create_notifications(hass)
    assert design.holen(hass).daten["ha_design"] == "gesamt"
