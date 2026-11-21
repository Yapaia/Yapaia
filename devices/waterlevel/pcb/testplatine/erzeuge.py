#!/usr/bin/env python3
"""Erzeugt die Testplatine des Wasserstandssensors (KiCad 7, pcbnew-API).

Aufruf (KiCad muss installiert sein):
    python3 erzeuge.py                 -> testplatine.kicad_pcb
    ./fertigung.sh                     -> DRC, Gerber, Bohrdaten, Vorschau

Aufbau: 100 x 100 mm, oben ein trockener Kopf mit XIAO ESP32S3, darunter sechs
Finger (Zungen) mit je einer Messbahn S1..S6 in unterschiedlicher Breite,
flankiert von GND-Streifen auf beiden Seiten. S7 ist ein Leerkanal, der im Kopf
endet (Grundkapazität/Drift ohne Wasser). Alle Maße in mm.
"""
import os
import pcbnew

HIER = os.path.dirname(os.path.abspath(__file__))
FP_LIB = "/usr/share/kicad/footprints"

# ---------------------------------------------------------------- Parameter
BREITE, HOEHE = 100.0, 100.0
KOPF = 35.0                 # Kopfhöhe (trocken, mit ESP), darunter beginnen die Finger
FINGER_B = 14.0             # Fingerbreite
SCHLITZ = 2.6               # Schlitz zwischen den Fingern
RAND_CU = 0.6               # Kupferabstand zur Platinenkante
SPALT = 1.5                 # Abstand Messbahn <-> GND-Streifen
MESS_OBEN = KOPF + 2.0      # hier beginnt die Messbahn in voller Breite
MESS_UNTEN = HOEHE - 3.0    # Ende der Messbahn (= Skala 0 mm)
ZULEITUNG = 0.18            # Breite der Zuleitung im Kopf (Espressif: <= 0,18)

# Kanal: (Name, Bahnbreite, Hinweis für den Bestückungsdruck)
KANAELE = [
    ("S1", 0.15, "0,15"),
    ("S2", 0.20, "0,2"),
    ("S3", 0.30, "0,3"),
    ("S4", 0.50, "0,5"),
    ("S5", 1.00, "1,0 B"),
    ("S6", 3.00, "3,0 B"),
]
LEERKANAL = "S7"

mm = pcbnew.FromMM


def P(x, y):
    return pcbnew.VECTOR2I(mm(x), mm(y))


board = pcbnew.BOARD()
ds = board.GetDesignSettings()
ds.SetCopperLayerCount(2)
ds.m_TrackMinWidth = mm(0.127)
ds.m_MinClearance = mm(0.2)
ds.m_CopperEdgeClearance = mm(0.5)
nc = ds.m_NetSettings.m_DefaultNetClass
nc.SetClearance(mm(0.3))
nc.SetTrackWidth(mm(ZULEITUNG))

nets = {}


def net(name):
    if name not in nets:
        n = pcbnew.NETINFO_ITEM(board, name)
        board.Add(n)
        nets[name] = n
    return nets[name]


def spur(a, b, breite, lage, netz):
    t = pcbnew.PCB_TRACK(board)
    t.SetStart(P(*a))
    t.SetEnd(P(*b))
    t.SetWidth(mm(breite))
    t.SetLayer(lage)
    t.SetNet(net(netz))
    board.Add(t)


def flaeche(x0, y0, x1, y1, lage, netz):
    """Rechteckige, voll gefüllte Kupferzone."""
    z = pcbnew.ZONE(board)
    z.SetLayer(lage)
    z.SetNet(net(netz))
    ol = z.Outline()
    ol.NewOutline()
    for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]:
        ol.Append(mm(x), mm(y))
    z.SetMinThickness(mm(0.2))
    z.SetPadConnection(pcbnew.ZONE_CONNECTION_FULL)
    board.Add(z)
    return z


def via(x, y, netz):
    v = pcbnew.PCB_VIA(board)
    v.SetPosition(P(x, y))
    v.SetWidth(mm(0.6))
    v.SetDrill(mm(0.3))
    v.SetNet(net(netz))
    board.Add(v)


def linie(a, b, lage, breite=0.15):
    s = pcbnew.PCB_SHAPE(board)
    s.SetShape(pcbnew.SHAPE_T_SEGMENT)
    s.SetStart(P(*a))
    s.SetEnd(P(*b))
    s.SetLayer(lage)
    s.SetWidth(mm(breite))
    board.Add(s)


