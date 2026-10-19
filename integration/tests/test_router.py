"""Yapaia Router in Home Assistant -- gegen einen nachgebauten GL.iNet-Router."""

from __future__ import annotations

import asyncio

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_capture_events

from homeassistant import config_entries
from homeassistant.components.persistent_notification import _async_get_or_create_notifications
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError

from custom_components.yapaia import router as r
from custom_components.yapaia.const import DOMAIN, EREIGNIS
from custom_components.yapaia.diagnostics import async_get_config_entry_diagnostics

from custom_components.yapaia.router.api import SWITCH_UI

from .glinet import BUS, FakeRouter

DATEN = {CONF_HOST: "192.168.8.1", CONF_USERNAME: "root", CONF_PASSWORD: "secret",
         "modul": "router", "instanz": "9483c4aabbcc"}


@pytest.fixture(autouse=True)
def schnell(monkeypatch):
    """Bestätigung in Millisekunden statt Minuten."""
    monkeypatch.setattr(r, "BESTAETIGUNG_S", 0.3)
    monkeypatch.setattr(r, "BESTAETIGUNG_TAKT_S", 0.01)


async def einrichten(hass: HomeAssistant, optionen: dict | None = None, daten: dict | None = None) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, title="Yapaia Router", unique_id="router_9483c4aabbcc",
                            data={**DATEN, **(daten or {})}, options=optionen or {})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def warten(bedingung, versuche: int = 200) -> None:
    for _ in range(versuche):
        if bedingung():
            return
        await asyncio.sleep(0.02)
    raise AssertionError("Bedingung nicht erfüllt")


def zustand(hass: HomeAssistant, entity_id: str) -> str:
    return hass.states.get(entity_id).state


