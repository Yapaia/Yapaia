# Wasserstand – kapazitiver Füllstandssensor (Entwurf)

Füllstandsmessung für den Frischwassertank (max. 50 cm hoch) mit einem ESP32 und
einer langen Leiterplatte als Sonde. Die Sonde hängt im Tank, ihre Leiterbahnen
sind nur durch den Lötstopplack (oder zusätzlich eine Beschichtung) vom Wasser
getrennt. Der ESP32 misst die Kapazität über seinen Touch-Eingang.

Stand: **Konzept und Dimensionierung**, noch keine Platine, nichts am Gerät geprüft.

| Datei | Inhalt |
|---|---|
| `README.md` | Konzept, Dimensionierung, Recherche, nächste Schritte |
| [`rechner.py`](rechner.py) | Rechner: Kapazität je Bahnbreite, Isolierdicke und Wasserhöhe |
| [`waterlevel.yaml`](waterlevel.yaml) | ESPHome-Entwurf für ESP32-S3 (ungetestet) |

## Messprinzip

Leitungswasser ist leitfähig. Für die Messung wirkt es deshalb nicht als
Dielektrikum, sondern wie eine **Kondensatorplatte**, die sich mit dem Füllstand
an der Sonde hochschiebt:

```
Touch-Pin ── Messbahn ─┤Lack├─ Wasser ─┤Lack├─ GND-Gegenelektrode ── GND (ESP)
              C_mess = ε0·εr·(b·h)/d          C_gnd (viel größer)
```

- Eingetauchte Fläche = Bahnbreite `b` × Wasserhöhe `h` → die Kapazität steigt
  **linear mit dem Füllstand**.
- Dielektrikum ist nur die Isolierung (Dicke `d`). Lötstopplack ist sehr dünn
  (ca. 10–30 µm, εr ≈ 3,5–4) → schon schmale Bahnen ergeben viel Kapazität.
- Die **zweite, isolierte Elektrode liegt auf GND** und koppelt das Wasser an
  die Masse des ESP. Ohne sie hinge das Wasser nur über undefinierte Wege
  (Pumpe, Tankwand, Fahrzeug) an Masse – die Messung würde wandern.
  Beide Kapazitäten liegen in Reihe; ist die GND-Elektrode ≥ 20× so breit wie
  die Messbahn, kostet das < 5 % Signal.

## Dimensionierung

### Was der ESP32 mag

Aus der Espressif Touch Sensor Application Note (geschrieben für Tasten unter
Abdeckungen, gilt hier nur sinngemäß):

- Der ESP32 lädt und entlädt den Pin mit einer Stromquelle; beim klassischen
  ESP32 sinkt der Zählwert mit steigender Kapazität („inversely proportional to
  the total capacitance“).
- **Grundkapazität Cp klein halten** – sie verdünnt die Änderung. Beispiel aus der
  Note: 5 pF Änderung sind bei Cp = 20 pF 25 %, bei Cp = 100 pF nur noch 5 %.
- Größte Einflüsse auf Cp: Zuleitungslänge, Massefläche nahe der Elektrode,
  Abstand zu Masse, Durchkontaktierungen.
- Richtwerte: Zuleitung ≤ 300 mm und ≤ 0,18 mm breit, 0,5–1 mm Abstand zu Masse,
  Masse als Gitter (Schraffur) statt Vollfläche, keine Vollfläche näher als 10 mm,
  Serienwiderstand 470 Ω–2 kΩ (510 Ω empfohlen) direkt am Pin.
- Stabil gilt ein System ab > 3 % Änderung und Signal/Rauschen > 5:1.

**Folgerung für die Sonde:** Unser Problem ist nicht zu wenig Signal, sondern
zu viel. Ein Finger bringt ein paar pF, eine voll eingetauchte Bahn unter Lack
hunderte pF. Ziel ist deshalb:

- Hub (leer → voll) etwa **50–150 pF**, Grundkapazität Cp **≤ 30 pF**
- also **schmale Messbahn**, Zuleitung zum Pin so kurz wie möglich
  (ESP direkt oben auf der Sonde, kein Kabel)

