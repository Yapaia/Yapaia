"""Yapaia Design: ein gemeinsames Aussehen für alle Yapaia-Oberflächen.

Die Schemata kommen aus `design/schemata/*.json` im Repo (Generator
`design/erzeugen.py`, Doku `docs/design-schemata.md`) und liegen hier fertig
unter `www/schemata.json`. Diese Datei verwaltet, welches gilt:

* **gesamt** – ein Schema für alles (Gerät „Yapaia Design“, Auswahl „Schema“),
* **je Modul** – ein eigenes oder „Wie gesamt“ (Auswahl „Design“ am Gerät des Moduls),
* **HA-Design** – nur wenn der Anwender es will, färbt ein passendes
  Home-Assistant-Theme auch HA selbst um. Standard: nicht anfassen.

Karten holen die Wahl über `yapaia/design` (WebSocket) und die Dateien unter
`/yapaia_design/`; das Ereignis `yapaia_design_geaendert` meldet Änderungen.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Callable

import voluptuous as vol
from homeassistant.components import persistent_notification, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

from ..const import CONF_MODUL, DOMAIN
from ..modul import text
from ..sprache import sprache

_LOGGER = logging.getLogger(__name__)

DATEN = f"{DOMAIN}_design"
MODUL = "design"
STATISCH = "/yapaia_design"
EREIGNIS = "yapaia_design_geaendert"
STANDARD = "retro"
# Feste Optionen der Auswahlen (übersetzt über translations/*.json → state)
WIE_GESAMT = "wie_gesamt"
NICHT_AENDERN = "nicht_aendern"
SCHRIFTEN_JS = f"{STATISCH}/yapaia-schriften.js"
THEME_VORSILBE = "Yapaia "
HIER = Path(__file__).parent


class Design:
    """Gewählte Schemata, gespeichert in .storage/yapaia.design."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, 1, "yapaia.design")
        # ha_vorher: das Standard-Theme vor unserer Änderung, zum Wiederherstellen
        self.daten: dict[str, Any] = {"gesamt": STANDARD, "module": {}, "ha_design": None, "ha_vorher": None}
        self.schemata: list[dict[str, Any]] = []
        self._hoerer: set[Callable[[], None]] = set()

    async def laden(self) -> None:
        roh = await self.hass.async_add_executor_job((HIER / "www" / "schemata.json").read_text, "utf-8")
        self.schemata = json.loads(roh)["schemata"]
        gespeichert = await self._store.async_load()
        if isinstance(gespeichert, dict):
            self.daten.update({k: v for k, v in gespeichert.items() if k in self.daten})
        if self.daten["gesamt"] not in self.ids:
            self.daten["gesamt"] = STANDARD if STANDARD in self.ids else self.ids[0]

    # ---- Abfragen -----------------------------------------------------------
    @property
    def ids(self) -> list[str]:
        return [s["id"] for s in self.schemata]

    def name(self, schema_id: str | None) -> str | None:
        return next((s["name"] for s in self.schemata if s["id"] == schema_id), None)

    def id_aus_name(self, name: str) -> str | None:
        return next((s["id"] for s in self.schemata if s["name"] == name or s["id"] == name), None)

    def namen(self) -> list[str]:
        return [s["name"] for s in self.schemata]

    def eigenes(self, kennung: str) -> str | None:
        wert = self.daten["module"].get(kennung)
        return wert if wert in self.ids else None

    def fuer(self, kennung: str | None) -> str:
        """Das Schema, das für dieses Modul gilt."""
        return (self.eigenes(kennung) if kennung else None) or self.daten["gesamt"]

    def stand(self) -> dict[str, Any]:
        return {
            "gesamt": self.daten["gesamt"],
            "module": {k: v for k, v in self.daten["module"].items() if v in self.ids},
            "ha_design": self.daten["ha_design"],
            "schemata": [{"id": s["id"], "name": s["name"], "hell": s["hell"]} for s in self.schemata],
            "dateien": f"{STATISCH}/schemata.json",
        }

    # ---- Ändern -------------------------------------------------------------
    async def setze_gesamt(self, schema_id: str) -> None:
        if schema_id not in self.ids:
            raise vol.Invalid(f"Unbekanntes Schema „{schema_id}“")
        self.daten["gesamt"] = schema_id
        await self._geaendert()
        if self.daten["ha_design"] == "gesamt":
            await self._ha_anwenden()

    async def setze_modul(self, kennung: str, schema_id: str | None) -> None:
        if schema_id is not None and schema_id not in self.ids:
            raise vol.Invalid(f"Unbekanntes Schema „{schema_id}“")
        if schema_id is None:
            self.daten["module"].pop(kennung, None)
        else:
            self.daten["module"][kennung] = schema_id
        await self._geaendert()

    async def setze_ha_design(self, wahl: str | None) -> None:
        """`None` = nicht ändern, `gesamt` = wie das Gesamt-Schema, sonst eine Schema-ID."""
        if wahl not in (None, "gesamt") and wahl not in self.ids:
            raise vol.Invalid(f"Unbekanntes Schema „{wahl}“")
        vorher = self.daten["ha_design"]
        self.daten["ha_design"] = wahl
        await self._geaendert()
        if wahl is None:
            if vorher is not None:
                await self._ha_zuruecksetzen()
        else:
            await self._ha_anwenden()

    def ha_design_schema(self) -> str | None:
        w = self.daten["ha_design"]
        return self.daten["gesamt"] if w == "gesamt" else w

    async def _geaendert(self) -> None:
        await self._store.async_save(self.daten)
        verteilen_bald(self.hass)
        self.hass.bus.async_fire(EREIGNIS, {"gesamt": self.daten["gesamt"], "module": dict(self.daten["module"])})
        for fn in list(self._hoerer):
            fn()

    @callback
    def hoeren(self, fn: Callable[[], None]) -> Callable[[], None]:
        self._hoerer.add(fn)
        return lambda: self._hoerer.discard(fn)

    # ---- Home-Assistant-Theme (nur auf Wunsch) ------------------------------
    async def _ha_anwenden(self) -> None:
        schema_id = self.ha_design_schema()
        name = self.name(schema_id)
        if not name:
            return
        theme = THEME_VORSILBE + name
        await self.hass.async_add_executor_job(self._themes_schreiben)
        if self.hass.services.has_service("frontend", "reload_themes"):
            await self.hass.services.async_call("frontend", "reload_themes", blocking=True)
        geladen = self.hass.data.get("frontend_themes") or {}
        if theme not in geladen:
            yaml = "\n\n```yaml\nfrontend:\n  themes: !include_dir_merge_named themes\n```"
            persistent_notification.async_create(
                self.hass,
                text({"de": "Das Yapaia-Theme liegt in `themes/yapaia.yaml`, Home Assistant lädt aber keine Themes aus "
                            "diesem Ordner. Bitte in `configuration.yaml` ergänzen und HA neu starten:",
                      "en": "The Yapaia theme is in `themes/yapaia.yaml`, but Home Assistant does not load themes "
                            "from this folder. Please add this to `configuration.yaml` and restart HA:"},
                     sprache(self.hass)) + yaml,
                title=text({"de": "Yapaia Design: HA-Design noch nicht aktiv",
                            "en": "Yapaia Design: HA theme not active yet"}, sprache(self.hass)),
                notification_id=f"{DOMAIN}_design_theme",
            )
            return
        persistent_notification.async_dismiss(self.hass, f"{DOMAIN}_design_theme")
        if self.daten.get("ha_vorher") is None:
            vorher = {
                "light": self.hass.data.get("frontend_default_theme") or "default",
                "dark": self.hass.data.get("frontend_default_dark_theme"),
            }
            # nur ein fremdes Theme merken, nie ein eigenes
            self.daten["ha_vorher"] = {k: (v if not str(v or "").startswith(THEME_VORSILBE) else None) for k, v in vorher.items()}
            await self._store.async_save(self.daten)
        for modus in ("light", "dark"):
            await self.hass.services.async_call("frontend", "set_theme", {"name": theme, "mode": modus}, blocking=True)
        self._schriften(True)

    async def _ha_zuruecksetzen(self) -> None:
        """Nur die eigene Änderung zurücknehmen: das Theme von vorher wiederherstellen."""
        vorher = self.daten.get("ha_vorher") or {}
        if self.hass.services.has_service("frontend", "set_theme"):
            await self.hass.services.async_call(
                "frontend", "set_theme", {"name": vorher.get("light") or "default", "mode": "light"}, blocking=True
            )
            await self.hass.services.async_call(
                "frontend", "set_theme", {"name": vorher.get("dark") or "none", "mode": "dark"}, blocking=True
            )
        self.daten["ha_vorher"] = None
        await self._store.async_save(self.daten)
        self._schriften(False)

    def _themes_schreiben(self) -> None:
        ziel = Path(self.hass.config.path("themes"))
        ziel.mkdir(exist_ok=True)
        (ziel / "yapaia.yaml").write_text((HIER / "themes" / "yapaia.yaml").read_text("utf-8"), "utf-8")

    @callback
    def _schriften(self, an: bool) -> None:
        """Die mitgelieferten Schriften auch in HA selbst laden (für das HA-Design)."""
        try:
            from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
        except ImportError:  # pragma: no cover
            return
        try:
            (add_extra_js_url if an else remove_extra_js_url)(self.hass, SCHRIFTEN_JS)
        except (KeyError, ValueError):
            pass


