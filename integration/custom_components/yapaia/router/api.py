"""JSON-RPC-Client für GL.iNet-Router mit Firmware 4.x (Yapaia Router).

The router exposes ``POST /rpc``. Login is a challenge/response:

1. ``challenge {username}`` -> ``{salt, nonce, alg, hash-method}``
2. ``login {username, hash}`` with
   ``hash = HASH(f"{username}:{crypt(password, alg, salt)}:{nonce}")`` -> ``{sid}``
3. ``call [sid, service, method, params]`` for everything else.
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import logging
from dataclasses import dataclass, field
from typing import Any

import aiohttp

from .crypt import crypt_password

_LOGGER = logging.getLogger(__name__)

# Keys that may hold the selected SIM slot in ``modem.get_slot_config``.
# The answer is not publicly documented, so the first one present wins.
SLOT_KEYS = (
    "slot",
    "current_slot",
    "sim",
    "current_sim",
    "sim_slot",
    "simslot",
    "sim_card",
    "card",
)

AUTH_ERROR_MARKERS = ("access denied", "unauthorized", "invalid sid", "no sid")


class GLiNetError(Exception):
    """Base error."""


class GLiNetConnectionError(GLiNetError):
    """Router not reachable."""


class GLiNetAuthError(GLiNetError):
    """Login rejected or session invalid."""


class GLiNetRpcError(GLiNetError):
    """The router answered with a JSON-RPC error."""

    def __init__(self, code: int | None, message: str) -> None:
        super().__init__(f"RPC error {code}: {message}")
        self.code = code
        self.message = message

    @property
    def is_auth_error(self) -> bool:
        return any(m in self.message.lower() for m in AUTH_ERROR_MARKERS)


def build_url(host: str) -> str:
    """Turn ``192.168.8.1`` or ``https://router`` into the RPC endpoint URL."""
    host = host.strip().rstrip("/")
    if not host.startswith(("http://", "https://")):
        host = f"http://{host}"
    if not host.endswith("/rpc"):
        host = f"{host}/rpc"
    return host


def build_login_hash(username: str, password: str, challenge: dict[str, Any]) -> str:
    """Compute the login hash for a ``challenge`` answer."""
    cipher = crypt_password(
        password, int(challenge.get("alg", 1)), str(challenge["salt"])
    )
    method = str(challenge.get("hash-method", "md5")).lower().replace("-", "")
    if method not in ("md5", "sha256", "sha512"):
        raise GLiNetAuthError(f"Unsupported hash method {method}")
    material = f"{username}:{cipher}:{challenge['nonce']}".encode()
    return getattr(hashlib, method)(material).hexdigest()