### Rechenwerte (`python3 rechner.py`, 450 mm Messlänge)

Variante A – nur Lötstopplack (εr 3,8):

| Bahnbreite | Lack 10 µm | Lack 20 µm | Lack 30 µm |
|---|---|---|---|
| 0,15 mm | 224 pF | 112 pF | 75 pF |
| **0,20 mm** | 297 pF | **148 pF** | 99 pF |
| 0,30 mm | 441 pF | 221 pF | 147 pF |
| 0,50 mm | 721 pF | 361 pF | 240 pF |

Variante B – Sonde zusätzlich in Schrumpfschlauch/Beschichtung (εr ≈ 2,3):

| Bahnbreite | Mantel 0,3 mm | Mantel 0,5 mm |
|---|---|---|
| 2 mm | 57 pF | 34 pF |
| **3 mm** | **83 pF** | 50 pF |
| 5 mm | 131 pF | 79 pF |

Erkenntnisse:

- **Die Lackdicke streut stark** (Hersteller, über Kupferkanten dünner) – der
  Hub schwankt dadurch um den Faktor 3. Einmal kalibrieren (leer/voll) ist
  deshalb Pflicht, der Absolutwert ist egal.
- Mit Lack allein: **Messbahn 0,2 mm** (8 mil, jeder Fertiger kann das).
- Lötstopplack ist nicht für Dauer-Unterwasser gedacht (Wasseraufnahme,
  Haarrisse, Drift, Trinkwasser). Robuster ist Variante B: dickerer, definierter
  Mantel → weniger Streuung, weniger Drift. Dafür Messbahn breiter (**3 mm**).
  Falls Variante B: auf Lebensmitteltauglichkeit des Materials achten und
  Lufteinschlüsse unter dem Mantel vermeiden (die verfälschen die Kapazität).

### Vorschlag Platinenaufbau (Variante A)

```
   ┌──────────────────────┐  ← Kopf (über dem Tank, trocken)
   │  ESP32-S3-Modul/Board│     Touch-Pin → 510 Ω → Messbahn (Zuleitung < 20 mm)
   │  12 V → 3,3 V, Stecker│
   ├──────────────────────┤  ← Tankdeckel / Durchführung
   │▓▓▓▓▓  │   │  ▓▓▓▓▓▓▓│
   │▓ GND ▓  S  ▓  GND  ▓│  S = Messbahn 0,2 mm, mittig
   │▓ 8 mm▓  │  ▓ 8 mm  ▓│  Abstand S ↔ GND je 1,5–2 mm
   │▓▓▓▓▓  │   │  ▓▓▓▓▓▓▓│  GND-Streifen auf beiden Seiten, unter Lack
   │   ┄┄ Schnittmarke ┄┄ │  alle 50 mm, mit cm-Skala im Bestückungsdruck
   │▓▓▓▓▓  │   │  ▓▓▓▓▓▓▓│
   └──────────────────────┘  ← unteres Ende, ggf. gekürzt und versiegelt
         ca. 22 mm breit, 1,6 mm FR4, 2 Lagen, bis 500 mm + Kopf lang
```

- Messbahn auf der Oberseite mittig, **unter der Messbahn auf der Unterseite
  kein Kupfer** (Aussparung ± 3 mm), sonst steigt Cp über das FR4.
- GND-Gegenelektrode: Streifen links/rechts oben und unten, unter Lack, über
  Durchkontaktierungen verbunden. Gesamtbreite ≥ 20× Messbahn (hier ≈ 30 mm
  wirksam, also reichlich).
- Messbahn endet ca. 5 mm vor dem unteren Rand, GND-Streifen ebenso – an der
  Schnittkante liegt so kein Kupfer der Messbahn frei.
- **Kürzen:** an den Schnittmarken unten absägen, Kante mit Epoxid versiegeln
  (die Bahnen sind dort durchtrennt und liegen blank). Die Kalibrierung danach
  neu machen.
- Kopf: ESP direkt auf der Sonde (Touch-Zuleitung kurz!), Versorgung 12 V über
  Step-down. Der Kopf sitzt über dem höchsten Wasserstand; Kondenswasser im
  Tank beachten (Kopf ggf. vergießen oder außerhalb des Deckels).
