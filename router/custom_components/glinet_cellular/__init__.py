"""GL.iNet Cellular: SIM switching and modem status for GL.iNet 4.x routers."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_USERNAME, Platform
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import ConfigType

from .api import GLiNetClient, GLiNetError
from .const import DOMAIN, SERVICE_RPC_CALL
from .coordinator import GLiNetConfigEntry, GLiNetCoordinator

PLATFORMS = [Platform.BINARY_SENSOR, Platform.BUTTON, Platform.SELECT, Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

RPC_CALL_SCHEMA = vol.Schema(
    {
        vol.Optional("config_entry_id"): cv.string,
        vol.Required("service"): cv.string,
        vol.Required("method"): cv.string,
        vol.Optional("params", default={}): vol.Any(dict, list),
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the raw RPC service used for testing new router calls."""

    async def _rpc_call(call: ServiceCall) -> ServiceResponse:
        entries = [
            entry
            for entry in hass.config_entries.async_loaded_entries(DOMAIN)
            if call.data.get("config_entry_id") in (None, entry.entry_id)
        ]
        if not entries:
            raise HomeAssistantError("No loaded GL.iNet Cellular router found")
        coordinator: GLiNetCoordinator = entries[0].runtime_data
        try:
            result: Any = await coordinator.client.call(
                call.data["service"], call.data["method"], call.data["params"]
            )
        except GLiNetError as err:
            raise HomeAssistantError(str(err)) from err
        await coordinator.async_request_refresh()
        return {"result": result}

    hass.services.async_register(
        DOMAIN,
        SERVICE_RPC_CALL,
        _rpc_call,
        schema=RPC_CALL_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: GLiNetConfigEntry) -> bool:
    """Set up a router from a config entry."""
    client = GLiNetClient(
        async_get_clientsession(hass),
        entry.data[CONF_HOST],
        entry.data[CONF_USERNAME],
        entry.data[CONF_PASSWORD],
    )
    coordinator = GLiNetCoordinator(hass, entry, client)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: GLiNetConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: GLiNetConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
