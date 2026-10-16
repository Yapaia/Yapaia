"""Home Assistant / Supervisor glue.

* installs (and updates) the bundled central ``yapaia`` integration into
  ``/homeassistant/custom_components`` -- shared by all Yapaia modules; the
  newest version wins (docs/integration-protokoll.md, Abschnitt 9)
* announces the add-on via Supervisor discovery (service ``yapaia``) so the
  integration is set up with one click
"""

from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path

import aiohttp

from .config import APP_DIR

_LOGGER = logging.getLogger(__name__)

SUPERVISOR = "http://supervisor"
HA_CONFIG = Path(os.environ.get("YAPAIA_HA_CONFIG", "/homeassistant"))
INTEGRATION_SRC = APP_DIR / "integration" / "yapaia"
DOMAIN = "yapaia"


def _token() -> str | None:
    return os.environ.get("SUPERVISOR_TOKEN")


def _version(pfad: Path) -> tuple[int, ...]:
    try:
        text = json.loads((pfad / "manifest.json").read_text()).get("version", "0")
        return tuple(int(t) for t in str(text).split(".") if t.isdigit())
    except (OSError, ValueError):
        return ()


def install_integration() -> str | None:
    """Install or update the central integration.

    Returns what happened (``"installiert"``, ``"aktualisiert"``) or ``None``."""
    if not HA_CONFIG.is_dir():
        _LOGGER.warning("Home Assistant configuration not mapped – cannot install integration")
        return None
    if not (INTEGRATION_SRC / "manifest.json").is_file():
        _LOGGER.warning("No Yapaia integration bundled in this image – skipped")
        return None
    komponenten = HA_CONFIG / "custom_components"
    target = komponenten / DOMAIN
    ergebnis: str | None = None
    ours, theirs = _version(INTEGRATION_SRC), _version(target)
    if target.exists() and theirs >= ours:
        _LOGGER.info("Integration %s %s is current (bundled: %s)", DOMAIN, theirs, ours)
    else:
        fresh = not target.exists()
        komponenten.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(f".{DOMAIN}.new")
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.copytree(INTEGRATION_SRC, tmp, ignore=shutil.ignore_patterns("__pycache__"))
        shutil.rmtree(target, ignore_errors=True)
        tmp.rename(target)
        ergebnis = "installiert" if fresh else "aktualisiert"
        _LOGGER.info("Integration %s %s: %s", DOMAIN, ergebnis, ".".join(map(str, ours)))
    return ergebnis


async def _call(method: str, path: str, payload: dict | None = None) -> dict | None:
    token = _token()
    if not token:
        return None
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.request(
                method, SUPERVISOR + path, json=payload, headers={"Authorization": f"Bearer {token}"}
            ) as r:
                if r.status >= 400:
                    _LOGGER.warning("Supervisor %s %s -> HTTP %s", method, path, r.status)
                    return None
                return await r.json(content_type=None)
    except (aiohttp.ClientError, ValueError) as err:
        _LOGGER.warning("Supervisor call %s failed: %s", path, err)
        return None


async def notify(title: str, message: str, notification_id: str = "yapaia_vision") -> None:
    await _call(
        "POST",
        "/core/api/services/persistent_notification/create",
        {"title": title, "message": message, "notification_id": notification_id},
    )


def discovery_config(hostname: str, port: int, instanz: str, token: str, version: str) -> dict:
    """Die Anmeldung nach dem Yapaia-Protokoll (Abschnitt 4)."""
    return {
        "modul": "vision",
        "instanz": instanz,
        "name": "Yapaia Vision",
        "host": hostname,
        "port": port,
        "token": token,
        "protokoll": 1,
        "version": version,
    }


async def announce(port: int, instanz: str, token: str, version: str) -> None:
    """Supervisor discovery → HA offers to set up the integration."""
    info = await _call("GET", "/addons/self/info")
    hostname = ((info or {}).get("data") or {}).get("hostname")
    if not hostname:
        _LOGGER.info("Not running under the Supervisor – discovery skipped")
        _LOGGER.info("Manual setup: http://<host>:%s, token %s", port, token)
        return
    res = await _call(
        "POST", "/discovery", {"service": DOMAIN, "config": discovery_config(hostname, port, instanz, token, version)}
    )
    if res is not None:
        _LOGGER.info("Discovery sent (%s:%s)", hostname, port)
