"""Ein nachgebauter GL.iNet-Router (JSON-RPC wie Firmware 4.x) für die Router-Tests."""

from __future__ import annotations

import copy
import hashlib
from typing import Any
from unittest.mock import patch

import pytest

from custom_components.yapaia.router.crypt import crypt_password

BUS = "0001:01:00.0"
PASSWORD = "secret"


class FakeRouter:
    """Answers ``challenge``, ``login`` and ``call`` like firmware 4.x does."""

    def __init__(self) -> None:
        self.password = PASSWORD
        self.sid = "sid-1"
        self.current_sim = 1
        # so liefert es der GL-X3000 (Firmware 4.x)
        self.slot_config: Any = {
            "failover_interval": "300", "hour": "03", "main_sim": "", "min": "00",
            "enable_timing": False, "apn": "", "enable_switch": False,
            "sim1": {"carrier": "o2 - de+"}, "sim2": {"carrier": "DR"}, "current_sim": "1",
        }  # fmt: skip
        self.calls: list[tuple[str, str, Any]] = []
        self.switch_takes_effect = True
        # Welcher Aufruf die SIM wirklich umschaltet (Firmware-abhängig, s. api.SWITCH_CANDIDATES)
        self.switch_method = "modem.set_slot_config"
        # Ländercode des eingebuchten Netzes, je SIM einstellbar
        self.mcc = {1: "262", 2: "262"}
        # Internetquellen: online (0) / offline (1), wie kmwan.get_status
        self.online = {"wan": 1, "wwan": 0, "tethering": 1, "modem_0001": 0, "secondwan": 1}
        self.repeater: Any = {
            "bssid": "94:83:C4:2F:26:FD", "running": True, "ipv4": {"gateway": "192.168.178.1",
            "ip": "192.168.178.46/24"}, "connected": "22d,9h,47m,48s", "ssid": "NoDramaLama", "state": 2,
            "channel": 6, "state_s": "connected", "signal": -55,
        }  # fmt: skip

    def handle(self, method: str, params: Any) -> Any:
        if method == "challenge":
            return {
                "salt": "abcdefgh",
                "nonce": "n0nce",
                "alg": 1,
                "hash-method": "sha256",
            }
        if method == "login":
            cipher = crypt_password(self.password, 1, "abcdefgh")
            expected = hashlib.sha256(f"root:{cipher}:n0nce".encode()).hexdigest()
            if params["hash"] != expected:
                raise RpcError(-32000, "Access denied")
            return {"sid": self.sid}
        assert method == "call"
        sid, service, func, args = params
        if sid != self.sid:
            raise RpcError(-32000, "Access denied")
        self.calls.append((service, func, copy.deepcopy(args)))
        return self.dispatch(service, func, args)

    def dispatch(self, service: str, func: str, args: Any) -> Any:
        key = f"{service}.{func}"
        if key == "system.get_info":
            return {
                "model": "x3000",
                "firmware_version": "4.8.3",
                "mac": "94:83:C4:AA:BB:CC",
            }
        if key == "modem.get_info":
            return {"modems": [{"bus": BUS, "model": "RM520N-GL", "imei": "123"}]}
        if key == "modem.get_status":
            return {
                "new_sms_count": 0,
                "modems": [
                    {
                        "bus": BUS,
                        "current_sim": str(self.current_sim),
                        "simcard": {
                            "carrier": "Telekom.de"
                            if self.current_sim == 1
                            else "Vodafone.de",
                            "signal": {
                                "network_type": "LTE",
                                "rsrp": -95,
                                "rsrq": -11,
                                "sinr": 12,
                                "rssi": -66,
                            },
                        },
                        "network": {
                            "status": 0,
                            "traffic_total": "1073741824",
                            "mcc": self.mcc[self.current_sim],
                        },
                    }
                ],
            }
        if key == "modem.get_cells_info":
            return {
                "cells": [{"mode": "LTE", "band": 3}, {"mode": "NR5G-NSA", "band": 78}]
            }
        if key == "modem.get_slot_config":
            return copy.deepcopy(self.slot_config)
        if key == "modem.set_slot_config":
            # wie der X3000: unbekannte Felder (etwa sim1/sim2) = Fehler,
            # `slot` wird angenommen und bewirkt nichts
            erlaubt = {"bus", "enable_switch", "current_sim", "main_sim", "failover_interval",
                       "enable_timing", "hour", "min", "slot"}  # fmt: skip
            if set(args) - erlaubt:
                raise RpcError(-32602, "Invalid params")
            if (self.switch_takes_effect and key == self.switch_method
                    and "current_sim" in args and not args.get("enable_switch")):  # fmt: skip
                self.current_sim = int(args["current_sim"])
                self.slot_config["current_sim"] = str(args["current_sim"])
            return []
        if key == self.switch_method:
            if self.switch_takes_effect:
                self.current_sim = int(next(v for k, v in args.items() if k != "bus"))
            return {}
        if key == "kmwan.get_status":
            return {"interfaces": [{"interface": n, "status_v4": s} for n, s in self.online.items()]}
        if key == "kmwan.get_config":
            metrik = {"wan": 10, "wwan": 20, "tethering": 30, "modem_0001": 40, "secondwan": 15}
            return {"mode": 0, "interfaces": [{"interface": n, "metric": m} for n, m in metrik.items()]}
        if key == "repeater.get_status":
            return copy.deepcopy(self.repeater)
        if key in ("modem.disconnect", "modem.set_connect", "system.reboot"):
            return {}
        raise RpcError(-32601, "Method not found")


class RpcError(Exception):
    def __init__(self, code: int, message: str) -> None:
        self.code = code
        self.message = message


@pytest.fixture
def router() -> FakeRouter:
    return FakeRouter()


@pytest.fixture
def patch_router(router: FakeRouter):
    """Route GLiNetClient._request into the fake router."""
    from custom_components.yapaia.router.api import GLiNetRpcError

    async def _request(self, method: str, params: Any) -> Any:
        try:
            return router.handle(method, params)
        except RpcError as err:
            raise GLiNetRpcError(err.code, err.message) from err

    with patch("custom_components.yapaia.router.api.GLiNetClient._request", _request):
        yield router
