# Reisetagebuch

Die Karte `yapaia-reisetagebuch-card` zeigt die aufgezeichneten Fahrten Tag für
Tag (◀ ▶ zum Blättern, Standard ist der letzte Tag): Strecke, Fahrzeit und
Durchschnitt, geschätzten Verbrauch und Kosten, die Route nach Tempo gefärbt
(Grenzübergänge markiert), Fahrstil (Tempomat, Gänge, Bremsungen), Länder,
Fahrzeugwerte und die Fahrtenliste. Fahrzeugwerte aus dem CAN-Bus sind
optional; ohne sie zeigt die Karte nur GPS-Daten. Während einer laufenden
Fahrt erscheint „Fahrt läuft …“.

## Voraussetzung

- Integration **Yapaia ab 0.9.0** mit Reisetagebuch (WebSocket
  `yapaia/reisetagebuch/tage` und `yapaia/reisetagebuch/tag`, Ereignis
  `yapaia_reisetagebuch_geaendert`).
- Welche Quellen die Integration auswertet, stellt der WebSocket-Befehl
  `yapaia/reisetagebuch/einstellungen` ein.

## Einbinden

Ressource (JavaScript-Modul) `/local/yapaia-dashboards/reisetagebuch-card.js`,
am einfachsten mit `python3 dashboards/deploy.py --dashboard reisetagebuch`.

```yaml
type: custom:yapaia-reisetagebuch-card
design: auto     # auto = Gesamt-Schema, sonst Schema-ID
preis_l: 2.40    # Dieselpreis €/l für die Kostenschätzung
```

Texte folgen der Sprache von Home Assistant (Deutsch/Englisch), Farben und
Schriften dem [Design-Schema](../../docs/design-schemata.md).

## Wie die Integration Fahrten erfasst

Code: `integration/custom_components/yapaia/reisetagebuch/`.

- Eine Fahrt beginnt, sobald sich das Fahrzeug mehr als 100 m mit über
  8 km/h bewegt. Sie endet erst nach 45 Minuten Stillstand, damit Pausen
  (Motor aus) Teil der Fahrt bleiben. Die Fahrzeit zählt ohne Stehzeiten.
  Fahrten unter 1 km zählen nicht.
- Gespeichert wird dauerhaft in `.storage/yapaia.reisetagebuch*`, ein Speicher
  je Monat. Die Recorder-Historie reicht dafür nicht.
- **Quellen** (Rolle → Entitäten): Ohne Einstellung nimmt die Integration nur
  Go und den Router (Position, Ort, Adresse, Höhe, Land). Fahrzeugwerte von
  fremden Geräten trägt man selbst ein, als Admin über den WebSocket:

  ```json
  {"type": "yapaia/reisetagebuch/einstellungen", "quellen": {
    "position": ["device_tracker.yapaia_go_standort"],
    "zuendung": ["binary_sensor.mein_can_zuendung"],
    "kilometerstand": ["sensor.mein_can_km"],
    "gang": ["sensor.mein_can_gang"]}}
  ```

  Rollen: `position`, `zuendung`, `kilometerstand`, `tempo`, `drehzahl`, `gang`,
  `tempomat`, `bremse`, `blinker_links`, `blinker_rechts`, `aussentemperatur`,
  `bordspannung`, `tank`, `verbrauch`, `momentanverbrauch`, `land`, `ort`, `adresse`, `hoehe`.
  Ohne `quellen` liefert der Befehl die aktuelle Einstellung.
- **Nachtragen** aus dem Recorder (ersetzt die Fahrten im Zeitraum):
  `{"type": "yapaia/reisetagebuch/nachtragen", "start": "2026-11-14T00:00", "ende": "2026-11-17T13:00"}`
- **Löschen** einer Fahrt: `{"type": "yapaia/reisetagebuch/loeschen", "start": "<start der Fahrt>"}`
