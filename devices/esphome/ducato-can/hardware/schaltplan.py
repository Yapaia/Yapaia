"""Zeichnet die Schaltplan-Blätter für das Ducato-CAN-Gerät als SVG.

Darstellung mit Netznamen: Jeder Baustein bekommt kurze Anschlussstummel mit
Netznamen (blau). Gleiche Netznamen sind miteinander verbunden. Die kleinen
Beschaltungen (Pull-ups, Jumper, Schutzdioden) stehen daneben.

Aufruf (benötigt `pip install schemdraw`):
    python schaltplan.py schaltplan/
"""
import re
import sys
from pathlib import Path

import schemdraw
import schemdraw.elements as elm

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
schemdraw.config(fontsize=11, lw=1.3, bgcolor="white")  # weiß, damit es auch im Dunkelmodus lesbar ist
BLAU = "#1f4e9c"
GRAU = "#555555"
ROT = "#a33333"
SIDE_LOC = {"left": "left", "right": "right", "up": "top", "down": "bottom"}


def ic(d, at, top_down, size, label, spacing=0.9, extra=None):
    """IC mit Pins je Seite in Lesereihenfolge (oben nach unten / links nach rechts).

    top_down: {"left": [(name, pin, anchor, invert)], "right": [...], "top": [...], "bottom": [...]}
    """
    pins = []
    for side, lst in top_down.items():
        seq = lst if side in ("top", "bottom") else list(reversed(lst))
        for name, pin, anchor, inv in seq:
            pins.append(elm.IcPin(name=name, pin=pin, side=side, anchorname=anchor, invert=inv))
    u = d.add(elm.Ic(pins=pins, size=size, pinspacing=spacing).at(at))
    cx, cy = u.center
    d.add(elm.Label().at((cx - size[0] / 2 - 0.3, cy - size[1] / 2 - 0.3))
          .label(label, halign="right", valign="top", fontsize=12))
    return u


def stub(d, at, direction, name, length=1.2, color=BLAU):
    ln = d.add(getattr(elm.Line(), direction)().at(at).length(length))
    netlabel(d, ln.end, name, loc={"up": "top", "down": "top"}.get(direction, direction))
    return ln


def rail(d, at, name, length=0.5):
    ln = d.add(elm.Line().up().at(at).length(length))
    d.add(elm.Vdd().at(ln.end).label(name))


def gnd(d, at, length=0.5):
    ln = d.add(elm.Line().down().at(at).length(length))
    d.add(elm.Ground().at(ln.end))


def netlabel(d, at, name, loc="left"):
    x, y = at
    if loc == "left":
        d.add(elm.Label().at((x - 0.15, y)).label(name, halign="right", valign="center", color=BLAU))
    elif loc == "right":
        d.add(elm.Label().at((x + 0.15, y)).label(name, halign="left", valign="center", color=BLAU))
    else:
        d.add(elm.Label().at((x, y + 0.2)).label(name, halign="center", valign="bottom", color=BLAU))


def pullup(d, at, net, value, to="+3V3", ref=""):
    """Netz ── Widerstand ── Versorgung (nach rechts)."""
    netlabel(d, at, net)
    d.add(elm.Line().right().at(at).length(0.4))
    r = d.add(elm.Resistor().right().length(2.0).label(f"{ref}\n{value}".strip(), loc="top"))
    d.add(elm.Line().right().length(0.4))
    if to == "GND":
        d.add(elm.Ground())
    else:
        d.add(elm.Vdd().label(to))


def _len(element, length):
    """Länge setzen, falls das Bauteil zwei Anschlüsse hat (Jumper hat keine Länge)."""
    try:
        return element.length(length)
    except AttributeError:
        return element