- Länge: 2-lagige FR4-Platinen bis 500 mm und mehr bietet z. B. JLCPCB an
  (dort 670 × 600 mm bzw. 1020 × 600 mm ab 0,8 mm Dicke) – vor Bestellung im
  Angebotstool prüfen; Platinen über 100 mm kosten deutlich mehr.

### Welcher ESP32

- **ESP32-S3 (empfohlen):** 14 Touch-Kanäle, feinere Auflösung, Zählwert steigt
  mit der Kapazität, hat einen Schirm-/Wasserschutz-Kanal (Shield). Von ESPHome
  unterstützt. *Grenzwerte für große Kapazitäten konnte ich in der Doku nicht
  finden – deshalb Test-Platine zuerst.*
- Klassischer ESP32: geht auch (10 Touch-Kanäle), Zählwert sinkt mit 1/C;
  über die Messdauer lässt sich die Auflösung erhöhen.
- **ESP32-C3/C6 haben keine Touch-Eingänge** (z. B. das Board der Tür) – nicht geeignet.

## Offene Punkte / Risiken

- Reicht der Messbereich des S3 für 150–300 pF? → Test-Platine
- Drift durch Lack-Wasseraufnahme und Temperatur → Langzeittest im Tank;
  Ausbaustufe: kurze **Referenzelektrode** am unteren Ende (immer unter Wasser)
  für eine verhältnisbasierte Messung, oder **Segmente** (z. B. 5–10 Stück à
  50 mm auf eigenen Touch-Pins; volle Segmente kalibrieren das teilweise
  eingetauchte von selbst).
- Wasserfilm/Tropfen an der Sonde über dem Wasserspiegel → kleiner Fehler beim
  Absinken; Messwert über Median glätten.
- Fahrt: Wasser schwappt → gleitender Mittelwert über einige Sekunden.
- Sehr weiches Wasser (Osmose/destilliert) ist kaum leitfähig – dann gilt das
  Modell nicht mehr, Kalibrierung ändert sich.
- Störungen von Wasserpumpe/12-V-Leitungen auf die Messbahn.

## Nächste Schritte

1. **Test-Platine** (≤ 100 × 100 mm, billig): mehrere Messbahnen 0,15 / 0,2 /
   0,3 / 0,5 mm × 80 mm mit GND-Streifen, je auf eigenem Anschluss. In einem
   Messbecher mit ESP32-S3 Rohwerte über die Eintauchtiefe aufnehmen
   (ESPHome `setup_mode`), dazu eine Hälfte mit Schrumpfschlauch.
2. Bahnbreite und Variante festlegen, Rechner mit gemessener Kapazität/mm
   abgleichen.
3. Sonde 500 mm in KiCad zeichnen (Ordner `pcb/`), mit Kopf für das ESP-Board.
4. `waterlevel.yaml` am echten Gerät testen, in `devices/esphome/` übernehmen.

## Quellen

- Espressif, Touch Sensor Application Note (ESP32):
  <https://github.com/espressif/esp-iot-solution/blob/release/v1.0/documents/touch_pad_solution/touch_sensor_design_en.md>
- ESP-IDF, Kapazitiver Touch-Sensor ESP32-S3:
  <https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-reference/peripherals/cap_touch_sens.html>
- ST AN4312 (Leiterbahn-Parasitärkapazität):
  <https://www.st.com/content/st_com/en/technical-documents/an4312-how-to-design-surface-sensors-for-touch-sensing-applications-on-stm32-mcus-stmicroelectronics_asset/chunk-003-topic-an4312-rotary-sensor.html>
- Renesas Referenzdesign Füllstand mit Schirmelektrode:
  <https://www.renesas.com/en/design-resources/reference-designs/liquid-level-ct-ref>
- TI TIDUE90 (Flüssigkeit und kapazitive Sensoren, Schirmelektrode):
  <https://www.ti.com/document-viewer/lit/html/TIDUE90/shield-sensor-electrodes-t5367504-12>
- JLCPCB Platinengrößen: <https://jlcpcb.com/help/article/pcb-dimensions>
