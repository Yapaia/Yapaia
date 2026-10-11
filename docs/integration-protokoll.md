# Das Yapaia-Protokoll (Entwurf, Version 1)

Wie sich Yapaia-Module bei der zentralen Home-Assistant-Integration **„Yapaia“**
anmelden, beschreiben, was sie anbieten, und miteinander sprechen.

> **Status: Entwurf zur Abstimmung.** Nichts davon ist gebaut. Was hier
> festgelegt wird, ist später schwer zu ändern – deshalb steht es vorher auf
> dem Papier.

## 1. Ziele

1. **Eine Stelle in Home Assistant.** Jedes installierte Modul erscheint unter
   *Einstellungen → Geräte & Dienste → Yapaia* als eigenes **Gerät** mit seinen
   Entitäten, Aktionen und Auslösern.
2. **Kein Modul braucht ein anderes.** Ohne Integration läuft jedes Add-on
   weiter wie bisher (Oberfläche, eigene Funktionen). Ohne Partner fällt nur
   die gemeinsame Funktion weg.
3. **Neue Module ohne neuen Integrationscode.** Ein Modul *beschreibt* seine
   Entitäten; die Integration baut sie daraus. Nur Sonderfälle (z. B. Beats
   Mediaplayer) bekommen eigenen Code.
4. **Echte Entitäten statt geschriebener Zustände.** Mit Gerät, umbenennbar,
   bedienbar, nach einem HA-Neustart sofort wieder da. (Heute schreibt Go über
   `POST /api/states` – ohne Gerät, ohne Befehle, nach Neustart kurz weg.)

### Namen

Es heißt überall **Yapaia** – mit **i**. Die alte Schreibweise „Yapaja“ (in
Ordnern, Add-on-Kennungen, Umgebungsvariablen, Entity-IDs, Dateinamen) wird mit
der Umstellung vollständig entfernt; neue Kennungen entstehen nur noch mit
`yapaia`.

## 2. Überblick

```
 ┌──────────────┐  1. Anmeldung (Supervisor-Discovery „yapaia“)  ┌─────────────────┐
 │  Add-on Go   │ ─────────────────────────────────────────────▶ │                 │
 │              │  2. GET  /yapaia/v1/beschreibung               │  Integration    │
 │              │ ◀───────────────────────────────────────────── │  „yapaia“       │
 │              │  3. WS   /yapaia/v1/live   (Zustände, Ereign.) │  in Home        │
 │              │ ═════════════════════════════════════════════▶ │  Assistant      │
 │              │  4. POST /yapaia/v1/aktion/<name>              │                 │
 │              │ ◀───────────────────────────────────────────── │                 │
 │              │  5. POST /yapaia/v1/partner  (wer ist noch da) │                 │
 │              │ ◀───────────────────────────────────────────── │                 │
 └──────────────┘                                                └─────────────────┘
        ▲  6. Modul ↔ Modul direkt (dokumentierte Fähigkeiten)
        ▼
 ┌──────────────┐
 │ Add-on Beat  │   … meldet sich genauso an
 └──────────────┘
```

Alle Wege gehen **vom Modul aus nur über HTTP/WebSocket** im internen
Home-Assistant-Netz. Kein MQTT nötig (Go behält MQTT als zusätzlichen Weg für
Nutzer, die es wollen).

## 3. Module und Instanzen

Ein **Modul** ist eine Art Baustein (`go`, `beat`, `satellite` …). Von einem
Modul kann es **mehrere Instanzen** geben – z. B. mehrere Satelliten, im
Wohnmobil verteilt. Deshalb trägt jede Instanz:

| Feld | Bedeutung |
|---|---|
| `modul` | Art des Bausteins, klein, ohne Leerzeichen: `go`, `beat`, `satellite`. |
| `instanz` | **Dauerhafte**, eindeutige Kennung dieser Instanz, vom Modul selbst erzeugt und gespeichert (zufällig beim ersten Start, bei Geräten z. B. aus der MAC-Adresse). Ändert sich nie – auch nicht bei Umbenennung oder Update. |
| `name` | Anzeigename, vom Nutzer änderbar: „Yapaia Satellite Küche“. |

Daraus folgt:

- In Home Assistant ist **jede Instanz ein eigenes Gerät** und ein eigener
  Konfigurationseintrag (eindeutig über `modul` + `instanz`).
- Unique-IDs der Entitäten: `yapaia_<modul>_<instanz>_<schluessel>` – stabil,
  auch wenn der Nutzer Gerät oder Entität umbenennt.