def text(t, x, y, groesse=1.0, lage=pcbnew.F_SilkS, drehung=0, links=False):
    tx = pcbnew.PCB_TEXT(board)
    tx.SetText(t)
    tx.SetPosition(P(x, y))
    tx.SetLayer(lage)
    tx.SetTextSize(P(groesse, groesse))
    tx.SetTextThickness(mm(groesse * 0.15))
    if drehung:
        tx.SetTextAngle(pcbnew.EDA_ANGLE(drehung, pcbnew.DEGREES_T))
    if links:
        tx.SetHorizJustify(pcbnew.GR_TEXT_H_ALIGN_LEFT)
    if lage == pcbnew.B_SilkS:
        tx.SetMirrored(True)
    board.Add(tx)


def bauteil(lib, name, ref, x, y, drehung=0, wert=""):
    fp = pcbnew.FootprintLoad(os.path.join(FP_LIB, lib + ".pretty"), name)
    fp.SetReference(ref)
    fp.SetValue(wert or name)
    fp.SetPosition(P(x, y))
    if drehung:
        fp.SetOrientationDegrees(drehung)
    fp.Value().SetVisible(False)
    board.Add(fp)
    return fp


# ---------------------------------------------------------------- Umriss
n = len(KANAELE)
rand_x = (BREITE - n * FINGER_B - (n - 1) * SCHLITZ) / 2
finger_x = [rand_x + i * (FINGER_B + SCHLITZ) for i in range(n)]   # linke Kante

pkt = [(0, 0), (BREITE, 0), (BREITE, KOPF)]
pkt += [(finger_x[-1] + FINGER_B, KOPF)]
for i in reversed(range(n)):
    x0 = finger_x[i]
    pkt += [(x0 + FINGER_B, HOEHE), (x0, HOEHE), (x0, KOPF)]
    if i:
        pkt += [(finger_x[i - 1] + FINGER_B, KOPF)]
pkt += [(0, KOPF)]
# Doppelte Punkte entfernen (rand_x > 0: Kopfkanten außen)
umriss = []
for p in pkt:
    if not umriss or umriss[-1] != p:
        umriss.append(p)
for a, b in zip(umriss, umriss[1:] + umriss[:1]):
    if a != b:
        linie(a, b, pcbnew.Edge_Cuts, 0.1)

# ---------------------------------------------------------------- Kopf
# Seeed XIAO ESP32S3 direkt auf der Platine (Stiftleisten 2x7, Raster 2,54,
# Reihenabstand 15,24 mm – Maße aus Seeeds KiCad-Bibliothek, Belegung aus
# arduino-esp32 variants/XIAO_ESP32S3/pins_arduino.h).
# Lage: um 180° gedreht, USB-C zeigt nach links zur Platinenkante, die Reihe
# D0..D6 liegt unten (zu den Fingern hin).
XIAO_X, XIAO_Y = 12.0, 11.5
REIHE = 7.62
# Pin-Nr. -> (Name, GPIO)   Pins 1..7 untere Reihe von links, 14..8 obere Reihe von links
XIAO_PINS = {
    1: ("D0", 1), 2: ("D1", 2), 3: ("D2", 3), 4: ("D3", 4), 5: ("D4", 5),
    6: ("D5", 6), 7: ("D6", 43), 8: ("D7", 44), 9: ("D8", 7), 10: ("D9", 8),
    11: ("D10", 9), 12: ("3V3", None), 13: ("GND", None), 14: ("5V", None),
}


def xiao_pos(nr):
    if nr <= 7:
        return XIAO_X - REIHE + (nr - 1) * 2.54, XIAO_Y + REIHE
    return XIAO_X - REIHE + (14 - nr) * 2.54, XIAO_Y - REIHE


# Kanal -> XIAO-Pin (S1..S6 = D0..D5 = GPIO1..6, S7 = D8 = GPIO7)
KANAL_PIN = {"S1": 1, "S2": 2, "S3": 3, "S4": 4, "S5": 5, "S6": 6, LEERKANAL: 9}