def nachricht(d: Design, kennung: str) -> dict[str, Any]:
    """Was ein Modul bekommt (POST /yapaia/v1/design, docs/integration-protokoll.md §9)."""
    schema_id = d.fuer(kennung)
    schema = next((s for s in d.schemata if s["id"] == schema_id), None)
    return {
        "schema": schema,
        "eigenes": d.eigenes(kennung) is not None,
        "schriften": f"{STATISCH}/schriften/schriften.css",
    }


async def senden(hass: HomeAssistant, modul: Any) -> None:
    """Einem Modul sein Schema schicken (wirft nie)."""
    d = holen(hass)
    client = getattr(modul, "client", None)
    if d is None or not hasattr(client, "design"):
        return
    try:
        if not await client.design(nachricht(d, modul.kennung)):
            _LOGGER.debug("%s kennt /design noch nicht", modul.kennung)
    except Exception as err:  # noqa: BLE001 – ein Modul ohne Verbindung bekommt es beim nächsten Verbinden
        _LOGGER.debug("%s: Design nicht zugestellt (%s)", getattr(modul, "kennung", "?"), err)


@callback
def senden_bald(hass: HomeAssistant, modul: Any) -> None:
    hass.async_create_background_task(senden(hass, modul), f"{DOMAIN}_design_{getattr(modul, 'kennung', '')}")


