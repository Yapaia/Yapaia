"""Die Integration gegen ein nachgebautes Modul -- im echten Home Assistant."""

from __future__ import annotations

import asyncio

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_capture_events

from homeassistant.config_entries import SOURCE_HASSIO, ConfigEntryState
from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.service_info.hassio import HassioServiceInfo

from custom_components.yapaia.const import DOMAIN, EREIGNIS

from .conftest import TOKEN, beschreibung, geraet_finden


async def einrichten(hass: HomeAssistant, m, titel: str = "Yapaia Go") -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN, title=titel, unique_id=f"{m.b['modul']}_{m.b['instanz']}",
        data={"url": m.url, "token": TOKEN, "modul": m.b["modul"], "instanz": m.b["instanz"]},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    await m.verbunden()
    await warten(lambda: entry.runtime_data.verbunden)
    await hass.async_block_till_done()
    return entry


async def warten(bedingung, versuche: int = 100) -> None:
    for _ in range(versuche):
        if bedingung():
            return
        await asyncio.sleep(0.02)
    raise AssertionError("Bedingung nicht erfüllt")


# ---------------------------------------------------------------- einrichten
async def test_erkennung_ueber_den_supervisor(hass: HomeAssistant) -> None:
    info = HassioServiceInfo(
        config={"modul": "go", "instanz": "a1", "name": "Yapaia Go", "host": "addon-go", "port": 8080,
                "token": TOKEN, "protokoll": 1},
        name="Yapaia Go", slug="yapaia_go", uuid="x",
    )
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_HASSIO}, data=info)
    assert r["type"] is FlowResultType.FORM and r["step_id"] == "hassio_confirm"
    r = await hass.config_entries.flow.async_configure(r["flow_id"], {})
    assert r["type"] is FlowResultType.CREATE_ENTRY
    assert r["title"] == "Yapaia Go"
    assert r["data"] == {"url": "http://addon-go:8080", "token": TOKEN, "modul": "go", "instanz": "a1"}
    assert r["result"].unique_id == "go_a1"

    # Nochmal gemeldet mit neuer Adresse: nichts Neues, aber Adresse übernommen.
    info.config["host"] = "addon-go-neu"
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_HASSIO}, data=info)
    assert r["type"] is FlowResultType.ABORT and r["reason"] == "already_configured"
    assert hass.config_entries.async_entries(DOMAIN)[0].data["url"] == "http://addon-go-neu:8080"


async def test_zu_neues_protokoll_wird_nicht_eingerichtet(hass: HomeAssistant, modul_fabrik) -> None:
    m = await modul_fabrik(beschreibung(protokoll=2))
    entry = MockConfigEntry(domain=DOMAIN, unique_id="go_a1",
                            data={"url": m.url, "token": TOKEN, "modul": "go", "instanz": "a1"})
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.SETUP_ERROR


# ---------------------------------------------------------------- entitäten
async def test_entitaeten_mit_geraet_und_stabilen_ids(hass: HomeAssistant, modul_fabrik) -> None:
    hass.config.language = "en"  # IDs hängen NICHT von der Sprache ab
    m = await modul_fabrik(werte={"restweg": 132.4, "ziel": "Magdeburg", "navigation": True,
                                  "profil": "Wohnmobil", "profile": ["Wohnmobil", "Pkw"],
                                  "ankunft": "2026-10-11T18:42:00+02:00"})
    await einrichten(hass, m)

    geraet = geraet_finden(hass, "go_a1")
    assert geraet is not None and geraet.name == "Yapaia Go" and geraet.model == "go"

    ereg = er.async_get(hass)
    assert ereg.async_get_entity_id("sensor", DOMAIN, "yapaia_go_a1_restweg") == "sensor.yapaia_go_restweg"
    s = hass.states.get("sensor.yapaia_go_restweg")
    assert s.state == "132.4" and s.attributes["unit_of_measurement"] == "km"
    assert s.attributes["ziel"] == "Magdeburg"
    assert hass.states.get("sensor.yapaia_go_ankunft").state == "2026-10-11T16:42:00+00:00"
    assert hass.states.get("switch.yapaia_go_navigation").state == "on"
    assert hass.states.get("sensor.yapaia_go_ankunft").attributes["friendly_name"] == "Yapaia Go Arrival"
    sel = hass.states.get("select.yapaia_go_profil")
    assert sel.state == "Wohnmobil" and sel.attributes["options"] == ["Wohnmobil", "Pkw"]
    # `spezial` kennt diese Integration noch nicht: weggelassen, Rest läuft
    assert not [e for e in hass.states.async_all() if "player" in e.entity_id]


async def test_zustaende_live_und_nicht_verfuegbar_bei_abbruch(hass: HomeAssistant, modul_fabrik) -> None:
    m = await modul_fabrik(werte={"restweg": 10})
    await einrichten(hass, m)
    await m.senden({"typ": "zustand", "werte": {"restweg": 9.5}})
    await warten(lambda: hass.states.get("sensor.yapaia_go_restweg").state == "9.5")

    await m.trennen()
    await warten(lambda: hass.states.get("sensor.yapaia_go_restweg").state == STATE_UNAVAILABLE)
    # verbindet sich von selbst neu und bekommt den vollen Zustand
    m.werte = {"restweg": 8}
    await m.verbunden()
    await warten(lambda: hass.states.get("sensor.yapaia_go_restweg").state == "8")