def series(d, at, net_a, element, net_b, length=2.4):
    """element ist eine Funktion, die das Bauteil erst hier erzeugt (sonst setzt schemdraw es zu früh)."""
    netlabel(d, at, net_a)
    d.add(elm.Line().right().at(at).length(0.4))
    e = d.add(_len(element().right(), length))
    ln = d.add(elm.Line().right().length(0.4))
    netlabel(d, ln.end, net_b, loc="right")


def shunt(d, at, net, element):
    """Netz ── Bauteil ── Masse (nach rechts, dann Masse)."""
    netlabel(d, at, net)
    d.add(elm.Line().right().at(at).length(0.4))
    d.add(_len(element().right(), 2.0))
    d.add(elm.Line().right().length(0.4))
    d.add(elm.Ground())


def note(d, at, text, color=GRAU, size=10):
    d.add(elm.Label().at(at).label(text, halign="left", valign="top", fontsize=size, color=color))


def finish(d, name, heading, sub):
    bb = d.get_bbox()
    x0, y1 = bb.xmin, bb.ymax
    d.add(elm.Dot(radius=0.01, color="white").at((bb.xmax + 3.5, bb.ymin)))
    d.add(elm.Label().at((x0, y1 + 1.9)).label(heading, halign="left", fontsize=15))
    d.add(elm.Label().at((x0, y1 + 1.1)).label(sub, halign="left", fontsize=10, color=GRAU))
    path = OUT / name
    d.save(str(path))
    weiss_hinterlegen(path)
    print("gespeichert:", name)


def weiss_hinterlegen(path):
    """Weißes Rechteck als erstes Element: Manche Betrachter ignorieren die CSS-Hintergrundfarbe."""
    svg = path.read_text(encoding="utf-8")
    vb = re.search(r'viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"', svg)
    x, y, w, h = vb.groups()
    kopf_ende = svg.index(">", svg.index("<svg")) + 1
    rect = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="white" />'
    path.write_text(svg[:kopf_ende] + rect + svg[kopf_ende:], encoding="utf-8")


