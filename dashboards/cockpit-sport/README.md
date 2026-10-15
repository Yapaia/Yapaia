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

## Spuren vor dem Abbiegen

Ab 500 m vor einer Abbiegung zeigt die Anweisung darunter die Fahrspuren,
die richtige hell (ab Yapaia Go 0.53.0, wo die Karte Spurpfeile kennt).

## Ankunft antippen: die Route

Ein Tipp auf die Ankunft öffnet die Halte: alle noch offenen Zwischenziele
und das Ziel, jeweils mit Restkilometern und Ankunftszeit (ab Yapaia Go
0.52.0, ältere Fassungen zeigen nur das Ziel). Die Zeile „Ziel: …“ unter der
Anweisung gibt es dafür nicht mehr.

## Ältere Browser

Die Karte kommt ohne Container-Einheiten (`cqw`, `@container`) aus: Das
Autoradio (Eonon UX6K Pro Max) hat eine WebView, die sie nicht kennt. Die
Maße setzt die Karte selbst per JavaScript nach der gemessenen Breite.
Verschieben und Größe ändern laufen über `transform` und Touch-Events,
weil die WebView (Chrome 101) `translate`/`scale` nicht kennt.

## Einrichten

1. Auf dem Mini-PC `python3 dashboards/deploy.py` ausführen: kopiert die
   Karte nach `/config/www/yapaia-cockpit/` und trägt die Ressource ein (mit
   `?v=<Prüfsumme>`, nach jeder Änderung einfach nochmal ausführen).
2. Von Hand geht es auch: Datei kopieren, unter *Einstellungen → Dashboards →
   ⋮ → Ressourcen* `/local/yapaia-cockpit/cockpit-sport-card.js?v=1`, Typ
   *JavaScript-Modul*, und nach jeder Änderung `?v=` hochzählen.
3. Neues Dashboard anlegen, im Raw-Konfigurationseditor den Inhalt von
   [`dashboard.yaml`](dashboard.yaml) einsetzen.

## Oben rechts: Internet

Zeigt, worüber der Router (Yapaia Router) gerade ins Internet geht, live
(alle 15 s):

- **WLAN:** die WLAN-Bögen, je mehr, desto besser der Empfang.
- **Mobilfunk:** Balken von links (klein) nach rechts (groß), dazu Netztyp
  (2G, E, 3G, H+, LTE, 5G) und aktive SIM, z. B. „5G SIM2“. **Rot** im
  Roaming.

Antippen öffnet darunter die Details: beim WLAN Netz, Signal, Kanal, IP und
Verbindungsdauer, beim Mobilfunk Anbieter, Netz und Bänder, aktive SIM, Land
(rot im Roaming) und Signalwerte, dazu die Knöpfe **SIM 1 / SIM 2** zum
Umschalten. Das Mikrofon daneben schaltet das Mikrofon des Satelliten stumm.

## Unten: Sprache und Sonderziele

- **Mikrofon:** öffnet den Sprachassistenten von Home Assistant und hört
  sofort zu (wie „Assist“ in der App). Im Browser braucht das Mikrofon eine
  sichere Verbindung (https oder die App).
- **Sonderziele** (Stecknadel): Tankstelle, Parkplatz, Stellplatz,
  Campingplatz, Supermarkt, Entsorgung, Frischwasser, Gasflaschen, Toilette.
  Eine Kategorie zeigt die nächsten, während der Fahrt voraus auf der Route.
  Ein Eintrag zeigt den Ort markiert auf der Karte, die anderen daneben
  (ab Yapaia Go 0.50.0). Das Fenster wird dann zu einer schmalen Leiste, damit
  die Karte frei bleibt: ◀ ▶ blättert, die Liste holt alle zurück, und
  **+ Zwischenziel** fügt den Ort ein. Ohne Navigation heißt der Knopf
  „Hinfahren“, dann wird der Ort das Ziel.
- Bei **Tankstellen** steht der Spritpreis dabei (Tankerkönig über Yapaia Go,
  Sorte aus dem aktiven Fahrzeugprofil, Diesel bzw. E5/E10), wie in Go:
  grün = aktuell, gelb = älter als 15 Minuten, grau = älter als eine Stunde,
  durchgestrichen = geschlossen. Ohne Tankerkönig-Verbindung gibt es keinen
  Preis.

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

## Tür und Licht

- **Schloss oben rechts** in der Kopfzeile: zeigt, ob die Aufbautür zu ist (rot = offen); Tippen schließt auf bzw. ab.
- **Lampe unten** in der Leiste: Tippen schaltet das Licht der Dinette; **lange drücken** öffnet ein Menü mit allen
  Lichtern (Dinette und Außen zuerst).
- Tür, Lampe und die Liste der Lichter (Name, Entität, Reihenfolge per Ziehen) lassen sich im grafischen Editor
  der Karte ändern (`door_entity`, `light_entity`, `lights`).

## Zielsuche: Favoriten und Verlauf

Öffnet man die Suche (Lupe), stehen dort – solange weniger als drei Zeichen getippt sind – die Favoriten aus
Yapaia Go und die letzten drei verschiedenen Ziele, jeweils mit Entfernung. Ein Tipp startet die Route.
Jedes in der Karte gewählte Ziel landet wie in Go selbst im Verlauf (`POST api/v1/history`), da Go Ziele aus
`yapaia.go_ziel_setzen` nicht selbst einträgt.

## Radio-Favoriten

Die Kachel „Favoriten“ zeigt alle Favoriten von Yapaia Beat in Seiten zu je vier Sendern. Wischen blättert,
die Punkte neben „Favoriten“ zeigen die Seite und lassen sich antippen. Beim Öffnen steht die Seite mit dem
laufenden Sender vorne.

