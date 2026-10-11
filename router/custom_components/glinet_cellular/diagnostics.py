"""Diagnostics: raw router answers for working out unknown RPC formats."""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.const import CONF_PASSWORD
from homeassistant.core import HomeAssistant

from .coordinator import GLiNetConfigEntry

TO_REDACT = {
    CONF_PASSWORD,
    "imei",
    "imsi",
    "iccid",
    "phone",
    "phone_number",
    "msisdn",
    "sn",
    "sn_bak",
    "serial",
    "mac",
    "ddns",
    "cell_id",
    "id",
    "pci",
    "tac",
    "lac",
    "enodeb",
}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: GLiNetConfigEntry
) -> dict[str, Any]:
    coordinator = entry.runtime_data
    data = coordinator.data
    return async_redact_data(
        {
            "entry": {"data": dict(entry.data), "options": dict(entry.options)},
            "system_info": coordinator.system_info,
            "parsed": {
                "bus": data.bus,
                "active_sim": data.active_sim,
                "pending_sim": coordinator.pending_sim,
                "carrier": data.carrier,
                "network_type": data.network_type,
                "rsrp": data.rsrp,
                "connected": data.connected,
                "bands": data.bands,
            },
            "raw": data.raw,
        },
        TO_REDACT,
    )