# ---------------------------------------------------------------------------
# Blatt 1: Stromversorgung
# ---------------------------------------------------------------------------
with schemdraw.Drawing(show=False) as d:
    jp = d.add(elm.Header(rows=3, pinsleft=["1: OBD 16 Dauerplus", "2: → F1", "3: X5 Zündungsplus"], shownumber=False)
               .at((0, 0)).anchor("pin2").label("JP0", loc="top"))
    d.add(elm.Line().right().at(jp.pin2).length(1.0))
    d.add(elm.Fuse().right().length(2.2).label("F1\nPTC 500 mA", loc="top"))
    n1 = d.add(elm.Dot())
    d.add(elm.Line().right().length(1.4))
    d.add(elm.Diode().right().length(2.2).label("D1\nSS34", loc="top"))
    n2 = d.add(elm.Dot())
    d.add(elm.Line().right().length(1.6))
    n3 = d.add(elm.Dot())
    d.add(elm.Line().right().length(1.6))
    n4 = d.add(elm.Dot())
    d.add(elm.Line().right().length(1.4))
    u1 = d.add(elm.Ic(pins=[elm.IcPin(name="VIN", pin="1", side="left"),
                            elm.IcPin(name="GND", pin="2", side="bottom"),
                            elm.IcPin(name="VOUT", pin="3", side="right")],
                      size=(2.6, 1.6)).anchor("VIN").label("U1\nTSR 1-2450", loc="top", ofst=0.1))
    gnd(d, u1.GND, 0.8)
    d.add(elm.Line().right().at(u1.VOUT).length(1.4))
    n5 = d.add(elm.Dot())
    d.add(elm.Line().right().length(1.2))
    netlabel(d, d.here, "+5V", loc="right")
    # Querzweige
    t = d.add(elm.DiodeTVS().down().at(n1.center).length(2.4).reverse().label("D2\nSMBJ24A", loc="bottom", ofst=0.3))
    d.add(elm.Ground().at(t.end))
    c = d.add(elm.Capacitor2().down().at(n3.center).length(2.4).label("C1\n47 µF\n50 V", loc="bottom", ofst=0.3))
    d.add(elm.Ground().at(c.end))
    c = d.add(elm.Capacitor().down().at(n4.center).length(2.4).label("C2\n100 nF", loc="bottom", ofst=0.3))
    d.add(elm.Ground().at(c.end))
    c = d.add(elm.Capacitor().down().at(n5.center).length(2.4).label("C3\n10 µF", loc="bottom", ofst=0.3))
    d.add(elm.Ground().at(c.end))
    ln = d.add(elm.Line().up().at(n2.center).length(1.2))
    netlabel(d, ln.end, "+12V_S", loc="top")
    # Masse
    g = d.add(elm.Header(rows=2, pinsleft=["1: OBD 4 Karosseriemasse", "2: OBD 5 Signalmasse"], shownumber=False)
              .at((0, -5.5)).anchor("pin1").label("X4", loc="top"))
    d.add(elm.Line().right().at(g.pin1).length(1.0))
    gd = d.add(elm.Dot())
    d.add(elm.Line().down().toy(g.pin2))
    d.add(elm.Line().left().tox(g.pin2))
    d.add(elm.Line().down().at(gd.center).length(1.2))
    d.add(elm.Ground().label("GND", loc="right"))
    note(d, (6, -5.0),
         "JP0 (Quelle): 1–2 = Dauerplus vom OBD-Port, 2–3 = Zündungsplus über Klemme X5.\n"
         "+12V_S geht zusätzlich an U5 BAT (nur Plan B/D).\n"
         "+5V geht an ESP32-Board 5V (J1-14) und an U5 VCC (nur Plan B/D).\n"
         "+3V3 liefert der Spannungsregler auf dem ESP32-Board (J1-1).\n"
         "Er versorgt U2–U4 und U6, zusammen ca. 40 mA.")
    finish(d, "1_stromversorgung.svg", "Blatt 1: Stromversorgung",
           "Bordnetz 12 V, abgesichert und gegen Verpolung und Spitzen geschützt, auf 5 V")

# ---------------------------------------------------------------------------
# Blatt 2: ESP32-C6-DevKitC-1
# ---------------------------------------------------------------------------
with schemdraw.Drawing(show=False) as d:
    u = ic(d, (0, 0), {
        "left": [("5V", "J1-14", "P5V", False), ("3V3", "J1-1", "P3V3", False), ("GND", "J1-15", "PGND", False)],
        "right": [("GPIO2", "J1-12", "G2", False), ("GPIO3", "J1-13", "G3", False),
                  ("GPIO6", "J1-5", "G6", False), ("GPIO7", "J1-6", "G7", False),
                  ("GPIO18", "J3-10", "G18", False), ("GPIO19", "J3-9", "G19", False),
                  ("GPIO20", "J3-8", "G20", False), ("GPIO21", "J3-7", "G21", False),
                  ("GPIO22", "J3-6", "G22", False), ("GPIO23", "J3-5", "G23", False)],
    }, size=(4.6, 9.6), label="ESP32-C6-DevKitC-1", spacing=0.85)
    stub(d, u.P5V, "left", "+5V")
    stub(d, u.P3V3, "left", "+3V3")
    gnd(d, d.add(elm.Line().left().at(u.PGND).length(1.0)).end)
    for a, txt in (("G2", "K1_TX"), ("G3", "K1_RX"), ("G6", "K2_TX"), ("G7", "K2_RX"),
                   ("G18", "SPI_SCK"), ("G19", "SPI_MOSI"), ("G20", "SPI_MISO"),
                   ("G21", "MCP_CS"), ("G22", "MCP_INT"), ("G23", "FT_ERR")):
        stub(d, getattr(u, a), "right", txt, 1.4)
    note(d, (10.5, 4.6),
         "K1 = eingebauter CAN-Controller 1\n"
         "K2 = eingebauter CAN-Controller 2\n"
         "SPI/MCP = dritter Kanal über MCP2515 (Plan A/B)\n"
         "FT_ERR = Fehlermeldung des TJA1055 (Plan B/D, optional)\n\n"
         "GPIO3 und GPIO7 sind LP-GPIOs: Aufwecken aus dem\n"
         "Tiefschlaf bei Busaktivität möglich.\n\n"
         "Nicht benutzen: GPIO4, 5, 8, 9, 15 (Startpins),\n"
         "GPIO12/13 (USB), GPIO16/17 (Log-Ausgabe).\n"
         "Frei als Reserve: GPIO0, 1, 10, 11.")
    finish(d, "2_esp32.svg", "Blatt 2: ESP32-C6-DevKitC-1",
           "Nur die benutzten Pins. Pinnummern nach Espressif-Handbuch DevKitC-1 v1.2")