async def test_bedienen_ruft_die_beschriebenen_aktionen(hass: HomeAssistant, modul_fabrik) -> None:
    m = await modul_fabrik(werte={"navigation": True, "profil": "Pkw", "profile": ["Wohnmobil", "Pkw"]})
    await einrichten(hass, m)
    await hass.services.async_call("switch", "turn_off", {"entity_id": "switch.yapaia_go_navigation"}, blocking=True)
    await hass.services.async_call("select", "select_option",
                                   {"entity_id": "select.yapaia_go_profil", "option": "Wohnmobil"}, blocking=True)
    assert m.aufrufe == [("navigation_beenden", {}), ("profil_waehlen", {"wert": "Wohnmobil"})]


# ---------------------------------------------------------------- aktionen
async def test_aktion_mit_einer_instanz_ohne_ziel(hass: HomeAssistant, modul_fabrik) -> None:
    m = await modul_fabrik()
    await einrichten(hass, m)
    assert hass.services.has_service(DOMAIN, "go_ziel_setzen")
    await hass.services.async_call(DOMAIN, "go_ziel_setzen", {"ziel": "Magdeburg"}, blocking=True)
    assert m.aufrufe == [("ziel_setzen", {"ziel": "Magdeburg"})]


async def test_mehrere_instanzen_brauchen_ein_ziel(hass: HomeAssistant, modul_fabrik) -> None:
    k = await modul_fabrik(beschreibung(modul="satellite2", instanz="kueche", name="Yapaia Satellite Küche"))
    a = await modul_fabrik(beschreibung(modul="satellite2", instanz="alkoven", name="Yapaia Satellite Alkoven"))
    await einrichten(hass, k, "Küche")
    await einrichten(hass, a, "Alkoven")
    # eigene Geräte, eigene Entity-IDs
    assert hass.states.get("sensor.yapaia_satellite_kuche_restweg") is not None
    assert hass.states.get("sensor.yapaia_satellite_alkoven_restweg") is not None

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "satellite2_ziel_setzen", {"ziel": "x"}, blocking=True)
    geraet = geraet_finden(hass, "satellite2_alkoven")
    await hass.services.async_call(DOMAIN, "satellite2_ziel_setzen", {"ziel": "x", "device_id": geraet.id}, blocking=True)
    assert a.aufrufe == [("ziel_setzen", {"ziel": "x"})] and k.aufrufe == []


# ---------------------------------------------------------------- ereignisse
async def test_ereignis_und_geraete_ausloeser(hass: HomeAssistant, modul_fabrik) -> None:
    from homeassistant.components.device_automation import DeviceAutomationType, async_get_device_automations

    m = await modul_fabrik()
    await einrichten(hass, m)
    geraet = geraet_finden(hass, "go_a1")
    ausloeser = await async_get_device_automations(hass, DeviceAutomationType.TRIGGER, [geraet.id])
    assert [t["type"] for t in ausloeser[geraet.id] if t["domain"] == DOMAIN] == ["ziel_erreicht"]

    gefangen = async_capture_events(hass, EREIGNIS)
    await m.senden({"typ": "ereignis", "name": "ziel_erreicht", "daten": {"ziel": "Magdeburg"}})
    await warten(lambda: len(gefangen) == 1)
    assert gefangen[0].data == {"modul": "go", "instanz": "a1", "geraet_id": geraet.id,
                                "name": "ziel_erreicht", "daten": {"ziel": "Magdeburg"}}


# ---------------------------------------------------------------- partner
async def test_partnerliste_ohne_sich_selbst_und_mit_satelliten(hass: HomeAssistant, modul_fabrik) -> None:
    from pytest_homeassistant_custom_component.common import MockConfigEntry as ME

    # ein ESPHome-Satellit (Projektkennung yapaia.satellite)
    esp = ME(domain="esphome")
    esp.add_to_hass(hass)
    sat = dr.async_get(hass).async_get_or_create(
        config_entry_id=esp.entry_id, connections={(dr.CONNECTION_NETWORK_MAC, "a4:cf:12:b3:e8:d0")},
        manufacturer="yapaia", model="satellite", name="Yapaia Satellite Küche",
    )
    er.async_get(hass).async_get_or_create("media_player", "esphome", "sat1", device_id=sat.id,
                                           suggested_object_id="yapaia_satellite_kueche")

    go = await modul_fabrik()
    beat = await modul_fabrik(beschreibung(modul="beat", instanz="b1", name="Yapaia Beat",
                                           faehigkeiten=["ansage.einmischen"]))
    await einrichten(hass, go)
    await einrichten(hass, beat, "Yapaia Beat")
    await warten(lambda: any(len(liste) == 2 for liste in go.partner) and beat.partner, versuche=300)

    letzte = go.partner[-1]
    assert {(p["modul"], p["instanz"]) for p in letzte} == {("beat", "b1"), ("satellite", "a4cf12b3e8d0")}
    beat_eintrag = next(p for p in letzte if p["modul"] == "beat")
    assert beat_eintrag["url"] == beat.url and beat_eintrag["faehigkeiten"] == ["ansage.einmischen"]
    sat_eintrag = next(p for p in letzte if p["modul"] == "satellite")
    assert sat_eintrag["media_player"] == "media_player.yapaia_satellite_kueche"
    assert sat_eintrag["faehigkeiten"] == ["sprache.eingabe", "sprache.ausgabe"]
    assert all(p["modul"] != "beat" for p in beat.partner[-1])
