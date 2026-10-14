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

## Kopfzeile ausblenden

Der Knopf mit dem Vollbild-Symbol in der oberen Leiste blendet die Kopfzeile
von Home Assistant („Cockpit Sport“) aus. Die Karte füllt dann den ganzen
Bildschirm. Nochmal tippen holt sie zurück, etwa zum Bearbeiten des
Dashboards. Gespeichert wird je Gerät. Andere Dashboards behalten ihre
Kopfzeile.

Das greift in Home Assistant hinein (getestet mit 2026.10). Ändert ein Update
den Aufbau, bleibt die Kopfzeile einfach stehen. Dann hilft kiosk-mode aus
HACS (`kiosk_mode: hide_header: true`).

## Anpassen

Der Knopf mit den vier Pfeilen in der oberen Leiste startet das Anpassen:

- **Ruhe** / **Navigation** wählt den Bildschirm. „Navigation“ zeigt dabei
  Beispielwerte, man muss also nicht losfahren.
- Jedes Objekt (Leisten, Radio, Favoriten, Anweisung, Kompass, Tempolimit,
  Suche, Ankunft) hat einen Rahmen: ziehen verschiebt, der Punkt unten rechts
  ändert die Größe.
- Ab Yapaia Go 0.49.0 erscheint in der Karte ein Fadenkreuz: dort sitzt die
  eigene Position. Auch die Verkehrsliste der Karte lässt sich dann
  verschieben. Das gilt nur für die Karte im Dashboard, nicht für Yapaia Go
  selbst.
- **Zurücksetzen** stellt den gewählten Bildschirm wieder auf den Standard.

Gespeichert wird je Gerät (im Browser), wie in Yapaia Go. Die Verschiebungen
wachsen mit der Breite mit: Auf- und Zuklappen der Seitenleiste von Home
Assistant lässt alles an seinem Platz. Ältere Anordnungen (in Pixeln) werden
beim ersten Öffnen einmal umgerechnet. Lagen sie nach dem Umklappen schief,
einmal nachrücken.

Mit `demo: true` an der Karte zeigt sie Beispielwerte einer Navigation.