# ---------------------------------------------------------------------------
# Blatt 3: Kanal Typ S (klassischer CAN, SN65HVD230)
# ---------------------------------------------------------------------------
with schemdraw.Drawing(show=False) as d:
    u = ic(d, (0, 0), {
        "left": [("Rs", "8", "RS", False), ("D", "1", "D", False), ("R", "4", "R", False)],
        "right": [("CANH", "7", "CANH", False), ("CANL", "6", "CANL", False), ("Vref", "5", "VREF", False)],
        "top": [("VCC", "3", "VCC", False)],
        "bottom": [("GND", "2", "GND", False)],
    }, size=(3.2, 3.6), label="Un  SN65HVD230 (SOIC-8)", spacing=1.0)
    rail(d, u.VCC, "+3V3", 0.6)
    gnd(d, u.GND, 0.6)
    stub(d, u.RS, "left", "Kn_RS")
    stub(d, u.D, "left", "Kn_D")
    stub(d, u.R, "left", "Kn_RX")
    stub(d, u.CANH, "right", "Xn-1 CAN-H")
    stub(d, u.CANL, "right", "Xn-2 CAN-L")
    d.add(elm.Label().at(u.VREF).label("   offen", loc="right", halign="left"))
    # Beschaltung
    X, Y = 13, 2.0
    pullup(d, (X, Y), "Kn_D", "10 kΩ", ref="Rn1")
    series(d, (X, Y - 1.8), "Kn_D", lambda: elm.Switch().label("JPn_TX (Steckbrücke)\noffen = nur lesen", loc="top"), "Kn_TX", 2.0)
    shunt(d, (X, Y - 3.6), "+3V3", lambda: elm.Capacitor().label("Cn1  100 nF", loc="top"))
    shunt(d, (X, Y - 5.4), "Xn-1 CAN-H", lambda: elm.DiodeTVS().label("Dn1  PESD1CAN", loc="top"))
    shunt(d, (X, Y - 7.2), "Xn-2 CAN-L", lambda: elm.DiodeTVS().label("(2. Diode im selben Gehäuse)", loc="top"))
    # Rs-Wahl
    h = d.add(elm.Header(rows=3, pinsright=["1: +3V3 (Nur hören)", "2: Kn_RS", "3: GND (Normal)"], shownumber=False)
              .at((X + 0.3, Y - 9.6)).anchor("pin1").label("JPn_RS", loc="left"))
    note(d, (-6, -4.6),
         "Kein 120-Ω-Abschluss: Der Bus im Auto ist schon abgeschlossen.\n\n"
         "Nur lesen, dreifach abgesichert:\n"
         "• JPn_TX offen: Der Sender bekommt kein Signal, Rn1 hält D auf „rezessiv“.\n"
         "• JPn_RS auf 1–2 (Rs an +3V3): Treiber im Chip abgeschaltet, Empfänger läuft.\n"
         "  Nur falls der Empfang so nicht geht: 2–3 (Rs an GND). JPn_TX bleibt offen.\n"
         "Dazu kommt der Nur-Hören-Modus in der Firmware.\n\n"
         "Bestückung: K1 = U2 (Kn_RX = GPIO3, Kn_TX = GPIO2, Klemme X1)\n"
         "                  K2 = U3 (GPIO7 / GPIO6, Klemme X2)\n"
         "                  K3 = U4 (U6 RXCAN / U6 TXCAN, Klemme X3; nur Plan A)")
    finish(d, "3_kanal_typ_s.svg", "Blatt 3: CAN-Kanal Typ S – klassischer CAN (SN65HVD230)",
           "Einmal je Kanal bestücken; n = Kanalnummer 1, 2 oder 3")

