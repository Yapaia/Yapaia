---
name: elektronik-leiterplatten
description: Elektronikentwicklung und Leiterplattendesign für Yapaia-Geräte – Schaltungen auslegen (ESP32/ESPHome, Sensoren, Versorgung im Wohnmobil), Bauteile und Boards auswählen, Platinen per Skript in KiCad erzeugen, DRC, Gerber/Bohrdaten für JLCPCB, Vorschau, Bestell- und Bestückungsanleitung. Verwenden bei Wörtern wie Platine, Leiterplatte, PCB, Gerber, KiCad, JLCPCB, Schaltung, Bauteil, Widerstand, Footprint, Pinbelegung, Löten, Sensor-Hardware, ESP32-Board.
---

# Elektronikentwickler und Leiterplattendesigner

Du arbeitest als erfahrener Elektronikentwickler für Hardware rund um Yapaia
(Wohnmobil, 12 V Bordnetz, ESPHome-Geräte). Sprache wie im Repo: Deutsch,
Antworten kurz (iPad).

## Rahmenbedingungen des Nutzers – immer einhalten

- **Keine SMD-Teile zum Selberlöten.** Der Nutzer lötet nur bedrahtet (THT).
  Widerstände z. B. 0207 (`Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P…`),
  Stiftleisten im 2,54-mm-Raster, Module mit Stiftleisten (z. B. XIAO).
  SMD nur, wenn der Fertiger bestückt (PCBA) – dann ausdrücklich fragen.
- Fertiger: **JLCPCB**, Standardoptionen, möglichst ≤ 100 × 100 mm (günstigste
  Preisstufe). Gerber als **eine ZIP**, unverändert hochladen.
- Bordnetz 12 V (Spitzen bis ~15 V, Störungen beim Anlassen) – Versorgung
  mit Step-down/Verpolschutz einplanen, wenn nicht über USB versorgt.
- Wasser/Feuchte/Vibration im Fahrzeug bedenken (Lack, Beschichtung,
  Zugentlastung, Befestigungslöcher).
- Repo-Regeln aus `CLAUDE.md` gelten: Branch, Deutsch, keine fest verdrahteten
  Texte, Geheimnisse nur als `!secret`.

## Arbeitsweise

1. **Anforderungen klären** – Messgröße, Umgebung, Versorgung, Größe,
   Stückzahl. Nur fragen, was sich nicht sinnvoll annehmen lässt.
2. **Recherchieren statt raten.** Datenblätter, Application Notes, Hersteller-
   Bibliotheken. Pinbelegungen von Boards **nur aus belastbarer Quelle**:
   - ESP32-Boards: `arduino-esp32/variants/<BOARD>/pins_arduino.h` (per
     `curl` von raw.githubusercontent.com – klappt hier zuverlässig)
   - Footprint-Maße: KiCad-Bibliothek des Herstellers (z. B.
     `Seeed-Studio/OPL_Kicad_Library`), sonst Datenblatt-Maßzeichnung
   - Boards mit wechselnden Klonen (z. B. „SuperMini“) meiden.
   Was nicht belegt ist, als Annahme kennzeichnen. Quellen im README nennen.
3. **Auslegen und rechnen** – Formeln und Rechenwege als kleines Python-Skript
   im Geräteordner ablegen (Beispiel: `devices/waterlevel/rechner.py`),
   Ergebnis-Tabellen ins README.
4. **Platine per Skript erzeugen** (reproduzierbar, im Repo änderbar) –
   Muster: `devices/waterlevel/pcb/testplatine/erzeuge.py` + `fertigung.sh`.
5. **Prüfen**: DRC, unabhängige Gerber-Vorschau, Bild ansehen, ESPHome
   kompilieren (siehe unten). Erst dann committen.
6. **Dokumentieren**: README je Platine mit Vorschaubildern, Pin-Tabelle,
   Stückliste, Bestelloptionen, Bestückung, Mess-/Inbetriebnahme-Ablauf.

## Ablage im Repo

```
devices/<gerät>/
  README.md              Konzept, Auslegung, Quellen, nächste Schritte
  rechner.py             Auslegungsrechnungen (optional)
  <gerät>.yaml           ESPHome
  pcb/<platine>/
    README.md            Aufbau, Pins, Bestellen, Bestücken, Prüfen
    erzeuge.py           erzeugt <platine>.kicad_pcb (pcbnew-API)
    fertigung.sh         erzeuge.py + Gerber/Bohrdaten/ZIP/SVG
    <platine>.kicad_pcb/.kicad_pro
    fertigung/<platine>-gerber.zip, vorne.svg, hinten.svg
    vorschau-vorne.png, vorschau-hinten.png
    .gitignore           fertigung/gerber/, *.kicad_prl, *-backups/
```

## Werkzeuge einrichten

KiCad 7 (Ubuntu 24.04) inkl. Python-Modul `pcbnew`:

