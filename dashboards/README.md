# Dashboards

Fertige Home-Assistant-Dashboards für die Yapaia-Module. Jedes Dashboard hat
einen eigenen Ordner mit

- `README.md` – was es zeigt, was es braucht, wie man es einrichtet,
- `dashboard.yaml` – die Rohkonfiguration für den Raw-Konfigurationseditor,
- eigenen Karten (`*.js`), falls es welche braucht.

| Dashboard | Was es ist |
|---|---|
| [Cockpit Sport](cockpit-sport/) | Navigation, Radio und Fahrdaten im Stil eines Auto-Infotainments |

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
