"""Entry point: ``python3 -m yapaia``."""

from __future__ import annotations

import asyncio
import logging
import os
import signal

from aiohttp import web

from . import befehl, ha, protokoll
from .audio import AudioOutput
from .config import DATA_DIR, VERSION, load_options
from .logos import LogoManager
from .radio import Radio
from .store import Store
from .web import create_app

PORT = int(os.environ.get("YAPAIA_PORT", "8099"))
LEVELS = {"trace": logging.DEBUG, "debug": logging.DEBUG, "info": logging.INFO, "notice": logging.INFO,
          "warning": logging.WARNING, "error": logging.ERROR, "fatal": logging.CRITICAL}  # fmt: skip


async def main() -> None:
    opts = load_options()
    logging.basicConfig(
        level=LEVELS.get(opts.log_level, logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)
    log = logging.getLogger("yapaia")
    log.info("Yapaia Beat %s starting", VERSION)

    store = Store(DATA_DIR / "stations.json")
    logos = LogoManager(DATA_DIR / "logos", opts.logo_lookup_online, opts.country_code)
    audio = AudioOutput(opts.audio_output == "local", opts.mp3_bitrate, opts.default_volume)
    audio.mischer.musik_pegel = max(0, min(100, opts.announce_music_level)) / 100
    radio = Radio(opts, store, logos, audio)

    ident = protokoll.Identitaet()
    runner = web.AppRunner(create_app(radio, ident), access_log=None)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", PORT).start()
    log.info("Web interface listening on port %d (local audio: %s)", PORT, audio.local)

    if opts.install_integration:
        try:
            was = ha.install_integration()
            if was == "ersetzt":
                await ha.notify(
                    "Yapaia",
                    "Yapaia Beat gehört jetzt zur gemeinsamen Integration **Yapaia**. "
                    "Bitte **Home Assistant neu starten**. Danach unter *Einstellungen → Geräte & Dienste* "
                    "den alten Eintrag „Yapaia Beat“ löschen und das neu gefundene Gerät „Yapaia Beat“ "
                    "hinzufügen. Die Entitäten (z. B. `media_player.yapaia_beat`) behalten ihre Namen.",
                )
            elif was:
                await ha.notify(
                    "Yapaia",
                    "Die Yapaia-Integration wurde installiert bzw. aktualisiert. "
                    "Bitte **Home Assistant neu starten**, danach erscheint Yapaia Beat unter "
                    "*Einstellungen → Geräte & Dienste* als entdecktes Gerät.",
                )
        except OSError as err:
            log.error("Could not install integration: %s", err)
    await ha.announce(PORT, ident.instanz, ident.token, VERSION)
    if await befehl.einrichten(opts.voice_commands):
        log.info("Sprachbefehle in Home Assistant: %s", "eingerichtet" if opts.voice_commands else "entfernt")

    await radio.start()

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    await stop.wait()
    log.info("Shutting down")
    await radio.shutdown()
    await logos.close()
    await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
