#!/usr/bin/env python3
"""Erzeugt die Testplatine des Wasserstandssensors (KiCad 7, pcbnew-API).

Aufruf (KiCad muss installiert sein):
    python3 erzeuge.py                 -> testplatine.kicad_pcb
    ./fertigung.sh                     -> DRC, Gerber, Bohrdaten, Vorschau

Aufbau: 100 x 100 mm, oben ein trockener Kopf mit Stiftleiste, darunter sechs
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
KOPF = 24.0                 # Kopfhöhe (trocken), darunter beginnen die Finger
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
# Stiftleiste: GND, S1..S7, GND (1x9, Raster 2,54) mittig oben
J_Y = 5.0
j_x0 = BREITE / 2 - 4 * 2.54
j1 = bauteil("Connector_PinHeader_2.54mm", "PinHeader_1x09_P2.54mm_Vertical",
             "J1", j_x0, J_Y, drehung=90, wert="ESP32")
pin_netz = ["GND"] + [f"{k[0]}_PIN" for k in KANAELE] + [f"{LEERKANAL}_PIN", "GND"]
for pad in j1.Pads():
    pad.SetNet(net(pin_netz[int(pad.GetNumber()) - 1]))


def pin_x(i):
    return j_x0 + i * 2.54


# Serienwiderstände 510 Ohm direkt an der Leiste (oder 0-Ohm-Brücke)
R_Y = 10.0
kanal_namen = [k[0] for k in KANAELE] + [LEERKANAL]
for i, name in enumerate(kanal_namen):
    x = pin_x(i + 1)
    r = bauteil("Resistor_SMD", "R_0805_2012Metric", f"R{i+1}", x, R_Y,
                drehung=90, wert="510")
    r.Reference().SetVisible(False)
    pads = sorted(r.Pads(), key=lambda p: p.GetPosition().y)
    pads[0].SetNet(net(f"{name}_PIN"))
    pads[1].SetNet(net(name))
    oben, unten = pads[0].GetPosition(), pads[1].GetPosition()
    spur((x, J_Y), (x, pcbnew.ToMM(oben.y)), ZULEITUNG, pcbnew.F_Cu, f"{name}_PIN")
    text(name, x, 2.0, 0.8)

# Zuleitungen vom Widerstand zum Finger (oben, 0,18 mm). Gestaffelte Spuren:
# die äußeren Kanäle biegen zuerst ab, so kreuzt sich nichts.
for i, (name, breite, hinweis) in enumerate(KANAELE):
    x_r = pin_x(i + 1)
    x_f = finger_x[i] + FINGER_B / 2
    spur_y = 13.5 + 2.0 * min(i, n - 1 - i)
    spur((x_r, R_Y + 0.95), (x_r, spur_y), ZULEITUNG, pcbnew.F_Cu, name)
    spur((x_r, spur_y), (x_f, spur_y), ZULEITUNG, pcbnew.F_Cu, name)
    spur((x_f, spur_y), (x_f, MESS_OBEN), ZULEITUNG, pcbnew.F_Cu, name)
    # Messbahn in Testbreite
    spur((x_f, MESS_OBEN), (x_f, MESS_UNTEN), breite, pcbnew.F_Cu, name)

# Leerkanal S7: endet im Kopf, gleiche Zuleitungslänge wie S4 ungefähr
x7 = pin_x(7)
spur((x7, R_Y + 0.95), (x7, 12.0), ZULEITUNG, pcbnew.F_Cu, LEERKANAL)
spur((x7, 12.0), (x7 + 14.0, 12.0), ZULEITUNG, pcbnew.F_Cu, LEERKANAL)
text("S7 leer", x7 + 9.0, 10.8, 0.8)

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
        flaeche(a, KOPF - 3.0, b, MESS_UNTEN, pcbnew.F_Cu, "GND")
        flaeche(a, KOPF - 3.0, b, MESS_UNTEN, pcbnew.B_Cu, "GND")
        # Durchkontaktierungen nur im trockenen Kopf
        via((a + b) / 2, KOPF - 1.8, "GND")
    # Beschriftung
    text(f"{name} {hinweis}", xm, 20.0, 0.9)
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
bauteil("MountingHole", "MountingHole_3.2mm_M3", "H1", 5.0, 6.0)
bauteil("MountingHole", "MountingHole_3.2mm_M3", "H2", BREITE - 5.0, 6.0)

text("Yapaia Wasserstand", 22.0, 9.0, 1.2)
text("Testplatine v1", 22.0, 11.0, 1.0)
text("Skala: cm ab Bahnende. B = mit Schrumpfschlauch", 50.0, 3.0, 0.8, pcbnew.B_SilkS)
text("Kopf bleibt trocken", 50.0, 9.0, 0.8, pcbnew.B_SilkS)
text("R1-R7: 510 Ohm 0805", 80.0, 6.0, 0.8, pcbnew.B_SilkS)

# ---------------------------------------------------------------- Zonen füllen, speichern
ziel = os.path.join(HIER, "testplatine.kicad_pcb")
board.Save(ziel)
# Füllen klappt nur an einer geladenen Platine (sonst Absturz in KiCad 7)
board = pcbnew.LoadBoard(ziel)
board.BuildConnectivity()
pcbnew.ZONE_FILLER(board).Fill(board.Zones())
board.Save(ziel)
print("gespeichert:", ziel)
