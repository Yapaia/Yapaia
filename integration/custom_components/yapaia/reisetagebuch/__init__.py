"""Yapaia Reisetagebuch: Fahrten automatisch erfassen und dauerhaft speichern.

Die Integration hört auf die Entitäten aus den Einstellungen (Rolle →
Entitäten, siehe `fahrten.ROLLEN`) und gibt jede Zustandsänderung an das
`Fahrtenbuch`. Fertige Fahrten landen in `.storage/yapaia.reisetagebuch.<JJJJ-MM>`
(ein Speicher je Monat), die Übersicht der Tage in `.storage/yapaia.reisetagebuch`.
Die Recorder-Historie reicht dafür nicht, sie hält nur wenige Tage.

Fremde Geräte (z. B. ein CAN-Bus-Adapter) sind nicht fest verdrahtet: Welche
Entität welche Rolle spielt, steht in den Einstellungen. Ohne Einstellungen
nimmt das Tagebuch die Entitäten der Yapaia-Module (Go, Router), sofern es sie gibt.

WebSocket:
* `yapaia/reisetagebuch/tage` – Übersicht je Tag, `laeuft`
* `yapaia/reisetagebuch/tag` (`datum`) – alle Fahrten eines Tages
* `yapaia/reisetagebuch/einstellungen` (optional `quellen`, nur Admin) – Rollen lesen/setzen
* `yapaia/reisetagebuch/nachtragen` (`start`, `ende`, nur Admin) – aus dem Recorder füllen
* `yapaia/reisetagebuch/loeschen` (`start`, nur Admin) – eine Fahrt löschen

Ereignis `yapaia_reisetagebuch_geaendert` (`datum`) nach jeder neuen Fahrt.
"""

from __future__ import annotations

import heapq
import logging
from datetime import datetime, timedelta
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, State, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .fahrten import ROLLEN, Fahrtenbuch

_LOGGER = logging.getLogger(__name__)

DATEN = f"{DOMAIN}_reisetagebuch"
EREIGNIS = "yapaia_reisetagebuch_geaendert"
SPEICHER = "yapaia.reisetagebuch"

# Ohne Einstellungen: Entitäten der Yapaia-Module
STANDARD_QUELLEN: dict[str, list[str]] = {
    "position": ["device_tracker.yapaia_go_standort"],
    "land": ["sensor.yapaia_router_land"],
    "ort": ["sensor.yapaia_go_ort"],
    "adresse": ["sensor.yapaia_go_adresse"],
    "hoehe": ["sensor.yapaia_go_hoehe"],
}


def lokalzeit(t: float) -> str:
    return dt_util.as_local(dt_util.utc_from_timestamp(t)).replace(tzinfo=None).isoformat(timespec="minutes")


def ereignis_wert(rolle: str, state: State) -> Any:
    if rolle == "position":
        lat, lon = state.attributes.get("latitude"), state.attributes.get("longitude")
        genau = state.attributes.get("gps_accuracy")
        if lat is None or lon is None or (isinstance(genau, (int, float)) and genau > 60):
            return None
        return (lat, lon)
    return state.state