# ---------------------------------------------------------------------------
# Blatt 4: Kanal Typ F (fehlertoleranter CAN, TJA1055T/3)
# ---------------------------------------------------------------------------
with schemdraw.Drawing(show=False) as d:
    u = ic(d, (0, 0), {
        "left": [("TXD", "2", "TXD", False), ("RXD", "3", "RXD", False), ("ERR", "4", "ERR", True),
                 ("STB", "5", "STB", True), ("EN", "6", "EN", False), ("WAKE", "7", "WAKE", True)],
        "right": [("INH", "1", "INH", False), ("CANH", "11", "CANH", False), ("CANL", "12", "CANL", False),
                  ("RTH", "8", "RTH", False), ("RTL", "9", "RTL", False)],
        "top": [("VCC", "10", "VCC", False), ("BAT", "14", "BAT", False)],
        "bottom": [("GND", "13", "GND", False)],
    }, size=(3.6, 6.0), label="U5  TJA1055T/3 (SOIC-14)", spacing=0.9)
    rail(d, u.VCC, "+5V", 0.6)
    rail(d, u.BAT, "+12V_S", 0.6)
    gnd(d, u.GND, 0.6)
    stub(d, u.TXD, "left", "FT_D")
    stub(d, u.RXD, "left", "Kn_RX")
    stub(d, u.ERR, "left", "FT_ERR")
    stub(d, u.STB, "left", "FT_MODE")
    stub(d, u.EN, "left", "FT_MODE")
    stub(d, u.WAKE, "left", "GND")
    d.add(elm.Label().at(u.INH).label("   offen", loc="right", halign="left"))
    stub(d, u.CANH, "right", "Xn-1 CAN-H")
    stub(d, u.CANL, "right", "Xn-2 CAN-L")
    stub(d, u.RTH, "right", "FT_RTH")
    stub(d, u.RTL, "right", "FT_RTL")
    X, Y = 13, 3.0
    pullup(d, (X, Y), "FT_D", "10 kΩ", ref="R51")
    series(d, (X, Y - 1.8), "FT_D", lambda: elm.Switch().label("JP5_TX (Steckbrücke)\noffen = nur lesen", loc="top"), "Kn_TX", 2.0)
    pullup(d, (X, Y - 3.6), "Kn_RX", "4,7 kΩ", ref="R52")
    pullup(d, (X, Y - 5.4), "FT_ERR", "10 kΩ", ref="R53")
    pullup(d, (X, Y - 7.2), "FT_MODE", "10 kΩ", ref="R54")
    series(d, (X, Y - 9.0), "FT_RTH", lambda: elm.Resistor().label("R55  RT 10 kΩ", loc="top"), "Xn-1 CAN-H", 2.0)
    series(d, (X, Y - 10.8), "FT_RTL", lambda: elm.Resistor().label("R56  RT 10 kΩ", loc="top"), "Xn-2 CAN-L", 2.0)
    shunt(d, (X, Y - 12.6), "+5V", lambda: elm.Capacitor().label("C51  100 nF", loc="top"))
    shunt(d, (X, Y - 14.4), "+12V_S", lambda: elm.Capacitor().label("C52  100 nF", loc="top"))
    shunt(d, (X, Y - 16.2), "Xn-1 CAN-H", lambda: elm.DiodeTVS().label("D51  PESD1CAN", loc="top"))
    shunt(d, (X, Y - 18.0), "Xn-2 CAN-L", lambda: elm.DiodeTVS().label("(2. Diode im selben Gehäuse)", loc="top"))
    note(d, (-6, -5.2),
         "Nur Plan B (statt U4, Kn = K3 am MCP2515)\n"
         "oder Plan D (statt U3, Kn = K2 an GPIO7/GPIO6).\n\n"
         "STB und EN fest auf High: Normalbetrieb.\n"
         "RXD und ERR sind beim „/3“ Open-Drain-Ausgänge\n"
         "mit Pull-up auf 3,3 V; deshalb passt der Pegel zum ESP32.\n\n"
         "Vor dem Bestellen mit dem Datenblatt TJA1055\n"
         "und NXP AH0801 abgleichen: Wert von RT\n"
         "(je Knoten 500 Ω bis 16 kΩ), Beschaltung von\n"
         "WAKE, Pull-up-Werte.", size=10)
    note(d, (-6, -9.6), "Fehlertolerante Busse haben\nkeine 120-Ω-Abschlüsse.", color=ROT)
    finish(d, "4_kanal_typ_f.svg", "Blatt 4: CAN-Kanal Typ F – fehlertoleranter Low-Speed-CAN (TJA1055T/3)",
           "Nur falls die Messung einen fehlertoleranten B-CAN zeigt (eine Ader ≈ 0 V, die andere ≈ 5 V)")

