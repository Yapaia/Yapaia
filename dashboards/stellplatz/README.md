# Dashboard „Stellplatz“

Für Stellplatz und Campingplatz: Heizung (Raum- und Wassertemperatur über die
Truma), Licht (Smartwomo-ESP: Dinette OUT2, Außen OUT1, Ambiente OUT5, Ambiente Bett OUT6, Bett OUT4, Bad OUT8, Eingang OUT3, Nachtlicht OUT7), Aufbautür (Door-ESP), Batterie,
Solar (Victron SmartSolar über btcollector), Gas und Wasser (btcollector bzw. Smartwomo), das Radio (Yapaia Beat)
und Internet: WLANs in der Umgebung suchen und den GL.iNet-Router damit verbinden.

Standardkarten von Home Assistant, die Karte von Yapaia Beat und die eigene
Karte `wlan-card.js`, alles im grafischen Editor änderbar.

## WLAN-Karte (`custom:yapaia-wlan-card`)

- **Suchen** zeigt die WLANs der Umgebung (je Name ein Eintrag, Signal, Bänder,
  offen/verschlüsselt, beim Router gespeichert). Antippen → Passwort → **Verbinden**.
  Bei gespeicherten WLANs darf das Passwort leer bleiben.
- Oben steht, mit welchem WLAN der Router verbunden ist und worüber das
  Internet gerade läuft; **Trennen** schaltet zurück (z. B. auf Mobilfunk).
- **Captive Portal:** Meldet der Router, dass das WLAN eine Anmeldung im Browser
  verlangt (Zugangscode, „Bedingungen akzeptieren“), zeigt die Karte einen
  Hinweis mit **Anmeldeseite öffnen** (`http://neverssl.com`, einstellbar).
  Das muss auf einem Gerät im WLAN des Wohnmobils geschehen; die Anmeldung gilt
  dann für alle Geräte dahinter, weil der Router für alle gemeinsam im
  Campingplatz-WLAN hängt.
- Braucht das Router-Modul der Integration ab 0.4.0 (Aktionen
  `yapaia.router_wlan_suchen`, `…_verbinden`, `…_trennen`, Sensor
  `binary_sensor.yapaia_router_wlan_anmeldung`).

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