class Reisetagebuch:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, 1, SPEICHER)
        self._monate: dict[str, Store[dict[str, Any]]] = {}
        self.daten: dict[str, Any] = {"quellen": None, "tage": {}, "laufend": None}
        self.buch = self._neues_buch()
        self._abmelden: list[Any] = []

    def _neues_buch(self) -> Fahrtenbuch:
        return Fahrtenbuch(self._fahrt_fertig, hat_zuendung=bool(self.quellen.get("zuendung")), lokalzeit=lokalzeit)

    @property
    def quellen(self) -> dict[str, list[str]]:
        q = self.daten.get("quellen")
        return q if isinstance(q, dict) else STANDARD_QUELLEN

    def _monat(self, datum: str) -> Store[dict[str, Any]]:
        m = datum[:7]
        if m not in self._monate:
            self._monate[m] = Store(self.hass, 1, f"{SPEICHER}.{m}")
        return self._monate[m]

    # ---- Start/Stopp --------------------------------------------------------
    async def laden(self) -> None:
        gespeichert = await self._store.async_load()
        if isinstance(gespeichert, dict):
            self.daten.update({k: v for k, v in gespeichert.items() if k in self.daten})
        self.buch = self._neues_buch()
        if isinstance(self.daten.get("laufend"), dict):
            self.buch.wiederherstellen(self.daten["laufend"])

    @callback
    def hoeren(self) -> None:
        for fn in self._abmelden:
            fn()
        rolle_von: dict[str, str] = {}
        for rolle, ids in self.quellen.items():
            for eid in ids or []:
                if rolle in ROLLEN:
                    rolle_von[eid] = rolle
        self.buch.hat_zuendung = "zuendung" in self.quellen and bool(self.quellen["zuendung"])

        @callback
        def geaendert(ev: Event[EventStateChangedData]) -> None:
            neu = ev.data["new_state"]
            rolle = rolle_von.get(ev.data["entity_id"])
            if neu is None or rolle is None:
                return
            wert = ereignis_wert(rolle, neu)
            if wert is not None:
                self.buch.ereignis(neu.last_updated.timestamp(), rolle, wert)
                self._laufend_merken()

        @callback
        def takt(_now: datetime) -> None:
            self.buch.pruefen(dt_util.utcnow().timestamp())
            self._laufend_merken()

        self._abmelden = [
            async_track_state_change_event(self.hass, list(rolle_von), geaendert),
            async_track_time_interval(self.hass, takt, timedelta(seconds=30), cancel_on_shutdown=True),
        ]

    @callback
    def _laufend_merken(self) -> None:
        self.daten["laufend"] = self.buch.zustand() if self.buch.fahrt else None
        self._store.async_delay_save(lambda: self.daten, 60)

    async def sichern(self) -> None:
        self.daten["laufend"] = self.buch.zustand() if self.buch.fahrt else None
        await self._store.async_save(self.daten)

    # ---- Fahrten ------------------------------------------------------------
    @callback
    def _fahrt_fertig(self, fahrt: dict[str, Any]) -> None:
        self.hass.async_create_task(self.speichern([fahrt]))

    async def speichern(self, fahrten: list[dict[str, Any]], ersetzen: tuple[str, str] | None = None) -> None:
        """Fahrten ablegen. `ersetzen` = (von, bis): vorhandene Fahrten in dem Zeitraum fliegen raus."""
        nach_monat: dict[str, list[dict[str, Any]]] = {}
        for f in fahrten:
            nach_monat.setdefault(f["start"][:7], []).append(f)
        monate = set(nach_monat)
        if ersetzen:
            monate |= {d[:7] for d in self.daten["tage"] if ersetzen[0][:10] <= d <= ersetzen[1][:10]}
        tage_neu: set[str] = set()
        for m in sorted(monate):
            store = self._monat(m)
            alt = ((await store.async_load()) or {}).get("fahrten", [])
            if ersetzen:
                alt = [f for f in alt if not (ersetzen[0] <= f["start"] <= ersetzen[1])]
            neu = {f["start"]: f for f in nach_monat.get(m, [])}  # gleiche Startzeit = Aktualisierung
            alle = [f for f in alt if f["start"] not in neu] + list(neu.values())
            alle.sort(key=lambda f: f["start"])
            await store.async_save({"fahrten": alle})
            # Übersicht des Monats neu
            for d in [d for d in self.daten["tage"] if d.startswith(m)]:
                del self.daten["tage"][d]
            for f in alle:
                tag = self.daten["tage"].setdefault(f["start"][:10], {"km": 0.0, "min": 0, "fahrten": 0, "orte": []})
                tag["km"] = round(tag["km"] + (f.get("km_tacho") or f["km_gps"]), 1)
                tag["min"] += f.get("fahr_min", f["dauer_min"])  # reine Fahrzeit ohne Pausen
                tag["fahrten"] += 1
                for o in (f.get("von"), f.get("nach")):
                    if o and (not tag["orte"] or tag["orte"][-1] != o):
                        tag["orte"].append(o)
            tage_neu |= {f["start"][:10] for f in nach_monat.get(m, [])}
        await self.sichern()
        for d in sorted(tage_neu) or [None]:
            self.hass.bus.async_fire(EREIGNIS, {"datum": d})

    async def tag(self, datum: str) -> list[dict[str, Any]]:
        daten = (await self._monat(datum).async_load()) or {}
        return [f for f in daten.get("fahrten", []) if f["start"].startswith(datum)]

    async def loeschen(self, start: str) -> bool:
        store = self._monat(start)
        alt = ((await store.async_load()) or {}).get("fahrten", [])
        if not any(f["start"] == start for f in alt):
            return False
        await self.speichern([], ersetzen=(start, start))
        return True

    # ---- Nachtragen aus dem Recorder ---------------------------------------
    async def nachtragen(self, start: datetime, ende: datetime) -> int:
        from homeassistant.components.recorder import get_instance, history

        reihen = []
        for rolle, ids in self.quellen.items():
            for eid in ids or []:
                zustaende = await get_instance(self.hass).async_add_executor_job(
                    lambda e=eid: history.state_changes_during_period(
                        self.hass, start, ende, e, no_attributes=(rolle != "position"),
                        include_start_time_state=True).get(e, []))
                reihen.append([(s.last_updated.timestamp(), rolle, s) for s in zustaende])
        fahrten: list[dict[str, Any]] = []
        buch = Fahrtenbuch(fahrten.append, hat_zuendung=bool(self.quellen.get("zuendung")), lokalzeit=lokalzeit)
        for t, rolle, s in heapq.merge(*reihen, key=lambda r: r[0]):
            wert = ereignis_wert(rolle, s)
            if wert is not None:
                buch.ereignis(t, rolle, wert)
        buch.abschliessen()
        await self.speichern(fahrten, ersetzen=(lokalzeit(start.timestamp()), lokalzeit(ende.timestamp())))
        return len(fahrten)

    def uebersicht(self) -> dict[str, Any]:
        return {
            "tage": [{"datum": d, **v} for d, v in sorted(self.daten["tage"].items())],
            "laeuft": self.buch.fahrt is not None,
        }


