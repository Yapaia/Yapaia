"""Reisetagebuch: Fahrten erkennen, auswerten, speichern, per WebSocket liefern."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from custom_components.yapaia import reisetagebuch
from custom_components.yapaia.reisetagebuch.fahrten import Fahrtenbuch

# ~0,001° Breite ≈ 111 m; alle 10 s ein Punkt → ~40 km/h
SCHRITT = 0.001


def fahrt_abspielen(buch: Fahrtenbuch, t0: float = 1000.0, punkte: int = 120,
                    extra: list[tuple[float, str, Any]] | None = None) -> float:
    ereignisse: list[tuple[float, str, Any]] = [(t0 - 5, "zuendung", "on"), (t0 - 5, "ort", "A"), (t0 - 5, "land", "Deutschland")]
    for i in range(punkte):
        ereignisse.append((t0 + i * 10, "position", (47.0 + i * SCHRITT, 8.0)))
    ende = t0 + (punkte - 1) * 10
    ereignisse += [(ende + 5, "ort", "B"), (ende + 20, "zuendung", "off")]
    for t, r, w in sorted(ereignisse + (extra or []), key=lambda e: e[0]):
        buch.ereignis(t, r, w)
    return ende


def test_fahrt_mit_zuendung_und_auswertung() -> None:
    fertig: list[dict[str, Any]] = []
    buch = Fahrtenbuch(fertig.append, hat_zuendung=True)
    t0 = 1000.0
    extra = [
        (t0 + 1, "gang", "3"), (t0 + 300, "gang", "6"),
        (t0 + 100, "tempomat", "on"), (t0 + 700, "tempomat", "off"),
        (t0 + 50, "bremse", "0"), (t0 + 60, "bremse", "12"), (t0 + 61, "bremse", "20"), (t0 + 70, "bremse", "0"),
        (t0 + 80, "bremse", "5"),
        # ein Blinken = viele Flanken kurz hintereinander
        *[(t0 + 200 + k, "blinker_links", "on" if k % 2 == 0 else "off") for k in range(6)],
        (t0 + 900, "blinker_rechts", "on"),
        (t0 + 400, "drehzahl", "2500"), (t0 + 500, "drehzahl", "unknown"),
        (t0 + 600, "land", "Schweiz"),
        (t0 - 3, "hoehe", "300"), (t0 + 400, "momentanverbrauch", "9.5"),
        # Kilometerstand mit Lesefehlern (zu große Werte)
        *[(t0 + i * 100, "kilometerstand", str(84000 + i)) for i in range(12)],
        *[(t0 + i * 100 + 50, "kilometerstand", str(6300000 + i)) for i in range(12)],
    ]
    fahrt_abspielen(buch, t0, extra=extra)
    assert len(fertig) == 1
    f = fertig[0]
    assert 12 < f["km_gps"] < 14
    assert f["von"] == "A" and f["nach"] == "B"
    assert f["quelle"] == "can" and f["km_stand"] == [84001.0, 84011.0] and f["km_tacho"] == 10.0
    assert f["bremsungen"] == 2 and f["blinker"] == 2 and f["drehzahl_max"] == 2500
    assert set(f["gaenge_min"]) == {"3", "6"} and f["gaenge_min"]["6"] > f["gaenge_min"]["3"]
    assert 0.4 < f["tempomat_anteil"] < 0.6
    assert f["grenzen"][0]["von"] == "Deutschland" and f["grenzen"][0]["nach"] == "Schweiz"
    assert set(f["laender"]) == {"Deutschland", "Schweiz"}
    assert len(f["spur"]) > 50
    assert all(len(p) == 5 and p[3] == 300 for p in f["spur"])
    assert f["spur"][0][4] is None and f["spur"][-1][4] == 9.5


def test_ende_durch_stillstand_und_kurze_fahrten_verworfen() -> None:
    fertig: list[dict[str, Any]] = []
    buch = Fahrtenbuch(fertig.append)
    for i in range(60):
        buch.ereignis(1000 + i * 10, "position", (47.0 + i * SCHRITT, 8.0))
    buch.pruefen(1000 + 59 * 10 + 300)
    assert fertig == []
    buch.pruefen(1000 + 59 * 10 + 400)
    assert len(fertig) == 1 and fertig[0]["quelle"] == "gps"
    # unter 1 km: weg
    for i in range(5):
        buch.ereignis(5000 + i * 10, "position", (48.0 + i * SCHRITT, 8.0))
    buch.pruefen(9000)
    assert len(fertig) == 1


def test_veraltete_zuendung_blockiert_nicht() -> None:
    """Quelle abgesteckt (unavailable): die letzte „aus“-Meldung gilt nicht mehr."""
    fertig: list[dict[str, Any]] = []
    buch = Fahrtenbuch(fertig.append, hat_zuendung=True)
    buch.ereignis(10, "zuendung", "off")
    buch.ereignis(20, "zuendung", "unavailable")
    for i in range(60):
        buch.ereignis(1000 + i * 10, "position", (47.0 + i * SCHRITT, 8.0))
    buch.abschliessen()
    assert len(fertig) == 1


def test_spaeter_verbrauch_wird_nachgetragen() -> None:
    fertig: list[dict[str, Any]] = []
    buch = Fahrtenbuch(fertig.append, hat_zuendung=True)
    ende = fahrt_abspielen(buch)
    buch.ereignis(ende + 600, "verbrauch", "8.7")
    assert len(fertig) == 2 and fertig[-1]["verbrauch_l100"] == 8.7 and fertig[0]["start"] == fertig[1]["start"]


def test_zustand_uebersteht_neustart() -> None:
    fertig: list[dict[str, Any]] = []
    a = Fahrtenbuch(fertig.append)
    for i in range(30):
        a.ereignis(1000 + i * 10, "position", (47.0 + i * SCHRITT, 8.0))
    b = Fahrtenbuch(fertig.append)
    b.wiederherstellen(a.zustand())
    for i in range(30, 60):
        b.ereignis(1000 + i * 10, "position", (47.0 + i * SCHRITT, 8.0))
    b.abschliessen()
    assert len(fertig) == 1 and fertig[0]["km_gps"] > 6


async def test_live_und_websocket(hass: HomeAssistant, hass_ws_client: Any) -> None:
    import time

    t0 = time.time() - 3600
    hass.states.async_set("binary_sensor.zuendung", "on")
    r = await reisetagebuch.einrichten(hass)
    ws = await hass_ws_client(hass)

    await ws.send_json({"id": 1, "type": "yapaia/reisetagebuch/einstellungen",
                        "quellen": {"position": ["device_tracker.womo"], "zuendung": ["binary_sensor.zuendung"],
                                    "ort": ["sensor.ort"]}})
    antwort = await ws.receive_json()
    assert antwort["success"] and antwort["result"]["quellen"]["zuendung"] == ["binary_sensor.zuendung"]

    hass.states.async_set("sensor.ort", "Basel", timestamp=t0 - 10)
    for i in range(60):
        hass.states.async_set("device_tracker.womo", "not_home",
                              {"latitude": 47.0 + i * SCHRITT, "longitude": 8.0, "gps_accuracy": 5},
                              timestamp=t0 + i * 10)
    await hass.async_block_till_done()
    await ws.send_json({"id": 2, "type": "yapaia/reisetagebuch/tage"})
    assert (await ws.receive_json())["result"]["laeuft"] is True

    hass.states.async_set("sensor.ort", "Liestal", timestamp=t0 + 595)
    hass.states.async_set("binary_sensor.zuendung", "off", timestamp=t0 + 600)
    await hass.async_block_till_done()
    await hass.async_block_till_done()

    await ws.send_json({"id": 3, "type": "yapaia/reisetagebuch/tage"})
    uebersicht = (await ws.receive_json())["result"]
    assert uebersicht["laeuft"] is False and len(uebersicht["tage"]) == 1
    tag = uebersicht["tage"][0]
    assert tag["fahrten"] == 1 and tag["orte"] == ["Basel", "Liestal"] and tag["km"] > 6

    await ws.send_json({"id": 4, "type": "yapaia/reisetagebuch/tag", "datum": tag["datum"]})
    fahrten = (await ws.receive_json())["result"]["fahrten"]
    assert len(fahrten) == 1 and fahrten[0]["nach"] == "Liestal"

    await ws.send_json({"id": 5, "type": "yapaia/reisetagebuch/loeschen", "start": fahrten[0]["start"]})
    assert (await ws.receive_json())["result"]["geloescht"] is True
    assert r.uebersicht()["tage"] == []


def test_gps_zittern_im_stand_ist_keine_fahrt() -> None:
    fertig: list[dict[str, Any]] = []
    buch = Fahrtenbuch(fertig.append)
    # Sprung von ~25 m und Zittern um ±15 m, eine Stunde lang
    for i in range(360):
        buch.ereignis(1000 + i * 10, "position", (47.0 + (0.00022 if i % 2 else 0.0), 8.0))
        assert buch.fahrt is None
    buch.abschliessen()
    assert fertig == []