@callback
def verteilen_bald(hass: HomeAssistant) -> None:
    """Allen verbundenen Modulen ihr Schema schicken (nach jeder Änderung)."""
    for e in hass.config_entries.async_entries(DOMAIN):
        m = getattr(e, "runtime_data", None)
        if m is not None and getattr(m, "verbunden", False):
            senden_bald(hass, m)


def holen(hass: HomeAssistant) -> Design | None:
    return hass.data.get(DATEN)


async def einrichten(hass: HomeAssistant) -> Design:
    """Einmal je HA-Start (async_setup der Integration)."""
    if (d := holen(hass)) is not None:
        return d
    d = Design(hass)
    hass.data[DATEN] = d
    await d.laden()
    if hass.http is not None:
        await hass.http.async_register_static_paths([StaticPathConfig(STATISCH, str(HIER / "www"), False)])
    websocket_api.async_register_command(hass, ws_stand)
    websocket_api.async_register_command(hass, ws_setzen)
    if d.daten["ha_design"] is not None:
        d._schriften(True)
    # Das Gerät „Yapaia Design“ (eigener Eintrag) anlegen, falls es fehlt
    if not any(e.data.get(CONF_MODUL) == MODUL for e in hass.config_entries.async_entries(DOMAIN)):
        hass.async_create_task(
            hass.config_entries.flow.async_init(DOMAIN, context={"source": "import"}, data={CONF_MODUL: MODUL})
        )
    return d


@websocket_api.websocket_command({vol.Required("type"): "yapaia/design", vol.Optional("modul"): str})
@callback
def ws_stand(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Wahl abfragen; mit `modul` (Kennung, z. B. go_ab12) auch das dort geltende Schema."""
    d = holen(hass)
    if d is None:
        connection.send_error(msg["id"], "nicht_bereit", "Yapaia Design ist noch nicht geladen")
        return
    antwort = d.stand()
    if "modul" in msg:
        antwort["gilt"] = d.fuer(msg["modul"])
    connection.send_result(msg["id"], antwort)


@websocket_api.websocket_command({
    vol.Required("type"): "yapaia/design/setzen",
    vol.Optional("gesamt"): str,
    vol.Optional("modul"): str,
    vol.Optional("schema"): vol.Any(str, None),
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_setzen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    d = holen(hass)
    if d is None:
        connection.send_error(msg["id"], "nicht_bereit", "Yapaia Design ist noch nicht geladen")
        return
    try:
        if "gesamt" in msg:
            await d.setze_gesamt(msg["gesamt"])
        if "modul" in msg:
            await d.setze_modul(msg["modul"], msg.get("schema"))
    except vol.Invalid as err:
        connection.send_error(msg["id"], "ungueltig", str(err))
        return
    connection.send_result(msg["id"], d.stand())
