#!/usr/bin/env python3
"""DRC für eine KiCad-7-Platine ohne GUI (kicad-cli 7 kann keinen DRC).

Aufruf: python3 drc.py platine.kicad_pcb
Gibt die Verstöße gruppiert aus. Exit 1 bei Fehlern außer den hier
als harmlos geführten Typen.
"""
import re
import sys
from collections import Counter

import pcbnew

HARMLOS = {"lib_footprint_issues"}   # Footprints ohne Bibliothekseintrag (aus Skript erzeugt)

pfad = sys.argv[1]
bericht = "/tmp/drc-bericht.rpt"
board = pcbnew.LoadBoard(pfad)
pcbnew.WriteDRCReport(board, bericht, pcbnew.EDA_UNITS_MILLIMETRES, True)
text = open(bericht).read()
typen = Counter(re.findall(r"^\[([a-z_]+)\]", text, re.M))
for t, n in typen.most_common():
    print(f"{n:5d}  {t}")
m = re.search(r"Found (\d+) unconnected pads", text)
print("offene Pads:", m.group(1) if m else "?")
print("Bericht:", bericht)
schlimm = {t for t in typen if t not in HARMLOS and t != "track_dangling"}
if "track_dangling" in typen:
    print("Hinweis: track_dangling ist bei Elektroden/Messbahnen gewollt – sonst prüfen.")
sys.exit(1 if schlimm or (m and m.group(1) != "0") else 0)
