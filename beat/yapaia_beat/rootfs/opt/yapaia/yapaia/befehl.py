"""Sprachbefehle fürs Radio: ein gesprochener Satz wird zu einer Bedienung.

Der Satz kommt über Home Assistant Assist (Sprachsatellit oder der
Assist-Knopf der App): eine Automation fängt Sätze wie „Spiel SWR3“ ab und
ruft die Aktion `yapaia.beat_befehl`; die Antwort wird gesprochen. Verstanden
wird ohne KI, nur anhand von Schlüsselwörtern und der Senderliste – deshalb
hier die Schreibweisen, die Spracherkennungen tatsächlich liefern („SWR drei“,
„S W R 3“, „stopp“, „stop“).
"""

from __future__ import annotations

import re
from typing import Any

from . import ha
from .store import display_name, normalize_name

AUTOMATION_ID = "yapaia_beat_sprachbefehle"

# Die Sätze, auf die Home Assistant hört. Bewusst ohne ein nacktes „lauter“
# oder „stopp“: das gehört dem Sprachassistenten selbst (seine Lautstärke,
# seine Antwort abbrechen).
SAETZE: tuple[str, ...] = (
    "(spiel|spiele|spiel mal|spiele mal) {befehl}",
    "(schalte|schalt) [um] auf {befehl}",
    "(wechsle|wechsel) [um] (auf|zu|zum|zur) {befehl}",
    "(wechsle|wechsel) [die] [audio]ausgabe (auf|zu|zum|zur) {befehl}",
    "[audio]ausgabe (auf|über) {befehl}",
    "radio {befehl}",
    "musik {befehl}",
    "sender {befehl}",
    "(mach|mache|schalte|schalt|stell|stelle) [das|die] (radio|musik) {befehl}",
    "(stoppe|stopp|stop|beende|pausiere) [das|die] (radio|musik)",
    "[das|die] (radio|musik) (stoppen|ausschalten|aus|beenden)",
    "(nächster|nächsten|vorheriger|vorherigen|letzter) sender",
    "[einen] sender (weiter|vor|zurück)",
    "(welcher|was für ein) sender (läuft|ist das) [gerade]",
    "was läuft [gerade|da] [im radio]",
)

ZAHLWOERTER = {
    "null": "0", "eins": "1", "ein": "1", "zwei": "2", "drei": "3", "vier": "4", "fünf": "5",
    "sechs": "6", "sieben": "7", "acht": "8", "neun": "9", "zehn": "10",
}  # fmt: skip

# Wörter, die zu einem Sendernamen nichts beitragen
FUELLWOERTER = {
    "bitte", "mal", "den", "der", "die", "das", "dem", "sender", "radiosender", "radio", "im", "auf",
    "um", "zu", "zum", "zur", "jetzt", "wieder", "einen", "ein", "yapaia", "beat", "musik", "von",
}  # fmt: skip


def automation_konfig() -> dict[str, Any]:
    return {
        "alias": "Yapaia Beat Sprachbefehle",
        "description": (
            "Von Yapaia Beat angelegt. Leitet gesprochene Radio-Befehle an Yapaia Beat weiter und spricht die "
            "Antwort. Abschalten: Add-on-Option „Sprachbefehle“."
        ),
        "triggers": [{"trigger": "conversation", "command": list(SAETZE)}],
        "conditions": [],
        "actions": [
            {
                "action": "yapaia.beat_befehl",
                "data": {"text": "{{ trigger.sentence }}"},
                "response_variable": "yapaia",
                "continue_on_error": True,
            },
            {
                "set_conversation_response": (
                    "{{ (yapaia.values() | first).antwort if yapaia is defined and yapaia "
                    "else 'Yapaia Beat antwortet gerade nicht.' }}"
                )
            },
        ],
        "mode": "queued",
        "max": 5,
    }


async def einrichten(aktiv: bool) -> bool:
    """Automation in Home Assistant anlegen (überschreibt eine ältere mit
    derselben Kennung, so kommt eine neue Satzliste von selbst an) oder
    entfernen. ``True``, wenn Home Assistant es angenommen hat."""
    pfad = f"/core/api/config/automation/config/{AUTOMATION_ID}"
    if aktiv:
        return await ha._call("POST", pfad, automation_konfig()) is not None
    return await ha._call("DELETE", pfad) is not None


def _woerter(text: str) -> list[str]:
    text = re.sub(r"[^\wäöüß+]+", " ", text.lower())
    return [ZAHLWOERTER.get(w, w) for w in text.split()]


def _sender_finden(radio: Any, woerter: list[str]) -> dict[str, Any] | None:
    """Den Sender zu dem, was vom Satz übrig ist. Favoriten und empfangbare
    Sender gehen vor; „SWR 3“ und „swr3“ sind dasselbe."""
    band = None
    if any(w in ("dab", "dab+", "digital", "digitalradio") for w in woerter):
        band = "dab"
    elif any(w in ("ukw", "fm") for w in woerter):
        band = "fm"
    rest = [w for w in woerter if w not in FUELLWOERTER and w not in ("dab", "dab+", "digital", "digitalradio", "ukw", "fm")]
    gesucht = normalize_name("".join(rest))
    if not gesucht:
        return None
    favoriten = list(radio.store.favorites)

    def rang(st: dict[str, Any]) -> tuple[int, int, int]:
        return (
            0 if st["id"] in favoriten else 1,
            0 if st.get("available", True) else 1,
            len(normalize_name(display_name(st))),
        )

    alle = [s for s in radio.sorted_stations() if band is None or s["band"] == band]
    namen = [(s, {normalize_name(display_name(s)), normalize_name(s.get("name", ""))} - {""}) for s in alle]
    genau = [s for s, n in namen if gesucht in n]
    if genau:
        return min(genau, key=rang)
    # „SWR3 Baden-Württemberg“ für „swr3“ – und umgekehrt ein Sendername, der
    # ganz im Gesagten steckt („spiel bitte den sender swr3 rock“).
    teil = [s for s, n in namen if any(gesucht in x or (len(x) >= 3 and x in gesucht) for x in n)]
    return min(teil, key=rang) if teil else None