async def test_einrichten_ueber_das_menue(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    r1 = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert r1["type"] is FlowResultType.MENU and "router" in r1["menu_options"]
    r2 = await hass.config_entries.flow.async_configure(r1["flow_id"], {"next_step_id": "router"})
    assert r2["step_id"] == "router"
    r3 = await hass.config_entries.flow.async_configure(
        r2["flow_id"], {CONF_HOST: "192.168.8.1", CONF_USERNAME: "root", CONF_PASSWORD: "falsch"}
    )
    assert r3["errors"] == {"base": "router_anmeldung"}
    r4 = await hass.config_entries.flow.async_configure(
        r2["flow_id"], {CONF_HOST: "192.168.8.1", CONF_USERNAME: "root", CONF_PASSWORD: "secret"}
    )
    assert r4["type"] is FlowResultType.CREATE_ENTRY and r4["title"] == "Yapaia Router"
    assert r4["data"]["modul"] == "router" and r4["data"]["instanz"] == "9483c4aabbcc"
    assert r4["result"].unique_id == "router_9483c4aabbcc"


async def test_entitaeten_und_land(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    await einrichten(hass)
    assert zustand(hass, "select.yapaia_router_sim") == "SIM 1"
    assert hass.states.get("select.yapaia_router_sim").attributes["options"] == ["SIM 1", "SIM 2"]
    assert zustand(hass, "sensor.yapaia_router_anbieter") == "Telekom.de"
    assert zustand(hass, "sensor.yapaia_router_land") == "Deutschland"
    assert hass.states.get("sensor.yapaia_router_land").attributes["land_code"] == "DE"
    assert zustand(hass, "sensor.yapaia_router_baender") == "B3 + n78"
    assert zustand(hass, "sensor.yapaia_router_signalbalken") == "3"
    assert zustand(hass, "binary_sensor.yapaia_router_verbunden") == "on"
    assert zustand(hass, "switch.yapaia_router_automatik") == "off"
    assert zustand(hass, "sensor.yapaia_router_umschaltung") == "bereit"


async def test_umschalten_lernt_den_weg(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    patch_router.switch_method = "modem.set_sim_slot"  # nicht der erste bekannte Weg
    entry = await einrichten(hass)
    ereignisse = async_capture_events(hass, EREIGNIS)

    await hass.services.async_call("select", "select_option",
                                   {"entity_id": "select.yapaia_router_sim", "option": "SIM 2"}, blocking=True)
    # Während des Wechsels zeigt die Auswahl schon das Ziel
    assert zustand(hass, "select.yapaia_router_sim") == "SIM 2"
    await warten(lambda: [e for e in ereignisse if e.data["name"] == "sim_gewechselt"])
    assert patch_router.current_sim == 2
    assert entry.data[r.DATA_WEG] == {"methode": "modem.set_sim_slot", "parameter": {"bus": "{bus}", "slot": "{sim}"}}
    await hass.async_block_till_done()
    assert zustand(hass, "sensor.yapaia_router_umschaltung") == "SIM 2 aktiv"
    assert zustand(hass, "sensor.yapaia_router_anbieter") == "Vodafone.de"

    # Zurück: der gelernte Weg kommt zuerst, kein Probieren mehr
    vorher = len(patch_router.calls)
    await hass.services.async_call("yapaia", "router_sim_waehlen", {"sim": "1"}, blocking=True)
    await warten(lambda: patch_router.current_sim == 1)
    versuche = [c for c in patch_router.calls[vorher:] if c[1] not in ("get_status", "get_cells_info", "get_slot_config")]
    assert [f"{s}.{m}" for s, m, _ in versuche] == ["modem.set_sim_slot"]


async def test_internet_ueber_wlan_oder_mobilfunk(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    """Für die Anzeige im Dashboard: worüber der Router gerade ins Internet geht."""
    await einrichten(hass)
    s = hass.states.get("sensor.yapaia_router_internet")
    assert s.state == "WLAN"
    assert s.attributes["quelle"] == "wlan" and s.attributes["wlan_ssid"] == "NoDramaLama"
    assert s.attributes["wlan_balken"] == 4
    assert float(zustand(hass, "sensor.yapaia_router_wlan_signal")) == -55


async def test_umschalten_wie_die_router_oberflaeche(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    """Gemeldet: Werte stimmen, die Umschaltung geht nicht. Der X3000 will
    `current_sim` als Text und `enable_switch: false` -- gleich der erste Weg."""
    entry = await einrichten(hass)
    ereignisse = async_capture_events(hass, EREIGNIS)
    vorher = len(patch_router.calls)
    await hass.services.async_call("yapaia", "router_sim_waehlen", {"sim": "2"}, blocking=True)
    await warten(lambda: [e for e in ereignisse if e.data["name"] == "sim_gewechselt"])
    versuche = [c for c in patch_router.calls[vorher:] if c[1] not in ("get_status", "get_cells_info", "get_slot_config")]
    assert versuche == [("modem", "set_slot_config", {"bus": BUS, "enable_switch": False, "current_sim": "2"})]
    assert entry.data[r.DATA_WEG] == {"methode": "modem.set_slot_config", "parameter": SWITCH_UI}


async def test_umschalten_ohne_wirkung_meldet_es(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    patch_router.switch_takes_effect = False
    await einrichten(hass)
    ereignisse = async_capture_events(hass, EREIGNIS)
    await hass.services.async_call("yapaia", "router_sim_waehlen", {"sim": "2"}, blocking=True)
    await warten(lambda: [e for e in ereignisse if e.data["name"] == "sim_wechsel_fehlgeschlagen"])
    await hass.async_block_till_done()
    meldungen = _async_get_or_create_notifications(hass)
    text = next(iter(meldungen.values()))["message"]
    assert "modem.set_slot_config" in text and "Diagnose" in text
    assert zustand(hass, "select.yapaia_router_sim") == "SIM 1"
    assert zustand(hass, "sensor.yapaia_router_umschaltung") == "fehlgeschlagen: SIM 2"

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call("yapaia", "router_sim_waehlen", {"sim": "3"}, blocking=True)


async def test_sim_nach_land_an_der_grenze(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    entry = await einrichten(hass, {r.OPT_SIM1: "DE", r.OPT_SIM2: "AT, CH", r.OPT_SONST: "keine",
                                    r.OPT_WARTEN: 0, r.OPT_INTERVALL: 3600})
    modul = entry.runtime_data
    ereignisse = async_capture_events(hass, EREIGNIS)
    await hass.services.async_call("switch", "turn_on", {"entity_id": "switch.yapaia_router_automatik"},
                                   blocking=True)
    assert entry.options[r.OPT_AUTOMATIK] is True
    assert zustand(hass, "switch.yapaia_router_automatik") == "on"

    # Über die Grenze nach Österreich: SIM 1 bucht sich bei einem österreichischen Netz ein
    patch_router.mcc = {1: "232", 2: "232"}
    await modul.abfragen()
    await warten(lambda: patch_router.current_sim == 2)
    await warten(lambda: [e for e in ereignisse if e.data["name"] == "sim_gewechselt"])
    namen = [e.data["name"] for e in ereignisse]
    assert namen[0] == "land_gewechselt"
    assert ereignisse[0].data["daten"] == {"land": "Österreich", "land_code": "AT", "vorher": "DE"}
    assert [e for e in ereignisse if e.data["name"] == "sim_gewechselt"][0].data["daten"]["grund"] == "land:AT"

    # Land ohne Zuordnung, „sonst: nicht wechseln“: bleibt
    patch_router.mcc = {1: "208", 2: "208"}
    await modul.abfragen()
    await hass.async_block_till_done()
    assert patch_router.current_sim == 2 and zustand(hass, "sensor.yapaia_router_land") == "Frankreich"


async def test_automatik_aus_wechselt_nicht(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    entry = await einrichten(hass, {r.OPT_SIM2: "AT", r.OPT_WARTEN: 0, r.OPT_INTERVALL: 3600})
    patch_router.mcc = {1: "232", 2: "232"}
    await entry.runtime_data.abfragen()
    await hass.async_block_till_done()
    assert patch_router.current_sim == 1


def test_sim_fuer_land() -> None:
    o = {r.OPT_SIM1: "DE", r.OPT_SIM2: "AT, CH", r.OPT_SONST: "2"}
    assert r.sim_fuer_land(o, "DE") == 1
    assert r.sim_fuer_land(o, "CH") == 2
    assert r.sim_fuer_land(o, "IT") == 2
    assert r.sim_fuer_land({**o, r.OPT_SONST: "keine"}, "IT") is None
    assert r.sim_fuer_land(o, None) is None
    assert r.sim_aus({"wert": "SIM 2"}) == 2 and r.sim_aus({"sim": 1}) == 1 and r.sim_aus({"sim": "x"}) is None


async def test_einstellungen(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    entry = await einrichten(hass)
    f = await hass.config_entries.options.async_init(entry.entry_id)
    assert f["type"] is FlowResultType.FORM
    f2 = await hass.config_entries.options.async_configure(f["flow_id"], {
        r.OPT_AUTOMATIK: True, r.OPT_SIM1: "de", r.OPT_SIM2: "ch at", r.OPT_SONST: "keine",
        r.OPT_WARTEN: 2, r.OPT_INTERVALL: 60, r.OPT_METHODE: "kaputt",
    })
    assert f2["errors"] == {r.OPT_METHODE: "methode"}
    f3 = await hass.config_entries.options.async_configure(f["flow_id"], {
        r.OPT_AUTOMATIK: True, r.OPT_SIM1: "de", r.OPT_SIM2: "ch at", r.OPT_SONST: "keine",
        r.OPT_WARTEN: 2, r.OPT_INTERVALL: 60,
    })
    assert f3["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options[r.OPT_SIM2] == "AT, CH" and entry.options[r.OPT_SIM1] == "DE"
    await hass.async_block_till_done()
    assert zustand(hass, "switch.yapaia_router_automatik") == "on"


async def test_rohaufruf_knoepfe_und_partner(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    from custom_components.yapaia import partner

    await einrichten(hass)
    antwort = await hass.services.async_call(
        "yapaia", "router_rpc", {"service": "system", "method": "get_info", "params": ""},
        blocking=True, return_response=True,
    )
    assert antwort["Yapaia Router"]["antwort"]["model"] == "x3000"
    await hass.services.async_call("button", "press", {"entity_id": "button.yapaia_router_neu_verbinden"},
                                   blocking=True)
    assert ("modem", "disconnect", {"bus": "0001:01:00.0"}) in patch_router.calls
    liste = partner.liste(hass)
    assert liste == [{"modul": "router", "instanz": "9483c4aabbcc", "name": "Yapaia Router", "version": r.VERSION,
                      "faehigkeiten": ["mobilfunk", "mobilfunk.sim_wechsel"]}]


async def test_diagnose_schwaerzt(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    entry = await einrichten(hass)
    d = await async_get_config_entry_diagnostics(hass, entry)
    text = str(d)
    assert "secret" not in text and "94:83:C4" not in text and "9483c4aabbcc" not in text
    assert "NoDramaLama" not in text  # das WLAN, an dem der Router hängt
    assert d["router"]["mcc"] == "262"
    assert d["router"]["roh"]["modem_status"]["modems"][0]["current_sim"] == "1"


async def test_neue_anmeldung_bei_falschem_passwort(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    patch_router.password = "neu"
    entry = MockConfigEntry(domain=DOMAIN, title="Yapaia Router", unique_id="router_x", data=DATEN)
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    flows = hass.config_entries.flow.async_progress()
    assert any(f["context"]["source"] == config_entries.SOURCE_REAUTH for f in flows)
