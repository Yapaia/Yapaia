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
  Sprache (`integration/tests/test_sprache.py`, für Karten
  `node dashboards/sprachen-pruefen.mjs`).
- Neue Module, Add-ons und Karten bauen das von Anfang an ein (wie die
  [Design-Schemata](design-schemata.md)).

## Wo die Texte stehen

| Bereich | Ort | Sprache kommt von |
|---|---|---|
| Integration: Einrichtung, Optionen, Entitäten, Dienste, Fehlermeldungen | `integration/custom_components/yapaia/strings.json` (= `translations/en.json`), `translations/de.json` | Home Assistant selbst (`translation_key`, `translation_domain`) |
| Entitäten, Aktionen, Ereignisse der Module | Beschreibung des Moduls (`{"de": …, "en": …}`), [Protokoll](integration-protokoll.md) §3 | Integration wählt die HA-Sprache |
| Benachrichtigungen der Integration | im Code als `text({"de": …, "en": …}, sprache(hass))` | `sprache.py` |
| Add-on-Optionen | `<addon>/translations/de.yaml`, `en.yaml` | Supervisor |
| Oberflächen der Add-ons (Go, Beat, Vision) | `const TEXTE` im Skript der Seite, feste HTML-Texte mit `data-t…`; Beat und Vision erledigt; Go: `apps/web/src/i18n` (`texte()`, `useT`, `tx`, `gebiet`), je Bereich `texte.ts`, geprüft von `i18n.test.ts` | `POST /yapaia/v1/sprache` (Protokoll §8b) |
| Karten/Dashboards | je Karte oben `const TEXTE = { de: {…}, en: {…} }` mit `t(hass, schlüssel, werte)`; Zahlen/Datum über `gebiet(hass)` – geprüft von `dashboards/sprachen-pruefen.mjs` | `hass.locale.language` |

## Stufen

1. Grundlage: Protokoll §8b, `sprache.py`, CI-Prüfung – **erledigt** (Integration 0.8.0)
2. Integration: feste Namen und Meldungen übersetzt – **erledigt** (Integration 0.8.0)
3. Karten und Dashboards – **erledigt** (Integration 0.8.1, Go 0.66.1)
4. Oberflächen von Beat und Vision – **erledigt** (Beat 1.19.0, Vision 0.4.0; offen: Meldungen, die Vision vom Server schickt)
5. Oberfläche von Go – **erledigt** (Go 0.67.0; `apps/web/src/i18n`, je Bereich `texte.ts`; offen: Texte, die der Kern erzeugt, und Sprachbefehle)
6. Kern-Texte, Sprachbefehle, ESPHome – **erledigt** (Go 0.68.0, Vision 0.4.1):
   Go-Kern übersetzt seine Meldungen (`apps/core/src/i18n.ts`, je Bereich
   `texte.ts`), versteht Sprachbefehle auf Deutsch und Englisch und meldet
   seine Sprache als Sensor `sprache` (für die ESPHome-Navi-Anzeige);
   Kartenbeschriftung wählbar im Stil-Menü (`name_en` ist in den Kacheln).
   Offen: Add-on-/Marktplatz-Meldungen in Go, Zustandstexte des Routers
   (die Cockpit-Karte wertet sie aus), Entitätsnamen der ESPHome-Geräte.
