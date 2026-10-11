"""Tests for the RPC client and parsing helpers (no Home Assistant needed)."""

from __future__ import annotations

import aiohttp
import pytest
from aiohttp import web

from custom_components.glinet_cellular.api import (
    GLiNetAuthError,
    GLiNetClient,
    build_switch_params,
    build_url,
    format_bands,
    parse_state,
    render_template,
    signal_bars,
)
from custom_components.glinet_cellular.crypt import crypt_password

from .conftest import BUS, FakeRouter, RpcError


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
            called, params, _ = await client.switch_sim(2, BUS)
            assert called == "modem.set_slot_config"
            assert params == {"bus": BUS, "slot": 2, "auto_switch": False}
            assert router.current_sim == 2

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
