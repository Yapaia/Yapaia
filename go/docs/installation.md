# Installations-Guide

Diese Anleitung setzt kein Vorwissen voraus. Jeder Schritt nennt den genauen
Befehl und was du danach auf dem Bildschirm erwarten kannst. Es gibt zwei unabhängige
Installationswege — wähle **einen**:

- **[A. Home-Assistant-Add-on](#a-home-assistant-add-on)** — wenn du bereits
  Home Assistant (HAOS oder Supervised) betreibst.
- **[B. Docker Compose / Proxmox-LXC](#b-docker-compose--proxmox-lxc)** —
  eigenständig, ohne Home Assistant, auf einem beliebigen Linux-Host oder
  einer Proxmox-LXC-Instanz.

Danach gilt für **beide** Wege:
**[C. Kartenkacheln bauen](#c-kartenkacheln-bauen-pmtiles)** — ohne diesen
Schritt gibt es keine Karte. Fertige Kacheln zum
Herunterladen gibt es nicht; §C.1 erklärt, warum.

Beide Wege enthalten außerdem einen eigenen Abschnitt zur
**[USB-GPS-Durchreichung](#usb-gps-durchreichung)**.

---

## Voraussetzungen (beide Wege)

- Ein x86_64- oder aarch64-Linux-Host ("Mini-PC", Referenz: N100-Klasse). RAM:
  für Yapaia allein reichen 4 GB bei kleiner Region; auf einer Home-Assistant-
  Maschine sind 6 GB oder mehr sinnvoll (Tabelle im [README](../README.md#requirements)).
- Für Weg A: eine laufende Home-Assistant-Installation (HAOS oder
  Supervised — **nicht** Home Assistant Core/Container, dem fehlt der
  Supervisor, der Add-ons überhaupt erst installieren kann).
- Für Weg B: Docker Engine + das `docker compose`-Plugin (`docker compose
  version` muss funktionieren, nicht das alte `docker-compose` mit
  Bindestrich).
- Optional, für echtes GPS statt Simulator: ein USB-GPS-Empfänger
  ("GPS-Maus", meist ein `u-blox`-Chipsatz, erscheint unter Linux als
  `/dev/ttyACM0` oder `/dev/ttyUSB0`).
- **Kommandozeilen-Werkzeuge**, die weiter unten vorausgesetzt werden:
  `curl` (Downloads und Health-Abfragen) und `jq` (formatiert die
  JSON-Antworten lesbar). Auf einem minimalen System sind beide oft nicht
  vorinstalliert:

  ```bash
  # Debian/Ubuntu (auch der Proxmox-LXC-Standard)
  apt-get update && apt-get install -y curl jq
  ```

  Auf anderen Distributionen entsprechend `dnf install curl jq` (Fedora/RHEL)
  bzw. `apk add curl jq` (Alpine). `jq` ist reiner Komfort — ohne es
  funktioniert jeder `curl`-Aufruf ebenfalls, die Ausgabe ist nur einzeilig.
- Mindestens eine Kartenregion als PBF-Datei (z. B. von
  [download.geofabrik.de](https://download.geofabrik.de/)) — ohne
  Kartendaten startet die App zwar, aber Routing/Suche haben nichts zu
  routen/suchen.

---

## A. Home-Assistant-Add-on

Der vollständige, technische Referenztext für diesen Weg ist
[`yapaia_go/DOCS.md`](../yapaia_go/DOCS.md) (Englisch, das
ist der Text, den die Add-on-Store-Seite in HA anzeigt) — dieser
Abschnitt hier ist die deutschsprachige Schritt-für-Schritt-Fassung.

> **Dieses Repository ist selbst das Add-on-Repository.** Beim Eintragen der
> Repository-URL findet der Home-Assistant-Supervisor die Add-ons in den
> Unterordnern selbst.

1. **Repository in Home Assistant eintragen** (GUI, ohne SSH).
   **Einstellungen → Add-ons → Add-on Store → ⋮ (oben rechts) →
   Repositories**, dort diese URL hinzufügen:

   ```
   https://github.com/Yapaia/yapaia
   ```

   Danach den Dialog schließen und die Store-Seite neu laden (bzw. **⋮ → Nach
   Updates suchen**).
   *Erwartetes Ergebnis:* ein neuer Store-Abschnitt „Yapaia" mit der
   Kachel **Yapaia Go** (daneben weitere Yapaia-Add-ons wie Yapaia Beat).
   *Erscheint nichts:* HA meldet ungültige Repositories mit einer eigenen
   Fehlermeldung im selben Dialog. Prüfe die URL und lade die Store-Seite neu.

2. Add-on öffnen, **Installieren** klicken. Der Supervisor lädt dabei ein
   **fertiges Image** für deine Architektur (`ghcr.io/yapaia/yapaia-go-amd64`
   bzw. `-aarch64`); auf dem Gerät wird nichts gebaut. Je nach Leitung dauert
   das einige Minuten. Eine Internetverbindung ist nur **während** der
   Installation (und später für Karten-Downloads) nötig.

   *Bricht die Installation ab* (z. B. `403 denied` beim Image-Download oder
   `could not read Username for 'https://github.com'`): beide Fälle stehen mit
   Ursache und Lösung unter
   [Troubleshooting: Die Add-on-Installation bricht ab](troubleshooting.md#i-01--die-add-on-installation-bricht-ab).
3. **Konfiguration (optional):** Im Reiter **Konfiguration** muss vor dem
   ersten Start nichts gesetzt werden. Bleibt `region` leer, führt der
   Einrichtungsassistent in Yapaia durch die Auswahl der Karte. Alle Optionen
   stehen in `yapaia_go/DOCS.md` unter „Configuration options".
4. Empfohlen bei knappem RAM auf einer geteilten HAOS-Maschine: die
   RAM-Empfehlung in `yapaia_go/DOCS.md` („RAM recommendation") **vor** dem
   ersten Start lesen — Home Assistant selbst, Mosquitto und alle anderen
   Add-ons teilen sich dieselbe Maschine.
5. Add-on **starten** (Schalter „Beim Booten starten" zusätzlich aktivieren,
   wenn das Add-on dauerhaft laufen soll). Im Log-Reiter sollte in dieser
   Reihenfolge erscheinen: Valhalla bereit (bzw. ohne Karte: wartet auf einen
   Routinggraphen) → Core lauscht → (falls eingeschaltet) MQTT verbunden.
6. Add-on aus der HA-Seitenleiste öffnen (Ingress — **kein** separates
   Login, die HA-eigene Sitzung deckt das ab, auch über Nabu-Casa-Remote-
   Zugriff). Erwartung: der Einrichtungsassistent bzw. die Karte erscheint.

**Anbindung an Home Assistant:** Das Add-on bringt die Integration „Yapaia"
mit. Nach dem ersten Start erscheint eine Benachrichtigung — Home Assistant
einmal neu starten (*Einstellungen → System → Neu starten*), dann unter
*Einstellungen → Geräte & Dienste* „Yapaia Go wurde gefunden. Einrichten?"
bestätigen. Kein Broker, keine Adresse, kein Token nötig. MQTT gibt
es zusätzlich (Option `mqtt_enabled`, Vorgabe aus). Details:
[User Manual → Home Assistant](manual.md#home-assistant).

Weiter mit [Erste Schritte](erste-schritte.md).

---

## B. Docker Compose / Proxmox-LXC

Dieser Weg nutzt exakt dasselbe `docker-compose.yml`, das auch als
Entwicklungs-/CI-Referenzumgebung dieses Repositories dient — kein
Sonderpfad, sondern der am häufigsten durchgespielte.

### B.1 Repository holen

```bash
git clone https://github.com/Yapaia/yapaia.git
cd yapaia/go
cp .env.example .env
```

Erwartung: `.env` existiert jetzt mit sinnvollen Defaults (Port 8080,
`PHOTON_XMX=1g` usw. — siehe `.env.example` für jede Option mit Kommentar).

### B.2 Proxmox-LXC anlegen (nur wenn du in einer Proxmox-LXC statt direkt
auf einem Host installierst — bei einem normalen Linux-Host diesen
Unterabschnitt überspringen)

1. Proxmox-Weboberfläche → **Create CT**.
2. Template: eine aktuelle Debian- oder Ubuntu-LTS-Vorlage.
3. Ressourcen: mindestens 4 GB RAM, 2 vCPU, ≥ 20 GB Disk (ein
   Deutschland-Extrakt mit Valhalla-Graph + Photon-Index braucht deutlich
   mehr — siehe `docs/01-architecture.md` §4 für die konkreten Zahlen je
   Kartengröße).
4. **Unprivileged container**: für USB-GPS-Durchreichung ist ein
   **privilegierter** Container (Häkchen bei „Unprivileged container"
   **entfernen**) der unkomplizierteste Weg — siehe
   [USB-GPS-Durchreichung](#usb-gps-durchreichung) unten für die genaue
   Begründung und die unprivilegierte Alternative.
5. Container starten, per `pct enter <VMID>` betreten, Docker installieren
   (`curl -fsSL https://get.docker.com | sh` bzw. die distributionseigene
   Docker-CE-Installationsanleitung), dann ab Schritt B.1 wie oben.

### B.3 Kartendaten bereitstellen

```bash
mkdir -p data/pbf
curl -fL --retry 3 -o data/pbf/li.osm.pbf \
  https://download.geofabrik.de/europe/liechtenstein-latest.osm.pbf

# Schlaegt der Download auch nach den drei Versuchen fehl, liegt es fast immer
# an der Netzverbindung, einem Proxy oder einer Firewall -- nicht an Yapaia.
# Pruefen: `curl -I https://download.geofabrik.de/` muss "200" liefern.
# Geofabrik-Extrakte lassen sich auch vorab woanders herunterladen und
# einfach nach data/pbf/ kopieren; der Dateiname ist das Einzige, worauf die
# naechsten Schritte sich stuetzen.

services/valhalla/build-tiles.sh data/pbf/li.osm.pbf
```

Erwartung: `build-tiles.sh` baut den Routing-Graphen in einem temporären
Verzeichnis und tauscht ihn danach **atomar** ein (ohne Ausfallzeit); bei einem Liechtenstein-Extrakt dauert das insgesamt
etwa 15 Minuten (siehe `docs/data-update-runbook.md` für die Zeitangaben
größerer Extrakte, z. B. Deutschland: 4–6 h, überwiegend Wartezeit). Details,
Env-Overrides und der genaue Ablauf stehen im Skript-Header von
`services/valhalla/build-tiles.sh` und in `services/valhalla/README.md`.

Für die Suche (Photon) analog:

```bash
services/photon/download-index.sh liechtenstein
```

(`services/photon/README.md` beschreibt Land-Codes, RAM-Tuning per
`PHOTON_XMX` und die Option `PHOTON_ENABLED=false` für Geräte mit knappem RAM.)

### B.4 Stack starten

```bash
docker compose --profile routing --profile search up -d
```

Erwartung: drei Container starten (`yapaia-core`, `yapaia-valhalla`,
`yapaia-photon`).

> **`yapaia-valhalla` zeigt „Restarting"? Das ist erwartbar, kein Fehler.**
> Valhalla läuft mit `restart: on-failure:3` und beendet sich, solange unter
> `data/valhalla/tiles/` noch kein fertiger Graph liegt — es versucht es
> dreimal und bleibt dann gestoppt. Wer Schritt B.3 (Graph bauen) noch nicht
> ausgeführt hat, sieht genau das. Der Health-Check unten meldet dann
> `"valhalla": "down"`; sobald der Graph existiert und der Container gestartet
> ist, springt er auf `"ok"`. Dasselbe gilt für `yapaia-photon` ohne Index.

Prüfen:

```bash
curl -s http://localhost:8080/api/v1/health | jq .
```

*(Ohne `jq`: `curl -s http://localhost:8080/api/v1/health` — dieselbe Antwort,
nur unformatiert.)*

Erwartete Antwort (Auszug):

```json
{
  "status": "ok",
  "version": "…",
  "services": { "db": "ok", "mqtt": "disabled" }
}
```

`/health` sagt nur, dass der Core läuft. Ob Karte, Routing, Suche und
Position bereit sind, meldet die Installationsprüfung (§C.2):

```bash
curl -s http://localhost:8080/api/v1/system/preflight | jq '.data.checks[] | {id, status, detail}'
```

Fehlen dort noch Routing oder Suche, ist das vor §C normal. Öffne danach
`http://<Host-IP>:8080/` im Browser — die App sollte erscheinen.

### B.5 Backup vor einem Update

Alle Nutzdaten (Kartenregionen, Valhalla-Graph, Such-Index, Fahrzeugprofile/
Favoriten-Datenbank) liegen unter `./data/` **außerhalb** der Container
(siehe die Volumes in `docker-compose.yml`) — ein Image-Update rührt das
nicht an. Trotzdem vor jedem größeren Update ein Backup anlegen:

```bash
tar czf "yapaia-backup-$(date +%Y%m%d).tar.gz" data/ .env
```

(Fehlen nach einem Update dennoch Daten: [Troubleshooting](troubleshooting.md#w-16--nach-einem-update-fehlen-kartendaten-oder-einstellungen-).)

Weiter mit [Erste Schritte](erste-schritte.md).

---

## C. Kartenkacheln bauen (PMTiles)

Dieser Abschnitt gilt für **beide** Installationswege. Er ist der Schritt, der
am ehesten überrascht — deshalb steht zuerst, warum es ihn überhaupt gibt.

### C.1 Warum es keinen Download gibt

Die Kacheln sind ein **Erzeugnis** aus OpenStreetMap-Rohdaten (PMTiles, gebaut
mit planetiler), kein Fremd-Download: Geofabrik verteilt ausschließlich
Rohdaten (`.osm.pbf`). **„Herunterladen"** in der Oberfläche holt deshalb nur
diese Rohdaten; die Kacheln entstehen beim Bauen. Der Weg dorthin ist dieser
Abschnitt — oder ein eigener Kartenserver mit fertigen Paketen
([Eigene Karten, Routen und Suche](eigene-karten.md)).

Dieselbe `.osm.pbf` erzeugt **drei** Dinge — die drei Skripte sind
austauschbar in der Reihenfolge, brauchen aber alle dieselbe Eingabedatei:

| Erzeugnis | Skript | Wofür |
|---|---|---|
| Kartenkacheln (`.pmtiles`) | `services/tiles/build-pmtiles.sh` | die Karte, die man sieht |
| Routing-Graph | `services/valhalla/build-tiles.sh` | Routen berechnen |
| Lite-Suchindex | `services/valhalla/build-lite-index.sh` | Orts-, Straßen- und Sonderzielsuche ohne Photon |

### C.2 Was fehlt mir gerade? — die Prüfung in der App

Bevor du irgendetwas baust: öffne Yapaia und tippe auf **⚙ → 🩺
Installation prüfen**. Die Seite listet Kacheln, Routing, Suche, Position,
RAM, Plattenplatz und MQTT — je mit dem, was tatsächlich vorgefunden wurde,
und dem, was dagegen zu tun ist. Sie funktioniert auch dann, wenn noch gar
keine Karte da ist; genau dafür ist sie gedacht.

Dasselbe ohne Oberfläche:

```bash
curl -s http://localhost:8080/api/v1/system/preflight | jq .
```

### C.3 Kleine Region — direkt auf dem Gerät

Für Liechtenstein, ein deutsches Bundesland oder einen US-Bundesstaat reicht
das Gerät selbst, auch eine HAOS-VM mit 8 GB.

**Der normale Weg — in der Yapaia-Oberfläche, ohne Shell:**

1. **⚙ → 🗺️ Karten verwalten** öffnen.
2. Bei jeder gewünschten Karte auf **„Herunterladen"** drücken — gern mehrere
   nacheinander, die Downloads laufen nebeneinander. Geladen wird nur der
   OpenStreetMap-Extrakt; gebaut wird noch nichts.
3. Danach **einmal „Fehlendes bauen"**: das baut alle heruntergeladenen
   Karten, dann das Routing einmal über alle und die Suche — in einem Lauf,
   siehe §C.3a. Der Fortschritt steht im Panel.

(Bei einer bereits installierten Karte heißt der Knopf **„Update"** und baut
sie direkt neu. Fertige Pakete vom eigenen Kartenserver heißen
**„Installieren"** und brauchen keinen Bau.)

Liechtenstein braucht Minuten, ein Bundesland wie Rheinland-Pfalz deutlich
länger. Beim **ersten** Bau lädt das Add-on einmalig `planetiler.jar`
(~100 MB) nach `/share/yapaia/tools/` — die bleibt dort über Updates hinweg.

Der Core lehnt den Start ab, wenn zu wenig Plattenplatz **oder** zu wenig
freier Arbeitsspeicher da ist, und sagt in beiden Fällen, was zu tun ist. Auf
einer 8-GB-VM heißt das meistens: Photon abschalten (§C.6).

> Ein Terminal-Add-on im „Protection Mode" hat keinen `docker`-Befehl; deshalb
> baut der Core die Karten selbst.

**Alternativ, im Add-on-Container** (nur wenn Protection Mode ausgeschaltet
ist und `docker` zur Verfügung steht):

```bash
docker exec -it $(docker ps --format '{{.Names}}' | grep yapaia_go) bash
yapaia-build-pmtiles https://download.geofabrik.de/europe/liechtenstein-latest.osm.pbf
```

`yapaia-build-pmtiles` ist ein Wrapper, der `TILES_DIR` auf
`/share/yapaia/tiles` setzt und beim **ersten** Aufruf einmalig
`planetiler.jar` (~100 MB) nach `/share/yapaia/tools/` lädt — dort bleibt sie
über Add-on-Updates hinweg. Er nutzt den JAR-Modus, weil es im Add-on-Container
keinen Docker-Socket gibt.

**Aus einem Repository-Checkout** (anderer Rechner, mit Docker):

```bash
services/tiles/build-pmtiles.sh \
  https://download.geofabrik.de/europe/liechtenstein-latest.osm.pbf
```

Das Skript lädt die PBF, baut in ein **temporäres** Verzeichnis, prüft die
PMTiles-Signatur der erzeugten Datei und tauscht sie erst dann atomar nach
`<TILES_DIR>/<region>.pmtiles`. Schlägt irgendetwas davor fehl, bleibt
die bisherige Kartendatei unangetastet. Ein Neustart ist danach **nicht**
nötig — der Core liest das Verzeichnis bei jeder Anfrage frisch; in der App
genügt ein Reload.

### C.3a Routinggraph und Suchindex — auf dem Gerät, per Knopfdruck

Für Routing und Suche braucht es zwei weitere Erzeugnisse aus **derselben**
`.osm.pbf`. Beide werden **direkt auf dem Gerät gebaut**, und mit
**einem** Knopf: **⚙ → 🗺️ Karten verwalten** öffnen und auf
**„Fehlendes bauen"** drücken.

| Erzeugnis | Ohne das … | Umfang |
|---|---|---|
| Valhalla-Graph | keine Routenberechnung | **einmal** über alle installierten Karten |
| Lite-Suchindex | Suche bleibt leer (Orte, Straßen, Sonderziele) | **je Karte** einer |

Der Lauf zeigt, im wievielten Schritt er steht und woran er gerade arbeitet.
Er zeigt **auch eine Restzeit** — aber nur, wenn es eine gibt: sie stammt aus
der gemessenen Dauer des **letzten** Laufs derselben Schritte. Beim ersten Mal
steht dort „Restzeit noch unbekannt".

Läuft ein Schritt zum ersten Mal, während andere schon gemessen sind, heißt es
**„mindestens noch …"** statt „noch etwa …" — eine Untergrenze fällt immer
zu kurz aus.

Es läuft immer nur **ein** schwerer Bau gleichzeitig — zwei davon nebeneinander
sprengen den Speicher einer 8-GB-Maschine, auf der auch Home Assistant läuft.

> **Eine selbst abgelegte `.pmtiles`** (per Samba nach `/share/yapaia/tiles/`)
> steht in keinem Katalog. Für sie gibt es keine OpenStreetMap-Quelle, also
> lässt sich für sie weder Routing noch Suche bauen — der Lauf überspringt sie
> und sagt es. Gezeichnet wird sie trotzdem.

Die Skripte unter `services/` bleiben für die Entwicklung und für den Fall, dass
jemand eine sehr große Region auf stärkerer Hardware vorbauen will:

```bash
services/valhalla/build-tiles.sh      data/pbf/rheinland-pfalz-latest.osm.pbf
services/valhalla/build-lite-index.sh data/pbf/rheinland-pfalz-latest.osm.pbf
```

Die Ergebnisse lassen sich weiterhin per **„Samba share"**- oder
**„File editor"**-Add-on ablegen:

| Datei | Ziel auf der HAOS-VM |
|---|---|
| Valhalla-Graph | `/share/yapaia/valhalla/tiles/` |
| `lite_search.db` | `/share/yapaia/lite-search/` |

Welche Formate genau passen — auch für Karten, die Bekannte selbst gebaut
haben — und wie man sie ablegt: [Eigene Karten, Routen und Suche](eigene-karten.md).

Ohne Routinggraph funktionieren Karte, Position und Favoriten weiterhin — nur
das **Berechnen von Routen** nicht. Ohne Suchindex bleibt die Adresssuche leer;
Navigieren zu Koordinaten und Favoriten geht trotzdem.

### C.4 Im Add-on-Container gibt es kein Docker

Standardmäßig ruft `build-pmtiles.sh` planetiler per `docker run` auf. **Innerhalb
eines Home-Assistant-Add-ons gibt es keinen Docker-Socket** — dieser Weg
funktioniert dort also nicht. Dafür gibt es den JAR-Modus:

```bash
# einmalig: planetiler holen (~100 MB)
curl -fL -o /share/yapaia/planetiler.jar \
  https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar

# bauen, ohne Docker
PLANETILER_JAR=/share/yapaia/planetiler.jar \
PLANETILER_XMX=2g \
TILES_DIR=/share/yapaia/tiles \
  services/tiles/build-pmtiles.sh https://download.geofabrik.de/europe/liechtenstein-latest.osm.pbf
```

Die Version ist **fest auf `v0.10.2` gepinnt**, damit der Bau nicht davon abhängt, was gerade
veröffentlicht wurde.

### C.5 Ganzes Land (Deutschland) — nicht auf der HAOS-VM

Das RAM-Budget einer 8-GB-HAOS-VM ist weitgehend vergeben:

| Posten | Bedarf |
|---|---|
| Yapaia Core | ~300 MB |
| Valhalla | ~1,5 GB |
| Photon | ~1 GB |
| Home Assistant + Mosquitto | ~1–1,5 GB |
| **frei für alles Weitere** | **~3,5 GB** |

Der Kachelbau ist der speicherhungrigste Schritt der ganzen Kette und
konkurriert genau mit diesen Posten. Ein Deutschland-Extrakt (~4 GB PBF,
~4,5 GB fertige Kacheln) sprengt das. Drei Auswege, **alle ohne SSH auf der
HAOS-VM**:

1. Die Proxmox-VM temporär auf 16 GB vergrößern, bauen, wieder verkleinern.
2. Einen separaten LXC nur für den Build anlegen und die fertige Datei
   herüberkopieren.
3. Die `.pmtiles` auf einem Desktop/Server bauen und per **„Samba share"**-
   oder **„File editor"**-Add-on nach `/share/yapaia/tiles/<region>.pmtiles`
   legen. Das ist der einzige Weg, der gar keinen zweiten *eigenen* Rechner
   voraussetzt, falls jemand die Datei bereitstellt.

### C.6 Empfehlung bei 8 GB: Photon abschalten

Photon will allein mehrere GB Heap. Auf einer geteilten 8-GB-VM ist der
**Lite-Suchindex** die verlässlichere Wahl — er deckt dieselbe Ortssuche ab
und braucht ein Vielfaches weniger Speicher. In der Add-on-Konfiguration in der Gruppe **Suche**
den Schalter **„Adresssuche mit Photon"** ausschalten — in YAML:

```yaml
search:
  photon_enabled: false
```

Die Installationsprüfung aus §C.2 meldet genau diese Empfehlung selbst,
sobald sie wenig RAM **und** eingeschaltetes Photon vorfindet — und sie meldet
die Suche als **in Ordnung**, sobald *einer* der beiden Wege da ist. Ein Gerät
ohne Photon ist nicht suchunfähig.

Weiter mit [Erste Schritte](erste-schritte.md).

---

## USB-GPS-Durchreichung

Der Core spricht mit `gpsd` über TCP (`GPSD_HOST`/`GPSD_PORT`, Default
`localhost:2947`, JSON-Protokoll) — **nicht** direkt mit dem USB-Gerät. Wie
`gpsd` selbst an das USB-Gerät kommt, unterscheidet sich zwischen den beiden
Installationswegen:

### Weg A (HA-Add-on)

`gpsd` ist **im Add-on-Container eingebaut**, und `config.yaml` deklariert
bereits `uart: true`, `usb: true` und `udev: true`, wodurch der HA-Supervisor
USB-Geräte durchreicht. Einzustellen ist nur die Quelle. Ablauf:

1. USB-GPS-Empfänger einstecken.
2. In der Add-on-Konfiguration `gps_source` auf **`usb`** stellen (Vorgabe ist
   `none`) und speichern.
3. Add-on neu starten (Geräte-Durchreichung wird beim Container-Start
   ausgewertet, nicht live nachgeladen).
4. Im Add-on-Log nachsehen: entweder `gpsd: benutze /dev/serial/by-id/…`
   oder eine Warnung, dass noch gewartet wird (in den ersten 90 s jede
   Sekunde, danach alle 15 s ein erneuter Versuch, kein Absturz).
5. In der App: **⚙ → 🩺 Installation prüfen** zeigt unter *Position*, ob
   `gpsd` einen Fix liefert (freie Sicht zum Himmel nötig, siehe
   [Troubleshooting: GPS-Signal verloren](troubleshooting.md#w-01--gps-signal-verloren-tunnel-parkhaus-abschattung)).

Details: `yapaia_go/DOCS.md` §„USB-GPS passthrough".

### Weg B (Docker Compose / Proxmox-LXC)

`gpsd` ist hier **kein** Bestandteil von `docker-compose.yml` — die
Empfehlung ist, es als natives Betriebssystem-Paket auf dem Host (bzw. in
der LXC) zu installieren, weil das der am längsten etablierte, am wenigsten
überraschungsanfällige Weg ist und keine zusätzliche Annahme über ein
bestimmtes Docker-Image für `gpsd` erfordert:

1. **`gpsd` installieren** (im selben Host bzw. derselben LXC, in der auch
   `docker compose` läuft):
   ```bash
   # Debian/Ubuntu; auf Fedora/RHEL `dnf install gpsd gpsd-clients`,
   # auf Alpine `apk add gpsd gpsd-clients`.
   apt-get update && apt-get install -y gpsd gpsd-clients
   ```
2. **Proxmox-LXC-Device-Passthrough** (nur relevant, wenn Docker in einer
   LXC läuft, nicht direkt auf dem Proxmox-Host oder einem Bare-Metal-Mini-
   PC): am Proxmox-**Host** (nicht in der LXC):
   ```bash
   pct set <VMID> -dev0 /dev/ttyACM0
   ```
   (Proxmox ≥ 7.1: `pct set -devN` reicht ein Host-Gerät direkt in eine LXC
   durch. Gerätepfad ggf. anpassen — `ls /dev/tty*` auf dem Proxmox-Host
   **vor** dem Einstecken und danach vergleichen, um den richtigen Knoten zu
   finden.) Danach die LXC neu starten (`pct reboot <VMID>`).
3. **`gpsd` auf das Gerät zeigen lassen** — `/etc/default/gpsd`:
   ```
   DEVICES="/dev/ttyACM0"
   GPSD_OPTIONS="-n"
   ```
   dann `systemctl restart gpsd`. Test: `gpspipe -w -n 5` sollte JSON-Zeilen
   mit `"class":"TPV"` ausgeben (ggf. draußen mit Sicht zum Himmel testen).
4. **Core auf dieses `gpsd` zeigen lassen.** Weil `core` im
   `docker-compose.yml` per Default im isolierten Bridge-Netzwerk läuft
   (eigenes `localhost`, das NICHT das `localhost` des Hosts ist), lokal
   ergänzen. Dazu **neben** der `docker-compose.yml` eine zweite Datei namens
   `docker-compose.override.yml` anlegen (exakt dieser Name): `docker compose`
   lädt sie automatisch zusätzlich, wenn sie im selben Verzeichnis liegt — ein
   Standardmechanismus von Compose, kein Yapaia-Sonderweg. So bleibt die
   getrackte `docker-compose.yml` unangetastet und lokale Anpassungen
   überstehen jedes `git pull`. Inhalt:
   ```yaml
   services:
     core:
       network_mode: host
       environment:
         - GPSD_ENABLED=true
   ```
   `network_mode: host` ist hier der unkomplizierteste Weg, weil er
   `localhost:2947` innerhalb des Containers direkt auf das `gpsd` des Hosts
   zeigen lässt, ohne eine feste IP erraten zu müssen. (Alternative ohne
   Host-Networking: `GPSD_HOST=<Host-Gateway-IP>` setzen und `2947/tcp` am
   Host für das Compose-Netzwerk freigeben — mehr Aufwand für denselben
   Effekt, nur nötig, wenn `network_mode: host` aus anderen Gründen nicht in
   Frage kommt, z. B. Portkonflikte mit anderen Host-Diensten.)
5. Stack neu starten: `docker compose --profile routing --profile search up
   -d --force-recreate core`. Danach sollte die Prüfung *Position* einen Fix
   melden: `curl -s http://localhost:8080/api/v1/system/preflight | jq
   '.data.checks[] | select(.id=="position")'`.

Ohne angeschlossenes GPS lässt sich die App trotzdem vollständig mit dem
eingebauten GPS-Simulator ausprobieren (**⚙ → 🧪 Testfahrt**, siehe
[Erste Schritte §6](erste-schritte.md#6-ohne-echtes-gps-testen-simulator)) —
die USB-Durchreichung ist nur für den Live-Betrieb im Fahrzeug nötig.

---

## Prüfliste nach der Installation

| # | Schritt | Erwartung |
|---|---|---|
| 1 | Stack bzw. Add-on starten | `docker compose ps` zeigt alle Container „Up" bzw. das Add-on-Log zeigt „Core lauscht" |
| 2 | Kartenregion bauen (B.3) bzw. im Einrichtungsassistenten installieren (A) | Bau endet ohne Fehler |
| 3 | `GET /api/v1/health` und `GET /api/v1/system/preflight` | `status: "ok"`; Prüfungen *Routing* und *Suche* `ok` |
| 4 | App im Browser öffnen | Karte rendert, Positionspunkt sichtbar (der Testfahrer reicht) |
| 5 | (falls GPS vorhanden) USB-GPS-Abschnitt durchspielen | Prüfung *Position* meldet einen Fix |
| 6 | Eine Route berechnen ([Erste Schritte](erste-schritte.md)) | Route wird angezeigt |
