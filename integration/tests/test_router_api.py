"""Tests for the RPC client and parsing helpers (no Home Assistant needed)."""

from __future__ import annotations

import aiohttp
import pytest
from aiohttp import web

from custom_components.yapaia.router.api import (
    GLiNetAuthError,
    SWITCH_UI,
    GLiNetClient,
    aktive_quelle,
    parse_wlan,
    wlan_balken,
    GLiNetRpcError,
    build_switch_params,
    build_url,
    format_bands,
    parse_state,
    render_template,
    signal_bars,
)
from custom_components.yapaia.router.crypt import crypt_password

from .glinet import BUS, FakeRouter, RpcError


@pytest.mark.parametrize(
    ("alg", "scheme"), [(1, "md5_crypt"), (5, "sha256_crypt"), (6, "sha512_crypt")]
)
@pytest.mark.parametrize("password", ["", "goodlife", "a" * 70, "Pässwört!"])
@pytest.mark.parametrize("salt", ["abcdefgh", "Xy7", "0123456789abcdef"])
def test_crypt_matches_passlib(alg: int, scheme: str, password: str, salt: str) -> None:
    passlib_hash = pytest.importorskip("passlib.hash")
    handler = getattr(passlib_hash, scheme)
    if alg == 1:
        salt = salt[:8]
        expected = handler.using(salt=salt).hash(password)
    else:
        expected = handler.using(salt=salt[:16], rounds=5000).hash(password)
        # passlib writes "rounds=5000$" only when asked; crypt(3) omits default rounds
        expected = expected.replace("rounds=5000$", "")
    assert crypt_password(password, alg, salt) == expected


def test_build_url() -> None:
    assert build_url("192.168.8.1") == "http://192.168.8.1/rpc"
    assert build_url("https://router.local/") == "https://router.local/rpc"
    assert build_url("http://10.0.0.1/rpc") == "http://10.0.0.1/rpc"


def test_switch_params_replace_slot_and_keep_type() -> None:
    cfg = {"bus": BUS, "slot": "1", "auto_switch": {"enable": True}}
    params = build_switch_params(cfg, BUS, 2)
    assert params == {"bus": BUS, "slot": "2", "auto_switch": {"enable": True}}
    assert cfg["slot"] == "1"  # original untouched


def test_switch_params_other_key_and_unknown_shape() -> None:
    assert build_switch_params({"current_sim": 1}, BUS, 2) == {
        "current_sim": 2,
        "bus": BUS,
    }
    assert build_switch_params(None, BUS, 2) == {"slot": 2, "bus": BUS}
    assert build_switch_params([], None, 1) == {"slot": 1}


def test_render_template() -> None:
    template = {"bus": "{bus}", "sim": "{sim}", "label": "SIM{sim}", "n": [1, "{sim}"]}
    assert render_template(template, 2, BUS) == {
        "bus": BUS,
        "sim": 2,
        "label": "SIM2",
        "n": [1, 2],
    }
    # die Oberfläche des X3000 schickt die SIM als Text
    assert render_template(SWITCH_UI, 2, BUS) == {"bus": BUS, "enable_switch": False, "current_sim": "2"}


def test_signal_bars() -> None:
    assert signal_bars(None) is None
    assert signal_bars(-75) == 5
    assert signal_bars(-95) == 3
    assert signal_bars(-125) == 0


def test_format_bands() -> None:
    cells = {
        "cells": [
            {"mode": "LTE FDD", "band": 3},
            {"mode": "NR5G-NSA", "band": "n78"},
            {"mode": "LTE", "band": 3},
            {"mode": "LTE"},
        ]
    }
    assert format_bands(cells) == "B3 + n78"
    assert format_bands(None) is None


def test_parse_state() -> None:
    router = FakeRouter()
    state = parse_state(
        router.dispatch("modem", "get_info", {}),
        router.dispatch("modem", "get_status", {}),
        router.dispatch("modem", "get_cells_info", {}),
        router.slot_config,
    )
    assert state.bus == BUS
    assert state.active_sim == 1
    assert state.carrier == "Telekom.de"
    assert state.rsrp == -95
    assert state.connected is True
    assert state.traffic_total == 1073741824
    assert state.bands == "B3 + n78"
    assert state.modem_model == "RM520N-GL"


def test_parse_state_falls_back_to_slot_config() -> None:
    state = parse_state(None, {"modems": [{"bus": BUS}]}, None, {"slot": "2"})
    assert state.active_sim == 2
    assert state.connected is None


def test_parse_state_empty() -> None:
    state = parse_state(None, {}, None, None)
    assert state.active_sim is None
    assert state.signal_bars is None


async def _serve(router: FakeRouter):
    async def rpc(request: web.Request) -> web.Response:
        body = await request.json()
        try:
            result = router.handle(body["method"], body["params"])
        except RpcError as err:
            return web.json_response(
                {
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "error": {"code": err.code, "message": err.message},
                }
            )
        return web.json_response({"jsonrpc": "2.0", "id": body["id"], "result": result})

    app = web.Application()
    app.router.add_post("/rpc", rpc)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = runner.addresses[0][1]
    return runner, f"http://127.0.0.1:{port}"


