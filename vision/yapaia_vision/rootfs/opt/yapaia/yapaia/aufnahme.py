"""Die Aufnahme: ein ffmpeg je Gerät, JPEG-Bilder an alle, die zusehen.

─── WIE UMGESCHALTET WIRD ──────────────────────────────────────────────────
Teilen sich mehrere Kanäle ein Gerät (ein Grabber, vier Eingänge), läuft
immer nur einer: der GEWÄHLTE. Gewählt wird

* ausdrücklich -- über die Auswahl in Home Assistant, die Aktion
  `yapaia.vision_kanal_waehlen` oder die Seite des Add-ons. Das gilt, bis
  wieder ausdrücklich gewählt wird.
* durch Zusehen -- wer den Live-Strom eines anderen Kanals öffnet, schaltet
  um, solange dem gewählten gerade NIEMAND live zusieht. Wer hinsieht, wird
  nicht weggeschaltet.

Standbilder schalten NIE um. Home Assistant holt für jede Kamera-Kachel alle
paar Sekunden ein Standbild; schalteten die, stritten sich vier Kacheln
ununterbrochen um einen Eingang. Für einen nicht gewählten Kanal gibt es
deshalb das letzte Bild, das er hatte (oder keins).

─── WANN AUFGENOMMEN WIRD ─────────────────────────────────────────────────
Nur bei Bedarf: solange jemand live zusieht, und `nachlauf_s` danach. Ein
Standbild startet die Aufnahme ebenfalls und wartet kurz auf das erste Bild.
Mit `immer_an` läuft sie durch -- dann ist das Bild der Rückfahrkamera sofort
da statt nach etwa einer Sekunde.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import tempfile
import time
from collections.abc import Callable
from pathlib import Path

from . import somagic
from .config import Kanal, Options
from .quellen import TESTGERAET, Geraet, Quelle

_LOGGER = logging.getLogger(__name__)

SOI = b"\xff\xd8"
EOI = b"\xff\xd9"
# Länger als das hier ohne Bild = ffmpeg hängt (Stecker gezogen, Treiber weg).
STILLE_S = 10
NEUSTART_MAX_S = 30
# Nach dem Start (und nach jedem Umschalten) braucht der Decoder im Grabber
# einen Moment, bis die Farbe eingerastet ist. Gesehen am EasyCAP002 mit
# NTSC-Kamera (2026-10-16): das erste Bild oben grau, unten übersättigt.
# Diese Bilder kommen nicht heraus -- ein halbe Sekunde später ist es richtig.
ANLAUF_BILDER = 15


class JpegZerleger:
    """Trennt den Strom von `-f image2pipe -c:v mjpeg` in einzelne Bilder.

    Ein JPEG beginnt mit FFD8 und endet mit FFD9. Innerhalb der Bilddaten
    kommt FFD9 nicht vor (0xFF wird dort als FF00 geschrieben), und ffmpeg
    hängt kein Vorschaubild mit eigenem FFD9 an."""

    def __init__(self, max_bytes: int = 8 * 1024 * 1024) -> None:
        self._puffer = bytearray()
        self._max = max_bytes

    def fuettern(self, daten: bytes) -> list[bytes]:
        self._puffer += daten
        bilder: list[bytes] = []
        while True:
            anfang = self._puffer.find(SOI)
            if anfang < 0:
                self._puffer.clear()
                break
            ende = self._puffer.find(EOI, anfang + 2)
            if ende < 0:
                if anfang:
                    del self._puffer[:anfang]
                if len(self._puffer) > self._max:
                    self._puffer.clear()
                break
            bilder.append(bytes(self._puffer[anfang : ende + 2]))
            del self._puffer[: ende + 2]
        return bilder


def ffmpeg_befehl(opts: Options, quelle: Quelle, kanal: Kanal, geraet: Geraet | None, textdatei: Path | None) -> list[str]:
    """Der ffmpeg-Aufruf für einen Kanal. Ohne Seiteneffekte, damit testbar."""
    breite, hoehe = opts.breite_hoehe
    fps = max(1, min(30, opts.bilder_pro_sekunde))
    filter_: list[str] = []
    if quelle.geraet == TESTGERAET:
        eingabe = ["-re", "-f", "lavfi", "-i", f"testsrc2=size={breite}x{hoehe}:rate={fps}"]
        if textdatei is not None:
            # Name aus einer Datei statt im Filter: so muss nichts im Namen
            # (Doppelpunkte, Anführungszeichen) für ffmpeg maskiert werden.
            groesse = max(16, hoehe // 12)
            filter_.append(
                f"drawtext=textfile={textdatei}:fontcolor=white:fontsize={groesse}"
                ":box=1:boxcolor=black@0.6:boxborderw=12:x=(w-tw)/2:y=h/3"
            )
            filter_.append(
                f"drawtext=text='%{{localtime}}':fontcolor=white:fontsize={groesse * 2 // 3}"
                ":box=1:boxcolor=black@0.6:boxborderw=8:x=(w-tw)/2:y=h/3+th*3"
            )
    elif geraet is not None and geraet.treiber == "somagic":
        # Rohes UYVY von somagic-capture (siehe `vorstufe`) über stdin.
        rb, rh, rfps = somagic.rohformat(opts.norm)
        eingabe = ["-f", "rawvideo", "-pix_fmt", "uyvy422", "-video_size", f"{rb}x{rh}", "-framerate", rfps, "-i", "-"]
        if opts.entflechten:
            filter_.append("yadif")
        if (rb, rh) != (breite, hoehe):
            filter_.append(f"scale={breite}:{hoehe}")
        filter_.append(f"fps={fps}")
    else:
        eingabe = ["-f", "v4l2"]
        if geraet is None or geraet.normen:
            eingabe += ["-standard", opts.norm]
        if geraet is None or len(geraet.eingaenge) > 1 or quelle.eingang:
            eingabe += ["-channel", str(quelle.eingang)]
        eingabe += ["-video_size", f"{breite}x{hoehe}", "-i", quelle.geraet]
        if opts.entflechten:
            filter_.append("yadif")
        filter_.append(f"fps={fps}")
    befehl = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", *eingabe]
    if filter_:
        befehl += ["-vf", ",".join(filter_)]
    befehl += ["-f", "image2pipe", "-c:v", "mjpeg", "-q:v", str(max(2, min(31, opts.qualitaet))), "-"]
    return befehl


def vorstufe(opts: Options, quelle: Quelle, geraet: Geraet | None) -> list[str] | None:
    """Ein Programm, das ffmpeg das Bild liefert -- nur für den Somagic."""
    if geraet is not None and geraet.treiber == "somagic":
        return somagic.capture_befehl(opts.norm, quelle.eingang)
    return None


class Erfassung:
    """Ein Gerät und die Kanäle, die es sich teilen."""

    def __init__(
        self,
        opts: Options,
        pfad: str,
        kanaele: list[tuple[Kanal, Quelle]],
        geraet: Geraet | None,
        gemeldet: Callable[[], None],
    ) -> None:
        self.opts = opts
        self.pfad = pfad
        self.kanaele = {k.nummer: (k, q) for k, q in kanaele}
        self.geraet = geraet
        self._gemeldet = gemeldet
        self.gewaehlt = next(iter(self.kanaele))
        self.letzte: dict[int, bytes] = {}
        self.zeit: dict[int, float] = {}
        self._abos: dict[int, set[asyncio.Queue[bytes]]] = {n: set() for n in self.kanaele}
        self._bedarf = 0.0
        self._task: asyncio.Task | None = None
        self._neues_bild = asyncio.Event()
        self.laeuft = False
        self.fehler: str | None = None

    # ─── Von außen ─────────────────────────────────────────────────────────
    def waehlen(self, nummer: int) -> None:
        if nummer not in self.kanaele or nummer == self.gewaehlt:
            return
        _LOGGER.info("%s: umschalten auf %s", self.pfad, self.kanaele[nummer][0].name)
        self.gewaehlt = nummer
        self._neu_starten()
        self._gemeldet()

    async def standbild(self, nummer: int, warten_s: float = 5.0) -> bytes | None:
        self._bedarf = time.monotonic()
        if nummer != self.gewaehlt:
            return self.letzte.get(nummer)
        frisch = self.zeit.get(nummer, 0) > time.monotonic() - 2
        if not frisch:
            self._sicherstellen()
            self._neues_bild.clear()
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self._neues_bild.wait(), warten_s)
        return self.letzte.get(nummer)

    def abonnieren(self, nummer: int) -> asyncio.Queue[bytes]:
        q: asyncio.Queue[bytes] = asyncio.Queue(maxsize=2)
        if nummer != self.gewaehlt and not self._abos[self.gewaehlt]:
            self.waehlen(nummer)
        self._abos[nummer].add(q)
        self._bedarf = time.monotonic()
        if nummer in self.letzte:
            q.put_nowait(self.letzte[nummer])
        self._sicherstellen()
        return q

    def abmelden(self, nummer: int, q: asyncio.Queue[bytes]) -> None:
        self._abos[nummer].discard(q)
        self._bedarf = time.monotonic()

    def starten(self) -> None:
        """Für `immer_an`: die Aufnahme ohne Zuschauer anwerfen."""
        self._sicherstellen()

    def zuschauer(self, nummer: int) -> int:
        return len(self._abos.get(nummer, ()))

    # ─── Ablauf ────────────────────────────────────────────────────────────
    def _gebraucht(self) -> bool:
        if self.opts.immer_an:
            return True
        if any(self._abos.values()):
            return True
        return time.monotonic() - self._bedarf < max(5, self.opts.nachlauf_s)

    def _sicherstellen(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._schleife(), name=f"aufnahme {self.pfad}")

    def _neu_starten(self) -> None:
        alt = self._task
        if alt is None or alt.done():
            return
        alt.cancel()

        async def danach() -> None:
            # Erst wenn der alte ffmpeg das Gerät freigegeben hat -- sonst
            # bekäme der neue „Device or resource busy“.
            with contextlib.suppress(asyncio.CancelledError):
                await alt
            await self._schleife()

        self._task = asyncio.create_task(danach(), name=f"aufnahme {self.pfad}")

    async def stoppen(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _schleife(self) -> None:
        pause = 1.0
        try:
            while self._gebraucht():
                ok = await self._einmal(self.gewaehlt)
                if not self._gebraucht():
                    break
                if ok:
                    pause = 1.0
                else:
                    await asyncio.sleep(pause)
                    pause = min(NEUSTART_MAX_S, pause * 2)
        finally:
            if self.laeuft:
                self.laeuft = False
                self._gemeldet()

    async def _einmal(self, nummer: int) -> bool:
        """Ein ffmpeg-Lauf. `True`, wenn er Bilder lieferte."""
        kanal, quelle = self.kanaele[nummer]
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write(f"Kanal {kanal.nummer} · {kanal.name}")
            textdatei = Path(f.name)
        befehl = ffmpeg_befehl(self.opts, quelle, kanal, self.geraet, textdatei)
        vor_befehl = vorstufe(self.opts, quelle, self.geraet)
        _LOGGER.debug("Starte %s%s", " ".join(vor_befehl) + " | " if vor_befehl else "", " ".join(befehl))
        vor: asyncio.subprocess.Process | None = None
        try:
            if vor_befehl:
                lesen, schreiben = os.pipe()
                try:
                    vor = await asyncio.create_subprocess_exec(
                        *vor_befehl, stdout=schreiben, stderr=asyncio.subprocess.PIPE
                    )
                    proc = await asyncio.create_subprocess_exec(
                        *befehl, stdin=lesen, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                    )
                finally:
                    os.close(lesen)
                    os.close(schreiben)
            else:
                proc = await asyncio.create_subprocess_exec(
                    *befehl, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
        except OSError as err:
            self._fehler(f"{(vor_befehl or befehl)[0]} nicht startbar: {err}")
            textdatei.unlink(missing_ok=True)
            if vor is not None:
                await _beenden(vor)
            return False
        zerleger = JpegZerleger()
        bilder = 0
        fehlertext = b""

        async def stderr_lesen(p: asyncio.subprocess.Process) -> None:
            nonlocal fehlertext
            assert p.stderr is not None
            async for zeile in p.stderr:
                fehlertext = (fehlertext + zeile)[-2000:]

        stderr_tasks = [asyncio.create_task(stderr_lesen(p)) for p in (vor, proc) if p is not None]
        try:
            assert proc.stdout is not None
            while self._gebraucht():
                try:
                    daten = await asyncio.wait_for(proc.stdout.read(65536), STILLE_S)
                except asyncio.TimeoutError:
                    self._fehler(f"{self.pfad}: seit {STILLE_S} s kein Bild – Kamera angeschlossen?")
                    break
                if not daten:
                    break
                for bild in zerleger.fuettern(daten):
                    bilder += 1
                    if bilder == 1:
                        self.laeuft = True
                        self.fehler = None
                        self._gemeldet()
                    if vor_befehl and bilder <= ANLAUF_BILDER:
                        continue
                    self._verteilen(nummer, bild)
        finally:
            # Die Vorstufe zuerst: sie hält den USB-Stick, und der nächste
            # Lauf (anderer Eingang) bekommt ihn erst, wenn sie weg ist.
            for p in (vor, proc):
                if p is not None:
                    await _beenden(p)
            for t in stderr_tasks:
                t.cancel()
            textdatei.unlink(missing_ok=True)
        if bilder == 0 and self._gebraucht():
            text = fehlertext.decode(errors="replace").strip().splitlines()
            self._fehler(f"{self.pfad}: ffmpeg endete ohne Bild ({text[-1] if text else proc.returncode})")
        return bilder > 0

    def _verteilen(self, nummer: int, bild: bytes) -> None:
        self.letzte[nummer] = bild
        self.zeit[nummer] = time.monotonic()
        self._neues_bild.set()
        for q in self._abos[nummer]:
            if q.full():
                with contextlib.suppress(asyncio.QueueEmpty):
                    q.get_nowait()
            q.put_nowait(bild)

    def _fehler(self, text: str) -> None:
        if text != self.fehler:
            _LOGGER.warning("%s", text)
            self.fehler = text
            self._gemeldet()


async def _beenden(p: asyncio.subprocess.Process) -> None:
    if p.returncode is not None:
        return
    with contextlib.suppress(ProcessLookupError):
        p.terminate()
    try:
        await asyncio.wait_for(p.wait(), 3)
    except asyncio.TimeoutError:
        with contextlib.suppress(ProcessLookupError):
            p.kill()
        await p.wait()
