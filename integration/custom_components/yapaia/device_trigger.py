"""Geräte-Auslöser aus den beschriebenen Ereignissen (Abschnitt 5)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.device_automation import DEVICE_TRIGGER_BASE_SCHEMA
from homeassistant.components.homeassistant.triggers import event as event_trigger
from homeassistant.const import CONF_DEVICE_ID, CONF_DOMAIN, CONF_PLATFORM, CONF_TYPE
from homeassistant.core import CALLBACK_TYPE, HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.trigger import TriggerActionType, TriggerInfo
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, EREIGNIS

TRIGGER_SCHEMA = DEVICE_TRIGGER_BASE_SCHEMA.extend({vol.Required(CONF_TYPE): str})


def _modul(hass: HomeAssistant, device_id: str):
    geraet = dr.async_get(hass).async_get(device_id)
    if geraet is None:
        return None
    for entry_id in geraet.config_entries:
        e = hass.config_entries.async_get_entry(entry_id)
        if e and e.domain == DOMAIN and getattr(e, "runtime_data", None):
            return e.runtime_data
    return None


async def async_get_triggers(hass: HomeAssistant, device_id: str) -> list[dict[str, Any]]:
    m = _modul(hass, device_id)
    if m is None:
        return []
    return [
        {CONF_PLATFORM: "device", CONF_DOMAIN: DOMAIN, CONF_DEVICE_ID: device_id, CONF_TYPE: e["name"]}
        for e in m.ereignisse()
    ]


async def async_attach_trigger(
    hass: HomeAssistant, config: ConfigType, action: TriggerActionType, trigger_info: TriggerInfo
) -> CALLBACK_TYPE:
    event_config = event_trigger.TRIGGER_SCHEMA({
        event_trigger.CONF_PLATFORM: "event",
        event_trigger.CONF_EVENT_TYPE: EREIGNIS,
        event_trigger.CONF_EVENT_DATA: {"geraet_id": config[CONF_DEVICE_ID], "name": config[CONF_TYPE]},
    })
    return await event_trigger.async_attach_trigger(hass, event_config, action, trigger_info, platform_type="device")
