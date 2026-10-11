"""Home Assistant level tests with a fake router."""

from __future__ import annotations

from datetime import timedelta

import pytest
from homeassistant import config_entries
from homeassistant.components.persistent_notification import (
    _async_get_or_create_notifications,
)
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from custom_components.glinet_cellular.const import (
    CONF_SIM_SWITCH_METHOD,
    CONF_SIM_SWITCH_PARAMS,
    DOMAIN,
    SIM_SWITCH_GRACE_SECONDS,
)
from custom_components.glinet_cellular.diagnostics import (
    async_get_config_entry_diagnostics,
)

from .conftest import BUS, FakeRouter

DATA = {CONF_HOST: "192.168.8.1", CONF_USERNAME: "root", CONF_PASSWORD: "secret"}


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


async def _setup(hass: HomeAssistant, options: dict | None = None) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        data=DATA,
        options=options or {},
        unique_id="94:83:c4:aa:bb:cc",
        title="x3000",
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_config_flow(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM

    bad = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**DATA, CONF_PASSWORD: "wrong"}
    )
    assert bad["errors"] == {"base": "invalid_auth"}

    ok = await hass.config_entries.flow.async_configure(result["flow_id"], DATA)
    assert ok["type"] is FlowResultType.CREATE_ENTRY
    assert ok["title"] == "x3000"
    assert ok["result"].unique_id == "94:83:c4:aa:bb:cc"


async def test_entities(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    await _setup(hass)
    assert hass.states.get("select.x3000_sim_card").state == "sim1"
    assert hass.states.get("sensor.x3000_active_sim").state == "1"
    assert hass.states.get("sensor.x3000_carrier").state == "Telekom.de"
    assert hass.states.get("sensor.x3000_rsrp").state == "-95.0"
    assert hass.states.get("sensor.x3000_bands").state == "B3 + n78"
    assert hass.states.get("sensor.x3000_signal_bars").state == "3"
    assert float(
        hass.states.get("sensor.x3000_cellular_data_used").state
    ) == pytest.approx(1.07, 0.01)
    assert hass.states.get("binary_sensor.x3000_cellular_connection").state == "on"


async def test_switch_sim(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    await _setup(hass)
    await hass.services.async_call(
        "select",
        "select_option",
        {"entity_id": "select.x3000_sim_card", "option": "sim2"},
        blocking=True,
    )
    assert (
        "modem",
        "set_slot_config",
        {"bus": BUS, "slot": 2, "auto_switch": False},
    ) in patch_router.calls
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=6))
    await hass.async_block_till_done()
    assert hass.states.get("sensor.x3000_carrier").state == "Vodafone.de"
    state = hass.states.get("select.x3000_sim_card")
    assert state.state == "sim2"
    assert state.attributes["switch_pending"] is False


async def test_switch_not_confirmed_notifies(
    hass: HomeAssistant, patch_router: FakeRouter, freezer
) -> None:
    patch_router.switch_takes_effect = False
    await _setup(hass)
    await hass.services.async_call(
        "select",
        "select_option",
        {"entity_id": "select.x3000_sim_card", "option": "sim2"},
        blocking=True,
    )
    assert hass.states.get("select.x3000_sim_card").state == "sim2"  # optimistic
    freezer.tick(timedelta(seconds=SIM_SWITCH_GRACE_SECONDS + 10))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get("select.x3000_sim_card").state == "sim1"
    assert f"{DOMAIN}_sim_switch" in _async_get_or_create_notifications(hass)


async def test_switch_with_template(
    hass: HomeAssistant, patch_router: FakeRouter
) -> None:
    await _setup(
        hass,
        {
            CONF_SIM_SWITCH_METHOD: "modem.set_slot_config",
            CONF_SIM_SWITCH_PARAMS: '{"bus": "{bus}", "slot": "{sim}"}',
        },
    )
    await hass.services.async_call(
        "select",
        "select_option",
        {"entity_id": "select.x3000_sim_card", "option": "sim2"},
        blocking=True,
    )
    assert ("modem", "set_slot_config", {"bus": BUS, "slot": 2}) in patch_router.calls
    assert ("modem", "get_slot_config", {"bus": BUS}) not in patch_router.calls[-1:]


async def test_rpc_call_service(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    await _setup(hass)
    response = await hass.services.async_call(
        DOMAIN,
        "rpc_call",
        {"service": "modem", "method": "get_slot_config", "params": {"bus": BUS}},
        blocking=True,
        return_response=True,
    )
    assert response == {"result": {"bus": BUS, "slot": 1, "auto_switch": False}}


async def test_buttons(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    await _setup(hass)
    await hass.services.async_call(
        "button",
        "press",
        {"entity_id": "button.x3000_reconnect_cellular"},
        blocking=True,
    )
    assert ("modem", "disconnect", {"bus": BUS}) in patch_router.calls
    assert ("modem", "set_connect", {"bus": BUS}) in patch_router.calls


async def test_options_flow(hass: HomeAssistant, patch_router: FakeRouter) -> None:
    entry = await _setup(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    bad = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {"scan_interval": 30, CONF_SIM_SWITCH_METHOD: "x", CONF_SIM_SWITCH_PARAMS: "{"},
    )
    assert bad["errors"] == {
        CONF_SIM_SWITCH_METHOD: "invalid_method",
        CONF_SIM_SWITCH_PARAMS: "invalid_json",
    }
    ok = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "scan_interval": 60,
            CONF_SIM_SWITCH_METHOD: "modem.set_slot_config",
            CONF_SIM_SWITCH_PARAMS: "",
        },
    )
    assert ok["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert entry.options["scan_interval"] == 60


async def test_reauth_on_bad_password(
    hass: HomeAssistant, patch_router: FakeRouter
) -> None:
    patch_router.password = "changed"
    entry = MockConfigEntry(domain=DOMAIN, data=DATA, unique_id="94:83:c4:aa:bb:cc")
    entry.add_to_hass(hass)
    assert not await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    flows = hass.config_entries.flow.async_progress()
    assert any(f["context"]["source"] == "reauth" for f in flows)


async def test_diagnostics_redacts(
    hass: HomeAssistant, patch_router: FakeRouter
) -> None:
    entry = await _setup(hass)
    diag = await async_get_config_entry_diagnostics(hass, entry)
    assert diag["entry"]["data"][CONF_PASSWORD] == "**REDACTED**"
    assert diag["raw"]["modem_info"]["modems"][0]["imei"] == "**REDACTED**"
    assert diag["raw"]["slot_config"]["slot"] == 1
