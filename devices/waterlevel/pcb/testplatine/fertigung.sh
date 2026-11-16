#!/bin/sh
# Erzeugt Platine, Fertigungsdaten (Gerber + Bohrdaten als ZIP) und Vorschau-SVGs.
# Braucht KiCad 7 (pcbnew-Python und kicad-cli).
set -e
cd "$(dirname "$0")"
python3 erzeuge.py
rm -rf fertigung && mkdir -p fertigung/gerber
kicad-cli pcb export gerbers -o fertigung/gerber/ \
  -l F.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts --subtract-soldermask \
  testplatine.kicad_pcb
kicad-cli pcb export drill -o fertigung/gerber/ --format excellon \
  --excellon-separate-th --generate-map --map-format gerberx2 testplatine.kicad_pcb
(cd fertigung/gerber && zip -q ../testplatine-gerber.zip ./*)
kicad-cli pcb export svg -o fertigung/vorne.svg -l F.Cu,F.SilkS,Edge.Cuts \
  --page-size-mode 2 --exclude-drawing-sheet testplatine.kicad_pcb
kicad-cli pcb export svg -o fertigung/hinten.svg -l B.Cu,B.SilkS,Edge.Cuts --mirror \
  --page-size-mode 2 --exclude-drawing-sheet testplatine.kicad_pcb
echo "fertig: fertigung/testplatine-gerber.zip"
