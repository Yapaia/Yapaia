"""Polling coordinator for the GL.iNet Cellular integration."""

from __future__ import annotations

import json
import logging
import time
from datetime import timedelta
from typing import Any

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_SCAN_INTERVAL
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import CellularState, GLiNetAuthError, GLiNetClient, GLiNetError, parse_state
from .const import (
    CONF_SIM_SWITCH_METHOD,
    CONF_SIM_SWITCH_PARAMS,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_SIM_SWITCH_METHOD,
    DOMAIN,
    SIM_SWITCH_GRACE_SECONDS,
)

_LOGGER = logging.getLogger(__name__)

type GLiNetConfigEntry = ConfigEntry[GLiNetCoordinator]


class GLiNetCoordinator(DataUpdateCoordinator[CellularState]):
    """Fetch modem state from the router."""

    config_entry: GLiNetConfigEntry

    def __init__(
        self, hass: HomeAssistant, entry: GLiNetConfigEntry, client: GLiNetClient
    ) -> None:
        interval = entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=timedelta(seconds=interval),
        )
        self.client = client
        self.system_info: dict[str, Any] = {}
        self._modem_info: Any = None
        self.pending_sim: int | None = None
        self._pending_until = 0.0

    async def _async_setup(self) -> None:
        try:
            self.system_info = await self.client.get_system_info()
        except GLiNetAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except GLiNetError as err:
            raise UpdateFailed(str(err)) from err

    async def _async_update_data(self) -> CellularState:
        client = self.client
        try:
            if not self._modem_info:
                self._modem_info = await client.call_optional("modem", "get_info")
            status = await client.call("modem", "get_status")
            bus = parse_state(self._modem_info, status, None, None).bus
            cells = (
                await client.call_optional("modem", "get_cells_info", {"bus": bus})
                if bus
                else None
            )
            slot_config = await client.get_slot_config(bus)
        except GLiNetAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except GLiNetError as err:
            raise UpdateFailed(str(err)) from err

        state = parse_state(self._modem_info, status, cells, slot_config)
        self._check_pending_switch(state)
        return state

    # ---- SIM switching ------------------------------------------------------

    def _check_pending_switch(self, state: CellularState) -> None:
        if self.pending_sim is None:
            return
        if state.active_sim == self.pending_sim:
            _LOGGER.info("Router now reports SIM %s as active", state.active_sim)
            self.pending_sim = None
            return
        if time.monotonic() < self._pending_until:
            return
        _LOGGER.warning(
            "SIM %s was requested but the router still reports SIM %s. "
            "Slot config from router: %s",
            self.pending_sim,
            state.active_sim,
            state.slot_config,
        )
        persistent_notification.async_create(
            self.hass,
            (
                f"SIM {self.pending_sim} wurde angefordert, der Router meldet nach "
                f"{SIM_SWITCH_GRACE_SECONDS} s aber weiterhin SIM {state.active_sim}.\n\n"
                "Antwort von `modem.get_slot_config`:\n"
                f"```\n{json.dumps(state.slot_config, indent=2, default=str)}\n```\n"
                "Bitte die Diagnose der Integration herunterladen und den "
                "Umschalt-Aufruf in den Integrationsoptionen anpassen (siehe README)."
            ),
            title="GL.iNet: SIM-Umschaltung nicht bestätigt",
            notification_id=f"{DOMAIN}_sim_switch",
        )
        self.pending_sim = None

    async def async_switch_sim(self, target: int) -> None:
        """Send the switch command and follow up with quicker refreshes."""
        options = self.config_entry.options
        template: Any = options.get(CONF_SIM_SWITCH_PARAMS) or None
        if isinstance(template, str):
            try:
                template = json.loads(template)
            except ValueError as err:
                raise HomeAssistantError(
                    f"SIM switch params in options are not valid JSON: {err}"
                ) from err
        bus = self.data.bus if self.data else None
        try:
            await self.client.switch_sim(
                target,
                bus,
                method=options.get(CONF_SIM_SWITCH_METHOD, DEFAULT_SIM_SWITCH_METHOD),
                params_template=template,
            )
        except GLiNetError as err:
            raise HomeAssistantError(f"SIM switch failed: {err}") from err

        persistent_notification.async_dismiss(self.hass, f"{DOMAIN}_sim_switch")
        self.pending_sim = target
        self._pending_until = time.monotonic() + SIM_SWITCH_GRACE_SECONDS
        self.async_update_listeners()
        for delay in (5, 15, 30, 60, SIM_SWITCH_GRACE_SECONDS + 5):
            self.config_entry.async_on_unload(
                async_call_later(self.hass, delay, self._async_follow_up)
            )

    async def _async_follow_up(self, _now: Any) -> None:
        await self.async_request_refresh()
