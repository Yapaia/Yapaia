"""JSON-RPC client and response parsing for GL.iNet firmware 4.x routers.

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
    """Replace ``"{sim}"`` (as number) and ``"{bus}"`` placeholders."""
    if isinstance(template, dict):
        return {k: render_template(v, target, bus) for k, v in template.items()}
    if isinstance(template, list):
        return [render_template(v, target, bus) for v in template]
    if template == "{sim}":
        return target
    if isinstance(template, str):
        return template.replace("{sim}", str(target)).replace("{bus}", bus or "")
    return template


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
    slot_config: Any = None
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
        slot_config=slot_config,
        raw={
            "modem_info": modem_info,
            "modem_status": modem_status,
            "cells_info": cells_info,
            "slot_config": slot_config,
        },
    )
