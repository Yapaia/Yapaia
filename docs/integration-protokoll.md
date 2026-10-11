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

## 3. Anmeldung

Beim Start meldet sich jedes Add-on beim Supervisor (`POST /discovery`, wie
Beat heute):

```json
{
  "service": "yapaia",
  "config": {
    "modul": "go",
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
  ein. Ein Konfigurationseintrag je Modul, eindeutig über `modul`.
- `token` erzeugt das Add-on einmal und speichert es in `/data`. Die
  Integration schickt es bei jedem Aufruf als `Authorization: Bearer <token>`.
  Ohne gültiges Token antwortet `/yapaia/v1/*` mit 401 – der Port kann ins
  Heimnetz freigegeben sein, die Schnittstelle bleibt trotzdem geschlossen.
- Ohne Supervisor (Docker, Entwicklung): manuell Host, Port und Token
  eintragen.

## 4. Beschreibung

`GET /yapaia/v1/beschreibung` liefert, was das Modul anbietet:

```json
{
  "protokoll": 1,
  "modul": "go",
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
| `schluessel` | Dauerhafte Kennung im Modul. **Nie umbenennen** – daraus wird die Unique-ID `yapaia_<modul>_<schluessel>`; Umbenennen erzeugt in HA eine neue Entität. |
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
`yapaia.go_ziel_setzen`, mit Feldern und Beschreibung im Aktionen-Editor.
Feldtypen: `text`, `zahl`, `bool`, `auswahl` (mit `optionen`), `entitaet`,
`ort` (Koordinaten).

### Ereignisse und Auslöser

Ereignisse kommen über die Live-Verbindung (unten). Die Integration

- feuert sie als HA-Ereignis `yapaia_ereignis` mit `modul`, `name`, `daten`,
- bietet sie als **Geräte-Auslöser** an („Yapaia Go: Ziel erreicht“) – im
  Automationen-Editor ohne YAML auswählbar.

## 5. Live-Verbindung

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

## 6. Aktionen ausführen

`POST /yapaia/v1/aktion/<name>` mit den Feldern als JSON-Körper.

- Erfolg: `200 {"ok": true}` (optional mit `ergebnis`).
- Fehler: `4xx/5xx {"ok": false, "fehler": "Text für den Nutzer"}` – erscheint
  in HA als Fehlermeldung der Aktion.
- Bedienen einer Entität (Schalter, Auswahl …) ruft die dort genannte Aktion;
  den neuen Zustand meldet das Modul über die Live-Verbindung (nicht über die
  Antwort), damit es nur **eine** Quelle für Zustände gibt.

## 7. Module untereinander

Damit Go weiß, dass Beat da ist (und umgekehrt), schickt die Integration jedem
Modul die Liste der anderen:

`POST /yapaia/v1/partner`

```json
{"partner": [
  {"modul": "beat", "url": "http://a0d7b954-yapaia-beat:8099", "token": "…",
   "version": "1.14.0", "faehigkeiten": ["ansage.einmischen", "radio"]}
]}
```

- Gesendet nach dem Einrichten und bei jeder Änderung (Modul kommt dazu, fällt
  weg, Update). Leere Liste = allein.
- **Fähigkeiten** sind die Verträge zwischen Modulen: `ansage.einmischen`
  bedeutet „ich nehme `POST /yapaia/v1/aktion/ansage` mit Text/Audio an und
  mische es ins Programm“. Jede Fähigkeit ist in `docs/faehigkeiten.md`
  beschrieben (Name, Aktion, Felder, Verhalten). Ein Modul nutzt eine
  Fähigkeit nur, wenn der Partner sie **meldet** – nie anhand des Modulnamens.
- Ohne Integration gibt es keine Partnerliste; jedes Modul arbeitet dann für
  sich (heutiger Zustand).

## 8. Installation der Integration

- Jedes Add-on bringt die Integration mit und legt sie unter
  `/config/custom_components/yapaia/` ab, **wenn sie fehlt oder älter ist** als
  die mitgebrachte (Vergleich über `manifest.json` → `version`). Zwei Add-ons
  mit derselben Version tun also nichts doppelt; das neuere gewinnt.
- Danach meldet das Add-on in HA eine **Reparatur** „Yapaia-Integration
  aktualisiert – Home Assistant neu starten“ mit Knopf.
- Später zusätzlich über HACS.

## 9. Versionen und Verträglichkeit

- `protokoll` ist eine ganze Zahl. **Neue Felder, Entitäten, Aktionen,
  Ereignisse, Fähigkeiten** ändern sie *nicht* – beide Seiten ignorieren, was
  sie nicht kennen.
- Nur was Bestehendes bricht (Feld umgedeutet, Weg entfernt), erhöht sie.
  Die Integration unterstützt dann die alte und die neue Version mindestens
  eine Add-on-Generation lang.
- Ein Modul mit einer Protokollversion, die die Integration nicht kennt, wird
  nicht eingerichtet, sondern als Reparatur gemeldet („Integration zu alt“).

## 10. Was das für die bestehenden Module heißt

| | Heute | Mit dem Protokoll |
|---|---|---|
| **Beat** | eigene Integration `yapaia_beat` | Gerät „Yapaia Beat“ in `yapaia`; Mediaplayer als `spezial: beat.player`; Einstellungen/Sensoren allgemein beschrieben. Die alte Integration wird beim Umstieg ersetzt. |
| **Go** | Zustände per `POST /api/states` (oder MQTT), Bedienen über Helfer | Gerät „Yapaia Go“ mit echten, bedienbaren Entitäten, Aktionen (`ziel_setzen` …) und Auslösern (`ziel_erreicht`, `stau_voraus` …). MQTT bleibt als Option; der States-Weg und die Helfer entfallen. |
| **Satellite** | ESPHome-Gerät | bleibt ESPHome (hat schon ein Gerät in HA). Go erkennt Satelliten über Home Assistant, nicht über dieses Protokoll. |

## 11. Offene Entscheidungen

1. **Entity-IDs:** Heute heißen Gos Entitäten `sensor.yapaja_*` (alter
   Schreibfehler). Mit dem Protokoll entstehen saubere neue:
   `sensor.yapaia_go_eta` usw. Bestehende Dashboards/Automationen müssten
   einmal umgestellt werden – Yapaia Go kann das erzeugte Dashboard selbst
   neu schreiben. **Vorschlag: saubere neue IDs.**
2. **Ein Eintrag je Modul oder einer für alle?** Vorschlag: je Modul ein
   Eintrag (so funktioniert die HA-Erkennung; jedes Modul lässt sich einzeln
   entfernen) – alle unter der Integration „Yapaia“.
