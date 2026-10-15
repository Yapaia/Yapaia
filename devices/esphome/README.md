# ESPHome-Geräte

Hier liegen die Konfigurationen aller ESPHome-Geräte, je Gerät ein eigener Ordner.
Im Betrieb liegen die Dateien im ESPHome Device Builder unter `/config/esphome/`.

| Ordner | Gerät |
|---|---|
| `btcollector/` | Bluetooth-Sammler: Batterie-BMS, Victron SmartShunt, Gasflaschen, Reifendruck |
| `door/` | Tür / Aufbauschloss |
| `heizung/` | Truma-Heizung (iNet Box) und Neigungssensor |
| `navi/` | Navigationsanzeige im Fahrzeug, so wie sie aktuell aufgespielt ist |
| `smartwomo/` | Schaltausgänge im Wohnmobil |
| `swc/` | swc (GPS, Schrittmotoren) |
| `yapaia-satellite/` | Gerätedatei des Sprach-Satelliten; die eigentliche Firmware liegt in `satellite/` |
| `yapaia-nav-display/` | Navigationsanzeige aus dem Repo (Kopie von `go/esphome/`, aktueller als `navi/`) |

## Geheimnisse

Das Repo ist öffentlich. Schlüssel, Passwörter, Bindkeys und MAC-Adressen stehen deshalb
nicht in den Dateien, sondern als `!secret …` in der `secrets.yaml` des Device Builders.
Welche Namen gebraucht werden, zeigt `secrets.beispiel.yaml`. Eine `secrets.yaml` nie
einchecken.
