"""Einstieg: ``python3 -m yapaia``."""

from __future__ import annotations

import asyncio
import logging
import os
import signal

from aiohttp import web

from . import ha, protokoll
from .config import VERSION, load_options
from .vision import Vision
from .web import create_app

PORT = int(os.environ.get("YAPAIA_PORT", "8099"))
LEVELS = {"debug": logging.DEBUG, "info": logging.INFO, "warning": logging.WARNING, "error": logging.ERROR}


async def main() -> None:
    opts = load_options()
    logging.basicConfig(
        level=LEVELS.get(opts.log_level, logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)
    log = logging.getLogger("yapaia")
    log.info("Yapaia Vision %s startet%s", VERSION, " (Testbild)" if opts.testbild else "")

    vision = Vision(opts)
    ident = protokoll.Identitaet()
    runner = web.AppRunner(create_app(vision, ident), access_log=None)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", PORT).start()
    log.info("Web-Oberfläche auf Port %d", PORT)

    if opts.install_integration:
        try:
            if ha.install_integration():
                await ha.notify(
                    "Yapaia",
                    "Die Yapaia-Integration wurde installiert bzw. aktualisiert. "
                    "Bitte **Home Assistant neu starten**, danach erscheint Yapaia Vision unter "
                    "*Einstellungen → Geräte & Dienste* als entdecktes Gerät.",
                )
        except OSError as err:
            log.error("Integration nicht installierbar: %s", err)
    await ha.announce(PORT, ident.instanz, ident.token, VERSION)

    if opts.immer_an:
        for e in vision.erfassungen.values():
            e.starten()

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    await stop.wait()
    log.info("Beende")
    await vision.stoppen()
    await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
