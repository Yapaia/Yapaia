# Dashboard „Stellplatz“

Für Stellplatz und Campingplatz: Heizung (Raum- und Wassertemperatur über die
Truma), Licht (Smartwomo-ESP: Dinette OUT2, Außen OUT1, Ambiente OUT5, Ambiente Bett OUT6, Bett OUT4, Bad OUT8, Eingang OUT3, Nachtlicht OUT7), Aufbautür (Door-ESP), Batterie,
Gas und Wasser (btcollector bzw. Smartwomo) und das Radio (Yapaia Beat).

Nur Standardkarten von Home Assistant und die Karte von Yapaia Beat, alles im
grafischen Editor änderbar.

## Offen

- Gas-Sensoren und einige Reifen liefern derzeit keine Werte („Unbekannt“).
- Wasser ist die Rohspannung des Drucksensors (V), noch nicht in Liter/Prozent umgerechnet.

## Einspielen

```sh
python3 dashboards/deploy.py --dashboard stellplatz
```
