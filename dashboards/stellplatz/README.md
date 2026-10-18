# Dashboard „Stellplatz“

Für Stellplatz und Campingplatz: Heizung (Raum- und Wassertemperatur über die
Truma), Licht (Smartwomo-ESP: Dinette OUT2, Außen OUT1, Ambiente OUT5, Ambiente Bett OUT6, Bett OUT4, Bad OUT8, Eingang OUT3, Nachtlicht OUT7), Aufbautür (Door-ESP), Batterie,
Solar (Victron SmartSolar über btcollector), Gas und Wasser (btcollector bzw. Smartwomo) und das Radio (Yapaia Beat).

Nur Standardkarten von Home Assistant und die Karte von Yapaia Beat, alles im
grafischen Editor änderbar.

## Offen

- Gas-Sensoren und einige Reifen liefern derzeit keine Werte („Unbekannt“).
- Wasser ist die Rohspannung des Drucksensors (V), noch nicht in Liter/Prozent umgerechnet.

## Einspielen

```sh
python3 dashboards/deploy.py --dashboard stellplatz
```

## Hilfssensoren

- `sensor.batterien_restlaufzeit` (Template-Helfer in HA): Restlaufzeit beider
  Batterien zusammen = 3 × (SOC Shunt 1 + SOC Shunt 2) Ah ÷ Entladestrom
  (2 × 300 Ah). Beim Laden „Unbekannt“. Anzeige der drei Restlaufzeiten in HA auf Tage umgestellt (Entitätseinstellung, Anzeige z. B. „8 T, 13h“).
