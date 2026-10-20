# 04 – Home-Assistant-Integration

> **Einordnung:** Fachreferenz, laufend gepflegt — hier stehen die Details.
> Wer einen Einstieg oder das Gesamtbild sucht, fängt besser im
> [Entwicklerhandbuch](developers.md) an; die Bedienung steht im
> [Handbuch](manual.md).


Yapaia Go und Home Assistant laufen auf demselben Mini-PC (Proxmox: HAOS-VM +
Yapaia-LXC/VM, **oder** Yapaia als HA-Add-on direkt in HAOS). Der Weg zu Home
Assistant ist die **Integration „Yapaia"** (§1b). Dazu kommen **MQTT** als
optionaler Zusatzkanal (`mqtt_enabled`, Vorgabe aus), **REST beidseitig**
(gezielte Aktionen) und das **HA-Add-on-Packaging** (Installation &
UI-Zugriff via Ingress).

## 1. MQTT (optionaler Zusatzkanal)

> Nur aktiv, wenn `mqtt_enabled` eingeschaltet ist. Entitäten, Aktionen und
> Auslöser liefert die Integration „Yapaia" (§1b); dieser Abschnitt beschreibt
> den zusätzlichen MQTT-Weg.

- Broker: der in HA übliche **Mosquitto**. Yapaia-Core verbindet sich als Client
  (mqtt.js), Reconnect mit Exponential-Backoff, **LWT** auf `yapaia/status = offline`.
- Topics/Payloads: siehe `docs/03-api-spec.md` §4. Ein gemeinsames Schema mit WS —
  keine Sonderformate für HA.
- **Auto-Discovery:** Beim Start (und bei `homeassistant/status = online`, d. h.
  HA-Neustart) publiziert Yapaia Discovery-Configs (retained) unter
  `homeassistant/<component>/yapaia_<objekt>/config`:

| HA-Entität | Typ | Quelle |
|---|---|---|
| `sensor.yapaia_speed` | sensor (km/h, device_class speed) | nav/speed |
| `sensor.yapaia_speed_limit` | sensor (km/h) | nav/speed |
| `binary_sensor.yapaia_speeding` | binary_sensor | nav/speed |
| `sensor.yapaia_eta` | sensor (timestamp) | nav/eta |
| `sensor.yapaia_distance_remaining` | sensor (km) | nav/eta |
| `sensor.yapaia_instruction` | sensor (Text) + Attribut `icon` (Richtungspfeil) | **nav/maneuver** (Zustand, 1 Hz) |
| `sensor.yapaia_instruction_distance` | sensor (m) | **nav/maneuver** (Zustand, 1 Hz) |
| `sensor.yapaia_altitude` | sensor (m, device_class distance) | nav/altitude |
| `sensor.yapaia_nav_state` | sensor (idle/navigating/…) | nav/state |
| `device_tracker.yapaia_vehicle` | device_tracker (json_attributes lat/lon) | position |
| `sensor.yapaia_destination` | sensor (Name) + Attribute lat/lon | nav/destination |
| `button.yapaia_stop` / `pause` / `resume` | button → cmd/navigation | – |
| `select.yapaia_profile` | select (Profilnamen) → cmd/profile | profiles |


  **Warum die beiden Anweisungs-Sensoren an `nav/maneuver` hängen und nicht an
  `nav/instruction` (0.7.2):** `nav/instruction` ist die ANSAGE. Sie entsteht
  nur, wenn eine Ansage-Schwelle fällt, und ihre `distance_m` ist die
  Entfernung in genau diesem Augenblick — der Typ sagt das selbst („AT THE
  MOMENT the threshold fired"). Gemeldet wurde: „Die Strecke bis zur nächsten
  Abbiegung wird nicht geupdated. Die anderen Werte wohl schon." Die anderen
  kamen aus `nav/state`. Betroffen war auch der TEXT: nach einer Abbiegung
  blieb die eben absolvierte Anweisung stehen, bis für die nächste eine
  Schwelle fiel. `nav/maneuver` wird aus `nav/state` gebildet und kommt
  deshalb im selben Takt wie Tempo, ETA und Reststrecke. Dasselbe gilt für den
  HA-internen Kanal (`ha/statesBridge.ts`), der denselben Fehler hatte.

  Alle Entitäten hängen an einem HA-**Device** „Yapaia Go" (identifiers:
  `yapaia_go`, sw_version, configuration_url → App-URL).

  **Die Entity-IDs oben gelten seit 0.6.9 wörtlich** — jede Discovery-Config
  schickt ein `object_id` mit (`mqtt/discovery.ts`). Davor waren sie eine
  Absichtserklärung: ohne `object_id` bildet Home Assistant die ID aus
  Geräte- **plus** Entitätsnamen, also `sensor.yapaia_go_speed`, und der
  Gerätename hat sich in 0.6.7 auch noch geändert. Bestehende Installationen
  behalten ihre einmal vergebenen IDs (die Registrierung benennt nichts um) —
  deshalb sucht `apps/core/src/ha/dashboard.ts` die IDs zur Laufzeit, statt
  sie vorauszusetzen.