async def test_client_over_http_login_and_relogin(socket_enabled) -> None:
    router = FakeRouter()
    runner, url = await _serve(router)
    try:
        async with aiohttp.ClientSession() as session:
            client = GLiNetClient(session, url, "root", "secret")
            info = await client.get_system_info()
            assert info["model"] == "x3000"
            # Router restarted -> old sid invalid -> client logs in again
            router.sid = "sid-2"
            status = await client.call("modem", "get_status")
            assert status["modems"][0]["bus"] == BUS
            assert await client.call_optional("modem", "nope") is None

            bad = GLiNetClient(session, url, "root", "wrong")
            with pytest.raises(GLiNetAuthError):
                await bad.login()
    finally:
        await runner.cleanup()


async def test_switch_sim_auto_and_template(socket_enabled) -> None:
    router = FakeRouter()
    runner, url = await _serve(router)
    try:
        async with aiohttp.ClientSession() as session:
            client = GLiNetClient(session, url, "root", "secret")
            # wie die Router-Oberfläche: SIM als Text, Automatik aus
            called, params, _ = await client.switch_sim(2, BUS, params_template=SWITCH_UI)
            assert called == "modem.set_slot_config"
            assert params == {"bus": BUS, "enable_switch": False, "current_sim": "2"}
            assert router.current_sim == 2
            # die ganze Slot-Konfiguration zurück lehnt der X3000 ab
            with pytest.raises(GLiNetRpcError):
                await client.switch_sim(1, BUS)

            await client.switch_sim(
                1, BUS, params_template={"bus": "{bus}", "slot": "{sim}"}
            )
            assert router.calls[-1] == (
                "modem",
                "set_slot_config",
                {"bus": BUS, "slot": 1},
            )
    finally:
        await runner.cleanup()


# ---- Land und Roaming (Yapaia Router) ----------------------------------------
def test_mcc_aus_verschiedenen_formen() -> None:
    from custom_components.yapaia.router.api import find_mcc

    assert find_mcc({"modems": [{"network": {"mcc": "262"}}]}) == "262"
    assert find_mcc({"modems": [{"network": {"mcc": 232}}]}) == "232"
    assert find_mcc({"cells": [{"plmn": "26201"}]}) == "262"
    assert find_mcc({"x": {"operator_numeric": "232-03"}}) == "232"
    assert find_mcc({"mcc": "0"}) is None
    assert find_mcc({"plmn": "12"}) is None
    assert find_mcc(None) is None


def test_roaming_aus_imsi_oder_feld() -> None:
    status = {"modems": [{"bus": BUS, "simcard": {"imsi": "262011234567890"}, "network": {"mcc": "232"}}]}
    z = parse_state(None, status, None, None)
    assert (z.mcc, z.sim_mcc, z.roaming) == ("232", "262", True)
    status["modems"][0]["network"]["mcc"] = "262"
    assert parse_state(None, status, None, None).roaming is False
    status["modems"][0]["roaming"] = "1"
    assert parse_state(None, status, None, None).roaming is True


def test_laender() -> None:
    from custom_components.yapaia.router.laender import codes, land

    assert land("232") == ("AT", "Österreich")
    assert land("999") == (None, None)
    assert codes("de, at;CH  it") == {"DE", "AT", "CH", "IT"}


# ---- Internetquelle und WLAN (für die Anzeige im Dashboard) -----------------
def test_aktive_quelle_nach_rangfolge() -> None:
    konfig = {"interfaces": [{"interface": "wan", "metric": 10}, {"interface": "wwan", "metric": 20},
                             {"interface": "modem_0001", "metric": 40}]}
    def status(**online):
        return {"interfaces": [{"interface": n, "status_v4": 0 if an else 1} for n, an in online.items()]}
    assert aktive_quelle(status(wan=False, wwan=True, modem_0001=True), konfig) == "wlan"
    assert aktive_quelle(status(wan=False, wwan=False, modem_0001=True), konfig) == "mobil"
    assert aktive_quelle(status(wan=True, wwan=True, modem_0001=True), konfig) == "kabel"
    assert aktive_quelle(status(wan=False, wwan=False, modem_0001=False), konfig) is None
    assert aktive_quelle(None, None) is None


def test_wlan_werte() -> None:
    w = parse_wlan({"state_s": "connected", "ssid": "NoDramaLama", "signal": -55, "channel": 6,
                    "ipv4": {"ip": "192.168.178.46/24", "gateway": "192.168.178.1"}, "connected": "1h"})
    assert w["ssid"] == "NoDramaLama" and w["balken"] == 4 and w["ip"] == "192.168.178.46"
    assert parse_wlan({"state_s": "disconnected", "ssid": "x"}) == {}
    assert [wlan_balken(d) for d in (-50, -60, -70, -80, -90, None)] == [4, 3, 2, 1, 0, None]