u1 = pcbnew.FOOTPRINT(board)
u1.SetReference("U1")
u1.SetValue("XIAO ESP32S3")
u1.SetPosition(P(XIAO_X, XIAO_Y))
u1.Reference().SetVisible(False)
u1.Value().SetVisible(False)
board.Add(u1)
for nr, (name, gpio) in XIAO_PINS.items():
    pad = pcbnew.PAD(u1)
    pad.SetNumber(str(nr))
    pad.SetAttribute(pcbnew.PAD_ATTRIB_PTH)
    pad.SetShape(pcbnew.PAD_SHAPE_RECT if nr == 1 else pcbnew.PAD_SHAPE_CIRCLE)
    pad.SetSize(P(1.7, 1.7))
    pad.SetDrillSize(P(1.0, 1.0))
    pad.SetLayerSet(pad.PTHMask())
    u1.Add(pad)
    x_, y_ = xiao_pos(nr)
    pad.SetPos0(P(x_ - XIAO_X, y_ - XIAO_Y))   # relativ zum Modul (wird gespeichert)
    pad.SetPosition(P(x_, y_))                  # absolut (für die Verbindungen)
    if name == "GND":
        pad.SetNet(net("GND"))
    for k, pnr in KANAL_PIN.items():
        if pnr == nr:
            pad.SetNet(net(f"{k}_PIN"))
# Umriss des Moduls (21 x 17,8 mm) und USB-Markierung im Bestückungsdruck
mx0, mx1 = XIAO_X - 10.55, XIAO_X + 10.425
my0, my1 = XIAO_Y - 8.9, XIAO_Y + 8.9
for a_, b_ in [((mx0, my0), (mx1, my0)), ((mx1, my0), (mx1, my1)),
               ((mx1, my1), (mx0, my1)), ((mx0, my1), (mx0, my0))]:
    linie(a_, b_, pcbnew.F_SilkS, 0.15)
text("USB", mx0 + 2.2, XIAO_Y, 0.9, drehung=90)
text("XIAO ESP32S3", XIAO_X + 1.0, XIAO_Y - 0.5, 1.0)
text("Bauteilseite oben", XIAO_X + 1.0, XIAO_Y + 2.0, 0.8)
for nr in (1, 14):
    x_, y_ = xiao_pos(nr)
    text(XIAO_PINS[nr][0], x_, y_ + (-2.0 if nr == 1 else 2.0), 0.8)


def widerstand(ref, x, y, name, drehung=90):
    """510 Ohm (0805) zwischen XIAO-Pin und Messbahn; liefert (Pin-Seite, Bahn-Seite)."""
    r = bauteil("Resistor_SMD", "R_0805_2012Metric", ref, x, y, drehung=drehung, wert="510")
    r.Reference().SetVisible(False)
    key = (lambda p: p.GetPosition().y) if drehung == 90 else (lambda p: p.GetPosition().x)
    pads = sorted(r.Pads(), key=key)
    pads[0].SetNet(net(f"{name}_PIN"))
    pads[1].SetNet(net(name))
    return [tuple(pcbnew.ToMM(v) for v in (p.GetPosition().x, p.GetPosition().y)) for p in pads]


# Messkanäle: Pin -> Widerstand (senkrecht darunter) -> Spur nach rechts -> Finger.
# Höhere Kanäle biegen weiter oben ab, so kreuzt sich nichts.
R_Y = 23.0
for i, (name, breite, hinweis) in enumerate(KANAELE):
    x_p, y_p = xiao_pos(KANAL_PIN[name])
    p_pin, p_bahn = widerstand(f"R{i+1}", x_p, R_Y, name)
    spur((x_p, y_p), p_pin, ZULEITUNG, pcbnew.F_Cu, f"{name}_PIN")
    x_f = finger_x[i] + FINGER_B / 2
    spur_y = 25.5 + 1.2 * (n - 1 - i)
    spur(p_bahn, (x_p, spur_y), ZULEITUNG, pcbnew.F_Cu, name)
    spur((x_p, spur_y), (x_f, spur_y), ZULEITUNG, pcbnew.F_Cu, name)
    spur((x_f, spur_y), (x_f, MESS_OBEN), ZULEITUNG, pcbnew.F_Cu, name)
    # Messbahn in Testbreite
    spur((x_f, MESS_OBEN), (x_f, MESS_UNTEN), breite, pcbnew.F_Cu, name)

