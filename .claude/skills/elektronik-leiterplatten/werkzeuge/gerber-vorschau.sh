#!/bin/sh
# Rendert Gerber + Bohrdaten unabhängig von KiCad (gerbv) als PNG zur Kontrolle.
# Aufruf: gerber-vorschau.sh <gerber-ordner> <ausgabe.png> [vorne|hinten]
# gerbv nachinstallieren: apt-get install -y gerbv
set -eu
d="$1"; out="$2"; seite="${3:-vorne}"
if [ "$seite" = vorne ]; then cu=F_Cu.gtl; mask=F_Mask.gts; silk=F_Silkscreen.gto
else cu=B_Cu.gbl; mask=B_Mask.gbs; silk=B_Silkscreen.gbo; fi
set -- "$d"/*-Edge_Cuts.gm1
edge="$1"
gerbv -x png -D 250 -B 0 -b "#1a3d20" -o "$out" \
  -f "#ffffffff" "$edge" \
  $(for f in "$d"/*.drl; do printf -- '-f #000000ff %s ' "$f"; done) \
  -f "#ffffffff" "$d"/*-"$silk" -f "#d0a040ff" "$d"/*-"$mask" -f "#c83232ff" "$d"/*-"$cu"
echo "$out"