- Damit sind in HA ohne YAML sofort Dashboards, Automationen („Wenn ETA < 30 min →
  Boiler an"), TTS-Ansagen über HA-Speaker etc. möglich.
- **Eigenes Dashboard (0.6.9).** Das Add-on legt beim Start zwei Dateien unter
  `<ha-config>/www/yapaia/` ab — also unter `/local/yapaia/`:
  `yapaia-map-card.js` (die Karte MIT Route und eigener Position; sie rahmt
  die Anzeigeseite `embed.html` des Add-ons, damit es nicht zwei Karten zu
  pflegen gibt) und `dashboard.yaml`/`.txt` (ein fertiges Dashboard für den
  Rohkonfigurationseditor, mit den zur Laufzeit gefundenen Entity-IDs). Die
  Karte holt sich Slug und Ingress-Sitzung über
  `hass.callWS({type: 'supervisor/api'})` — die drei genutzten Endpunkte sind
  dort auch ohne Administratorrechte erlaubt (`hassio/websocket_api.py`).

## 1b. Die Integration „Yapaia" — der Weg zu Home Assistant

Yapaia Go spricht das Yapaia-Protokoll (`docs/integration-protokoll.md` im
Monorepo, Code in `apps/core/src/yapaia/`) und erscheint als Gerät „Yapaia
Go" mit echten, bedienbaren Entitäten, Aktionen (`yapaia.go_*`) und
Auslösern. Das Add-on bringt die Integration mit, legt sie nach
`custom_components/yapaia` und meldet sich per Supervisor-Discovery an.

Der frühere Weg über geschriebene Zustände (`POST /api/states`) und die
Bedien-Helfer (`input_button.*`) ist entfallen — die Integration ersetzt
beide. MQTT bleibt als zusätzlicher Weg (`mqtt_enabled`, Vorgabe aus).

## 1d. Position aus der Companion-App (0.7.1)

`GET`/`POST /api/v1/system/ha/trackers` listet die `device_tracker`, die Home
Assistant kennt und die Koordinaten haben, und wählt einen aus. Die Auswahl
steht in der Installationsprüfung (🩺) im Add-on selbst und **gilt sofort** —
`HaTrackerSource` liest die Entity-ID bei jeder Abfrage neu, kein Neustart.

Warum nicht in der Add-on-Konfiguration: dort steht ein Freitextfeld, in das
eine Entity-ID gehört — eine Angabe, die man nicht weiß, sondern unter
*Entwicklerwerkzeuge → Zustände* nachschlagen muss. Eine Einrichtung aus
Textfeld und Ratespiel ist keine. Das Feld bleibt als Vorgabe erhalten; die
Auswahl in der Oberfläche gewinnt (`ha/config.ts#resolveTrackerEntityId`, das
auch die Zeichenkette `"null"` abfängt).

## 2. REST beidseitig

- **HA → Yapaia:** die komplette Core-REST-API (docs/03 §2), nutzbar via
  `rest_command`. Wichtigster Endpunkt: `POST /api/v1/navigation/destination`
  (Ziel setzen + optional Autostart) – für Automationen wie „Klick auf Karte im
  HA-Dashboard ⇒ Ziel im Navi".
- **Yapaia → HA:** Core kann die HA-REST-API rufen (Long-Lived-Token in Settings,
  im Add-on automatisch via `SUPERVISOR_TOKEN`/`http://supervisor/core/api`).
  V1-Nutzung bewusst klein: HA-Notifications (`notify`) und TTS-Ansagen über
  HA-Mediaplayer als optionaler Ausgabekanal für Navigationsansagen.
  Alles Weitere bleibt Add-ons überlassen (z. B. Kamera-Add-on holt Streams aus HA).

## 3. Auslieferung als HA-Add-on

**Entscheidung (aktualisiert in `feat/gui-install-path`):** **dieses Monorepo
ist selbst das Add-on-Repository.** Nutzer tragen unter *Einstellungen →
Add-ons → Add-on Store → ⋮ → Repositories* die URL
`https://github.com/Yapaia/yapaia` ein und bekommen „Yapaia Go"
als installierbares Add-on angezeigt.

**Warum die Struktur so ist:** Der Supervisor erkennt ein Git-Repository nur
dann als Add-on-Repository, wenn im **Wurzelverzeichnis** eine
`repository.yaml` liegt; die installierbaren Add-ons sucht er darunter in
allen Ordnern (außer Punkt-Ordnern und `rootfs/`), die eine `config.yaml`
enthalten — siehe den Kommentar in `repository.yaml`. So behält jedes Modul
des Monorepos seinen Add-on-Ordner im eigenen Verzeichnis
(`go/yapaia_go/`, `beat/yapaia_beat/`, `vision/yapaia_vision/`).

Struktur:
```
yapaia/                  # Monorepo-Wurzel
├── repository.yaml      # name, url, maintainer  ← macht das Repo zum Add-on-Repo
└── go/yapaia_go/
    ├── config.yaml      # name, slug, arch: [amd64, aarch64], ingress: true,
    │                    # ports: {} (ingress-only) bzw. optional 8080 für Direktzugriff,
    │                    # map: [share:rw]  → Kartendaten unter /share/yapaia (überlebt Updates!),
    │                    # services: [mqtt:want], uart/usb/udev: true (GPS-Maus),
    │                    # image: ghcr.io/yapaia/yapaia-go-{arch} (fertiges Image)
    ├── Dockerfile       # FROM Valhalla-Image (build.yaml); s6-overlay startet:
    │                    # core, valhalla, photon, gpsd (kein Compose in HA-Add-ons)
    ├── rootfs/etc/s6-overlay/...   # Service-Definitionen, Abhängigkeits-Reihenfolge
    └── DOCS.md / README.md / PACKAGING.md / icon.png
```

Alles Übrige im Monorepo (`apps/`, `packages/`, `services/`, `docs/` …)
ignoriert der Supervisor — er sieht nur Verzeichnisse mit `config.yaml`. Eine
spätere Auslagerung in ein eigenständiges `yapaia-go-ha-addon`-Repo bleibt
als Spiegel-Schritt möglich, ist für den GUI-Weg aber nicht mehr nötig
(`yapaia_go/PACKAGING.md`).

Kernpunkte:
- **Ingress:** `ingress: true` ⇒ UI erscheint in der HA-Seitenleiste, HA übernimmt
  Auth & Remote-Zugriff (Nabu Casa). Frontend muss unter beliebigem Pfad-Prefix
  laufen (relative URLs, kein hartes `/`) – Anforderung an E01/E07!
  WebSocket über Ingress funktioniert, muss aber explizit getestet werden (E08-T4).
- **MQTT-Credentials automatisch:** `services: [mqtt:want]` ⇒ bashio liefert
  Host/User/Passwort, Core liest sie beim Start (nur relevant mit
  `mqtt_enabled`).
- **USB-GPS:** `usb: true` + udev; gpsd läuft im Add-on-Container.
- **Kartendaten nach `/share/yapaia/`** (PMTiles, Valhalla-Graph, Photon-Index),
  nicht ins Container-FS – Add-on-Updates dürfen keine Daten-Downloads erzwingen.
- **Ressourcen-Realität:** HAOS-VM braucht dann RAM für HA **und** Yapaia-Services.
  Empfehlung in DOCS.md: HAOS-VM ≥ 6 GB bei DE-Karten; wer knapp ist, nimmt die
  Standalone-Compose-Variante im eigenen LXC. Beide Wege dokumentieren.
- Add-on-Optionen (config.yaml `options/schema`): Kartenregion, MQTT-Prefix,
  Photon an/aus (RAM-Sparmodus mit reduzierter Suche), GPS-Quelle, Log-Level.

## 4. Standalone-Variante (Proxmox LXC/VM, ohne HAOS-Add-on)

`go/docker-compose.yml`: `core` + `valhalla` + `photon`. Einen
`gpsd`-Dienst enthält die Compose-Datei derzeit nicht — gpsd läuft auf dem
Host (USB-Durchreichung an LXC dokumentieren).
MQTT-Zugang manuell in Settings. Reverse-Proxy-Hinweise (optional TLS via Caddy).
Diese Variante ist die **Referenz für Entwicklung und CI**.

## 6. Add-on-Events (E09-T8)

Jedes Add-on mit dem Scope `events.publish` (docs/05 §2) landet automatisch
auch in MQTT: ein Bus-Event `addon/{id}/*` wird 1:1 unter
`yapaia/addon/{id}/*` republiziert -- **kein YAML, keine Auto-Discovery
nötig**, einfach das Topic in einer Automation abonnieren. Rate-Limit
5 msg/s pro Add-on (unabhängig je Add-on -- ein "lautes" Add-on kann keinem
anderen das Budget wegnehmen), Payload ≤ 16 KB, nicht retained (jedes Event
ist ein Zeitpunkt-Ereignis, keine dauerhafte Zustandsgröße) und pro Add-on
über die Store-Detailseite ("In Home Assistant verfügbar") ab-/anschaltbar --
wirkt sofort, ohne Core-Neustart.

### Worked Example: Track-Recorder Start/Stop

Das Referenz-Add-on **Track-Recorder** (`com.yapaia.track-recorder`, docs/05
§6.2) publiziert beim Start/Ende einer Aufzeichnung:

| MQTT-Topic | Payload |
|---|---|
| `yapaia/addon/com.yapaia.track-recorder/started` | `{"trackId": "track-1738500000000", "startedAt": "2026-08-02T09:00:00.000Z"}` |
| `yapaia/addon/com.yapaia.track-recorder/stopped` | `{"id": "track-1738500000000", "name": "track-1738500000000", "startedAt": "…", "endedAt": "…", "distanceMeters": 12345.6, "pointCount": 812, "segmentCount": 2}` |

Eine HA-Automation, die bei Aufnahme-Ende eine Notification mit der
gefahrenen Distanz sendet (`configuration.yaml` / UI-Automation-YAML):

```yaml
automation:
  - alias: "Yapaia Go: Aufzeichnung beendet -> Benachrichtigung"
    trigger:
      - platform: mqtt
        topic: "yapaia/addon/com.yapaia.track-recorder/stopped"
    action:
      - service: notify.mobile_app_dein_handy
        data:
          title: "Track aufgezeichnet"
          message: >
            {{ (trigger.payload_json.distanceMeters / 1000) | round(1) }} km
            aufgezeichnet ({{ trigger.payload_json.pointCount }} Punkte,
            {{ trigger.payload_json.segmentCount }} Segment(e)).
```

Und ein `input_boolean`/Statuslicht, das anzeigt, ob gerade aufgezeichnet wird:

```yaml
automation:
  - alias: "Yapaia Go: Recorder-Status-Helper setzen"
    trigger:
      - platform: mqtt
        topic: "yapaia/addon/com.yapaia.track-recorder/started"
        id: "start"
      - platform: mqtt
        topic: "yapaia/addon/com.yapaia.track-recorder/stopped"
        id: "stop"
    action:
      - service: >
          {{ 'input_boolean.turn_on' if trigger.id == 'start' else 'input_boolean.turn_off' }}
        target:
          entity_id: input_boolean.yapaia_recording
```

Jedes Add-on mit `events.publish` funktioniert nach demselben Muster --
Topic-Name und Payload-Schema legt das jeweilige Add-on selbst fest (siehe
dessen README/Doku); der Namensraum `yapaia/addon/{id}/*` und die
Rate-/Größenlimits oben gelten für alle gleich.

## 7. Wargame-Bezüge (Details docs/08)

- W-06 MQTT-Broker down ⇒ Queue + Reconnect, App voll funktionsfähig ohne HA.
- W-07 HA-Neustart ⇒ Discovery-Replay via `homeassistant/status`.
- W-15 Ingress-Pfad bricht Assets ⇒ Pflichttest „App unter Sub-Pfad" in CI.
- W-16 Add-on-Update löscht Karten ⇒ Daten in `/share`, Migrationstest.