- Entity-IDs entstehen aus Gerätename und **Schlüssel** (nicht aus dem
  angezeigten Namen, der von der HA-Sprache abhängt): `sensor.yapaia_go_ankunft`, bei
  mehreren Satelliten `media_player.yapaia_satellite_kuche`,
  `media_player.yapaia_satellite_alkoven` usw.
- **Aktionen nehmen ein Ziel-Gerät** (`target: device_id`) an. Gibt es nur
  eine Instanz des Moduls, darf es fehlen.
- Die **Partnerliste** (Abschnitt 8) nennt jede Instanz einzeln. Ein Modul
  entscheidet selbst, ob es eine, mehrere oder alle nutzt (Go kann z. B. eine
  Ansage auf allen Satelliten oder nur auf dem nächsten ausgeben).

### Instanzen, die kein Add-on sind

Satelliten sind ESPHome-Geräte; sie sprechen nicht dieses HTTP-Protokoll,
sondern ESPHomes eigene Schnittstelle zu Home Assistant – und sind dort schon
Geräte mit Mikrofon, Lautsprecher und Mediaplayer. Die Integration erkennt sie
an der ESPHome-Projektkennung **`yapaia.satellite`** (in der Firmware unter
`esphome: project: name:`), zählt jeden als Instanz des Moduls `satellite`
und meldet ihn den anderen Modulen als Partner – mit den Fähigkeiten, die die
Firmware angibt (`sprache.eingabe`, `sprache.ausgabe`). Instanz-Kennung ist
die MAC-Adresse. So gelten dieselben Regeln, ohne dass ein Satellit selbst
etwas vom Protokoll wissen muss.

## 4. Anmeldung

Beim Start meldet sich jedes Add-on beim Supervisor (`POST /discovery`, wie
Beat heute):

```json
{
  "service": "yapaia",
  "config": {
    "modul": "go",
    "instanz": "7f3c9a2e",
    "name": "Yapaia Go",
    "host": "a0d7b954-yapaia-go",
    "port": 8080,
    "token": "…zufällig, 32 Byte, base64…",
    "protokoll": 1,
    "version": "0.43.0"
  }
}
```

- Home Assistant zeigt daraufhin **„Yapaia Go gefunden“**; ein Tipp richtet es
  ein. Ein Konfigurationseintrag je Instanz, eindeutig über `modul` +
  `instanz`.
- `token` erzeugt das Add-on einmal und speichert es in `/data`. Die
  Integration schickt es bei jedem Aufruf als `Authorization: Bearer <token>`.
  Ohne gültiges Token antwortet `/yapaia/v1/*` mit 401 – der Port kann ins
  Heimnetz freigegeben sein, die Schnittstelle bleibt trotzdem geschlossen.
- Ohne Supervisor (Docker, Entwicklung): manuell Host, Port und Token
  eintragen.

## 5. Beschreibung

`GET /yapaia/v1/beschreibung` liefert, was das Modul anbietet:

```json
{
  "protokoll": 1,
  "modul": "go",
  "instanz": "7f3c9a2e",
  "name": "Yapaia Go",
  "version": "0.43.0",
  "hersteller": "Yapaia",
  "konfiguration_url": "/hassio/ingress/yapaia_go",
  "faehigkeiten": ["navigation", "ansage.senden"],
  "entitaeten": [
    {
      "schluessel": "eta",
      "plattform": "sensor",
      "name": {"de": "Ankunft", "en": "Arrival"},
      "geraeteklasse": "timestamp",
      "symbol": "mdi:flag-checkered"
    },
    {
      "schluessel": "restweg",
      "plattform": "sensor",
      "name": {"de": "Restweg", "en": "Distance remaining"},
      "geraeteklasse": "distance",
      "einheit": "km",
      "zustandsklasse": "measurement"
    },
    {
      "schluessel": "navigation",
      "plattform": "switch",
      "name": {"de": "Navigation", "en": "Navigation"},
      "aktion_an": "navigation_fortsetzen",
      "aktion_aus": "navigation_beenden"
    },
    {
      "schluessel": "profil",
      "plattform": "select",
      "name": {"de": "Fahrzeugprofil", "en": "Vehicle profile"},
      "optionen_aus": "profile",
      "aktion": "profil_waehlen"
    }
  ],
  "aktionen": [
    {
      "name": "ziel_setzen",
      "titel": {"de": "Ziel setzen", "en": "Set destination"},
      "felder": {
        "ziel": {"typ": "text", "pflicht": true, "titel": {"de": "Adresse oder Ort"}},
        "zwischenziel": {"typ": "bool", "standard": false}
      }
    }
  ],
  "ereignisse": [
    {"name": "ziel_erreicht",  "titel": {"de": "Ziel erreicht"}},
    {"name": "stau_voraus",    "titel": {"de": "Stau voraus"}, "daten": ["strasse", "laenge_km"]}
  ]
}
```

