# Troubleshooting

Was tun, wenn …? Für jeden Fall: **Symptom** (was du siehst) → **Ursache**
(warum das passiert) → **Lösung** (was du tust). Probleme bei der Installation
des Add-ons stehen am Ende unter [Die Add-on-Installation bricht ab](#i-01--die-add-on-installation-bricht-ab).

## Inhalt

| Problem | Schweregrad |
|---|---|
| [GPS-Signal verloren](#w-01--gps-signal-verloren-tunnel-parkhaus-abschattung) | 🟠 |
| [Positionsmarker springt](#w-02--positionsmarker-springt-kurz-unrealistisch) | 🟠 |
| [„Standortzugriff nicht möglich"](#w-03--standortzugriff-nicht-möglich) | 🟠 |
| [Automatische Neuberechnung nach einer Abzweigung](#w-05--app-berechnet-nach-einer-abzweigung-automatisch-neu) | 🟠 |
| [Home-Assistant-Entitäten „nicht verfügbar"](#w-06--ha-entitäten-werden-nicht-verfügbar) | 🟠 |
| [Route führt an einer zu engen/niedrigen Stelle vorbei](#w-08--route-führt-an-einer-zu-engenniedrigen-stelle-vorbei-) | 🔴 |
| [„Ziel liegt außerhalb der installierten Karte"](#w-09--meldung-ziel-liegt-außerhalb-der-installierten-karte) | 🟠 |
| [Add-on verhält sich verdächtig](#w-10--add-on-verhält-sich-verdächtig-) | 🔴 |
| [Add-on ist nach einem Update deaktiviert](#w-11--add-on-ist-nach-einem-update-deaktiviert) | 🟠 |
| [Suche reagiert nicht mehr](#w-12--suche-reagiert-nicht-mehrvereinfachte-suche) | 🟠 |
| [App ruckelt, während ein Add-on aktiv ist](#w-14--app-ruckelt-während-ein-add-on-aktiv-ist) | 🟠 |
| [Funktioniert direkt, aber nicht über Home Assistant](#w-15--app-funktioniert-direkt-aber-nicht-über-ha-ingress) | 🟠 |
| [Nach einem Update fehlen Daten](#w-16--nach-einem-update-fehlen-kartendaten-oder-einstellungen-) | 🔴 |
| [Region-Download wegen Speicherplatz abgelehnt](#w-18--region-download-wird-sofort-mit-speicherplatz-fehler-abgelehnt) | 🟠 |
| [Navigation nach Tab-Absturz/Neustart weg](#w-19--navigation-scheint-nach-tab-crashneustart-weg-zu-sein) | 🟠 |
| [Ankunftszeit wirkt falsch](#w-22--anzeige-der-ankunftszeit-wirkt-falsch) | 🟠 |

---
## W-01 — GPS-Signal verloren (Tunnel, Parkhaus, Abschattung)

**Symptom:** Der Positionspunkt wird grau, ein Banner „GPS-Signal verloren"
erscheint; nach ca. 30 s pausiert die Navigation.

**Ursache:** Der GPS-Empfänger liefert länger als 3 Sekunden keinen gültigen
Fix mehr (`gpsd`-Modus < 2 bzw. Browser-Timeout) — typisch in Tunneln,
Parkhäusern oder unter Brücken.

**Lösung:**
1. Kurzzeitig (< 30 s) musst du nichts tun: Die App fährt per
   Koppelnavigation (Dead-Reckoning) mit der letzten bekannten Geschwindigkeit
   weiter, **Ansagen laufen normal weiter** — genau für Tunnelabfahrten gebaut.
2. Hält der Verlust länger an: freie Sicht zum Himmel herstellen, sobald
   möglich (aus Tunnel/Parkhaus heraus).
3. Prüfe, ob eine **externe** USB-GPS-Antenne mit Fensterhalterung verbaut
   ist statt einer im Gehäuse verbauten Antenne — die häufigste Ursache für
   dauerhaft schlechten Empfang im Fahrzeug.
4. Prüfen, ob wirklich der USB-Empfänger liefert: in der Add-on-Konfiguration
   muss `gps_source` auf `usb` stehen, und **⚙ → 🩺 Installation prüfen**
   zeigt unter *Position*, welche Quelle gerade liefert.
5. Sobald wieder ein Fix vorliegt, läuft die Navigation automatisch weiter —
   kein manueller Neustart nötig.

---

## W-02 — Positionsmarker springt kurz unrealistisch

**Symptom:** Der Positionspunkt „springt" für einen Moment an eine
unplausible Stelle (z. B. in einer Häuserschlucht), ohne dass die App neu
routet.

**Ursache:** Mehrwegeausbreitung (Multipath) an Gebäudefassaden erzeugt
einzelne GPS-Ausreißer (rechnerisch > 300 m/s Geschwindigkeit oder
Genauigkeit > 100 m).

**Lösung:** In der Regel ist kein Eingriff nötig — die App verwirft bis zu
drei aufeinanderfolgende Ausreißer automatisch und löst wegen eines
einzelnen Sprungs **kein** Rerouting aus (das braucht 5 s bestätigte
Abweichung). Hält der „Sprung" länger an (mehr als 3 Fixes in Folge, z. B.
nach einer Fährüberfahrt), übernimmt die App ihn bewusst als neue,
plausible Position — das ist Absicht, kein Fehler. Bei dauerhaft
schwankender Genauigkeit: Antennenposition/-sicht zum Himmel prüfen.

---

## W-03 — „Standortzugriff nicht möglich"

**Symptom:** Dialog/Hinweis, dass der Standortzugriff nicht möglich ist,
obwohl ein GPS-Empfänger vorhanden ist; keine Positionsanzeige.

**Ursache:** Browser verlangen für die Geolocation-API einen „Secure
Context" (HTTPS oder `localhost`). Ein Zugriff über eine reine
HTTP-LAN-Adresse (z. B. `http://192.168.1.50:8080`) wird deshalb blockiert.

Das gilt auch für den Aufruf über Home Assistant: Ingress erbt das Protokoll
von Home Assistant. Wer Home Assistant über `http://…:8123` öffnet, bekommt
auch Yapaia nur über HTTP.

**Lösung:** Die App erkennt diesen Fall, **bevor** sie überhaupt fragt, und
zeigt den Hinweis „Standortzugriff nicht verfügbar (unsicherer Kontext)".
Was wirklich hilft:
1. **Empfohlen im Fahrzeug:** ein USB-GPS-Empfänger am Gerät
   (Add-on-Option `gps_source: usb`) — funktioniert unabhängig vom
   Browser-Sicherheitskontext.
2. Die **Home-Assistant-Companion-App** als Quelle (`gps_source:
   companion_app`) — sie meldet die Position an Home Assistant statt an den
   Browser, auch bei gesperrtem Bildschirm. Siehe
   [Manual](manual.md#using-the-home-assistant-companion-app).
3. Home Assistant selbst über HTTPS erreichbar machen (eigenes Zertifikat
   oder Nabu Casa) — dann ist auch Ingress HTTPS. Hintergrund:
   [GPS vom eigenen Endgerät](gps-endgeraete.md).
4. Nur zum Ausprobieren: Aufruf direkt auf dem Gerät über
   `http://localhost:8080` (Compose-Installation) — Browser stufen
   `localhost` als sicher ein.

---

## W-05 — App berechnet nach einer Abzweigung automatisch neu

**Symptom:** Nach einer falschen/bewussten Abweichung von der Route (z. B.
wegen einer Umleitung) berechnet die App ohne Rückfrage eine neue Route.

**Ursache:** Erkannte dauerhafte Abweichung von der geplanten Route
(Map-Matching-Distanz > 30 m über mindestens 5 s **und** passende
Fahrtrichtung) — genau das Verhalten, das bei einer Umleitung oder Sperrung
erwartet wird.

**Lösung:** Kein Eingriff nötig — das Rerouting läuft automatisch und ist
in der Regel in unter 3 Sekunden abgeschlossen, mit sofort neuen
Anweisungen. Weicht die Fahrt **dreimal in 5 Minuten** an derselben Stelle (im Umkreis
von 200 m) ab — z. B. weil eine Baustelle den einzigen erlaubten Weg
blockiert —, rechnet die App dort nicht noch einmal automatisch neu, statt
dieselbe Route immer wieder zu berechnen. Plane in dem Fall die Route neu
(z. B. mit einem Zwischenziel).

---

## W-06 — HA-Entitäten werden „nicht verfügbar"

**Symptom:** Home-Assistant-Entitäten von Yapaia Go zeigen „nicht
verfügbar".

**Ursache:** Die Entitäten des Geräts „Yapaia Go" kommen über die
Integration „Yapaia". Sie werden „nicht verfügbar", solange das Add-on nicht
läuft (Update, Neustart) oder die Integration noch nicht eingerichtet ist. Wer
zusätzlich MQTT nutzt: die MQTT-Entitäten hängen am Broker (meist das
Mosquitto-Add-on), der z. B. während eines HA-Updates kurz nicht erreichbar
ist.

**Lösung:** Prüfen, ob das Add-on läuft und unter *Einstellungen → Geräte &
Dienste* das Gerät „Yapaia Go" in der Integration „Yapaia" eingerichtet ist
(„Yapaia Go gefunden" bestätigen). Für MQTT gilt: **Die App selbst bleibt voll
funktionsfähig** — MQTT ist
bewusst nie im Kernpfad der Navigation. Broker neu starten (Home Assistant
→ Add-ons → Mosquitto → Neu starten); Yapaia Go verbindet sich automatisch
mit exponentiellem Backoff neu und veröffentlicht alle Zustände (Discovery
+ aktuelle Werte) erneut, sobald der Broker wieder da ist. Kein
Datenverlust, kein manuelles Eingreifen an der App nötig.

---

## W-08 — Route führt an einer zu engen/niedrigen Stelle vorbei 🔴

**Symptom:** Die berechnete Route führt an einer Stelle vorbei, die dem
eingestellten Fahrzeugprofil eigentlich physisch nicht erlaubt sein sollte
(z. B. eine niedrige Unterführung bei einem hohen Fahrzeug).

**Ursache:** Nicht jede reale Höhen-, Gewichts- oder Breitenbeschränkung ist
in den zugrunde liegenden OpenStreetMap-Daten erfasst. Yapaia Go kann nur
meiden, was in den Kartendaten steht — das ist eine physische Grenze der
Datenquelle, kein Software-Fehler, und wird bewusst offen kommuniziert statt
verschwiegen.

**Lösung:**
1. **Immer selbst auf Beschilderung, Schranken und Höhenwarner achten** —
   besonders auf kleinen Straßen, wo Maßangaben in OpenStreetMap oft fehlen.
   Verlasse dich dort nicht blind auf die Route.
2. Den Warnhinweis bei Fahrzeugprofilen über 2,7 m Höhe lesen — er
   beschreibt genau diesen Fall.
3. Bekannte, fehlende Beschränkungen kannst du selbst in OpenStreetMap
   nachtragen (`maxheight`, `maxweight`, `maxwidth`-Tags auf
   openstreetmap.org) — das kommt allen Nutzern der Karte zugute, nicht nur
   dir.
4. **Grundsatz:** Eigene Ortskenntnis und tatsächlich vorhandene
   Beschilderung haben immer Vorrang vor der Routenempfehlung.

---

## W-09 — Meldung „Ziel liegt außerhalb der installierten Karte"

**Symptom:** Statt einer Route erscheint die Meldung, dass das Ziel
außerhalb der installierten Kartenregion liegt.

**Ursache:** Die Zielkoordinate liegt außerhalb der heruntergeladenen
Kartenregion(en), oder es fehlt ein zusammenhängender Extrakt für eine
grenzüberschreitende Route.

**Lösung:** Unter **⚙ → 🗺️ Karten verwalten** die fehlende Region
installieren und danach einmal **„Fehlendes bauen"** tippen, damit auch
Routing und Suche sie abdecken. Bei Routen über mehrere Länder/Regionen:
sicherstellen, dass **alle** benötigten Regionen installiert sind und
lückenlos aneinander angrenzen.

---

## W-10 — Add-on verhält sich verdächtig 🔴

**Symptom:** Ein installiertes Add-on versucht scheinbar, auf die Route
zuzugreifen, Daten abzugreifen, oder verhält sich anders als erwartet
(unerwarteter Netzwerkzugriff, ungewöhnliche Berechtigungsanfragen).

**Ursache:** Auch geprüfte Add-ons laufen technisch als nicht
vertrauenswürdiger Fremdcode — deshalb läuft jedes Add-on standardmäßig in
einer Sandbox mit ausschließlich den beim Installieren sichtbar bestätigten
Berechtigungen (Scoped Tokens, iframe-Sandbox, Default-Deny für alle
API-Aufrufe).

**Lösung:**
1. **Sofortmaßnahme:** Add-on deaktivieren — **⚙ → 🧩 Add-on-Store →
   Reiter „Updates" → Installierte Add-ons → „Deaktivieren"**. Der
   Kill-Switch wirkt sofort.
2. Jeder verbotene Versuch (fremde API-Aufrufe, DOM-Zugriff, undeklarierte
   Hosts) wird automatisch geblockt **und** protokolliert. In der Oberfläche
   gibt es dafür keine eigene Ansicht; abrufbar ist das Protokoll über
   `GET /api/v1/security/events`.
3. Für die Zukunft: nur signierte Add-ons aus dem Marktplatz installieren
   (im Katalog „✓ Geprüft"), den **Entwicklermodus** ausgeschaltet lassen und
   beim Installieren die angezeigten Berechtigungen tatsächlich lesen, bevor
   du bestätigst. Versionen, die der Marktplatz sperrt, schaltet Go beim
   nächsten Abgleich selbst ab.

---

## W-11 — Add-on ist nach einem Update deaktiviert

**Symptom:** Nach einem App-/Core-Update erscheint ein Add-on im Store als
„deaktiviert" mit einem Kompatibilitätshinweis, statt normal zu laden.

**Ursache:** Das Add-on deklariert in seinem Manifest eine `core_api`-
Versionsspanne, die mit der neuen Core-Version nicht mehr übereinstimmt
(die Add-on-API hat sich in einer Weise geändert, die dieses Add-on nicht
mehr unterstützt).

**Lösung:** Das ist ein bewusst sicherer Fehlerpfad — kein Absturz, kein
Datenverlust, das Add-on wird einfach nicht geladen. Im Store prüfen, ob
eine aktualisierte Version des Add-ons verfügbar ist (der Add-on-Autor muss
`core_api` an die neue Version anpassen). Bis dahin bleibt das Add-on
deaktiviert; der Rest der App funktioniert unverändert weiter.

---

## W-12 — Suche reagiert nicht mehr/„vereinfachte Suche"

**Symptom:** Die Ortssuche reagiert nicht mehr oder wird sehr langsam; die
App zeigt einen Hinweis „vereinfachte Suche"; im Systemprotokoll finden
sich OOM-Kills (Out-of-Memory).

**Ursache:** Photon (der Java-basierte Volltextsuchindex) braucht auf sehr
kleinen Geräten (z. B. einer 4-GB-Proxmox-LXC) mehr Arbeitsspeicher, als
verfügbar ist.

**Lösung:**
- **HA-Add-on:** in der Add-on-Konfiguration, Gruppe **Suche**,
  „Adresssuche mit Photon" (`photon_enabled`) ausschalten oder
  „Arbeitsspeicher für Photon (MB)" (`photon_xmx_mb`) verkleinern, dann das
  Add-on neu starten.
- **Compose/Proxmox:** in der `.env`-Datei `PHOTON_XMX` verkleinern, z. B.
  auf `512m` oder `256m`, und `docker compose up -d photon` neu starten.

In beiden Fällen wechselt die App automatisch auf den deutlich schlankeren
SQLite-FTS5-Suchindex (Anzeige „vereinfachte Suche") — Orte und Straßen
bleiben durchsuchbar, nur mit etwas geringerer Toleranz bei Tippfehlern.

---

## W-14 — App ruckelt, während ein Add-on aktiv ist

**Symptom:** Die App reagiert spürbar langsamer, während ein bestimmtes
Add-on aktiv ist.

**Ursache:** Ein Add-on (z. B. eine rechenintensive Bilderkennung) nutzt
dauerhaft zu viel CPU (mehr als 25 % über 60 Sekunden) auf demselben
Mini-PC, auf dem auch die Navigation läuft.

**Lösung:** Die App drosselt ein solches Add-on bereits automatisch; nach
wiederholten Abstürzen (mehr als 5) wird es sogar automatisch dauerhaft
deaktiviert — Navigation und Kartendarstellung bleiben davon unberührt.
Zusätzlich kannst du das betroffene Add-on manuell deaktivieren
(**⚙ → 🧩 Add-on-Store → Reiter „Updates" → „Deaktivieren"**) oder, falls
angeboten, die
`runtime: external`-Variante wählen (läuft dann auf einem eigenen
Gerät/Container statt auf dem Navi-Mini-PC).

---

## W-15 — App funktioniert direkt, aber nicht über HA-Ingress

**Symptom:** Yapaia Go funktioniert unter der direkten Adresse
(`http://<Geräte-IP>:8080`), aber nicht über den Ingress-Link in Home
Assistant (weiße Seite, fehlende Kartenkacheln, hängender Ladebalken).

**Ursache:** Ein klassischer HA-Add-on-Fehler: Ressourcen (Skripte, Karten-
Kacheln, WebSocket-Verbindung) werden mit absoluten statt relativen Pfaden
angefragt und landen dadurch am falschen Ingress-Sub-Pfad
(`/api/hassio_ingress/<token>/…`).

**Lösung:**
1. Add-on einmal neu starten: Home Assistant → Add-ons → Yapaia Go → Neu
   starten.
2. Danach den Ingress-Link erneut öffnen; bei Bedarf den Browser-Cache der
   Seite leeren (`Strg`+`Shift`+`R` bzw. `Cmd`+`Shift`+`R`).
3. Bleibt das Problem bestehen: Add-on-Version prüfen und das Problem
   melden (mit Version und Browser) — es ist ein Fehler, kein
   Normalzustand.

---

## W-16 — Nach einem Update fehlen Kartendaten oder Einstellungen 🔴

**Symptom:** Nach einem App- oder Add-on-Update sind Kartendaten,
Favoriten oder Einstellungen verschwunden, oder die App startet mit einer
leeren Konfiguration.

**Ursache:** Dieser Fall sollte durch die Architektur ausgeschlossen sein —
alle Nutzdaten liegen bewusst **außerhalb** des Containers (HA-Add-on:
`/share/yapaia`; Compose: das Verzeichnis `./data/`), und jede
SQLite-Migration legt vorher automatisch eine Sicherungsdatei an. Tritt der
Fall dennoch auf, deutet das auf einen Fehler in der Update-/Migrationslogik
hin.

**Lösung:**
1. **Vorbeugend, vor jedem größeren Update:** Backup des Datenverzeichnisses
   anlegen (siehe `docs/installation.md` → Abschnitt „Backup vor einem
   Update").
2. Im Datenverzeichnis nach automatisch angelegten Sicherungsdateien
   suchen (Endung `.bak`, angelegt unmittelbar vor jeder
   Schema-Migration) und bei Bedarf zurückspielen.
3. Kartendaten (Tiles/Valhalla-Graph) liegen in einem separaten
   Unterverzeichnis und werden von App-Updates nie verändert — dort ist ein
   Verlust besonders unerwartet und sollte gesondert gemeldet werden.
4. **Nicht** einfach neu installieren, ohne vorher das bestehende
   Datenverzeichnis zu sichern. Diesen Fall bitte als Fehler melden.

---

## W-18 — Region-Download wird sofort mit „Speicherplatz"-Fehler abgelehnt

**Symptom:** Der Download einer Kartenregion startet gar nicht erst,
sondern wird sofort mit einer Meldung „Nicht genug Speicherplatz"
abgelehnt.

**Ursache:** Der anschließende Kartengraph-Bau (Valhalla) braucht
vorübergehend etwa das 2,5-Fache der reinen PBF-Downloadgröße an freiem
Speicherplatz. Die App prüft das **vorab** und lehnt lieber sofort ab, als
eine „halb" installierte, kaputte Region zu hinterlassen.

**Lösung:** Die Fehlermeldung nennt exakt „benötigt vs. frei" — daran
lässt sich ablesen, wie viel zusätzlicher Platz fehlt.
- Nicht mehr benötigte Regionen löschen (**⚙ → 🗺️ Karten verwalten**).
- Oder das Datenverzeichnis auf einen größeren Datenträger verlegen:
  Compose → die Volume-Pfade (`./data/…`) in einer
  `docker-compose.override.yml` umbiegen; Proxmox-LXC → Datenträger
  (`pct resize` bzw. über die Proxmox-Oberfläche) vergrößern.

Danach den Download erneut starten.

---

## W-19 — Navigation scheint nach Tab-Crash/Neustart weg zu sein

**Symptom:** Der Browser-Tab stürzt ab oder das Kiosk-Gerät startet mitten
in einer laufenden Navigation neu; nach dem Neuladen scheint die Route
zunächst verschwunden.

**Ursache:** Das sollte sich von selbst beheben — der eigentliche
Navigationszustand lebt bewusst im Core-Server, **nicht** im Browser-Tab.

**Lösung:** Kein Eingriff nötig — kurz warten (in der Regel wenige
Sekunden) oder die Seite neu laden. Die App verbindet sich neu mit dem
Core und stellt die laufende Navigation automatisch wieder her (Route,
nächstes Manöver, ETA, Fahrmodus). Für den Kiosk-Dauerbetrieb: die
Autostart-Konfiguration prüfen (siehe `docs/kiosk-setup.md`) — nach einem
Geräte-Neustart sollte der Browser automatisch wieder auf die App-URL
zeigen, ohne dass jemand manuell eingreifen muss.

---

## W-22 — Anzeige der Ankunftszeit wirkt falsch

**Symptom:** Die angezeigte Ankunftszeit (ETA) springt beim Überqueren
einer Zeitzonengrenze oder rund um die Zeitumstellung (Sommer-/Winterzeit)
um eine Stunde, oder wirkt offensichtlich falsch.

**Ursache:** In aller Regel ein Anzeigeproblem, nicht die eigentliche
Berechnung — der Core rechnet grundsätzlich in UTC, dein Gerät (Browser
bzw. Home-Assistant-Instanz) formatiert die Uhrzeit lokal.

**Lösung:** Zuerst prüfen, ob die Zeitzoneneinstellung des anzeigenden
Geräts korrekt ist — das ist die mit Abstand häufigste Ursache. Die
verbleibende Fahrzeit (die Minuten- bzw. Stundenangabe „noch X Min.")
bleibt davon unabhängig **immer** korrekt, auch wenn die absolute Uhrzeit
kurzzeitig irritierend wirkt. Bleibt die Anzeige trotz korrekt eingestellter
Geräte-Zeitzone dauerhaft falsch: bitte als Fehler melden.


## I-01 — Die Add-on-Installation bricht ab

Der Supervisor lädt das fertige Image `ghcr.io/yapaia/yapaia-go-<arch>:<version>`;
auf dem Gerät wird nichts gebaut.

### „403 denied" beim Herunterladen des Images

```
Failed to fetch manifest for ghcr.io/yapaia/yapaia-go-amd64:<version> - 401
Can't install ghcr.io/yapaia/yapaia-go-amd64:<version>:
[403] Head "https://ghcr.io/v2/yapaia/yapaia-go-amd64/manifests/<version>": denied
```

**Ursache:** Der Supervisor findet das Image genau dieser Version nicht oder
darf es nicht lesen — etwa, weil eine gerade veröffentlichte Version noch
gebaut wird.

**Lösung:** Einige Minuten warten und im Add-on-Store **⋮ → Nach Updates
suchen**, dann erneut installieren. Bleibt der Fehler bei einer Version
bestehen, bitte als Fehler melden (mit Version und Architektur).

### „could not read Username for 'https://github.com'"

```
Can't clone https://github.com/Yapaia/yapaia repository:
fatal: could not read Username for 'https://github.com': No such device or address
```

**Ursache:** Der Supervisor klont **anonym**, ohne Zugangsdaten. Die Meldung
heißt fast immer, dass die Repository-Adresse falsch ist oder das Repository
nicht öffentlich erreichbar ist (bei einem Fork etwa privat).

**Lösung:** Adresse prüfen und das Repository öffentlich machen. Ob es ohne
Anmeldung erreichbar ist, zeigt ein privates Browserfenster.

### Kachelbau schlägt fehl

**Wo steht der Grund?** Jede Ausgabezeile des Baus steht im Add-on-Protokoll
mit dem Präfix `[Kachelbau <region>]`, z. B. `[Kachelbau liechtenstein]`;
die letzte Zeile steht zusätzlich in der Fehlermeldung.

**Der erste Bau dauert lange:** Beim ersten Lauf lädt das Add-on einmalig
`planetiler.jar` (~100 MB) nach `/share/yapaia/tools/` und gemeinsame
Basisdaten (mehrere hundert MB) nach `/share/yapaia/planetiler-sources/`.
Das ist kein Hänger; jede weitere Region nutzt dieselben Dateien.

---

## Weitere Hilfe

Keine passende Lösung gefunden? Prüfe zusätzlich die [FAQ](faq.md) und den
[Installations-Guide](installation.md). Für Add-on-spezifische Fragen siehe
den [Add-on-Entwicklungsleitfaden](addon-dev-guide.md).
