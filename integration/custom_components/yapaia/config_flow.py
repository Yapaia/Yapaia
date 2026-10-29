"""Einrichten: per Supervisor-Erkennung (ein Tipp), von Hand -- oder ein GL.iNet-Router."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    BooleanSelector,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)
from homeassistant.helpers.service_info.hassio import HassioServiceInfo

from .client import YapaiaClient, YapaiaFehler
from .const import CONF_INSTANZ, CONF_MODUL, CONF_TOKEN, CONF_URL, DOMAIN, PROTOKOLL


class YapaiaConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._daten: dict[str, Any] = {}
        self._name = ""

    async def async_step_import(self, import_data: dict[str, Any]) -> ConfigFlowResult:
        """Das Gerät „Yapaia Design“ legt die Integration selbst an (design/)."""
        if import_data.get(CONF_MODUL) != "design":
            return self.async_abort(reason="not_supported")
        await self.async_set_unique_id("design")
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title="Yapaia Design", data={CONF_MODUL: "design"})

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
        return self.async_show_menu(step_id="user", menu_options=["router", "adresse"])

    # ---- GL.iNet-Router ------------------------------------------------------
    async def async_step_router(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        from . import router
        from .router.api import GLiNetAuthError, GLiNetError

        fehler: dict[str, str] = {}
        if user_input is not None:
            daten = {k: str(user_input[k]).strip() for k in (CONF_HOST, CONF_USERNAME)}
            daten[CONF_PASSWORD] = user_input[CONF_PASSWORD]
            try:
                info = await router.pruefen(self.hass, daten[CONF_HOST], daten[CONF_USERNAME], daten[CONF_PASSWORD])
            except GLiNetAuthError:
                fehler["base"] = "router_anmeldung"
            except GLiNetError:
                fehler["base"] = "router_erreichbar"
            else:
                await self.async_set_unique_id(f"router_{info['instanz']}")
                self._abort_if_unique_id_configured(updates={CONF_HOST: daten[CONF_HOST]})
                return self.async_create_entry(
                    title="Yapaia Router",
                    data={**daten, CONF_MODUL: "router", CONF_INSTANZ: info["instanz"]},
                    options={router.OPT_SONST: "keine"},
                )
        schema = vol.Schema({
            vol.Required(CONF_HOST, default="192.168.8.1"): str,
            vol.Required(CONF_USERNAME, default="root"): str,
            vol.Required(CONF_PASSWORD): TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD)),
        })
        return self.async_show_form(
            step_id="router", data_schema=self.add_suggested_values_to_schema(schema, user_input), errors=fehler
        )

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        from . import router
        from .router.api import GLiNetAuthError, GLiNetError

        entry = self._get_reauth_entry()
        fehler: dict[str, str] = {}
        if user_input is not None:
            daten = {**entry.data, CONF_PASSWORD: user_input[CONF_PASSWORD]}
            try:
                await router.pruefen(self.hass, daten[CONF_HOST], daten[CONF_USERNAME], daten[CONF_PASSWORD])
            except GLiNetAuthError:
                fehler["base"] = "router_anmeldung"
            except GLiNetError:
                fehler["base"] = "router_erreichbar"
            else:
                return self.async_update_reload_and_abort(entry, data=daten)
        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({
                vol.Required(CONF_PASSWORD): TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))
            }),
            errors=fehler,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return RouterOptionen()

    @classmethod
    @callback
    def async_supports_options_flow(cls, config_entry: ConfigEntry) -> bool:
        return config_entry.data.get(CONF_MODUL) == "router"

    # ---- Add-on-Modul von Hand ----------------------------------------------
    async def async_step_adresse(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
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
            step_id="adresse",
            data_schema=vol.Schema({vol.Required(CONF_URL, default="http://"): str, vol.Required(CONF_TOKEN): str}),
            errors=fehler,
        )


class RouterOptionen(OptionsFlow):
    """SIM nach Land, Abfrageintervall und -- für Fachleute -- der Umschaltbefehl."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        from . import router as r

        fehler: dict[str, str] = {}
        if user_input is not None:
            methode = str(user_input.get(r.OPT_METHODE) or "").strip()
            parameter = str(user_input.get(r.OPT_PARAMETER) or "").strip()
            if methode and "." not in methode:
                fehler[r.OPT_METHODE] = "methode"
            if parameter:
                try:
                    json.loads(parameter)
                except ValueError:
                    fehler[r.OPT_PARAMETER] = "json"
            if not fehler:
                return self.async_create_entry(data={
                    **user_input,
                    r.OPT_SIM1: ", ".join(sorted(r.codes(user_input.get(r.OPT_SIM1)))),
                    r.OPT_SIM2: ", ".join(sorted(r.codes(user_input.get(r.OPT_SIM2)))),
                    r.OPT_METHODE: methode,
                    r.OPT_PARAMETER: parameter,
                    r.OPT_INTERVALL: int(user_input[r.OPT_INTERVALL]),
                    r.OPT_WARTEN: int(user_input[r.OPT_WARTEN]),
                })
        o = self.config_entry.options
        schema = vol.Schema({
            vol.Required(r.OPT_AUTOMATIK, default=bool(o.get(r.OPT_AUTOMATIK, False))): BooleanSelector(),
            vol.Optional(r.OPT_SIM1, description={"suggested_value": o.get(r.OPT_SIM1, "")}): str,
            vol.Optional(r.OPT_SIM2, description={"suggested_value": o.get(r.OPT_SIM2, "")}): str,
            vol.Required(r.OPT_SONST, default=str(o.get(r.OPT_SONST, "keine"))): SelectSelector(
                SelectSelectorConfig(options=["keine", "1", "2"], mode=SelectSelectorMode.DROPDOWN,
                                     translation_key="sonst")
            ),
            vol.Required(r.OPT_WARTEN, default=o.get(r.OPT_WARTEN, r.STANDARD_WARTEN)): NumberSelector(
                NumberSelectorConfig(min=0, max=30, step=1, unit_of_measurement="min", mode=NumberSelectorMode.BOX)
            ),
            vol.Required(r.OPT_INTERVALL, default=o.get(r.OPT_INTERVALL, r.STANDARD_INTERVALL)): NumberSelector(
                NumberSelectorConfig(min=10, max=600, step=5, unit_of_measurement="s", mode=NumberSelectorMode.BOX)
            ),
            vol.Optional(r.OPT_METHODE, description={"suggested_value": o.get(r.OPT_METHODE, "")}): str,
            vol.Optional(r.OPT_PARAMETER, description={"suggested_value": o.get(r.OPT_PARAMETER, "")}): TextSelector(
                TextSelectorConfig(multiline=True)
            ),
        })
        return self.async_show_form(step_id="init", data_schema=schema, errors=fehler)
