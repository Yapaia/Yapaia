# Cockpit Sport

Ein Dashboard im Stil eines Auto-Infotainments: die Karte von Yapaia Go
bildschirmfüllend, darüber Kacheln für Radio (Yapaia Beat) und Favoriten,
rechts oben die nächste Anweisung, unten Ankunft und eine Leiste mit Tempo,
Tempolimit und Höhe.

Die Zielsuche (Lupe) sucht wie das Suchfeld in Yapaia Go selbst: ab drei
Zeichen, mit der eigenen Position als Vorliebe, sortiert nach Entfernung.
Enter nimmt den ersten Vorschlag.

## Braucht

- **Yapaia Go** – ab 0.48.0 trägt ein gewähltes Ziel den Namen des
  Suchtreffers, ältere Fassungen navigieren ohne Namen.
- Die Kartenkachel von Yapaia Go als Ressource `/local/yapaia/yapaia-map-card.js`
  (liegt in [`go/yapaia_go/lovelace/`](../../go/yapaia_go/lovelace/)).
- Optional **Yapaia Beat** (Radio) und **Yapaia Satellite** (Mikrofon).
  Die Entitäten stehen oben in `cockpit-sport-card.js` unter `E`.

## Einrichten

1. `cockpit-sport-card.js` nach `/config/www/yapaia-cockpit/` kopieren.
2. *Einstellungen → Dashboards → ⋮ → Ressourcen*:
   `/local/yapaia-cockpit/cockpit-sport-card.js?v=1`, Typ *JavaScript-Modul*.
   Nach jeder Änderung an der Datei `?v=` hochzählen, sonst lädt der Browser
   die alte.
3. Neues Dashboard anlegen, im Raw-Konfigurationseditor den Inhalt von
   [`dashboard.yaml`](dashboard.yaml) einsetzen.

Mit `demo: true` an der Karte zeigt sie Beispielwerte einer Navigation.