def _ausgabe_finden(radio: Any, woerter: list[str]) -> tuple[str, str] | None:
    """(Wert, Name) der gemeinten Ausgabe: ``local``, ``none`` oder die
    Entität eines Home-Assistant-Players."""
    satz = normalize_name("".join(woerter))
    beste: tuple[int, str, str] | None = None
    for p in radio.players:
        name = normalize_name(p["name"])
        # „Wohnzimmer“ für „Sonos Wohnzimmer“: jedes Wort des Namens zählt
        teile = [normalize_name(t) for t in re.split(r"[\s/_-]+", p["name"]) if len(normalize_name(t)) >= 3]
        treffer = len(name) if name and name in satz else max((len(t) for t in teile if t in satz), default=0)
        if treffer and (beste is None or treffer > beste[0]):
            beste = (treffer, p["entity_id"], p["name"])
    if beste:
        return beste[1], beste[2]
    if any(w in satz for w in ("minipc", "lokal", "eingebaut", "rechner")):
        return "local", "Mini-PC"
    if any(w in satz for w in ("browser", "stream")):
        return "none", "nur Browser"
    return None


def _laeuft(radio: Any) -> str:
    status = radio.status()
    sender = (status.get("station") or {}).get("name")
    if status.get("state") != "playing" or not sender:
        return "Das Radio ist aus."
    titel = " – ".join(t for t in (status.get("artist"), status.get("title")) if t)
    return f"Es läuft {sender}" + (f": {titel}." if titel else ".")


async def ausfuehren(radio: Any, text: str) -> str:
    """Führt den Satz aus und gibt die Antwort zurück, die gesprochen wird."""
    woerter = _woerter(text)
    satz = " ".join(woerter)

    def hat(*w: str) -> bool:
        return any(x in woerter for x in w)

    verben = ("spiel", "spiele", "schalte", "schalt", "wechsle", "wechsel", "mach", "mache", "stell", "stelle")
    ohne_verb = [w for w in woerter if w not in verben and w not in ("an", "ein", "einschalten")]

    if hat("ausgabe", "audioausgabe", "lautsprecher", "ausgang") or re.search(r"\b(radio|musik) (auf|über) (den|dem|die|das)\b", satz):
        ziel = _ausgabe_finden(radio, woerter)
        if ziel is None:
            namen = ", ".join(p["name"] for p in radio.players) or "keine weiteren"
            return f"Diese Ausgabe kenne ich nicht. Es gibt: Mini-PC, {namen}."
        wert, name = ziel
        if wert == "local":
            radio.set_speaker(None)
            await radio.set_local_output(True)
        else:
            await radio.set_local_output(False)
            radio.set_speaker(None if wert == "none" else wert)
        return f"Das Radio läuft jetzt über {name}."

    if hat("lauter", "leiser") or "lautstärke" in satz:
        zahl = next((int(w) for w in woerter if w.isdigit()), None)
        if hat("lauter", "leiser"):
            schritt = zahl if zahl and zahl <= 50 else 10
            radio.set_volume(radio.audio.volume + (schritt if hat("lauter") else -schritt))
        elif zahl is not None:
            radio.set_volume(zahl)
        else:
            return f"Die Lautstärke steht auf {radio.audio.volume} Prozent."
        return f"Lautstärke {radio.audio.volume} Prozent."

    if hat("welcher", "läuft") and not hat("spiel", "spiele"):
        return _laeuft(radio)

    if hat("nächster", "nächsten", "weiter", "vor") and hat("sender"):
        await radio.step(1)
        return _laeuft(radio)
    if hat("vorheriger", "vorherigen", "letzter", "zurück") and hat("sender"):
        await radio.step(-1)
        return _laeuft(radio)

    # Nach „Spiel …“ zuerst den Sender suchen: in einem Sendernamen darf auch
    # „aus“ oder „stop“ vorkommen.
    sender = _sender_finden(radio, ohne_verb) if hat("spiel", "spiele") else None
    if sender is None and hat("stoppe", "stopp", "stop", "stoppen", "aus", "ausschalten", "beende", "beenden", "pausiere", "pause"):
        await radio.stop()
        return "Radio aus."

    sender = sender or _sender_finden(radio, ohne_verb)
    if sender is not None:
        await radio.play(sender["id"])
        return f"{display_name(sender)} läuft."

    rest = [w for w in woerter if w not in FUELLWOERTER and w not in verben]
    if not rest or set(rest) <= {"an", "ein", "einschalten", "weiter", "etwas", "was"}:
        # „Radio an“, „Spiel Musik“: da weitermachen, wo es zuletzt lief
        station = radio.station
        if station and not station.get("transient"):
            await radio.play(station["id"])
        elif station:
            await radio.tune_fm(station["freq"])
        else:
            await radio.step(1)
        return _laeuft(radio) if radio.station else "Ich habe noch keinen Sender. Bitte erst einen Suchlauf starten."

    # Ein Ziel ohne das Wort „Ausgabe“: „Wechsle auf Wohnzimmer“
    ziel = _ausgabe_finden(radio, woerter)
    if ziel is not None and ziel[0] not in ("local", "none"):
        await radio.set_local_output(False)
        radio.set_speaker(ziel[0])
        return f"Das Radio läuft jetzt über {ziel[1]}."
    return f"Den Sender „{' '.join(rest)}“ kenne ich nicht."
