# ESPHome-Geräte

Hier liegen die Konfigurationen aller ESPHome-Geräte, je Gerät ein eigener Ordner.
Im Betrieb liegen die Dateien im ESPHome Device Builder unter `/config/esphome/`.

| Ordner | Gerät |
|---|---|
| [`btcollector/`](btcollector/) | Bluetooth-Sammler: Batterie-BMS, Victron SmartShunt, Gasflaschen, Reifendruck |
| [`door/`](door/) | Tür / Aufbauschloss |
| [`heizung/`](heizung/) | Truma-Heizung (iNet Box) und Neigungssensor |
| [`navi/`](navi/) | Navigationsanzeige im Fahrzeug, so wie sie aktuell aufgespielt ist |
| [`smartwomo/`](smartwomo/) | Schaltausgänge im Wohnmobil |
| [`swc/`](swc/) | Lenkradfernbedienung (SWC) fürs Autoradio: zwei Digitalpotis (X9C) bilden die Lenkradtasten nach; dazu ein GPS-Empfänger |
| [`yapaia-satellite/`](yapaia-satellite/) | Gerätedatei des Sprachsatelliten; die eigentliche Firmware liegt in [`satellite/`](../../satellite/) |
| [`m5-dial/`](m5-dial/) | Drehknopf M5Stack Dial: Navi und Wasserwaage wie `yapaia-nav-display/`, dazu Licht, Heizung, Batterie, Gas, Reifen, Uhr/Tür |
| [`yapaia-nav-display/`](yapaia-nav-display/) | Navigationsanzeige aus dem Repo (Kopie von [`go/esphome/`](../../go/esphome/), aktueller als `navi/`) |

## Geheimnisse

Das Repo ist öffentlich. Schlüssel, Passwörter, Bindkeys und MAC-Adressen stehen deshalb
nicht in den Dateien, sondern als `!secret …` in der `secrets.yaml` des Device Builders.
Welche Namen gebraucht werden, zeigt [`secrets.beispiel.yaml`](secrets.beispiel.yaml). Eine `secrets.yaml` nie
einchecken.
