"""Config and options flow for the GL.iNet Cellular integration."""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import (
    CONF_HOST,
    CONF_PASSWORD,
    CONF_SCAN_INTERVAL,
    CONF_USERNAME,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.device_registry import format_mac
from homeassistant.helpers.selector import (
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .api import GLiNetAuthError, GLiNetClient, GLiNetError
from .const import (
    CONF_SIM_SWITCH_METHOD,
    CONF_SIM_SWITCH_PARAMS,
    DEFAULT_HOST,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_SIM_SWITCH_METHOD,
    DEFAULT_USERNAME,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

PASSWORD_SELECTOR = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))


async def _validate(hass: HomeAssistant, data: Mapping[str, Any]) -> dict[str, Any]:
    client = GLiNetClient(
        async_get_clientsession(hass),
        data[CONF_HOST],
        data[CONF_USERNAME],
        data[CONF_PASSWORD],
    )
    return await client.get_system_info()


class GLiNetConfigFlow(ConfigFlow, domain=DOMAIN):
    """Ask for router address and admin password."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                info = await _validate(self.hass, user_input)
            except GLiNetAuthError:
                errors["base"] = "invalid_auth"
            except GLiNetError:
                errors["base"] = "cannot_connect"
            except Exception:
                _LOGGER.exception("Unexpected error while connecting to the router")
                errors["base"] = "unknown"
            else:
                if mac := info.get("mac"):
                    await self.async_set_unique_id(format_mac(mac))
                    self._abort_if_unique_id_configured(
                        updates={CONF_HOST: user_input[CONF_HOST]}
                    )
                else:
                    self._async_abort_entries_match({CONF_HOST: user_input[CONF_HOST]})
                title = info.get("model") or "GL.iNet Router"
                return self.async_create_entry(title=title, data=user_input)

        schema = vol.Schema(
            {
                vol.Required(CONF_HOST, default=DEFAULT_HOST): str,
                vol.Required(CONF_USERNAME, default=DEFAULT_USERNAME): str,
                vol.Required(CONF_PASSWORD): PASSWORD_SELECTOR,
            }
        )
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(schema, user_input),
            errors=errors,
        )

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        entry = self._get_reauth_entry()
        if user_input is not None:
            data = {**entry.data, CONF_PASSWORD: user_input[CONF_PASSWORD]}
            try:
                await _validate(self.hass, data)
            except GLiNetAuthError:
                errors["base"] = "invalid_auth"
            except GLiNetError:
                errors["base"] = "cannot_connect"
            else:
                return self.async_update_reload_and_abort(entry, data=data)
        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({vol.Required(CONF_PASSWORD): PASSWORD_SELECTOR}),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry) -> GLiNetOptionsFlow:
        return GLiNetOptionsFlow()


class GLiNetOptionsFlow(OptionsFlow):
    """Polling interval and an override for the SIM switch call."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            method = user_input.get(CONF_SIM_SWITCH_METHOD, "").strip()
            params = user_input.get(CONF_SIM_SWITCH_PARAMS, "").strip()
            if "." not in method:
                errors[CONF_SIM_SWITCH_METHOD] = "invalid_method"
            if params:
                try:
                    json.loads(params)
                except ValueError:
                    errors[CONF_SIM_SWITCH_PARAMS] = "invalid_json"
            if not errors:
                return self.async_create_entry(
                    data={
                        CONF_SCAN_INTERVAL: int(user_input[CONF_SCAN_INTERVAL]),
                        CONF_SIM_SWITCH_METHOD: method,
                        CONF_SIM_SWITCH_PARAMS: params,
                    }
                )

        options = self.config_entry.options
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_SCAN_INTERVAL,
                    default=options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
                ): NumberSelector(
                    NumberSelectorConfig(
                        min=10,
                        max=600,
                        step=5,
                        unit_of_measurement="s",
                        mode=NumberSelectorMode.BOX,
                    )
                ),
                vol.Required(
                    CONF_SIM_SWITCH_METHOD,
                    default=options.get(
                        CONF_SIM_SWITCH_METHOD, DEFAULT_SIM_SWITCH_METHOD
                    ),
                ): str,
                vol.Optional(
                    CONF_SIM_SWITCH_PARAMS,
                    description={
                        "suggested_value": options.get(CONF_SIM_SWITCH_PARAMS, "")
                    },
                ): TextSelector(TextSelectorConfig(multiline=True)),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