class GLiNetClient:
    """Minimal async client for the GL.iNet 4.x JSON-RPC API."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        host: str,
        username: str,
        password: str,
        timeout: float = 15,
    ) -> None:
        self._session = session
        self._url = build_url(host)
        self._username = username
        self._password = password
        self._timeout = aiohttp.ClientTimeout(total=timeout)
        self._sid: str | None = None
        self._id = 0
        self._auth_lock = asyncio.Lock()
        self._write_lock = asyncio.Lock()

    @property
    def url(self) -> str:
        return self._url

    async def _request(self, method: str, params: Any) -> Any:
        self._id += 1
        payload = {"jsonrpc": "2.0", "id": self._id, "method": method, "params": params}
        try:
            async with self._session.post(
                self._url,
                json=payload,
                timeout=self._timeout,
                # Routers reached via https use a self-signed certificate.
                ssl=False,
            ) as resp:
                resp.raise_for_status()
                data = await resp.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            raise GLiNetConnectionError(f"{self._url}: {err}") from err
        if not isinstance(data, dict):
            raise GLiNetRpcError(None, "Malformed response")
        if error := data.get("error"):
            raise GLiNetRpcError(error.get("code"), str(error.get("message", "")))
        return data.get("result")

    async def login(self) -> None:
        """Run the challenge/response login and store the session id."""
        async with self._auth_lock:
            await self._login_unlocked()

    async def _login_unlocked(self) -> None:
        try:
            challenge = await self._request("challenge", {"username": self._username})
        except GLiNetRpcError as err:
            raise GLiNetAuthError(str(err)) from err
        if (
            not isinstance(challenge, dict)
            or "salt" not in challenge
            or "nonce" not in challenge
        ):
            raise GLiNetAuthError("Malformed login challenge")
        try:
            login_hash = build_login_hash(self._username, self._password, challenge)
        except ValueError as err:
            raise GLiNetAuthError(str(err)) from err
        try:
            result = await self._request(
                "login", {"username": self._username, "hash": login_hash}
            )
        except GLiNetRpcError as err:
            raise GLiNetAuthError("Router rejected the credentials") from err
        sid = result.get("sid") if isinstance(result, dict) else None
        if not sid:
            raise GLiNetAuthError("Login answer contained no sid")
        self._sid = sid

    async def call(
        self, service: str, method: str, params: dict[str, Any] | None = None
    ) -> Any:
        """Call ``service.method``; log in again once if the session expired."""
        if self._sid is None:
            await self.login()
        sid = self._sid
        try:
            return await self._request("call", [sid, service, method, params or {}])
        except GLiNetRpcError as err:
            if not err.is_auth_error:
                raise
        async with self._auth_lock:
            if self._sid == sid:
                await self._login_unlocked()
        try:
            return await self._request(
                "call", [self._sid, service, method, params or {}]
            )
        except GLiNetRpcError as err:
            if err.is_auth_error:
                raise GLiNetAuthError(str(err)) from err
            raise

    async def call_optional(
        self, service: str, method: str, params: dict[str, Any] | None = None
    ) -> Any:
        """Like ``call`` but return ``None`` if the firmware lacks the method."""
        try:
            return await self.call(service, method, params)
        except GLiNetRpcError as err:
            _LOGGER.debug("%s.%s(%s) not available: %s", service, method, params, err)
            return None

    # ---- high level helpers -------------------------------------------------

    async def get_system_info(self) -> dict[str, Any]:
        result = await self.call("system", "get_info")
        return result if isinstance(result, dict) else {}

    async def get_slot_config(self, bus: str | None) -> Any:
        """Return the SIM slot configuration (undocumented)."""
        if bus:
            result = await self.call_optional("modem", "get_slot_config", {"bus": bus})
            if result is not None:
                return result
        return await self.call_optional("modem", "get_slot_config")

    async def switch_sim(
        self,
        target: int,
        bus: str | None,
        *,
        method: str | None = None,
        params_template: Any = None,
    ) -> tuple[str, dict[str, Any], Any]:
        """Ask the router to use SIM ``target``.

        Without a template the current ``get_slot_config`` answer is sent back
        to ``set_slot_config`` with only the slot value replaced. A template
        configured in the integration options overrides this guess.
        Returns ``(service.method, params, result)`` for logging.
        """
        async with self._write_lock:
            service, _, func = (method or "modem.set_slot_config").partition(".")
            if params_template not in (None, "", {}):
                params = render_template(params_template, target, bus)
            else:
                params = build_switch_params(
                    await self.get_slot_config(bus), bus, target
                )
            _LOGGER.info("SIM switch: calling %s.%s with %s", service, func, params)
            result = await self.call(service, func, params)
            _LOGGER.info("SIM switch: router answered %s", result)
            return f"{service}.{func}", params, result

    async def reconnect(self, bus: str) -> None:
        async with self._write_lock:
            await self.call("modem", "disconnect", {"bus": bus})
            await asyncio.sleep(2)
            await self.call("modem", "set_connect", {"bus": bus})

    async def reboot(self) -> None:
        async with self._write_lock:
            await self.call("system", "reboot")


# ---- pure helpers (unit tested) ---------------------------------------------


# ---- SIM-Umschaltung: bekannte Wege -----------------------------------------
#
# Am GL-X3000 (Firmware 4.x) nachgesehen, was die Router-Oberfläche beim
# „Anwenden“ im Dialog „SIM-Kartensteckplatz-Einstellungen“ schickt:
# `modem.set_slot_config {bus, enable_switch: false, current_sim: "2"}` --
# die SIM als Text, der automatische Wechsel aus. Die ganze Slot-Konfiguration
# zurückzuschicken lehnt der Router ab („Invalid params“), `slot` nimmt er an
# und tut nichts.
SWITCH_UI = {"bus": "{bus}", "enable_switch": False, "current_sim": "{sim_text}"}
#
# GL.iNet dokumentiert den Aufruf nicht. Die Router-Oberfläche kann es, also
# gibt es ihn -- nur nicht unter einem bekannten Namen. Deshalb werden diese
# Wege der Reihe nach probiert, und als gelernt gilt nur, was der Router
# danach WIRKLICH meldet (`current_sim`). `None` als Vorlage heißt: die
# aktuelle Slot-Konfiguration mit ersetzter SIM-Nummer zurückschicken.
SWITCH_CANDIDATES: tuple[tuple[str, Any], ...] = (
    ("modem.set_slot_config", SWITCH_UI),
    ("modem.set_slot_config", None),
    ("modem.set_slot_config", {"bus": "{bus}", "slot": "{sim}"}),
    ("modem.set_sim_slot", {"bus": "{bus}", "slot": "{sim}"}),
    ("modem.switch_sim", {"bus": "{bus}", "sim": "{sim}"}),
    ("modem.set_current_sim", {"bus": "{bus}", "current_sim": "{sim}"}),
    ("modem.set_sim", {"bus": "{bus}", "sim": "{sim}"}),
)


def is_unknown_method(err: Exception) -> bool:
    """Ob der Router den Aufruf gar nicht kennt (dann sofort den nächsten Weg)."""
    if not isinstance(err, GLiNetRpcError):
        return False
    return err.code == -32601 or "not found" in err.message.lower() or "no such" in err.message.lower()


def find_slot_key(config: dict[str, Any]) -> str | None:
    return next((key for key in SLOT_KEYS if key in config), None)


def build_switch_params(
    slot_config: Any, bus: str | None, target: int
) -> dict[str, Any]:
    """Derive ``set_slot_config`` params from the current slot config."""
    params: dict[str, Any] = (
        copy.deepcopy(slot_config) if isinstance(slot_config, dict) else {}
    )
    key = find_slot_key(params)
    if key is None:
        params["slot"] = target
    else:
        current = params[key]
        params[key] = str(target) if isinstance(current, str) else target
    if bus:
        params["bus"] = bus
    return params


def render_template(template: Any, target: int, bus: str | None) -> Any:
    """Replace ``"{sim}"`` (as number), ``"{sim_text}"`` and ``"{bus}"`` placeholders."""
    if isinstance(template, dict):
        return {k: render_template(v, target, bus) for k, v in template.items()}
    if isinstance(template, list):
        return [render_template(v, target, bus) for v in template]
    if template == "{sim}":
        return target
    if isinstance(template, str):
        return (
            template.replace("{sim_text}", str(target))
            .replace("{sim}", str(target))
            .replace("{bus}", bus or "")
        )
    return template


# Schlüssel, unter denen die Firmware den Ländercode des Netzes liefern kann.
# Nicht dokumentiert -- deshalb tolerant gesucht, in Status und Zellinfo.
MCC_KEYS = ("mcc",)
PLMN_KEYS = ("plmn", "plmn_id", "operator_code", "operator_numeric", "oper_num", "numeric")
ROAMING_KEYS = ("roaming", "is_roaming", "roam")


def _first_key(obj: Any, keys: tuple[str, ...], depth: int = 0) -> Any:
    """Erster Wert zu einem der Schlüssel, in beliebiger Tiefe (Dicts und Listen)."""
    if depth > 6:
        return None
    if isinstance(obj, dict):
        for key in keys:
            if key in obj and obj[key] not in (None, ""):
                return obj[key]
        children = obj.values()
    elif isinstance(obj, list):
        children = obj
    else:
        return None
    for child in children:
        found = _first_key(child, keys, depth + 1)
        if found is not None:
            return found
    return None


def find_mcc(obj: Any) -> str | None:
    """Der Ländercode des eingebuchten Netzes: `mcc`, sonst die ersten drei Ziffern der PLMN."""
    mcc = _first_key(obj, MCC_KEYS)
    if mcc is not None:
        digits = str(mcc).strip()
        if digits.isdigit() and len(digits) <= 3 and int(digits) >= 200:
            return digits.zfill(3)
    plmn = _first_key(obj, PLMN_KEYS)
    if plmn is not None:
        digits = "".join(ch for ch in str(plmn) if ch.isdigit())
        if len(digits) in (5, 6) and int(digits[:3]) >= 200:
            return digits[:3]
    return None


def _to_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "on"):
        return True
    if text in ("0", "false", "no", "off"):
        return False
    return None


def _to_int(value: Any) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _first_modem(response: Any) -> dict[str, Any]:
    modems = _dict(response).get("modems")
    if isinstance(modems, list) and modems and isinstance(modems[0], dict):
        return modems[0]
    return {}


def signal_bars(rsrp: float | None) -> int | None:
    """Map RSRP (dBm) to 0-5 bars like a phone does."""
    if rsrp is None:
        return None
    for bars, limit in ((5, -80), (4, -90), (3, -100), (2, -110), (1, -120)):
        if rsrp >= limit:
            return bars
    return 0


def format_bands(cells_info: Any) -> str | None:
    """Turn ``get_cells_info`` into e.g. ``B3 + n78``."""
    cells = _dict(cells_info).get("cells")
    if not isinstance(cells, list):
        return None
    bands = []
    for cell in cells:
        cell = _dict(cell)
        band = cell.get("band")
        if band in (None, ""):
            continue
        band = str(band).lstrip("BbNn")
        prefix = "n" if "NR" in str(cell.get("mode", "")).upper() else "B"
        label = f"{prefix}{band}"
        if label not in bands:
            bands.append(label)
    return " + ".join(bands) or None


# ---- Internetquelle (Multi-WAN) und WLAN-Repeater ---------------------------
#
# `kmwan.get_status`: je Schnittstelle `status_v4` (0 = online, wie mwan3),
# `kmwan.get_config`: ihre Rangfolge (`metric`, kleiner = bevorzugt). Genutzt
# wird die erreichbare mit der kleinsten Metrik -- am X3000 standardmäßig
# Kabel (10) vor WLAN-Repeater (20) vor Tethering (30) vor Mobilfunk (40).
QUELLEN = {"wan": "kabel", "secondwan": "kabel", "wwan": "wlan", "tethering": "tethering"}


def quelle_der_schnittstelle(name: str) -> str | None:
    if name.startswith("modem"):
        return "mobil"
    return QUELLEN.get(name)


def aktive_quelle(kmwan_status: Any, kmwan_config: Any) -> str | None:
    """Über welche Quelle der Router gerade ins Internet geht."""
    online = [
        str(i.get("interface")) for i in _dict(kmwan_status).get("interfaces") or []
        if isinstance(i, dict) and _to_int(i.get("status_v4")) == 0
    ]  # fmt: skip
    if not online:
        return None
    metrik = {
        str(i.get("interface")): _to_int(i.get("metric")) for i in _dict(kmwan_config).get("interfaces") or []
        if isinstance(i, dict)
    }  # fmt: skip
    online.sort(key=lambda n: metrik.get(n) if metrik.get(n) is not None else 999)
    return next((q for q in map(quelle_der_schnittstelle, online) if q), None)


def wlan_balken(dbm: float | None) -> int | None:
    """WLAN-Signal (dBm) in 0-4 Balken, wie ein Telefon."""
    if dbm is None:
        return None
    for balken, grenze in ((4, -55), (3, -67), (2, -75), (1, -85)):
        if dbm >= grenze:
            return balken
    return 0


def parse_wlan(repeater: Any) -> dict[str, Any]:
    """Die wichtigen Werte aus `repeater.get_status`.

    Verbindungswerte nur, wenn verbunden. `zustand`, `fehler` und `portal`
    immer: gerade wenn keine Verbindung zustande kommt (falsches Passwort) oder
    ein Captive Portal die Anmeldung im Browser verlangt, will man das sehen.
    """
    r = _dict(repeater)
    if not r:
        return {}
    allgemein = {
        "zustand": r.get("state_s") or None,
        "fehler": r.get("fail_type") or None,
        "portal": _to_bool(r.get("portal")),
    }
    if r.get("state_s") != "connected" and _to_int(r.get("state")) != 2:
        return allgemein
    signal = _to_float(r.get("signal"))
    ipv4 = _dict(r.get("ipv4"))
    return {
        **allgemein,
        "ssid": r.get("ssid") or None,
        "signal": signal,
        "balken": wlan_balken(signal),
        "kanal": _to_int(r.get("channel")),
        "bssid": r.get("bssid") or None,
        "ip": str(ipv4.get("ip") or "").split("/")[0] or None,
        "gateway": ipv4.get("gateway") or None,
        "verbunden": r.get("connected") or None,
    }


BAND_NAME = {"2g": "2,4 GHz", "5g": "5 GHz", "6g": "6 GHz"}


def parse_scan(scan: Any, verbunden_ssid: str | None = None) -> list[dict[str, Any]]:
    """WLANs aus `repeater.scan`, je Name EIN Eintrag (stärkster Zugangspunkt).

    Ein Campingplatz hat oft Dutzende Zugangspunkte mit demselben Namen; für
    die Auswahl zählt der Name, verbunden wird mit dem stärksten. Versteckte
    Netze (ohne Namen) fallen weg -- verbinden ließe sich ohnehin nur mit Namen.
    """
    netze: dict[str, dict[str, Any]] = {}
    for ap in _dict(scan).get("res") or []:
        if not isinstance(ap, dict) or not ap.get("ssid"):
            continue
        ssid = str(ap["ssid"])
        signal = _to_float(ap.get("signal"))
        verschl = _dict(ap.get("encryption"))
        band = BAND_NAME.get(str(ap.get("band") or ""), ap.get("band"))
        alt = netze.get(ssid)
        if alt is None:
            alt = netze[ssid] = {"ssid": ssid, "signal": None, "baender": [], "zugangspunkte": 0,
                                 "verschluesselt": False, "verschluesselung": None,
                                 "gespeichert": False, "verbunden": ssid == verbunden_ssid}
        alt["zugangspunkte"] += 1
        if band and band not in alt["baender"]:
            alt["baender"].append(band)
        if _to_bool(ap.get("saved")):
            alt["gespeichert"] = True
        if _to_bool(verschl.get("enabled")):
            alt["verschluesselt"] = True
            alt["verschluesselung"] = verschl.get("description") or alt["verschluesselung"]
        if signal is not None and (alt["signal"] is None or signal > alt["signal"]):
            alt["signal"] = signal
            alt["bssid"] = ap.get("bssid")
    liste = sorted(netze.values(), key=lambda n: (not n["verbunden"], -(n["signal"] if n["signal"] is not None else -999)))
    for n in liste:
        n["balken"] = wlan_balken(n["signal"])
        n["baender"].sort()
    return liste


def gespeicherter_schluessel(gespeichert: Any, ssid: str) -> str | None:
    """Das Passwort eines gespeicherten WLANs -- bleibt in der Integration."""
    for ap in _dict(gespeichert).get("res") or []:
        if isinstance(ap, dict) and ap.get("ssid") == ssid:
            return ap.get("key") or None
    return None


@dataclass
class CellularState:
    """Parsed view of the modem."""

    bus: str | None = None
    modem_model: str | None = None
    active_sim: int | None = None
    carrier: str | None = None
    network_type: str | None = None
    rsrp: float | None = None
    rsrq: float | None = None
    sinr: float | None = None
    rssi: float | None = None
    connected: bool | None = None
    traffic_total: int | None = None
    bands: str | None = None
    # Ländercode (MCC) des Netzes, in dem das Modem gerade eingebucht ist --
    # er sagt, in welchem Land man ist, unabhängig von der SIM.
    mcc: str | None = None
    # MCC aus der IMSI der SIM: das Heimatland der Karte
    sim_mcc: str | None = None
    roaming: bool | None = None
    slot_config: Any = None
    # wlan | mobil | kabel | tethering (None = unbekannt / offline)
    quelle: str | None = None
    wlan: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def signal_bars(self) -> int | None:
        return signal_bars(self.rsrp)


def parse_state(
    modem_info: Any, modem_status: Any, cells_info: Any, slot_config: Any
) -> CellularState:
    """Build a ``CellularState`` from raw RPC answers."""
    info = _first_modem(modem_info)
    status = _first_modem(modem_status)
    simcard = _dict(status.get("simcard"))
    signal = _dict(simcard.get("signal")) or _dict(status.get("signal"))
    network = _dict(status.get("network"))

    active = _to_int(status.get("current_sim"))
    if active is None and isinstance(slot_config, dict):
        key = find_slot_key(slot_config)
        active = _to_int(slot_config.get(key)) if key else None

    net_status = network.get("status")
    traffic = _to_int(network.get("traffic_total"))
    mcc = find_mcc(status) or find_mcc(cells_info)
    imsi = str(simcard.get("imsi") or status.get("imsi") or "")
    sim_mcc = imsi[:3] if len(imsi) >= 5 and imsi[:3].isdigit() else None
    roaming = _to_bool(_first_key(status, ROAMING_KEYS))
    if roaming is None and mcc and sim_mcc:
        roaming = mcc != sim_mcc

    return CellularState(
        bus=status.get("bus") or info.get("bus"),
        modem_model=info.get("model") or info.get("name"),
        active_sim=active,
        carrier=simcard.get("carrier") or status.get("carrier") or None,
        network_type=signal.get("network_type") or network.get("network_type") or None,
        rsrp=_to_float(signal.get("rsrp")),
        rsrq=_to_float(signal.get("rsrq")),
        sinr=_to_float(signal.get("sinr")),
        rssi=_to_float(signal.get("rssi")),
        connected=None if net_status is None else _to_int(net_status) == 0,
        traffic_total=traffic,
        bands=format_bands(cells_info),
        mcc=mcc,
        sim_mcc=sim_mcc,
        roaming=roaming,
        slot_config=slot_config,
        raw={
            "modem_info": modem_info,
            "modem_status": modem_status,
            "cells_info": cells_info,
            "slot_config": slot_config,
        },
    )
