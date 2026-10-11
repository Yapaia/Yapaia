"""Konstanten des Beat-Teils der Yapaia-Integration."""

from __future__ import annotations

import json
from pathlib import Path

DOMAIN = "yapaia"
WWW = Path(__file__).parent / "www"
CARD_URL = "/yapaia/beat/yapaia-beat-card.js"
CARD_PATH = WWW / "yapaia-beat-card.js"
# Sendspin client (Music Assistant's audio protocol), loaded by the card on demand
SENDSPIN_URL = "/yapaia/beat/sendspin.js"
SENDSPIN_PATH = WWW / "sendspin.js"
SENDSPIN_LICENSES_URL = "/yapaia/beat/sendspin.LICENSES.txt"
SENDSPIN_LICENSES_PATH = WWW / "sendspin.LICENSES.txt"
LOGO_URL = "/api/yapaia/beat/logo/{}"
SLIDE_URL = "/api/yapaia/beat/slide"
STREAM_URL = "/api/yapaia/beat/stream"

VERSION = json.loads((Path(__file__).parent.parent / "manifest.json").read_text())["version"]
