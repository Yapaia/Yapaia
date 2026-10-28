# Dashboard „Stellplatz Stil“

Das Stellplatz-Dashboard als **eine eigene Karte** (`custom:yapaia-stellplatz-card`)
in drei Stilen, je eine Ansicht:

| Ansicht | Stil | Aussehen |
|---|---|---|
| Retro | `retro` | Retro-Camper: Sahne, Rost, Senf, schräge Streifen, Fraunces |
| Magazin | `magazin` | Outdoor-Magazin: Waldgrün mit Höhenlinien, große Serifenschrift, kurze Sätze |
| Mix | `mix` | Retro-Farben und -Kacheln im Magazin-Aufbau |

Inhalt wie im Dashboard [Stellplatz](../stellplatz/): Heizung (Truma Raum, Warmwasser
Eco/Heiß/Boost), Batterie mit Restlaufzeit, Solar, Gas und Frischwasser, alle
Lichter, Aufbautür, Radio (Yapaia Beat, Senderfavoriten), WLAN (Yapaia Router),
dazu Wetter (`weather.forecast_home`) und Sonne (`sun.sun`).

- **Energie:** aktuelle Leistung der Batterien in W, je Batterie Spannung × Strom
  der Shunts (negativ = Verbrauch/Entladen, positiv = Laden). Eigene
  Leistungssensoren gehen über `leistung`/`leistung_2`; die BMS-Werte
  `…battery_1_power` taugen dafür nicht, sie springen bei kleinen Strömen
  zwischen dem echten Wert und 0. Beim Laden schätzt
  die Karte, wann die Batterie voll ist: fehlende Ah (aus Ladestand und
  `kapazitaet_ah`, Standard 600 Ah) ÷ Ladestrom. Gegen Ende lädt eine
  Lithiumbatterie langsamer, deshalb „ca.“.
- **Aufbautür:** zweimal tippen (Schutz vor versehentlichem Öffnen).
- **Frischwasser:** ohne `wasser_leer_v`/`wasser_voll_v` zeigt die Karte die
  Spannung des Drucksensors; mit beiden Werten Prozent.
- **Ort:** statt „Stellplatz“ steht der aktuelle Ort in der Überschrift: aus
  `ort_entity` (Standard `sensor.autoradio_geocoded_location` der Companion-App
  auf dem Autoradio, Attribut `locality`; braucht dort Internet). Fest
  eintragen geht mit `ort`; ohne beides steht der Titel da. „Tag 3 auf dem Platz“ aus dem Entwurf
  fehlt noch – dafür gibt es keinen Sensor.
- **Schriften** (Fraunces, DM Sans, Instrument Serif, Inter) kommen von Google
  Fonts; ohne Internet nimmt die Karte Georgia bzw. die Systemschrift.
- Passt sich der Breite an: 1280 px (iPad quer) voll, darunter zwei Spalten,
  am Telefon eine.

## Einspielen

```sh
python3 dashboards/deploy.py --dashboard stellplatz-stil
```
