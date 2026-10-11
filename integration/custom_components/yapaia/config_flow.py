"""Einrichten: per Supervisor-Erkennung (ein Tipp) oder von Hand (Abschnitt 4)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.service_info.hassio import HassioServiceInfo

from .client import YapaiaClient, YapaiaFehler
from .const import CONF_INSTANZ, CONF_MODUL, CONF_TOKEN, CONF_URL, DOMAIN, PROTOKOLL


class YapaiaConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._daten: dict[str, Any] = {}
        self._name = ""

    async def async_step_hassio(self, discovery_info: HassioServiceInfo) -> ConfigFlowResult:
        c = discovery_info.config
        try:
            modul, instanz = str(c[CONF_MODUL]), str(c[CONF_INSTANZ])
            daten = {
                CONF_URL: f"http://{c['host']}:{int(c['port'])}",
                CONF_TOKEN: str(c[CONF_TOKEN]),
                CONF_MODUL: modul,
                CONF_INSTANZ: instanz,
            }
        except (KeyError, ValueError, TypeError):
            return self.async_abort(reason="ungueltig")
        if int(c.get("protokoll", 1)) > PROTOKOLL:
            return self.async_abort(reason="zu_neu")
        await self.async_set_unique_id(f"{modul}_{instanz}")
        # Schon eingerichtet: Adresse/Token übernehmen (z. B. nach Neuinstallation)
        self._abort_if_unique_id_configured(updates=daten)
        self._daten = daten
        self._name = str(c.get("name") or f"Yapaia {modul}")
        self.context["title_placeholders"] = {"name": self._name}
        return await self.async_step_hassio_confirm()

    async def async_step_hassio_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title=self._name, data=self._daten)
        return self.async_show_form(step_id="hassio_confirm", description_placeholders={"name": self._name})

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        fehler: dict[str, str] = {}
        if user_input is not None:
            url = user_input[CONF_URL].strip().rstrip("/")
            client = YapaiaClient(async_get_clientsession(self.hass), url, user_input[CONF_TOKEN].strip())
            try:
                b = await client.beschreibung()
            except YapaiaFehler as err:
                fehler["base"] = "token" if "Token" in str(err) else "nicht_erreichbar"
            else:
                if int(b.get("protokoll", 0)) > PROTOKOLL:
                    return self.async_abort(reason="zu_neu")
                await self.async_set_unique_id(f"{b['modul']}_{b['instanz']}")
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=str(b.get("name") or f"Yapaia {b['modul']}"),
                    data={
                        CONF_URL: url, CONF_TOKEN: user_input[CONF_TOKEN].strip(),
                        CONF_MODUL: b["modul"], CONF_INSTANZ: b["instanz"],
                    },
                )
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_URL, default="http://"): str, vol.Required(CONF_TOKEN): str}),
            errors=fehler,
        )
