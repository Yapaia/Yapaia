"""Fahrten erkennen und auswerten – ohne Home Assistant, damit live und beim
Nachtragen aus dem Recorder genau dasselbe passiert.

Eingang sind Ereignisse `(zeit, rolle, wert)` in zeitlicher Reihenfolge:

* `position` – `(lat, lon)`; daraus Strecke, Tempo, Spur, Start und Ende,
* alle anderen Rollen (siehe `ROLLEN`) – Zustand als Text oder Zahl.

Eine Fahrt beginnt mit der ersten Bewegung (über 8 km/h, sobald 100 m
erreicht sind) und endet, wenn
die Zündung ausgeht oder sich das Fahrzeug 6 Minuten nicht bewegt hat.
Fahrten unter 1 km werden verworfen (Rangieren, GPS-Sprünge).
"""

from __future__ import annotations

import math
from typing import Any, Callable

# Rolle → Bedeutung (die Entitäten dazu stehen in den Einstellungen)
ROLLEN = {
    "position": "device_tracker mit latitude/longitude",
    "zuendung": "binary_sensor Zündung",
    "kilometerstand": "sensor km",
    "tempo": "sensor km/h (Tacho)",
    "drehzahl": "sensor 1/min",
    "gang": "sensor Gang (1–6, 14 = R, 15 = N)",
    "tempomat": "binary_sensor Tempomat regelt",
    "bremse": "sensor Bremse (> 0 = gebremst) oder binary_sensor",
    "blinker_links": "binary_sensor",
    "blinker_rechts": "binary_sensor",
    "aussentemperatur": "sensor °C",
    "bordspannung": "sensor V",
    "tank": "sensor Tankinhalt (roh, l oder %)",
    "verbrauch": "sensor Ø-Verbrauch l/100 km (Bordcomputer)",
    "momentanverbrauch": "sensor l/100 km gerade jetzt (färbt die Route)",
    "land": "sensor Land",
    "ort": "sensor Ort",
    "adresse": "sensor Adresse",
    "hoehe": "sensor m",
}

START_KMH = 8.0          # ab diesem Tempo gilt: fährt
STEH_KMH = 3.0           # darunter: steht
MAX_KMH = 180.0          # darüber: GPS-Sprung
MAX_LUECKE = 120.0       # s; größere Lücken zählen nicht als Strecke
STILLSTAND_ENDE = 360.0  # s ohne Bewegung → Fahrt zu Ende
SPUR_ABSTAND = 5.0       # s zwischen zwei gespeicherten Spurpunkten
START_STRECKE = 0.1      # km vom ersten bewegten Punkt, bis eine Fahrt beginnt
START_FENSTER = 120.0    # s, in denen diese Strecke erreicht sein muss
POS_ABSTAND = 10.0       # s; dichtere Positionen werden übersprungen (GPS-Zittern im Stand)
MIN_KM = 1.0
BLINK_PAUSE = 5.0        # s; kürzere Pausen gehören zum selben Blinken
KM_GRUPPE = 500.0        # km; Kilometerstände näher beieinander gehören zu einer Gruppe
NACHLAUF = 3600.0        # s; so lange nach dem Ende werden späte Werte (Ort, Verbrauch) noch nachgetragen

GANG_NAMEN = {"14": "R", "15": "N", "0": "N"}
UNGUELTIG = {None, "", "unknown", "unavailable", "none"}


def entfernung_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(min(1.0, h)))


def zahl(wert: Any) -> float | None:
    if isinstance(wert, (int, float)) and not isinstance(wert, bool):
        return float(wert)
    try:
        return float(str(wert).replace(",", "."))
    except (TypeError, ValueError):
        return None


def an(wert: Any) -> bool | None:
    if wert in UNGUELTIG:
        return None
    if isinstance(wert, bool):
        return wert
    s = str(wert).lower()
    if s in ("on", "true", "an", "1"):
        return True
    if s in ("off", "false", "aus", "0"):
        return False
    z = zahl(wert)
    return None if z is None else z > 0


def gang_name(wert: Any) -> str | None:
    if wert in UNGUELTIG:
        return None
    s = str(wert).strip()
    z = zahl(s)
    if z is not None and z == int(z):
        s = str(int(z))
    return GANG_NAMEN.get(s, s)