def holen(hass: HomeAssistant) -> Reisetagebuch:
    return hass.data[DATEN]


async def einrichten(hass: HomeAssistant) -> Reisetagebuch:
    if DATEN in hass.data:
        return hass.data[DATEN]
    r = Reisetagebuch(hass)
    hass.data[DATEN] = r
    await r.laden()
    r.hoeren()

    async def stopp(_ev: Event) -> None:
        await r.sichern()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, stopp)
    for cmd in (ws_tage, ws_tag, ws_einstellungen, ws_nachtragen, ws_loeschen):
        websocket_api.async_register_command(hass, cmd)
    return r


# ---- WebSocket --------------------------------------------------------------
@websocket_api.websocket_command({vol.Required("type"): "yapaia/reisetagebuch/tage"})
@callback
def ws_tage(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], holen(hass).uebersicht())


@websocket_api.websocket_command({vol.Required("type"): "yapaia/reisetagebuch/tag", vol.Required("datum"): str})
@websocket_api.async_response
async def ws_tag(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], {"datum": msg["datum"], "fahrten": await holen(hass).tag(msg["datum"])})


@websocket_api.websocket_command({
    vol.Required("type"): "yapaia/reisetagebuch/einstellungen",
    vol.Optional("quellen"): vol.Any(None, {vol.In(list(ROLLEN)): [str]}),
})
@websocket_api.async_response
async def ws_einstellungen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    r = holen(hass)
    if "quellen" in msg:
        if not connection.user.is_admin:
            connection.send_error(msg["id"], "unauthorized", "Nur Admins dürfen die Quellen ändern")
            return
        r.daten["quellen"] = msg["quellen"]
        r.hoeren()
        await r.sichern()
    connection.send_result(msg["id"], {"quellen": r.quellen, "standard": r.daten.get("quellen") is None,
                                       "rollen": ROLLEN})


@websocket_api.websocket_command({
    vol.Required("type"): "yapaia/reisetagebuch/nachtragen",
    vol.Required("start"): str, vol.Required("ende"): str,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_nachtragen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    start, ende = dt_util.parse_datetime(msg["start"]), dt_util.parse_datetime(msg["ende"])
    if start is None or ende is None or ende <= start:
        connection.send_error(msg["id"], "invalid_format", "start/ende: ISO-Zeitpunkte, ende nach start")
        return
    start, ende = dt_util.as_utc(start if start.tzinfo else start.replace(tzinfo=dt_util.get_default_time_zone())), \
        dt_util.as_utc(ende if ende.tzinfo else ende.replace(tzinfo=dt_util.get_default_time_zone()))
    n = await holen(hass).nachtragen(start, ende)
    connection.send_result(msg["id"], {"fahrten": n})


@websocket_api.websocket_command({vol.Required("type"): "yapaia/reisetagebuch/loeschen", vol.Required("start"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_loeschen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], {"geloescht": await holen(hass).loeschen(msg["start"])})