# Leerkanal S7 (D8/GPIO7, obere Reihe): nach oben, Widerstand, endet im Kopf
x7, y7 = xiao_pos(KANAL_PIN[LEERKANAL])
p_pin, p_bahn = widerstand("R7", 26.0, 1.5, LEERKANAL, drehung=0)
spur((x7, y7), (x7, 1.5), ZULEITUNG, pcbnew.F_Cu, f"{LEERKANAL}_PIN")
spur((x7, 1.5), p_pin, ZULEITUNG, pcbnew.F_Cu, f"{LEERKANAL}_PIN")
spur(p_bahn, (44.0, 1.5), ZULEITUNG, pcbnew.F_Cu, LEERKANAL)
text("S7 leer", 38.0, 3.0, 0.8)

# GND im Kopf: Rückseite als schraffierte Zone, Leiste verbindet über THT-Pads
zone = pcbnew.ZONE(board)
zone.SetLayer(pcbnew.B_Cu)
zone.SetNet(net("GND"))
ol = zone.Outline()
ol.NewOutline()
for x, y in [(0.5, 0.5), (BREITE - 0.5, 0.5), (BREITE - 0.5, KOPF - 0.5), (0.5, KOPF - 0.5)]:
    ol.Append(mm(x), mm(y))
zone.SetLocalClearance(mm(1.0))
zone.SetMinThickness(mm(0.2))
zone.SetFillMode(pcbnew.ZONE_FILL_MODE_HATCH_PATTERN)
zone.SetHatchThickness(mm(0.3))
zone.SetHatchGap(mm(1.5))
zone.SetPadConnection(pcbnew.ZONE_CONNECTION_FULL)
board.Add(zone)

# ---------------------------------------------------------------- Finger
for i, (name, breite, hinweis) in enumerate(KANAELE):
    x0 = finger_x[i]
    xm = x0 + FINGER_B / 2
    innen = breite / 2 + SPALT
    links = (x0 + RAND_CU, xm - innen)
    rechts = (xm + innen, x0 + FINGER_B - RAND_CU)
    for a, b in (links, rechts):
        # oben und unten gleiche Streifen; unter der Messbahn kein Kupfer
        flaeche(a, KOPF - 2.0, b, MESS_UNTEN, pcbnew.F_Cu, "GND")
        flaeche(a, KOPF - 2.0, b, MESS_UNTEN, pcbnew.B_Cu, "GND")
        # Durchkontaktierungen nur im trockenen Kopf
        via((a + b) / 2, KOPF - 1.0, "GND")
    # Beschriftung
    text(f"{name} {hinweis}", xm, KOPF + 1.0, 0.9)
    # Skala: 0 = unteres Ende der Messbahn, Striche alle 10 mm auf der Rückseite
    for k in range(0, 8):
        y = MESS_UNTEN - k * 10
        if y < MESS_OBEN:
            break
        lang = 2.5 if k % 5 == 0 else 1.5
        linie((x0 + FINGER_B - 0.3 - lang, y), (x0 + FINGER_B - 0.3, y), pcbnew.B_SilkS, 0.15)
        if k:
            text(f"{k}", x0 + FINGER_B - 3.6, y, 0.8, pcbnew.B_SilkS)

# Befestigungslöcher M3 links/rechts im Kopf (nicht mit GND verbunden)
bauteil("MountingHole", "MountingHole_3.2mm_M3", "H1", 55.0, 6.0)
bauteil("MountingHole", "MountingHole_3.2mm_M3", "H2", BREITE - 5.0, 6.0)

text("Yapaia Wasserstand", 75.0, 12.0, 1.2)
text("Testplatine v2 (XIAO ESP32S3)", 75.0, 14.5, 1.0)
text("Skala: cm ab Bahnende. B = mit Schrumpfschlauch", 60.0, 18.0, 0.8, pcbnew.B_SilkS)
text("Kopf bleibt trocken", 60.0, 21.0, 0.8, pcbnew.B_SilkS)
text("R1-R7: 510 Ohm 0805", 75.0, 6.0, 0.8, pcbnew.B_SilkS)

# ---------------------------------------------------------------- Zonen füllen, speichern
ziel = os.path.join(HIER, "testplatine.kicad_pcb")
board.Save(ziel)
# Füllen klappt nur an einer geladenen Platine (sonst Absturz in KiCad 7)
board = pcbnew.LoadBoard(ziel)
board.BuildConnectivity()
pcbnew.ZONE_FILLER(board).Fill(board.Zones())
board.Save(ziel)
print("gespeichert:", ziel)
