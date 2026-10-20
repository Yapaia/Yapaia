# Dashboards

Fertige Home-Assistant-Dashboards für die Yapaia-Module. Jedes Dashboard hat
einen eigenen Ordner mit

- `README.md` – was es zeigt, was es braucht, wie man es einrichtet,
- `dashboard.yaml` – die Rohkonfiguration für den Raw-Konfigurationseditor,
- eigenen Karten (`*.js`), falls es welche braucht.

| Dashboard | Was es ist |
|---|---|
| [Cockpit Sport](cockpit-sport/) | Navigation, Radio und Fahrdaten im Stil eines Auto-Infotainments |
| [Rangieren](rangieren/) | Parkmanöver: Rückfahrkamera, Nivellierung, Licht Dinette, Aufbautür |
| [Stellplatz](stellplatz/) | Stellplatz/Camping: Heizung, Licht, Tür, Batterie, Gas, Wasser, Radio |

Rangieren, Stellplatz und Teile von Cockpit Sport zeigen auch Werte der
ESPHome-Geräte aus [`devices/esphome/`](../devices/esphome/) (Heizung, Tür,
Licht, Bluetooth-Sammler). Wer andere Geräte hat, passt die Entitäten im
grafischen Editor bzw. in `dashboard.yaml` an.

## Einspielen

Auf dem Mini-PC (im Entwicklungs-Add-on):

```sh
python3 dashboards/deploy.py
```

Das kopiert die Karten nach `/config/www/` und setzt ihre Ressource in Home
Assistant auf `?v=<Prüfsumme der Datei>`. `?v=` von Hand hochzählen ist damit
nicht mehr nötig: Die Prüfsumme ändert sich genau dann, wenn sich die Datei
ändert, und jeder Browser lädt die neue Fassung beim nächsten Öffnen. Fehlt
die Ressource noch, legt das Skript sie an. Neue Karten trägt man in
`KARTEN` in `deploy.py` ein.

Mit `--dashboard <ordner>` legt das Skript zusätzlich das Dashboard aus
`<ordner>/dashboard.yaml` an bzw. überschreibt es (eingetragen in `DASHBOARDS`).
Ohne die Option bleiben Dashboards unangetastet. Python braucht `aiohttp`
und `pyyaml`.
