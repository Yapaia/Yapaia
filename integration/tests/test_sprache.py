"""Sprache: Yapaia folgt der HA-Sprache (de/en), Übersetzungen vollständig."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest
import yaml

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError

from custom_components.yapaia import sprache

from .test_integration import einrichten as modul_einrichten, warten

REPO = Path(__file__).resolve().parents[2]
YAPAIA = REPO / "integration/custom_components/yapaia"


def _schluessel(d: object, vorne: str = "") -> dict[str, str]:
    """Alle Blätter als {pfad: text}."""
    if isinstance(d, dict):
        aus: dict[str, str] = {}
        for k, v in d.items():
            aus |= _schluessel(v, f"{vorne}.{k}" if vorne else str(k))
        return aus
    return {vorne: str(d)}


def _platzhalter(t: str) -> set[str]:
    return set(re.findall(r"\{(\w+)\}", t))


def test_integration_uebersetzungen_vollstaendig() -> None:
    """strings.json = en.json; de.json hat dieselben Schlüssel und Platzhalter."""
    strings = json.loads((YAPAIA / "strings.json").read_text())
    en = json.loads((YAPAIA / "translations/en.json").read_text())
    de = json.loads((YAPAIA / "translations/de.json").read_text())
    assert strings == en, "strings.json und translations/en.json müssen gleich sein"
    s_en, s_de = _schluessel(en), _schluessel(de)
    assert set(s_en) == set(s_de), set(s_en) ^ set(s_de)
    for k in s_en:
        assert _platzhalter(s_en[k]) == _platzhalter(s_de[k]), k


@pytest.mark.parametrize("addon", ["go/yapaia_go", "beat/yapaia_beat", "vision/yapaia_vision"])
def test_addon_uebersetzungen_vollstaendig(addon: str) -> None:
    ordner = REPO / addon / "translations"
    de = _schluessel(yaml.safe_load((ordner / "de.yaml").read_text()))
    en = _schluessel(yaml.safe_load((ordner / "en.yaml").read_text()))
    assert set(de) == set(en), set(de) ^ set(en)


def test_karten_uebersetzungen_vollstaendig() -> None:
    """Jede Karte: TEXTE.de und TEXTE.en mit denselben Schlüsseln und Platzhaltern."""
    r = subprocess.run(["node", str(REPO / "dashboards/sprachen-pruefen.mjs")], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


async def test_sprache_aus_ha(hass: HomeAssistant) -> None:
    for ha, erwartet in [("de", "de"), ("de-CH", "de"), ("en-GB", "en"), ("fr", "en")]:
        hass.config.language = ha
        assert sprache.sprache(hass) == erwartet


async def test_module_bekommen_die_sprache(hass: HomeAssistant, modul_fabrik) -> None:
    """POST /yapaia/v1/sprache beim Verbinden; HA-Sprache ändern → neu laden und neu senden."""
    await hass.config.async_update(language="de")
    m = await modul_fabrik()
    await modul_einrichten(hass, m)
    await warten(lambda: m.sprache)
    assert m.sprache[-1] == "de"

    await hass.config.async_update(language="en")
    await hass.async_block_till_done()
    await warten(lambda: m.sprache[-1] == "en")


async def test_fehlermeldungen_uebersetzt(hass: HomeAssistant, modul_fabrik) -> None:
    m = await modul_fabrik()
    await modul_einrichten(hass, m)
    with pytest.raises(ServiceValidationError) as fehler:
        await hass.services.async_call("yapaia", "go_ziel_setzen", {"device_id": "gibts-nicht"}, blocking=True)
    assert fehler.value.translation_key in {"falsches_geraet", "kein_modul"}