# ---------------------------------------------------------------------------
# Blatt 5: MCP2515
# ---------------------------------------------------------------------------
with schemdraw.Drawing(show=False) as d:
    u = ic(d, (0, 0), {
        "left": [("SCK", "13", "SCK", False), ("SI", "14", "SI", False), ("SO", "15", "SO", False),
                 ("CS", "16", "CS", True), ("INT", "12", "INT", True), ("RESET", "17", "RST", True)],
        "right": [("TXCAN", "1", "TXCAN", False), ("RXCAN", "2", "RXCAN", False),
                  ("OSC1", "8", "OSC1", False), ("OSC2", "7", "OSC2", False),
                  ("TXnRTS", "4–6", "RTS", False), ("CLKOUT, RXnBF", "3, 10, 11", "NC", False)],
        "top": [("VDD", "18", "VDD", False)],
        "bottom": [("VSS", "9", "VSS", False)],
    }, size=(5.4, 6.0), label="U6  MCP2515 (DIP-18 oder SOIC-18)", spacing=0.9)
    rail(d, u.VDD, "+3V3", 0.6)
    gnd(d, u.VSS, 0.6)
    for a, txt in (("SCK", "SPI_SCK"), ("SI", "SPI_MOSI"), ("SO", "SPI_MISO"), ("CS", "MCP_CS"),
                   ("INT", "MCP_INT"), ("RST", "MCP_RST")):
        stub(d, getattr(u, a), "left", txt)
    stub(d, u.TXCAN, "right", "K3_TX")
    stub(d, u.RXCAN, "right", "K3_RX")
    stub(d, u.OSC1, "right", "OSC1")
    stub(d, u.OSC2, "right", "OSC2")
    d.add(elm.Label().at(u.RTS).label("   offen (interne Pull-ups)", loc="right", halign="left"))
    d.add(elm.Label().at(u.NC).label("   offen", loc="right", halign="left"))
    X, Y = 15, 3.0
    pullup(d, (X, Y), "MCP_RST", "10 kΩ", ref="R61")
    shunt(d, (X, Y - 1.8), "MCP_RST", lambda: elm.Capacitor().label("C61  100 nF", loc="top"))
    pullup(d, (X, Y - 3.6), "MCP_INT", "10 kΩ", ref="R62")
    series(d, (X, Y - 5.4), "OSC1", lambda: elm.Crystal().label("Y1  8 MHz", loc="top"), "OSC2", 2.0)
    shunt(d, (X, Y - 7.2), "OSC1", lambda: elm.Capacitor().label("C62  22 pF", loc="top"))
    shunt(d, (X, Y - 9.0), "OSC2", lambda: elm.Capacitor().label("C63  22 pF", loc="top"))
    shunt(d, (X, Y - 10.8), "+3V3", lambda: elm.Capacitor().label("C64  100 nF", loc="top"))
    note(d, (-6, -5.0),
         "Nur Plan A und B.\n"
         "K3_TX/K3_RX gehen an den Transceiver von K3:\n"
         "Plan A: U4 (Typ S), Plan B: U5 (Typ F).\n\n"
         "MCP2515 läuft mit 3,3 V direkt am ESP32.\n"
         "Kein fertiges MCP2515-Modul mit TJA1050 (5 V).\n\n"
         "ESPHome: platform: mcp2515,\n"
         "clock: 8MHZ, mode: LISTENONLY\n\n"
         "Kondensatoren am Quarz nach dessen\n"
         "Lastkapazität wählen (18–22 pF).")
    finish(d, "5_mcp2515.svg", "Blatt 5: Dritter CAN-Controller MCP2515",
           "SPI an den ESP32; Quarz 8 MHz")

