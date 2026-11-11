#!/usr/bin/env python3
"""Rechner für die Elektroden des kapazitiven Füllstandssensors.

Modell: Leitungswasser ist leitfähig und wirkt wie eine Platte. Gemessen wird
die Kapazität Messbahn -> Isolierung -> Wasser -> Isolierung -> GND-Gegenelektrode.
Beide Teilkapazitäten sind Plattenkondensatoren (C = e0 * er * A / d) und liegen
in Reihe. Randfelder werden vernachlässigt (sie erhöhen C etwas).

Aufruf:  python3 rechner.py                   (Standardtabelle)
         python3 rechner.py --breite 0.3 --hoehe 300 --dicke 0.02 --er 3.8
"""
import argparse

E0 = 8.854e-12  # F/m


def platte_pf(breite_mm: float, laenge_mm: float, dicke_mm: float, er: float) -> float:
    """Plattenkondensator in pF (Fläche = Breite x eingetauchte Länge)."""
    a = breite_mm * laenge_mm * 1e-6
    return E0 * er * a / (dicke_mm * 1e-3) * 1e12


def reihe(c1: float, c2: float) -> float:
    return c1 * c2 / (c1 + c2) if c1 and c2 else 0.0


def zeile(name, breite, gnd_breite, hoehe, dicke, er, cp):
    cs = platte_pf(breite, hoehe, dicke, er)
    cg = platte_pf(gnd_breite, hoehe, dicke, er)
    dc = reihe(cs, cg)
    print(f"{name:<34} {breite:5.2f} mm {dicke*1000:5.0f} µm  "
          f"{platte_pf(breite, 1, dicke, er):6.3f} pF/mm  "
          f"ΔC voll {dc:7.1f} pF  Cp+ΔC {cp+dc:7.1f} pF  Hub {dc/cp*100:6.0f} %")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--breite", type=float, help="Breite der Messbahn in mm")
    p.add_argument("--gnd", type=float, default=10.0, help="wirksame Breite der GND-Gegenelektrode in mm (beide Seiten zusammen)")
    p.add_argument("--hoehe", type=float, default=450.0, help="Messlänge (Wasserhöhe voll) in mm")
    p.add_argument("--dicke", type=float, default=0.020, help="Isolierdicke in mm (Lötstopplack ca. 0.010-0.030)")
    p.add_argument("--er", type=float, default=3.8, help="Dielektrizitätszahl der Isolierung (Lack ca. 3.5-4, PE/PO-Schrumpfschlauch ca. 2.3)")
    p.add_argument("--cp", type=float, default=25.0, help="Grundkapazität (Pin, Zuleitung, trocken) in pF")
    a = p.parse_args()

    if a.breite:
        zeile("eigene Werte", a.breite, a.gnd, a.hoehe, a.dicke, a.er, a.cp)
        return

    h = a.hoehe
    print(f"Messlänge {h:.0f} mm, GND-Gegenelektrode {a.gnd:.0f} mm, Grundkapazität {a.cp:.0f} pF\n")
    print("Variante A – nur Lötstopplack (er 3.8)")
    for d in (0.010, 0.020, 0.030):
        for b in (0.15, 0.2, 0.3, 0.5):
            zeile(f"  Lack {d*1000:.0f} µm", b, a.gnd, h, d, 3.8, a.cp)
    print("\nVariante B – Lack + Schrumpfschlauch/Beschichtung (er 2.3, Gesamtdicke)")
    for d in (0.3, 0.5):
        for b in (2.0, 3.0, 5.0):
            zeile(f"  Mantel {d*1000:.0f} µm", b, 3 * a.gnd, h, d, 2.3, a.cp)


if __name__ == "__main__":
    main()