class Fahrtenbuch:
    """Nimmt Ereignisse an und liefert fertige Fahrten an `fertig`."""

    def __init__(self, fertig: Callable[[dict[str, Any]], None], hat_zuendung: bool = False,
                 lokalzeit: Callable[[float], str] | None = None) -> None:
        self.fertig = fertig
        self.hat_zuendung = hat_zuendung
        self.lokalzeit = lokalzeit or (lambda t: str(t))
        self.werte: dict[str, Any] = {}       # letzter gültiger Wert je Rolle
        self.letzte_pos: tuple[float, float, float] | None = None  # (t, lat, lon)
        self.fahrt: dict[str, Any] | None = None
        self._kandidat: tuple[float, float, float] | None = None  # erster bewegter Punkt
        self.nachlauf: dict[str, Any] | None = None  # zuletzt fertige Fahrt (für späte Werte)
        self.nachlauf_t = 0.0

    # ---- Zustand sichern (laufende Fahrt übersteht einen Neustart) ---------
    def zustand(self) -> dict[str, Any]:
        return {"werte": self.werte, "letzte_pos": self.letzte_pos, "fahrt": self.fahrt}

    def wiederherstellen(self, z: dict[str, Any]) -> None:
        self.werte = dict(z.get("werte") or {})
        lp = z.get("letzte_pos")
        self.letzte_pos = tuple(lp) if lp else None  # type: ignore[assignment]
        self.fahrt = z.get("fahrt")

    # ---- Eingang ------------------------------------------------------------
    def ereignis(self, t: float, rolle: str, wert: Any) -> None:
        self.pruefen(t)
        if rolle == "position":
            self._position(t, wert)
            return
        f = self.fahrt
        if wert == "unavailable":
            # Quelle weg: Wert unbekannt – nicht den alten weiterverwenden
            # (z. B. Zündung „aus“ oder km von gestern). „unknown“ kommt auch
            # zwischendurch und zählt nicht.
            self.werte.pop(rolle, None)
            return
        if rolle == "kilometerstand":
            # Nur während der Fahrt gesammelt, in Gruppen nahe beieinander
            # liegender Werte – Lesefehler (z. B. falsch maskierte Bits)
            # bilden eigene Gruppen; am Ende gilt die zur GPS-Strecke passende.
            z = zahl(wert)
            if z is not None and f is not None:
                self._km_gruppe(f, z)
            return
        if rolle == "gang":
            wert = gang_name(wert)
        elif rolle in ("zuendung", "tempomat", "blinker_links", "blinker_rechts", "bremse"):
            wert = an(wert)
        elif rolle in ("drehzahl", "tempo", "aussentemperatur", "bordspannung", "tank", "verbrauch", "momentanverbrauch", "hoehe"):
            wert = zahl(wert)
        elif wert in UNGUELTIG:
            wert = None
        if wert is None:
            return
        self._nachtragen(t, rolle, wert)
        alt = self.werte.get(rolle)
        if f is not None:
            self._zeit_buchen(f, t)
            self._auswerten(f, t, rolle, alt, wert)
        self.werte[rolle] = wert
        if rolle == "zuendung" and wert is False and f is not None:
            self._beenden(f["letzte_bewegung"])

    def _nachtragen(self, t: float, rolle: str, wert: Any) -> None:
        """Späte Werte zur zuletzt fertigen Fahrt; geänderte Fahrt erneut melden."""
        n = self.nachlauf
        if n is None or self.fahrt is not None or t - self.nachlauf_t > NACHLAUF:
            return
        feld = {"verbrauch": "verbrauch_l100", "ort": "nach", "adresse": "nach_adr"}.get(rolle)
        if feld and n.get(feld) is None:
            n[feld] = wert
            self.fertig(n)

    def pruefen(self, t: float) -> None:
        """Ende durch Stillstand – auch ohne neue Ereignisse (Zeitgeber)."""
        f = self.fahrt
        if f is not None and t - f["letzte_bewegung"] > STILLSTAND_ENDE:
            self._beenden(f["letzte_bewegung"])

    def abschliessen(self) -> None:
        """Am Ende des Nachtragens: offene Fahrt beenden."""
        if self.fahrt is not None:
            self._beenden(self.fahrt["letzte_bewegung"])

    # ---- Position -----------------------------------------------------------
    def _position(self, t: float, wert: Any) -> None:
        lat, lon = float(wert[0]), float(wert[1])
        if self.letzte_pos is not None and 0 <= t - self.letzte_pos[0] < POS_ABSTAND:
            return
        vorher, self.letzte_pos = self.letzte_pos, (t, lat, lon)
        if vorher is None:
            return
        dt = t - vorher[0]
        if dt <= 0:
            self.letzte_pos = vorher
            return
        d = entfernung_km((vorher[1], vorher[2]), (lat, lon))
        kmh = d / dt * 3600
        luecke = dt > MAX_LUECKE or kmh > MAX_KMH
        f = self.fahrt
        if f is None:
            # Beginn erst, wenn es sich wirklich bewegt: ≥ 100 m vom ersten
            # bewegten Punkt (GPS-Zittern und Sprünge nach Neustart bleiben darunter)
            k = self._kandidat
            if luecke or self.werte.get("zuendung") is False or (k is None and kmh < START_KMH):
                self._kandidat = None
                return
            if k is None or t - k[0] > START_FENSTER:
                self._kandidat = vorher if kmh >= START_KMH else None
                return
            if entfernung_km((k[1], k[2]), (lat, lon)) < START_STRECKE:
                return
            self._kandidat = None
            f = self._beginnen(k)
            d = entfernung_km((k[1], k[2]), (lat, lon))
            dt = t - k[0]
            kmh = d / dt * 3600
        if not luecke:
            f["km_gps"] += d
            if kmh < STEH_KMH:
                f["steh_s"] += dt
            else:
                f["letzte_bewegung"] = t if kmh >= START_KMH else f["letzte_bewegung"]
            f["_km_lauf"] = f["km_gps"]
        if t - f["_spur_t"] >= SPUR_ABSTAND:
            f["spur"].append(self._punkt(lat, lon, 0 if luecke else round(min(kmh, 160))))
            f["_spur_t"] = t

    # ---- Fahrt --------------------------------------------------------------
    def _beginnen(self, p: tuple[float, float, float]) -> dict[str, Any]:
        w = self.werte
        f: dict[str, Any] = {
            "t_start": p[0], "letzte_bewegung": p[0], "km_gps": 0.0, "steh_s": 0.0,
            "spur": [self._punkt(p[1], p[2], 0)], "_spur_t": p[0], "_km_lauf": 0.0,
            "von": w.get("ort"), "von_adr": w.get("adresse"), "land_start": w.get("land"),
            "km_gruppen": [], "tank_start": w.get("tank"),
            "grenzen": [], "laender_km": {}, "_land": w.get("land"), "_land_km": 0.0,
            "bremsungen": 0, "blinker": 0, "_blink_t": {}, "gaenge_s": {}, "tempomat_s": 0.0,
            "_t": p[0], "max": {}, "min": {},
        }
        for rolle in ("aussentemperatur", "bordspannung", "hoehe", "drehzahl", "tempo"):
            if isinstance(w.get(rolle), (int, float)):
                self._minmax(f, rolle, w[rolle])
        self.fahrt = f
        return f

    def _punkt(self, lat: float, lon: float, kmh: float) -> list[Any]:
        """Spurpunkt [lat, lon, km/h, Höhe m, l/100 km]; Unbekanntes als None."""
        h, mv = self.werte.get("hoehe"), self.werte.get("momentanverbrauch")
        return [round(lat, 5), round(lon, 5), kmh, None if h is None else round(h),
                None if mv is None else round(mv, 1)]

    @staticmethod
    def _km_gruppe(f: dict[str, Any], z: float) -> None:
        for g in f["km_gruppen"]:
            if g[0] - KM_GRUPPE < z < g[1] + KM_GRUPPE:
                g[0], g[1], g[2] = min(g[0], z), max(g[1], z), g[2] + 1
                return
        if len(f["km_gruppen"]) < 30:
            f["km_gruppen"].append([z, z, 1])

    @staticmethod
    def _km_waehlen(f: dict[str, Any]) -> list[float] | None:
        """Die Gruppe, deren Spanne zur GPS-Strecke passt (±25 %); passen mehrere,
        die kleinste – falsch gelesene Bits machen den Wert größer, nie kleiner."""
        km = f["km_gps"]
        passend = [g for g in f["km_gruppen"] if g[2] >= 3 and 0.75 * km - 1 <= g[1] - g[0] <= 1.25 * km + 1]
        if not passend:
            return None
        g = min(passend, key=lambda g: g[0])
        return [g[0], g[1]]

    @staticmethod
    def _minmax(f: dict[str, Any], rolle: str, v: float) -> None:
        f["max"][rolle] = max(v, f["max"].get(rolle, v))
        f["min"][rolle] = min(v, f["min"].get(rolle, v))

    def _zeit_buchen(self, f: dict[str, Any], t: float) -> None:
        """Zeitanteile (Gang, Tempomat) bis `t` aufaddieren."""
        dt = t - f["_t"]
        if dt <= 0:
            return
        g = self.werte.get("gang")
        if g is not None:
            f["gaenge_s"][g] = f["gaenge_s"].get(g, 0.0) + dt
        if self.werte.get("tempomat"):
            f["tempomat_s"] += dt
        f["_t"] = t

    def _auswerten(self, f: dict[str, Any], t: float, rolle: str, alt: Any, wert: Any) -> None:
        if isinstance(wert, (int, float)) and not isinstance(wert, bool) and rolle in (
                "aussentemperatur", "bordspannung", "hoehe", "drehzahl", "tempo"):
            self._minmax(f, rolle, wert)
        elif rolle == "bremse" and wert and not alt:
            f["bremsungen"] += 1
        elif rolle in ("blinker_links", "blinker_rechts") and wert:
            if t - f["_blink_t"].get(rolle, -1e9) > BLINK_PAUSE:
                f["blinker"] += 1
            f["_blink_t"][rolle] = t
        elif rolle in ("blinker_links", "blinker_rechts"):
            f["_blink_t"][rolle] = t
        elif rolle == "land" and wert != f["_land"]:
            if f["_land"] is not None:
                km = f["km_gps"] - f["_land_km"]
                f["laender_km"][f["_land"]] = f["laender_km"].get(f["_land"], 0.0) + km
                pos = self.letzte_pos
                f["grenzen"].append({"zeit": self.lokalzeit(t), "pos": [pos[1], pos[2]] if pos else None,
                                     "von": f["_land"], "nach": wert})
            else:
                f["land_start"] = wert
            f["_land"], f["_land_km"] = wert, f["km_gps"]
        elif rolle == "tank" and f["tank_start"] is None:
            f["tank_start"] = wert
        elif rolle == "ort" and f["von"] is None:
            f["von"] = wert
        elif rolle == "adresse" and f["von_adr"] is None:
            f["von_adr"] = wert

    def _beenden(self, t_ende: float) -> None:
        f, self.fahrt = self.fahrt, None
        if f is None or f["km_gps"] < MIN_KM:
            return
        self._zeit_buchen(f, max(t_ende, f["_t"]))
        w = self.werte
        dauer = max(1.0, t_ende - f["t_start"])
        aus: dict[str, Any] = {
            "start": self.lokalzeit(f["t_start"]), "ende": self.lokalzeit(t_ende),
            "dauer_min": round(dauer / 60), "km_gps": round(f["km_gps"], 1),
            "von": f["von"], "nach": w.get("ort"), "von_adr": f["von_adr"], "nach_adr": w.get("adresse"),
            "steh_min": round(f["steh_s"] / 60), "land_start": f["land_start"],
            "spur": f["spur"], "quelle": "gps",
        }
        if "hoehe" in f["max"]:
            aus["hoehe"] = [f["min"]["hoehe"], f["max"]["hoehe"]]
        if f["grenzen"]:
            lk = dict(f["laender_km"])
            lk[f["_land"]] = lk.get(f["_land"], 0.0) + f["km_gps"] - f["_land_km"]
            aus["laender"] = {k: round(v) for k, v in lk.items()}
            aus["grenzen"] = f["grenzen"]
        km = self._km_waehlen(f)
        if km:
            aus["quelle"] = "can"
            aus["km_tacho"] = round(km[1] - km[0], 1)
            aus["km_stand"] = km
        if "drehzahl" in f["max"]:
            aus["drehzahl_max"] = f["max"]["drehzahl"]
            aus["quelle"] = "can"
        if "tempo" in f["max"]:
            aus["vmax"] = f["max"]["tempo"]
        if "aussentemperatur" in f["max"]:
            aus["temp"] = [f["min"]["aussentemperatur"], f["max"]["aussentemperatur"]]
        if "bordspannung" in f["max"]:
            aus["batterie"] = [round(f["min"]["bordspannung"], 2), round(f["max"]["bordspannung"], 2)]
        if f["tank_start"] is not None and w.get("tank") is not None:
            aus["tank_roh"] = [f["tank_start"], w["tank"]]
        if w.get("verbrauch") is not None:
            aus["verbrauch_l100"] = w["verbrauch"]
        if f["gaenge_s"]:
            aus["gaenge_min"] = {k: round(v / 60, 1) for k, v in sorted(f["gaenge_s"].items())}
        if "tempomat" in w:
            aus["tempomat_anteil"] = round(f["tempomat_s"] / dauer, 3)
        if "bremse" in w:
            aus["bremsungen"] = f["bremsungen"]
        if "blinker_links" in w or "blinker_rechts" in w:
            aus["blinker"] = f["blinker"]
        self.nachlauf, self.nachlauf_t = aus, t_ende
        self.fertig(aus)
