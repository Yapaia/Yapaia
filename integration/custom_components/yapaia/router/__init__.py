"""Yapaia Router: Mobilfunk des GL.iNet-Routers als Modul der Integration „Yapaia“.

Der Router ist kein Add-on und spricht kein Yapaia-Protokoll. Dieses Modul
spricht es für ihn -- lokal: es beschreibt den Router wie jedes andere Modul
(Entitäten, Aktionen, Ereignisse, Fähigkeiten), füllt die Werte aus der
JSON-RPC-Schnittstelle des Routers und führt die Aktionen dort aus. Dadurch
gelten für den Router dieselben allgemeinen Plattformen, Aktionen, Auslöser
und die Partnerliste wie für Go und Beat.

Das Wichtigste ist die SIM-Umschaltung, vor allem an Ländergrenzen:

* Der Ländercode (MCC) des eingebuchten Netzes sagt, in welchem Land man ist.
* Mit der Automatik wählt der Router je Land die passende SIM.
* Der Umschaltbefehl ist nicht dokumentiert. Bekannte Wege werden der Reihe
  nach probiert; als gelernt gilt nur, was der Router danach wirklich meldet.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryAuthFailed, ConfigEntryNotReady
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.device_registry import format_mac

from ..client import YapaiaFehler
from ..const import DOMAIN
from ..modul import YapaiaModul
from .api import (
    SWITCH_CANDIDATES,
    CellularState,
    GLiNetAuthError,
    GLiNetClient,
    GLiNetError,
    aktive_quelle,
    is_unknown_method,
    parse_state,
    parse_wlan,
)
from .laender import codes, land

_LOGGER = logging.getLogger(__name__)

MODUL = "router"
VERSION = "0.3.0"
FAEHIGKEITEN = ["mobilfunk", "mobilfunk.sim_wechsel"]

# Optionen (Einstellungen der Integration für diesen Router)
OPT_INTERVALL = "intervall"
OPT_AUTOMATIK = "automatik"
OPT_SIM1 = "laender_sim1"
OPT_SIM2 = "laender_sim2"
OPT_SONST = "sonst"
OPT_WARTEN = "wartezeit_min"
OPT_METHODE = "umschalt_methode"
OPT_PARAMETER = "umschalt_parameter"
# In den Daten des Eintrags: der Weg, der sich bewährt hat
DATA_WEG = "umschaltweg"

# 15 s: die Anzeige im Dashboard soll den Empfang „live“ zeigen
STANDARD_INTERVALL = 15
# Rangfolge der Internetquellen ändert sich selten
KMWAN_CONFIG_S = 600
STANDARD_WARTEN = 3
# Wie lange nach einem angenommenen Befehl auf die Bestätigung gewartet wird
BESTAETIGUNG_S = 90
BESTAETIGUNG_TAKT_S = 5
# Nach einem automatischen Versuch so lange keinen weiteren
AUTOMATIK_PAUSE_S = 15 * 60

SIM_OPTIONEN = ["SIM 1", "SIM 2"]
QUELLEN_NAME = {"wlan": "WLAN", "mobil": "Mobilfunk", "kabel": "Kabel", "tethering": "Tethering"}

_T = dict  # Kurzform für Texte {"de": …, "en": …}


def beschreibung(instanz: str, name: str, version: str) -> dict[str, Any]:
    def sensor(schluessel: str, de: str, en: str, **extra: Any) -> dict[str, Any]:
        return {"schluessel": schluessel, "plattform": "sensor", "name": _T(de=de, en=en), **extra}

    dbm = {"geraeteklasse": "signal_strength", "einheit": "dBm", "zustandsklasse": "measurement"}
    db = {"einheit": "dB", "zustandsklasse": "measurement", "symbol": "mdi:signal"}
    return {
        "protokoll": 1,
        "modul": MODUL,
        "instanz": instanz,
        "name": name,
        "version": version,
        "hersteller": "Yapaia",
        "faehigkeiten": FAEHIGKEITEN,
        "entitaeten": [
            {"schluessel": "sim", "plattform": "select", "name": _T(de="SIM-Karte", en="SIM card"),
             "symbol": "mdi:sim", "optionen": SIM_OPTIONEN, "aktion": "sim_waehlen"},
            {"schluessel": "automatik", "plattform": "switch", "name": _T(de="SIM nach Land", en="SIM by country"),
             "symbol": "mdi:earth-arrow-right", "aktion_an": "automatik_an", "aktion_aus": "automatik_aus"},
            sensor("land", "Land", "Country", symbol="mdi:earth", attribute=["land_code", "mcc"]),
            {"schluessel": "roaming", "plattform": "binary_sensor", "name": _T(de="Roaming", en="Roaming"),
             "symbol": "mdi:airplane"},
            sensor("aktive_sim", "Aktive SIM", "Active SIM", symbol="mdi:sim"),
            sensor("anbieter", "Anbieter", "Carrier", symbol="mdi:radio-tower"),
            sensor("netztyp", "Netztyp", "Network type", symbol="mdi:signal-5g"),
            sensor("baender", "Frequenzbänder", "Bands", symbol="mdi:sine-wave"),
            sensor("signalbalken", "Signalbalken", "Signal bars", symbol="mdi:signal-cellular-3",
                   zustandsklasse="measurement"),
            sensor("rsrp", "RSRP", "RSRP", **dbm),
            sensor("rsrq", "RSRQ", "RSRQ", **db),
            sensor("sinr", "SINR", "SINR", **db),
            sensor("rssi", "RSSI", "RSSI", standard_aktiv=False, **dbm),
            sensor("datenverbrauch", "Datenverbrauch", "Data usage", geraeteklasse="data_size", einheit="B",
                   zustandsklasse="total_increasing", symbol="mdi:swap-vertical"),
            {"schluessel": "verbunden", "plattform": "binary_sensor",
             "name": _T(de="Mobilfunkverbindung", en="Cellular connection"), "geraeteklasse": "connectivity"},
            sensor("umschaltung", "SIM-Umschaltung", "SIM switching", symbol="mdi:swap-horizontal",
                   kategorie="diagnostic", attribute=["umschaltweg"]),
            sensor("modem", "Modem", "Modem", symbol="mdi:router-network", kategorie="diagnostic"),
            sensor("internet", "Internet über", "Internet via", symbol="mdi:web",
                   attribute=["quelle", "wlan_ssid", "wlan_balken", "wlan_kanal", "wlan_bssid", "wlan_ip",
                              "wlan_gateway", "wlan_verbunden"]),
            sensor("wlan_signal", "WLAN-Signal", "Wi-Fi signal", **dbm),
            {"schluessel": "neu_verbinden", "plattform": "button",
             "name": _T(de="Mobilfunk neu verbinden", en="Reconnect cellular"), "symbol": "mdi:restart",
             "aktion": "neu_verbinden"},
            {"schluessel": "neustart", "plattform": "button", "name": _T(de="Router neu starten", en="Restart router"),
             "geraeteklasse": "restart", "kategorie": "config", "standard_aktiv": False, "aktion": "router_neustart"},
        ],
        "aktionen": [
            {"name": "sim_waehlen", "titel": _T(de="SIM wählen", en="Select SIM"),
             "beschreibung": _T(
                 de="Schaltet auf SIM 1 oder SIM 2 um. Das Ergebnis meldet der Auslöser „SIM gewechselt“ "
                    "bzw. „SIM-Wechsel fehlgeschlagen“ (bis zu einigen Minuten).",
                 en="Switches to SIM 1 or SIM 2. The outcome is reported by the triggers."),
             "felder": {"sim": {"typ": "auswahl", "optionen": ["1", "2"], "pflicht": True,
                                "titel": _T(de="SIM", en="SIM")}}},
            {"name": "neu_verbinden", "titel": _T(de="Mobilfunk neu verbinden", en="Reconnect cellular")},
            {"name": "router_neustart", "titel": _T(de="Router neu starten", en="Restart router")},
            {"name": "automatik_an", "titel": _T(de="SIM nach Land: an", en="SIM by country: on")},
            {"name": "automatik_aus", "titel": _T(de="SIM nach Land: aus", en="SIM by country: off")},
            {"name": "rpc", "titel": _T(de="Router-Aufruf (roh)", en="Raw router call"),
             "beschreibung": _T(de="Für Fachleute: ruft service.method am Router auf und gibt die Antwort zurück.",
                                en="For experts: calls service.method on the router and returns the answer."),
             "felder": {"service": {"typ": "text", "pflicht": True}, "method": {"typ": "text", "pflicht": True},
                        "params": {"typ": "text", "titel": _T(de="Parameter (JSON)", en="Parameters (JSON)")}}},
        ],
        "ereignisse": [
            {"name": "land_gewechselt", "titel": _T(de="Land gewechselt", en="Country changed"),
             "daten": ["land", "land_code", "vorher"]},
            {"name": "sim_gewechselt", "titel": _T(de="SIM gewechselt", en="SIM switched"),
             "daten": ["sim", "grund"]},
            {"name": "sim_wechsel_fehlgeschlagen", "titel": _T(de="SIM-Wechsel fehlgeschlagen", en="SIM switch failed"),
             "daten": ["sim", "grund"]},
        ],
    }


def sim_fuer_land(optionen: dict[str, Any], land_code: str | None) -> int | None:
    """Welche SIM in diesem Land gelten soll (`None`: nicht wechseln)."""
    if not land_code:
        return None
    if land_code in codes(optionen.get(OPT_SIM1)):
        return 1
    if land_code in codes(optionen.get(OPT_SIM2)):
        return 2
    sonst = str(optionen.get(OPT_SONST) or "")
    return int(sonst) if sonst in ("1", "2") else None


def sim_aus(daten: dict[str, Any]) -> int | None:
    """`{"sim": 2}`, `{"sim": "2"}` oder vom Auswahlfeld `{"wert": "SIM 2"}`."""
    roh = daten.get("sim", daten.get("wert"))
    text = str(roh or "").strip().upper().replace("SIM", "").strip()
    return int(text) if text in ("1", "2") else None


class LokalerClient:
    """Was die Integration sonst übers Netz an ein Modul schickt, hier direkt."""

    def __init__(self, modul: RouterModul) -> None:
        self._modul = modul

    async def aktion(self, name: str, daten: dict[str, Any]) -> dict[str, Any]:
        return {"ok": True, "ergebnis": await self._modul.aktion(name, daten)}

    async def partner(self, liste: list[dict[str, Any]]) -> None:
        self._modul.partner = liste


class RouterModul(YapaiaModul):
    """Ein GL.iNet-Router als Yapaia-Modul."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, router: GLiNetClient, instanz: str, name: str) -> None:
        super().__init__(hass, entry, LokalerClient(self), beschreibung(instanz, name, VERSION))
        self.router = router
        self.partner: list[dict[str, Any]] = []
        self.system_info: dict[str, Any] = {}
        self.zustand: CellularState | None = None
        self._modem_info: Any = None
        self._kmwan_config: Any = None
        self._kmwan_config_bis = 0.0
        self._wecker = asyncio.Event()
        self._wechsel: asyncio.Task | None = None
        self._wechsel_ziel: int | None = None
        self._letzter_automatik_versuch = float("-inf")
        self._land: str | None = None
        self._land_seit = 0.0
        self._status = "bereit"

    # ---- Einstellungen ------------------------------------------------------
    @property
    def optionen(self) -> dict[str, Any]:
        return dict(self.entry.options)

    @property
    def umschaltweg(self) -> dict[str, Any] | None:
        weg = self.entry.data.get(DATA_WEG)
        return weg if isinstance(weg, dict) and weg.get("methode") else None

    def _wege(self) -> list[tuple[str, Any]]:
        """Reihenfolge: von Hand eingetragen, bewährt, dann die übrigen bekannten."""
        wege: list[tuple[str, Any]] = []
        methode = str(self.optionen.get(OPT_METHODE) or "").strip()
        if "." in methode:
            roh = str(self.optionen.get(OPT_PARAMETER) or "").strip()
            try:
                wege.append((methode, json.loads(roh) if roh else None))
            except ValueError:
                _LOGGER.warning("Router: Parameter für die SIM-Umschaltung sind kein gültiges JSON")
        if (weg := self.umschaltweg) is not None:
            wege.append((weg["methode"], weg.get("parameter")))
        for w in SWITCH_CANDIDATES:
            if w not in wege:
                wege.append(w)
        return wege

    # ---- Abfragen -----------------------------------------------------------
    async def erste_abfrage(self) -> None:
        try:
            self.system_info = await self.router.get_system_info()
            await self.abfragen()
            self.verbunden = True
        except GLiNetAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except GLiNetError as err:
            raise ConfigEntryNotReady(f"{self.name}: {err}") from err

    async def _status_lesen(self) -> CellularState:
        r = self.router
        if not self._modem_info:
            self._modem_info = await r.call_optional("modem", "get_info")
        status = await r.call("modem", "get_status")
        bus = parse_state(self._modem_info, status, None, None).bus
        cells = await r.call_optional("modem", "get_cells_info", {"bus": bus}) if bus else None
        slot = await r.get_slot_config(bus)
        z = parse_state(self._modem_info, status, cells, slot)
        # Internetquelle und WLAN-Repeater: ältere Firmware kennt das nicht
        if time.monotonic() >= self._kmwan_config_bis:
            self._kmwan_config = await r.call_optional("kmwan", "get_config")
            self._kmwan_config_bis = time.monotonic() + KMWAN_CONFIG_S
        z.quelle = aktive_quelle(await r.call_optional("kmwan", "get_status"), self._kmwan_config)
        z.wlan = parse_wlan(await r.call_optional("repeater", "get_status"))
        return z

    async def abfragen(self) -> None:
        self.zustand = z = await self._status_lesen()
        self._land_pruefen(z)
        self._werte_setzen()
        self._automatik(z)

    def _werte_setzen(self) -> None:
        z = self.zustand
        if z is None:
            return
        code, landname = land(z.mcc)
        anzeige_sim = self._wechsel_ziel or z.active_sim
        weg = self.umschaltweg
        self.werte.update({
            "sim": f"SIM {anzeige_sim}" if anzeige_sim in (1, 2) else None,
            "automatik": bool(self.optionen.get(OPT_AUTOMATIK)),
            "land": landname or (f"MCC {z.mcc}" if z.mcc else None),
            "land_code": code,
            "mcc": z.mcc,
            "roaming": z.roaming,
            "aktive_sim": z.active_sim,
            "anbieter": z.carrier,
            "netztyp": z.network_type,
            "baender": z.bands,
            "signalbalken": z.signal_bars,
            "rsrp": z.rsrp,
            "rsrq": z.rsrq,
            "sinr": z.sinr,
            "rssi": z.rssi,
            "datenverbrauch": z.traffic_total,
            "verbunden": z.connected,
            "modem": z.modem_model,
            "internet": QUELLEN_NAME.get(z.quelle or ""),
            "quelle": z.quelle,
            "wlan_signal": z.wlan.get("signal"),
            **{f"wlan_{k}": z.wlan.get(k) for k in ("ssid", "balken", "kanal", "bssid", "ip", "gateway", "verbunden")},
            "umschaltung": self._status,
            "umschaltweg": f"{weg['methode']} {json.dumps(weg.get('parameter'))}" if weg else "noch nicht eingelernt",
        })
        self._melden()

    # ---- Land und Automatik -------------------------------------------------
    def _land_pruefen(self, z: CellularState) -> None:
        code, name = land(z.mcc)
        kennung = code or (f"MCC {z.mcc}" if z.mcc else None)
        # Ohne Netz (z. B. während eines Wechsels) gilt das bisherige Land weiter.
        if kennung is None or kennung == self._land:
            return
        vorher = self._land
        self._land, self._land_seit = kennung, time.monotonic()
        if vorher is not None:
            _LOGGER.info("Router: Land gewechselt %s → %s", vorher, kennung)
            self._ereignis("land_gewechselt", {"land": name or kennung, "land_code": code, "vorher": vorher})

    def _automatik(self, z: CellularState) -> None:
        o = self.optionen
        if not o.get(OPT_AUTOMATIK) or self._wechsel is not None or z.active_sim is None:
            return
        ziel = sim_fuer_land(o, land(z.mcc)[0])
        if ziel is None or ziel == z.active_sim:
            return
        jetzt = time.monotonic()
        if jetzt - self._land_seit < float(o.get(OPT_WARTEN, STANDARD_WARTEN)) * 60:
            return  # erst sicher sein, dass man wirklich drüben ist
        if jetzt - self._letzter_automatik_versuch < AUTOMATIK_PAUSE_S:
            return
        self._letzter_automatik_versuch = jetzt
        _LOGGER.info("Router: %s → SIM %s (SIM nach Land)", self._land, ziel)
        self._starten(ziel, f"land:{self._land}")

    # ---- SIM-Umschaltung ----------------------------------------------------
    def _starten(self, ziel: int, grund: str) -> None:
        self._wechsel_ziel = ziel
        self._status = f"läuft: SIM {ziel}"
        self._werte_setzen()
        self._wechsel = self.entry.async_create_background_task(
            self.hass, self._umschalten(ziel, grund), f"{DOMAIN}_{self.kennung}_sim"
        )

    async def sim_wechseln(self, ziel: int, grund: str = "nutzer") -> dict[str, Any]:
        if self._wechsel is not None:
            raise YapaiaFehler(f"Die Umschaltung auf SIM {self._wechsel_ziel} läuft noch")
        if self.zustand and self.zustand.active_sim == ziel:
            return {"sim": ziel, "schon_aktiv": True}
        self._starten(ziel, grund)
        return {"sim": ziel, "gestartet": True}

    async def _bestaetigt(self, ziel: int) -> bool:
        ende = time.monotonic() + BESTAETIGUNG_S
        while time.monotonic() < ende:
            await asyncio.sleep(BESTAETIGUNG_TAKT_S)
            try:
                z = await self._status_lesen()
            except GLiNetError:
                continue  # während des Wechsels ist der Router oft kurz beschäftigt
            if z.active_sim == ziel:
                self.zustand = z
                return True
        return False

    async def _umschalten(self, ziel: int, grund: str) -> None:
        versucht: list[str] = []
        bus = self.zustand.bus if self.zustand else None
        try:
            for methode, vorlage in self._wege():
                try:
                    await self.router.switch_sim(ziel, bus, method=methode, params_template=vorlage)
                except GLiNetError as err:
                    versucht.append(f"{methode}: {'unbekannt' if is_unknown_method(err) else err}")
                    continue
                if await self._bestaetigt(ziel):
                    self._gelernt(methode, vorlage)
                    self._status = f"SIM {ziel} aktiv"
                    persistent_notification.async_dismiss(self.hass, f"{DOMAIN}_{self.kennung}_sim")
                    self._ereignis("sim_gewechselt", {"sim": ziel, "grund": grund})
                    return
                versucht.append(f"{methode} {json.dumps(vorlage)}: angenommen, aber keine Umschaltung")
            self._status = f"fehlgeschlagen: SIM {ziel}"
            self._ereignis("sim_wechsel_fehlgeschlagen", {"sim": ziel, "grund": grund})
            persistent_notification.async_create(
                self.hass,
                f"Die Umschaltung auf SIM {ziel} hat der Router nicht bestätigt. Versucht:\n\n"
                + "\n".join(f"- `{v}`" for v in versucht)
                + "\n\nBitte unter Einstellungen → Geräte & Dienste → Yapaia → Yapaia Router → ⋮ → "
                "„Diagnose herunterladen“ die Datei weitergeben; damit lässt sich der richtige Aufruf finden.",
                title="Yapaia Router: SIM-Umschaltung nicht bestätigt",
                notification_id=f"{DOMAIN}_{self.kennung}_sim",
            )
        finally:
            self._wechsel = None
            self._wechsel_ziel = None
            self._wecker.set()

    @callback
    def _gelernt(self, methode: str, vorlage: Any) -> None:
        weg = {"methode": methode, "parameter": vorlage}
        if self.umschaltweg != weg:
            _LOGGER.info("Router: SIM-Umschaltung eingelernt: %s %s", methode, vorlage)
            self.hass.config_entries.async_update_entry(self.entry, data={**self.entry.data, DATA_WEG: weg})

    # ---- Aktionen -----------------------------------------------------------
    async def aktion(self, name: str, daten: dict[str, Any]) -> Any:
        try:
            if name == "sim_waehlen":
                ziel = sim_aus(daten)
                if ziel is None:
                    raise YapaiaFehler("Bitte SIM 1 oder SIM 2 angeben")
                return await self.sim_wechseln(ziel)
            if name in ("automatik_an", "automatik_aus"):
                self.hass.config_entries.async_update_entry(
                    self.entry, options={**self.entry.options, OPT_AUTOMATIK: name == "automatik_an"}
                )
                self._werte_setzen()
                return None
            if name == "neu_verbinden":
                if not (self.zustand and self.zustand.bus):
                    raise YapaiaFehler("Kein Modem gefunden")
                await self.router.reconnect(self.zustand.bus)
            elif name == "router_neustart":
                await self.router.reboot()
                return None
            elif name == "rpc":
                params = daten.get("params") or {}
                if isinstance(params, str):
                    try:
                        params = json.loads(params) if params.strip() else {}
                    except ValueError as err:
                        raise YapaiaFehler(f"Parameter sind kein gültiges JSON: {err}") from err
                ergebnis = await self.router.call(str(daten.get("service")), str(daten.get("method")), params)
                self._wecker.set()
                return {"antwort": ergebnis}
            else:
                raise YapaiaFehler(f"Unbekannte Aktion {name}")
        except GLiNetError as err:
            raise YapaiaFehler(f"Router: {err}") from err
        self._wecker.set()
        return None

    @callback
    def _ereignis(self, name: str, daten: dict[str, Any]) -> None:
        self._verarbeiten({"typ": "ereignis", "name": name, "daten": daten})

    # ---- Lauf ---------------------------------------------------------------
    @callback
    def bald_abfragen(self) -> None:
        self._werte_setzen()
        self._wecker.set()

    def starten(self) -> None:
        self._task = self.entry.async_create_background_task(self.hass, self._lauf(), f"{DOMAIN}_{self.kennung}_lauf")

    async def stoppen(self) -> None:
        await super().stoppen()
        if self._wechsel is not None:
            self._wechsel.cancel()
            await asyncio.gather(self._wechsel, return_exceptions=True)

    async def _lauf(self) -> None:
        while True:
            intervall = float(self.optionen.get(OPT_INTERVALL, STANDARD_INTERVALL))
            try:
                await asyncio.wait_for(self._wecker.wait(), timeout=intervall)
            except TimeoutError:
                pass
            self._wecker.clear()
            if self._wechsel is not None:
                continue  # die Umschaltung fragt selbst ab
            try:
                await self.abfragen()
                if not self.verbunden:
                    self.verbunden = True
                    self._melden()
            except GLiNetAuthError:
                self.entry.async_start_reauth(self.hass)
                return
            except GLiNetError as err:
                _LOGGER.debug("Router nicht erreichbar: %s", err)
                if self.verbunden:
                    self.verbunden = False
                    self._melden()


async def einrichten(hass: HomeAssistant, entry: ConfigEntry) -> RouterModul:
    router = GLiNetClient(
        async_get_clientsession(hass), entry.data[CONF_HOST], entry.data[CONF_USERNAME], entry.data[CONF_PASSWORD]
    )
    instanz = str(entry.data.get("instanz") or entry.data[CONF_HOST])
    modul = RouterModul(hass, entry, router, instanz, entry.title or "Yapaia Router")
    await modul.erste_abfrage()
    return modul


async def pruefen(hass: HomeAssistant, host: str, benutzer: str, passwort: str) -> dict[str, Any]:
    """Für die Einrichtung: anmelden und `system.get_info` lesen."""
    client = GLiNetClient(async_get_clientsession(hass), host, benutzer, passwort)
    info = await client.get_system_info()
    mac = info.get("mac")
    return {"instanz": format_mac(mac).replace(":", "") if mac else host, "modell": info.get("model")}
