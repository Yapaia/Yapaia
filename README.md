# Yapaia

**Yapaia** ist eine Suite von Home-Assistant-Modulen fürs Wohnmobil – jedes
Modul erfüllt eine Aufgabe, funktioniert für sich allein und wird besser, je
mehr Yapaia-Module zusammenarbeiten.

| Modul | Was es ist | Ordner |
|---|---|---|
| **Yapaia Go** | Offline-Navigation fürs Wohnmobil (Add-on) | [`go/`](go/) |
| **Yapaia Beat** | UKW- und DAB+-Radio mit RTL-SDR-Stick (Add-on) | [`beat/`](beat/) |
| **Yapaia Vision** | Analoge Kameras (z. B. Rückfahrkamera) über einen USB-Video-Grabber (Add-on) | [`vision/`](vision/) |
| **Yapaia Satellite** | Sprachsatellit auf dem ESP32 Audio Kit (ESPHome) | [`satellite/`](satellite/) |
| **Yapaia Router** | Mobilfunk des GL.iNet-Routers (GL-X3000): Status, SIM-Umschaltung nach Land (Teil der Integration „Yapaia“) | [`router/`](router/) |

Fertige Dashboards für Home Assistant liegen in [`dashboards/`](dashboards/).

## Installation

Alle Add-ons kommen aus **einem** Add-on-Store:
Home Assistant → Einstellungen → Add-ons → Add-on-Store → ⋮ → Repositories →
`https://github.com/Yapaia/yapaia`. Danach jedes Modul einzeln installieren –
nur die, die man braucht.

Jedes Add-on bringt die Integration **„Yapaia“** mit. Nach dem ersten Start
einmal Home Assistant neu starten; dann erscheint jedes Modul unter
*Einstellungen → Geräte & Dienste* als „… gefunden“ und wird mit einem Tipp
eingerichtet. Der **Yapaia Router** (GL.iNet-Mobilfunk) ist kein Add-on: *Integration
hinzufügen → Yapaia → GL.iNet-Router*.

## Grundsätze

1. **Jedes Modul ist eigenständig.** Go läuft ohne Beat, Beat ohne Go, Beat
   ohne Music Assistant. Ist ein Partner-Modul da, wird es genutzt; fehlt es,
   fällt nur diese Zusatzfunktion weg.
2. **Module sprechen über dokumentierte Schnittstellen**, nie über Interna
   eines anderen Moduls.
3. **Eine zentrale Home-Assistant-Integration „Yapaia“** (in Arbeit): jedes
   installierte Modul meldet sich dort an und stellt seine Sensoren,
   Schalter, Aktionen und Auslöser bereit – alles an einer Stelle.

## Entwicklung

- Jedes Modul hat seinen eigenen Prüflauf. Ein Pull Request startet **nur die
  Prüfungen der geänderten Module** (`.github/workflows/ci.yml`); der Check
  **„Gate“** fasst sie zusammen und entscheidet über das Mergen.
- Versionen und Änderungslisten führt jedes Modul selbst
  (`go/yapaia_go/CHANGELOG.md`, `beat/yapaia_beat/CHANGELOG.md`, `vision/yapaia_vision/CHANGELOG.md`).
  Release-Tags tragen das Modul im Namen, z. B. `go-v0.43.0`.
- Die Geschichte der früheren Einzel-Repositories ist vollständig erhalten
  (`git log -- go/`, `git log -- beat/`, `git log -- satellite/`, `git log -- router/`).

## Lizenz

Yapaia ist freie Software unter der **GNU General Public License 3.0 oder
später** ([`LICENSE`](LICENSE)): du darfst es nutzen, verändern und
weitergeben – auch verändert, solange es dabei unter derselben Lizenz und mit
Quelltext bleibt.

- **Ohne Gewähr.** Yapaia wird unentgeltlich und ohne Gewährleistung
  bereitgestellt; die Haftung ist ausgeschlossen, soweit das Gesetz es zulässt
  (GPL-3.0, Abschnitte 15 und 16). Alle Anzeigen – Route, Durchfahrtshöhe,
  Tempolimit, Spuren, Kamera, Reifendruck, Füllstände – sind Hinweise; die
  Verantwortung für das Fahrzeug liegt immer bei der Person am Steuer.
- **Fremde Bausteine und Daten** (OpenStreetMap, welle.io, Valhalla …):
  [`DRITTLIZENZEN.md`](DRITTLIZENZEN.md).
- **Name und Logo** sind nicht Teil der Lizenz: [`NAME-UND-LOGO.md`](NAME-UND-LOGO.md).

