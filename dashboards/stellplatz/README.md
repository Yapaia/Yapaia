# Dashboard „Stellplatz“

Für Stellplatz und Campingplatz: Heizung (Raum- und Wassertemperatur über die
Truma), Licht (Smartwomo-ESP, OUT1–OUT8), Aufbautür (Door-ESP), Batterie,
Gas und Wasser (btcollector bzw. Smartwomo) und das Radio (Yapaia Beat).

Nur Standardkarten von Home Assistant und die Karte von Yapaia Beat, alles im
grafischen Editor änderbar.

## Offen

- Die Lichter heißen noch OUT1–OUT8, bis feststeht, was an welchem Ausgang hängt.
- Gas-Sensoren und einige Reifen liefern derzeit keine Werte („Unbekannt“).
- Wasser ist die Rohspannung des Drucksensors (V), noch nicht in Liter/Prozent umgerechnet.

## Einspielen

```sh
python3 dashboards/deploy.py --dashboard stellplatz
```
