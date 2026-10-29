# Sprachen (Internationalisierung)

Yapaia zeigt alle Texte in der Sprache von Home Assistant. Unterstützt sind
**Deutsch (`de`) und Englisch (`en`)**; jede andere HA-Sprache wird zu Englisch.
Eine eigene Sprache je Modul gibt es nicht.

## Grundsätze

- **Keine festen Texte im Code.** Alles, was Anwender sehen, steht je Sprache
  in einer Übersetzungsdatei bzw. als `{"de": …, "en": …}`. Fehlt ein Text,
  gilt Englisch.
- **Neue Sprachen ohne Code:** eine weitere Datei je Bereich und den Code in
  `SPRACHEN` (Integration) ergänzen.
- **CI prüft Vollständigkeit:** dieselben Schlüssel und Platzhalter in jeder
  Sprache (`integration/tests/test_sprache.py`).
- Neue Module, Add-ons und Karten bauen das von Anfang an ein (wie die
  [Design-Schemata](design-schemata.md)).

## Wo die Texte stehen

| Bereich | Ort | Sprache kommt von |
|---|---|---|
| Integration: Einrichtung, Optionen, Entitäten, Dienste, Fehlermeldungen | `integration/custom_components/yapaia/strings.json` (= `translations/en.json`), `translations/de.json` | Home Assistant selbst (`translation_key`, `translation_domain`) |
| Entitäten, Aktionen, Ereignisse der Module | Beschreibung des Moduls (`{"de": …, "en": …}`), [Protokoll](integration-protokoll.md) §3 | Integration wählt die HA-Sprache |
| Benachrichtigungen der Integration | im Code als `text({"de": …, "en": …}, sprache(hass))` | `sprache.py` |
| Add-on-Optionen | `<addon>/translations/de.yaml`, `en.yaml` | Supervisor |
| Oberflächen der Add-ons (Go, Beat, Vision) | je Add-on (geplant) | `POST /yapaia/v1/sprache` (Protokoll §8b) |
| Karten/Dashboards | je Karte (geplant) | `hass.language` |

## Stufen

1. Grundlage: Protokoll §8b, `sprache.py`, CI-Prüfung – **erledigt** (Integration 0.8.0)
2. Integration: feste Namen und Meldungen übersetzt – **erledigt** (Integration 0.8.0)
3. Karten und Dashboards
4. Oberflächen von Beat und Vision
5. Oberfläche von Go
6. Go-Ansagen, Kartenbeschriftung, ESPHome-Geräte
