"""Fertige Dashboards in Home Assistant einspielen, ohne `?v=` von Hand.

Kopiert die Karten nach `/config/www/<ordner>/` und setzt die Ressource in
Home Assistant auf `?v=<Prüfsumme der Datei>`. Die ändert sich nur, wenn sich
die Datei ändert -- dann lädt jeder Browser die neue Fassung beim nächsten
Öffnen von selbst.

Läuft auf dem Mini-PC (Add-on mit `SUPERVISOR_TOKEN` und `/config`):

    python3 dashboards/deploy.py

Mit `--dashboard <ordner>` (mehrfach möglich) legt es außerdem das Dashboard
aus `<ordner>/dashboard.yaml` an bzw. überschreibt dessen Konfiguration. Ohne
die Option bleiben die Dashboards selbst unangetastet -- Änderungen, die man
in der Oberfläche gemacht hat, gehen also nicht verloren.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import shutil
import sys
from pathlib import Path

import aiohttp

HIER = Path(__file__).resolve().parent
WWW = Path("/config/www")
# Datei im Repository → Ordner unter /config/www (= /local/…)
KARTEN = {
    HIER / "cockpit-sport" / "cockpit-sport-card.js": "yapaia-cockpit",
    HIER / "rangieren" / "nivellierung-card.js": "yapaia-dashboards",
    HIER / "rangieren" / "kamera-card.js": "yapaia-dashboards",
}
# Ordner → (url_path, Titel, Symbol) für `--dashboard`
DASHBOARDS = {
    "cockpit-sport": ("yapaia-sport", "Cockpit Sport", "mdi:car-sports"),
    "rangieren": ("yapaia-rangieren", "Rangieren", "mdi:car-brake-parking"),
    "stellplatz": ("yapaia-stellplatz", "Stellplatz", "mdi:caravan"),
}


async def ws_rufen(ws: aiohttp.ClientWebSocketResponse, nr: int, **befehl: object) -> object:
    await ws.send_json({"id": nr, **befehl})
    antwort = await ws.receive_json()
    if not antwort.get("success"):
        raise RuntimeError(f"{befehl.get('type')}: {antwort.get('error')}")
    return antwort.get("result")


async def dashboard_einspielen(ws: aiohttp.ClientWebSocketResponse, nr: int, ordner: str) -> int:
    import yaml  # nur hier gebraucht

    url_path, titel, symbol = DASHBOARDS[ordner]
    konfig = yaml.safe_load((HIER / ordner / "dashboard.yaml").read_text(encoding="utf-8"))
    vorhanden = await ws_rufen(ws, nr, type="lovelace/dashboards/list")
    if not any(d["url_path"] == url_path for d in vorhanden):
        nr += 1
        await ws_rufen(ws, nr, type="lovelace/dashboards/create", url_path=url_path, title=titel, icon=symbol, mode="storage", show_in_sidebar=True, require_admin=False)
        print(f"Dashboard angelegt: /{url_path}")
    nr += 1
    await ws_rufen(ws, nr, type="lovelace/config/save", url_path=url_path, config=konfig)
    print(f"Dashboard gespeichert: /{url_path}")
    return nr + 1


async def main() -> int:
    args = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    args.add_argument("--dashboard", action="append", default=[], choices=sorted(DASHBOARDS), help="Dashboard anlegen bzw. überschreiben")
    optionen = args.parse_args()
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        print("Kein SUPERVISOR_TOKEN – nur auf dem Mini-PC (Add-on) aufrufen.", file=sys.stderr)
        return 1
    async with aiohttp.ClientSession() as s, s.ws_connect("http://supervisor/core/websocket") as ws:
        await ws.receive_json()
        await ws.send_json({"type": "auth", "access_token": token})
        if (await ws.receive_json()).get("type") != "auth_ok":
            print("Anmeldung bei Home Assistant fehlgeschlagen", file=sys.stderr)
            return 1
        nr = 1
        ressourcen = await ws_rufen(ws, nr, type="lovelace/resources")
        for quelle, ordner in KARTEN.items():
            ziel = WWW / ordner / quelle.name
            ziel.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(quelle, ziel)
            url = f"/local/{ordner}/{quelle.name}?v={hashlib.sha1(quelle.read_bytes()).hexdigest()[:10]}"
            basis = url.split("?")[0]
            alt = next((r for r in ressourcen if r["url"].split("?")[0] == basis), None)
            nr += 1
            if alt is None:
                await ws_rufen(ws, nr, type="lovelace/resources/create", res_type="module", url=url)
                print(f"neu:  {url}")
            elif alt["url"] != url:
                await ws_rufen(ws, nr, type="lovelace/resources/update", resource_id=alt["id"], res_type="module", url=url)
                print(f"neu:  {url} (war {alt['url']})")
            else:
                print(f"gleich: {url}")
        for ordner in optionen.dashboard:
            nr = await dashboard_einspielen(ws, nr + 1, ordner)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
