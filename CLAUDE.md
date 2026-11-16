# CLAUDE.md – Yapaia

Yapaia ist eine Suite von Home-Assistant-Modulen fürs Wohnmobil (siehe README.md).
Claude läuft direkt auf dem Mini-PC des Wohnmobils (Home Assistant OS, Add-on mit
Terminal); der Nutzer bedient die Session per Remote vom iPad (Claude-App).

## Sprache und Stil

- Mit dem Nutzer, in Code-Kommentaren, Commits, PRs und Doku: **Deutsch**.
- Antworten kurz halten – sie werden auf dem iPad gelesen.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `go/` | Yapaia Go – Offline-Navigation (Node/pnpm-Monorepo, Add-on in `go/yapaia_go/`) |
| `beat/` | Yapaia Beat – UKW/DAB+-Radio (Add-on in `beat/yapaia_beat/`) |
| `vision/` | Yapaia Vision – analoge Kameras über USB-Grabber (Add-on in `vision/yapaia_vision/`) |
| `satellite/` | Sprachsatellit ESP32 (ESPHome) |
| `router/` | GL.iNet-Mobilfunk – Teil der Integration, kein Add-on |
| `integration/custom_components/yapaia/` | zentrale HA-Integration „Yapaia“ (Tests: `integration/tests`) |
| `dashboards/` | Karten und Dashboards, Einspielen mit `python3 dashboards/deploy.py` |
| `devices/esphome/` | weitere ESPHome-Geräte (z. B. Navi-Anzeige) |
| `docs/` | `integration-protokoll.md` (Schnittstelle Module ↔ Integration), `faehigkeiten.md`, `design-schemata.md`, `sprachen.md` |

`go/ORCHESTRATION-LOG.md` ist der Arbeitsstand der großen Go-Epics – bei Arbeit an
Go zuerst lesen.

## Pfade auf diesem Gerät

- Repo (Arbeitskopie): `/share/yapaia-dev/yapaia`
- HA-Konfiguration: `/homeassistant` (= `/config`); installierte Integration in
  `/homeassistant/custom_components/yapaia` (wird von den Add-ons mitgebracht)
- Karten/Dashboards im Browser: `/homeassistant/www/yapaia*`
- Laufzeitdaten von Go (Valhalla, Photon, Tiles, DB): `/share/yapaia`
- `/root` ist **nicht** dauerhaft; dauerhaft sind `/data`, `/share`, `/homeassistant`.

## Arbeitsweise

- Nie direkt auf `main`: Branch anlegen, PR über `gh` (eingeloggt als Apfelsafft),
  Squash-Merge – der Titel bekommt dann `(#N)`.
- PR-Beschreibung: knappe Stichpunkte, was und warum, was auf dem Gerät geprüft wurde.
- CI prüft nur geänderte Module (`.github/workflows/ci.yml`), der Check **„Gate“**
  entscheidet über das Mergen.
- Jedes Add-on führt Version (`config.yaml`) und `CHANGELOG.md` selbst; bei
  Änderungen an einem Add-on beides hochziehen. Commit-/PR-Titel beginnt dann mit
  Modul und Version, z. B. „Vision 0.2.4: …“. Release-Tags: `go-v0.53.0` usw.
- Neue Module, Add-ons, Karten, Dashboards und Displays bauen die **Design-Schemata**
  von Anfang an ein (Tokens aus `design/schemata`, Auswahl `select.<gerät>_design`,
  Protokoll §8a, siehe `docs/design-schemata.md`) – keine fest verdrahteten Farben/Schriften.
- Texte nie fest verdrahten: alles Sichtbare auf Deutsch und Englisch, Sprache folgt
  Home Assistant (siehe `docs/sprachen.md`, Protokoll §8b).
- Grundsatz: Module sind eigenständig und reden nur über dokumentierte
  Schnittstellen miteinander.

## Prüfen

- Integration: `cd integration && python -m pytest -q`
- Go: `cd go && pnpm test --run` (vitest, ohne Watch-Modus)
- Änderungen möglichst auch am echten Gerät prüfen (HA neu laden, Add-on neu
  starten, ESPHome per OTA) und im PR vermerken.
