"""Diagnose: was ein Modul beschreibt und meldet -- beim Router mit den rohen Antworten.

Die rohen Router-Antworten sind der Weg, unbekannte Formate (Ländercode,
SIM-Umschaltung) zu klären. Kennungen der SIM und des Geräts sind geschwärzt.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_PASSWORD
from homeassistant.core import HomeAssistant

from .const import CONF_TOKEN

SCHWAERZEN = {
    CONF_PASSWORD, CONF_TOKEN, "imei", "imsi", "iccid", "phone", "phone_number", "msisdn",
    "sn", "sn_bak", "serial", "mac", "ddns", "cell_id", "pci", "tac", "lac", "enodeb", "instanz",
}


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    m = entry.runtime_data
    daten: dict[str, Any] = {
        "eintrag": {"data": dict(entry.data), "options": dict(entry.options)},
        "beschreibung": {k: v for k, v in m.beschreibung.items() if k != "instanz"},
        "werte": m.werte,
        "verbunden": m.verbunden,
    }
    if (z := getattr(m, "zustand", None)) is not None:
        daten["router"] = {
            "system_info": m.system_info,
            "mcc": z.mcc,
            "sim_mcc": z.sim_mcc,
            "roh": z.raw,
        }
    return async_redact_data(daten, SCHWAERZEN)
