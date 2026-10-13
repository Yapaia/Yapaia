"""Aktionen der Module als HA-Aktionen `yapaia.<modul>_<name>` (Abschnitt 5)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import ATTR_DEVICE_ID
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_set_service_schema
from homeassistant.helpers.target import async_extract_referenced_entity_ids

try:
    from homeassistant.helpers.target import TargetSelection
except ImportError:  # Home Assistant vor der Umbenennung
    from homeassistant.helpers.target import TargetSelectorData as TargetSelection

from .client import YapaiaFehler
from .const import DOMAIN
from .modul import YapaiaModul, text

SELEKTOR = {
    "text": {"text": {}},
    "zahl": {"number": {"mode": "box"}},
    "bool": {"boolean": {}},
    "entitaet": {"entity": {}},
    "ort": {"location": {}},
}


def _module(hass: HomeAssistant, modul: str) -> list[YapaiaModul]:
    return [
        e.runtime_data
        for e in hass.config_entries.async_entries(DOMAIN)
        if e.state is ConfigEntryState.LOADED and getattr(e, "runtime_data", None) and e.runtime_data.modul == modul
    ]


def _selektor(feld: dict[str, Any]) -> dict[str, Any]:
    if feld.get("typ") == "auswahl":
        return {"select": {"options": [str(o) for o in feld.get("optionen", [])]}}
    return SELEKTOR.get(feld.get("typ", "text"), {"text": {}})


def registrieren(hass: HomeAssistant, modul: YapaiaModul) -> None:
    for a in modul.aktionen():
        dienst = f"{modul.modul}_{a['name']}"
        if hass.services.has_service(DOMAIN, dienst):
            continue

        async def ausfuehren(call: ServiceCall, _modul: str = modul.modul, _name: str = a["name"]) -> ServiceResponse:
            ziele = _ziele(hass, call, _modul)
            daten = {k: v for k, v in call.data.items() if k not in (ATTR_DEVICE_ID, "entity_id", "area_id", "floor_id", "label_id")}
            ergebnis: dict[str, Any] = {}
            for m in ziele:
                try:
                    antwort = await m.client.aktion(_name, daten)
                except YapaiaFehler as err:
                    raise HomeAssistantError(f"{m.name}: {err}") from err
                ergebnis[m.name] = antwort.get("ergebnis")
            return ergebnis if call.return_response else None

        hass.services.async_register(
            DOMAIN, dienst, ausfuehren, schema=vol.Schema(dict(cv.TARGET_SERVICE_FIELDS), extra=vol.ALLOW_EXTRA),
            supports_response=SupportsResponse.OPTIONAL,
        )
        sprache = modul.sprache
        async_set_service_schema(
            hass,
            DOMAIN,
            dienst,
            {
                "name": f"{modul.name.split(' ')[0]} {modul.modul.capitalize()}: {text(a.get('titel'), sprache) or a['name']}",
                "description": text(a.get("beschreibung"), sprache),
                "target": {"device": [{"integration": DOMAIN, "model": modul.modul}]},
                "fields": {
                    k: {
                        "name": text(f.get("titel"), sprache) or k,
                        "required": bool(f.get("pflicht")),
                        **({"default": f["standard"]} if "standard" in f else {}),
                        "selector": _selektor(f),
                    }
                    for k, f in (a.get("felder") or {}).items()
                    if isinstance(f, dict)
                },
            },
        )


def _ziele(hass: HomeAssistant, call: ServiceCall, modul: str) -> list[YapaiaModul]:
    alle = _module(hass, modul)
    geraete = set(async_extract_referenced_entity_ids(hass, TargetSelection(call.data)).referenced_devices)
    if geraete:
        ziele = [m for m in alle if m.geraet_id in geraete]
    elif len(alle) == 1:
        ziele = alle
    elif not alle:
        raise ServiceValidationError(f"Kein Yapaia-Modul „{modul}“ eingerichtet")
    else:
        raise ServiceValidationError(f"Mehrere „{modul}“-Geräte – bitte eines als Ziel wählen")
    if not ziele:
        raise ServiceValidationError("Das gewählte Gerät gehört nicht zu diesem Modul")
    return ziele


def aufraeumen(hass: HomeAssistant, entry) -> None:
    """Aktionen eines Moduls entfernen, wenn keine Instanz mehr da ist."""
    modul: YapaiaModul = entry.runtime_data
    if [m for m in _module(hass, modul.modul) if m is not modul]:
        return
    for a in modul.aktionen():
        if hass.services.has_service(DOMAIN, f"{modul.modul}_{a['name']}"):
            hass.services.async_remove(DOMAIN, f"{modul.modul}_{a['name']}")