### Entitäten

| Feld | Bedeutung |
|---|---|
| `schluessel` | Dauerhafte Kennung im Modul. **Nie umbenennen** – daraus wird die Unique-ID `yapaia_<modul>_<instanz>_<schluessel>`; Umbenennen erzeugt in HA eine neue Entität. |
| `plattform` | `sensor`, `binary_sensor`, `switch`, `select`, `number`, `button`, `text`, `device_tracker`, `image`, `event` – oder `spezial` (unten). |
| `name` | Anzeigename je Sprache; die Integration nimmt die HA-Sprache, sonst `en`, sonst den ersten. |
| `geraeteklasse`, `einheit`, `zustandsklasse`, `symbol` | wie in Home Assistant. |
| `kategorie` | `config` oder `diagnostic` (Einstellungs- bzw. Diagnose-Entität). |
| `standard_aktiv` | `false` = in HA zunächst deaktiviert (selten gebrauchte Werte). |
| `aktion`, `aktion_an`, `aktion_aus` | Welche Aktion ein Bedienen auslöst (Schalter, Auswahl, Zahl, Knopf, Text). |
| `optionen` / `optionen_aus` | Feste Liste, oder der Zustandsschlüssel, der die Liste liefert. |
| `min`, `max`, `schritt` | für `number`. |
| `attribute` | Zustandsschlüssel, die als Attribute mitgegeben werden. |

`spezial` steht für Entitäten, die sich nicht allgemein beschreiben lassen
(Beats Mediaplayer mit Senderliste, Logos und Lautsprecher-Weiterleitung). Die
Integration hat dafür modulspezifischen Code; das Feld `spezial` nennt ihn,
z. B. `"spezial": "beat.player"`. Kennt die Integration ihn nicht (zu alt),
lässt sie die Entität weg und meldet das im Protokoll – der Rest läuft.

### Aktionen

Jede Aktion erscheint in Home Assistant als `yapaia.<modul>_<name>`, z. B.
`yapaia.go_ziel_setzen`, mit Feldern und Beschreibung im Aktionen-Editor –
und mit einem Ziel-Gerät, wenn es mehrere Instanzen gibt.
Feldtypen: `text`, `zahl`, `bool`, `auswahl` (mit `optionen`), `entitaet`,
`ort` (Koordinaten).

### Ereignisse und Auslöser

Ereignisse kommen über die Live-Verbindung (unten). Die Integration

- feuert sie als HA-Ereignis `yapaia_ereignis` mit `modul`, `instanz`,
  `geraet_id`, `name`, `daten`,
- bietet sie als **Geräte-Auslöser** an („Yapaia Go: Ziel erreicht“) – im
  Automationen-Editor ohne YAML auswählbar.

## 6. Live-Verbindung

`GET /yapaia/v1/live` (WebSocket). Das Modul schickt:

```json
{"typ": "zustand", "werte": {"eta": "2026-10-11T18:42:00+02:00", "restweg": 132.4}}
{"typ": "ereignis", "name": "ziel_erreicht", "daten": {"ziel": "Magdeburg"}}
{"typ": "beschreibung_geaendert"}
```

- Direkt nach dem Verbinden: **ein vollständiger** `zustand` mit allen
  Schlüsseln; danach nur Änderungen.
- Werte sind JSON; `null` = unbekannt (HA zeigt „unbekannt“).
- `beschreibung_geaendert` (z. B. neue Profile, Update): die Integration holt
  die Beschreibung neu.
- Bricht die Verbindung ab, werden die Entitäten **nicht verfügbar**; die
  Integration verbindet sich neu (1, 2, 4 … höchstens 60 s) und bekommt
  wieder den vollständigen Zustand. Ein Modul muss dafür nichts merken.
- Häufig wechselnde Werte (Tempo, Position) sendet das Modul höchstens
  einmal je Sekunde.

## 7. Aktionen ausführen

`POST /yapaia/v1/aktion/<name>` mit den Feldern als JSON-Körper.

- Erfolg: `200 {"ok": true}` (optional mit `ergebnis`).
- Fehler: `4xx/5xx {"ok": false, "fehler": "Text für den Nutzer"}` – erscheint
  in HA als Fehlermeldung der Aktion.
- Bedienen einer Entität (Schalter, Auswahl …) ruft die dort genannte Aktion;
  den neuen Zustand meldet das Modul über die Live-Verbindung (nicht über die
  Antwort), damit es nur **eine** Quelle für Zustände gibt.

## 8. Module untereinander