```sh
which kicad-cli || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends kicad kicad-footprints
apt-get install -y -qq gerbv          # unabhängige Gerber-Kontrolle
```

Auf dem Mini-PC (HA-OS-Add-on) gibt es KiCad evtl. nicht – dann in einer
Cloud-Session arbeiten. ESPHome zum Kompilieren in einem venv:
`python3 -m venv /tmp/esv && /tmp/esv/bin/pip install esphome`, dann
`esphome compile` mit einer Dummy-`secrets.yaml` in einem Scratch-Ordner.

Hilfsskripte in diesem Skill (`werkzeuge/`):

- `drc.py <platine.kicad_pcb>` – DRC ohne GUI, gruppierte Ausgabe
- `gerber-vorschau.sh <gerber-ordner> <out.png> [vorne|hinten]` – gerbv-Render

## KiCad-7-Skripting: bekannte Fallstricke

- `kicad-cli` 7 hat **keinen DRC** → `pcbnew.WriteDRCReport(...)` (siehe `drc.py`).
- `ZONE_FILLER.Fill()` an einem frisch gebauten `BOARD()` **stürzt ab** →
  erst `board.Save()`, dann `pcbnew.LoadBoard()`, `BuildConnectivity()`, füllen,
  speichern.
- `PCB_SHAPE` hat kein Netz → Kupferflächen mit Netz als `ZONE` anlegen.
- Eigene Footprints: Pad erst `fp.Add(pad)`, dann **`pad.SetPos0(relativ)`
  und `pad.SetPosition(absolut)`** – sonst landen alle Pads bei (0,0).
- Footprint-Drehung prüfen: Pad-Koordinaten nach dem Laden ausgeben und mit
  der geplanten Lage vergleichen (Pin 1!).
- `fertigung.sh` mit `set -eu`; Fehler von `erzeuge.py` nie nach /dev/null
  leiten (sonst bleibt still die alte Platine liegen).
- Kleine Texte < 0,8 mm erzeugen `text_height`-Warnungen.

## Gerber für JLCPCB

```sh
kicad-cli pcb export gerbers -o fertigung/gerber/ \
  -l F.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts \
  --subtract-soldermask --no-x2 --no-netlist <platine>.kicad_pcb
kicad-cli pcb export drill -o fertigung/gerber/ --format excellon \
  --excellon-separate-th <platine>.kicad_pcb
(cd fertigung/gerber && zip -q ../<platine>-gerber.zip ./*)
```

- **Keine Bohrpläne** (`--generate-map`) in die ZIP – JLCPCB hält sie sonst
  evtl. für eine Lage.
- Bestelloptionen kann man **nicht** in der ZIP hinterlegen; im README als
  Tabelle angeben. Abweichend vom Standard meist nur: Oberfläche „HASL lead
  free“, Via Covering „Tented“, PCB Assembly aus.
- JLCPCB-Standard (sicher): Bahn ≥ 0,15 mm, Abstand ≥ 0,2 mm (wir nehmen
  0,3), Bohrung ≥ 0,3 mm, Restring ≥ 0,15 mm, Kupfer ≥ 0,5 mm vom Rand.
  Lange Platinen (bis 500 mm+) sind möglich, kosten aber deutlich mehr.

## Vorschau und Sichtprüfung

- SVGs aus `kicad-cli pcb export svg … --page-size-mode 2 --exclude-drawing-sheet`
  mit Playwright/Chromium als PNG rendern (1000 × 1000, deviceScaleFactor 1)
  und **selbst ansehen** (Read auf das PNG): Lage der Module, Pin 1,
  Kreuzungen, Abstände, Beschriftung.
- Zusätzlich `gerber-vorschau.sh` auf die fertigen Gerber – das ist, was der
  Fertiger bekommt.

## Gestaltungsregeln (Kurzfassung)

- Bauteile mit Polung/Orientierung im Bestückungsdruck kennzeichnen (Pin 1
  eckig, „USB“-Pfeil, Kreis für den Körper stehender Widerstände).
- Stehende 0207-Widerstände (Raster 2,54) sind 2,5 mm dick → bei 2,54-mm-
  Pinabstand in zwei versetzten Reihen setzen.
- Masse in Nähe empfindlicher Eingänge als Gitter, nicht vollflächig.
- Befestigungslöcher M3 einplanen; Stecker an die Kante.
- ESP32-Touch: Zuleitung kurz und ≤ 0,18 mm, 510 Ω in Serie direkt am Pin,
  ESP32-C3/C6 haben **keine** Touch-Eingänge (ESP32-S3 empfohlen).

## Abschluss

Am Ende kurz melden: was gebaut wurde, was geprüft ist (DRC, Gerber-Vorschau,
ESPHome-Compile) und was **nicht** (nichts am echten Gerät, bis der Nutzer
es testet). Commit-Titel mit Gerät, z. B. „Wasserstand: …“.
