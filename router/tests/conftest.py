"""Shared fixtures: a fake GL.iNet router speaking the 4.x JSON-RPC dialect."""

from __future__ import annotations

import copy
import hashlib
from typing import Any
from unittest.mock import patch

import pytest

from custom_components.glinet_cellular.crypt import crypt_password

BUS = "0001:01:00.0"
PASSWORD = "secret"


class FakeRouter:
    """Answers ``challenge``, ``login`` and ``call`` like firmware 4.x does."""

    def __init__(self) -> None:
        self.password = PASSWORD
        self.sid = "sid-1"
        self.current_sim = 1
        self.slot_config: Any = {"bus": BUS, "slot": 1, "auto_switch": False}
        self.calls: list[tuple[str, str, Any]] = []
        self.switch_takes_effect = True

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
                        "network": {"status": 0, "traffic_total": "1073741824"},
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
            self.slot_config = copy.deepcopy(args)
            if self.switch_takes_effect:
                self.current_sim = int(args["slot"])
            return {}
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
    from custom_components.glinet_cellular.api import GLiNetRpcError

    async def _request(self, method: str, params: Any) -> Any:
        try:
            return router.handle(method, params)
        except RpcError as err:
            raise GLiNetRpcError(err.code, err.message) from err

    with patch("custom_components.glinet_cellular.api.GLiNetClient._request", _request):
        yield router