# ---------------------------------------------------------------------------
# Blatt 6: OBD-Anschluss und Klemmen
# ---------------------------------------------------------------------------
with schemdraw.Drawing(show=False) as d:
    obd = d.add(elm.Header(rows=9, pinsleft=["Pin 1", "Pin 3", "Pin 4", "Pin 5", "Pin 6", "Pin 9", "Pin 11", "Pin 14", "Pin 16"], shownumber=False)
                .at((0, 0)).anchor("pin1").label("OBD-Stecker\n(Litzen am Y-Kabel)", loc="top"))
    for i, txt in enumerate(["OBD1", "OBD3", "→ X4-1 (GND)", "→ X4-2 (GND)", "OBD6", "OBD9", "OBD11", "OBD14",
                             "→ JP0-1 (Dauerplus)"], start=1):
        stub(d, getattr(obd, f"pin{i}"), "right", txt, 1.0)
    for j, (name, sub) in enumerate((("X1", "K1"), ("X2", "K2"), ("X3", "K3"))):
        x = d.add(elm.Header(rows=3, pinsleft=["1: CAN-H", "2: CAN-L", "3: GND"], shownumber=False)
                  .at((9, -j * 3.2)).anchor("pin1").label(f"{name} (Kanal {sub})", loc="top"))
        gnd(d, d.add(elm.Line().right().at(x.pin3).length(0.6)).end, 0.3)
    x5 = d.add(elm.Header(rows=1, pinsleft=["1: Zündungsplus"], shownumber=False)
               .at((9, -9.8)).anchor("pin1").label("X5 (nur bei JP0 2–3)", loc="top"))
    stub(d, x5.pin1, "right", "→ JP0-3", 0.8)
    note(d, (14, 0.6),
         "Klemmen X1–X3: Schraubklemmen, 3-polig.\n"
         "Die Litzen OBD1/3/6/9/11/14 werden je nach Plan\n"
         "auf X1–X3 gelegt (Tabelle im README).\n\n"
         "Litzenpaare verdrillen und kurz halten:\n"
         "Stichleitung bei 500 kbit/s höchstens ca. 30 cm\n"
         "vom OBD-Port bis zum Transceiver.\n\n"
         "Nicht belegte Litzen isolieren.")
    finish(d, "6_obd_klemmen.svg", "Blatt 6: OBD-Anschluss und Klemmen",
           "Welches Pin-Paar auf welchen Kanal geht, entscheidet die Messung")
