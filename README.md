# Yapaia

> [!CAUTION]
> **Alpha-Version – Nutzung auf eigene Gefahr.**
>
> Yapaia befindet sich in der Alpha-Testphase und ist noch fehlerbehaftet.
> Einzelne Funktionen – etwa der Bau großer Karten – können ein System stark
> belasten und im schlimmsten Fall zum Absturz bringen.
>
> - **Vor der Installation ein vollständiges Backup** des Home-Assistant-Systems
>   anlegen und prüfen, dass es sich zurückspielen lässt.
> - **Am besten zuerst auf einem Testsystem** ausprobieren und erst auf das
>   produktive System wechseln, wenn alles zuverlässig läuft.
> - Yapaia ist **kein Ersatz für ein zugelassenes Navigationsgerät**; Routen,
>   Höhen- und Gewichtsangaben immer selbst prüfen.
>
> Die Software wird ohne jede Gewährleistung bereitgestellt. Jegliche Haftung
> für Schäden, die durch die Nutzung entstehen – insbesondere Datenverlust,
> Ausfälle oder Folgeschäden –, ist ausgeschlossen, soweit gesetzlich zulässig.
> Siehe auch Abschnitte 15 und 16 der [Lizenz (GPL-3.0)](LICENSE).

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
| **Integration „Yapaia“** | Die Home-Assistant-Integration, bei der sich alle Module anmelden; kommt mit jedem Add-on mit | [`integration/`](integration/) |
| **Dashboards** | Fertige Home-Assistant-Dashboards (Cockpit, Rangieren, Stellplatz) | [`dashboards/`](dashboards/) |
| **Geräte** | ESPHome-Konfigurationen für Geräte im Wohnmobil (Heizung, Tür, Bluetooth-Sammler, Navigationsanzeige …) | [`devices/esphome/`](devices/esphome/) |

**Add-ons für Yapaia Go:** Go lässt sich mit Add-ons erweitern. Seit Go 0.56.0
installiert es sie aus einem Add-on-Marktplatz – nur signierte Pakete, auf
Wunsch mit Lizenz, auch kostenpflichtige
(Protokoll: [`go/docs/marktplatz.md`](go/docs/marktplatz.md), Anleitung für
Add-on-Entwickler: [`go/docs/addon-dev-guide.md`](go/docs/addon-dev-guide.md)).

## Installation

Alle Add-ons kommen aus **einem** Add-on-Store:
Home Assistant → Einstellungen → Add-ons → Add-on-Store → ⋮ → Repositories →
`https://github.com/Yapaia/yapaia`. Danach jedes Modul einzeln installieren –
nur die, die man braucht.

Jedes Add-on bringt die Integration **„Yapaia“** mit. Nach dem ersten Start
einmal Home Assistant neu starten; dann erscheint jedes Modul unter
*Einstellungen → Geräte & Dienste* als „… gefunden“ und wird mit einem Tipp
eingerichtet. Der **Yapaia Router** (GL.iNet-Mobilfunk) ist kein Add-on: *Integration
hinzufügen → Yapaia → GL.iNet-Router* (die Integration muss dafür schon über
eines der Add-ons installiert sein). Der **Yapaia Satellite** wird im ESPHome
Device Builder aufgespielt – Anleitung in [`satellite/`](satellite/).

## Grundsätze

1. **Jedes Modul ist eigenständig.** Go läuft ohne Beat, Beat ohne Go, Beat
   ohne Music Assistant. Ist ein Partner-Modul da, wird es genutzt; fehlt es,
   fällt nur diese Zusatzfunktion weg.
2. **Module sprechen über dokumentierte Schnittstellen**, nie über Interna
   eines anderen Moduls.
3. **Eine zentrale Home-Assistant-Integration „Yapaia“:** Jedes
   installierte Modul meldet sich dort an und stellt seine Sensoren,
   Schalter, Aktionen und Auslöser bereit – alles an einer Stelle
   ([Protokoll](docs/integration-protokoll.md),
   [Fähigkeiten](docs/faehigkeiten.md)).
4. **Ein gemeinsames Aussehen:** Design-Schemata (Sport, Retro, Magazin,
   Mix, Beat Modern, Beat Retro) gelten für alle Oberflächen – eines für
   alles oder je Modul ein eigenes; Home Assistant selbst nur auf Wunsch
   ([Design-Schemata](docs/design-schemata.md)).

## Entwicklung

- Jedes Modul hat seinen eigenen Prüflauf. Ein Pull Request startet **nur die
  Prüfungen der geänderten Module** (`.github/workflows/ci.yml`); der Check
  **„Gate“** fasst sie zusammen und entscheidet über das Mergen.
- Versionen und Änderungslisten führt jedes Modul selbst
  ([`go/yapaia_go/CHANGELOG.md`](go/yapaia_go/CHANGELOG.md), [`beat/yapaia_beat/CHANGELOG.md`](beat/yapaia_beat/CHANGELOG.md),
  [`vision/yapaia_vision/CHANGELOG.md`](vision/yapaia_vision/CHANGELOG.md), [`router/CHANGELOG.md`](router/CHANGELOG.md)).
  Release-Tags tragen das Modul im Namen, z. B. `go-v0.56.0`.
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
- **Ausnahme Add-ons:** Das Add-on-SDK von Go, die Beispiel-Add-ons und die
  Signaturprüfung des Marktplatzes stehen unter Apache-2.0, damit Add-ons
  frei lizenziert werden können – auch kommerziell. Details in [`DRITTLIZENZEN.md`](DRITTLIZENZEN.md).
- **Fremde Bausteine und Daten** (OpenStreetMap, welle.io, Valhalla …):
  [`DRITTLIZENZEN.md`](DRITTLIZENZEN.md).
- **Name und Logo** sind nicht Teil der Lizenz: [`NAME-UND-LOGO.md`](NAME-UND-LOGO.md).