Damit Go weiß, dass Beat da ist (und umgekehrt), schickt die Integration jedem
Modul die Liste der anderen:

`POST /yapaia/v1/partner`

```json
{"partner": [
  {"modul": "beat", "instanz": "c41b07d2", "name": "Yapaia Beat",
   "url": "http://a0d7b954-yapaia-beat:8099", "token": "…",
   "version": "1.14.0", "faehigkeiten": ["ansage.einmischen", "radio"]},
  {"modul": "satellite", "instanz": "a4cf12b3e8d0", "name": "Yapaia Satellite Küche",
   "media_player": "media_player.yapaia_satellite_kuche",
   "faehigkeiten": ["sprache.eingabe", "sprache.ausgabe"]}
]}
```

- Gesendet nach dem Einrichten und bei jeder Änderung (Instanz kommt dazu,
  fällt weg, Update, Umbenennung). Leere Liste = allein.
- Partner ohne eigene HTTP-Schnittstelle (Satelliten) tragen statt `url` die
  Home-Assistant-Entitäten, über die man sie erreicht.
- **Fähigkeiten** sind die Verträge zwischen Modulen: `ansage.einmischen`
  bedeutet „ich nehme `POST /yapaia/v1/aktion/ansage` mit Text/Audio an und
  mische es ins Programm“. Jede Fähigkeit ist in `docs/faehigkeiten.md`
  beschrieben (Name, Aktion, Felder, Verhalten). Ein Modul nutzt eine
  Fähigkeit nur, wenn der Partner sie **meldet** – nie anhand des Modulnamens.
- Ohne Integration gibt es keine Partnerliste; jedes Modul arbeitet dann für
  sich (heutiger Zustand).

## 9. Installation der Integration

- Jedes Add-on bringt die Integration mit und legt sie unter
  `/config/custom_components/yapaia/` ab, **wenn sie fehlt oder älter ist** als
  die mitgebrachte (Vergleich über `manifest.json` → `version`). Zwei Add-ons
  mit derselben Version tun also nichts doppelt; das neuere gewinnt.
- Danach meldet das Add-on in HA eine **Reparatur** „Yapaia-Integration
  aktualisiert – Home Assistant neu starten“ mit Knopf.
- Später zusätzlich über HACS.

## 10. Versionen und Verträglichkeit

- `protokoll` ist eine ganze Zahl. **Neue Felder, Entitäten, Aktionen,
  Ereignisse, Fähigkeiten** ändern sie *nicht* – beide Seiten ignorieren, was
  sie nicht kennen.
- Nur was Bestehendes bricht (Feld umgedeutet, Weg entfernt), erhöht sie.
  Die Integration unterstützt dann die alte und die neue Version mindestens
  eine Add-on-Generation lang.
- Ein Modul mit einer Protokollversion, die die Integration nicht kennt, wird
  nicht eingerichtet, sondern als Reparatur gemeldet („Integration zu alt“).

## 11. Was das für die bestehenden Module heißt

| | Heute | Mit dem Protokoll |
|---|---|---|
| **Beat** | eigene Integration `yapaia_beat` | Gerät „Yapaia Beat“ in `yapaia`; Mediaplayer als `spezial: beat.player`; Einstellungen/Sensoren allgemein beschrieben. Die alte Integration wird beim Umstieg ersetzt. |
| **Go** | Zustände per `POST /api/states` (oder MQTT), Bedienen über Helfer | Gerät „Yapaia Go“ mit echten, bedienbaren Entitäten, Aktionen (`ziel_setzen` …) und Auslösern (`ziel_erreicht`, `stau_voraus` …). MQTT bleibt als Option; der States-Weg und die Helfer entfallen. |
| **Satellite** | ESPHome-Gerät | bleibt ESPHome; die Integration erkennt jeden Satelliten an der Projektkennung `yapaia.satellite` und meldet ihn als Instanz und Partner (Abschnitt 3). Beliebig viele. |

## 12. Entscheidungen

1. **Entity-IDs:** Neue, saubere IDs nach dem Muster
   `<plattform>.yapaia_<modul>[_<name>]_<schluessel>`, z. B.
   `sensor.yapaia_go_ankunft`. Die alten `…yapaja_…` entfallen; Yapaia Go
   schreibt sein erzeugtes Dashboard selbst um, eigene Automationen werden
   einmal angepasst. *(entschieden)*
2. **Ein Konfigurationseintrag je Instanz**, alle unter der Integration
   „Yapaia“; jede Instanz einzeln entfernbar. *(entschieden)*
3. **Mehrere Instanzen je Modul** sind von Anfang an vorgesehen (Abschnitt 3).
   *(entschieden)*
