# Fähigkeiten der Yapaia-Module

Eine **Fähigkeit** ist ein Vertrag zwischen Modulen (siehe
`integration-protokoll.md`, Abschnitt 8): Ein Modul meldet sie in seiner
Beschreibung, die Integration gibt sie in der Partnerliste weiter, und andere
Module nutzen sie **nur, wenn der Partner sie meldet** – nie anhand des
Modulnamens.

| Fähigkeit | Wer bietet sie | Was sie zusagt |
|---|---|---|
| `navigation` | Go | Offline-Navigation; Ziel, Ankunft, Restweg als Entitäten. |
| `radio` | Beat | UKW/DAB+-Radio als Mediaplayer. |
| `ansage.einmischen` | Beat | Ansagen werden ins laufende Radio gemischt (Musik leiser, Ansage, Musik zurück). |
| `sprache.eingabe` | Satellite | Mikrofon für den Home-Assistant-Sprachassistenten. |
| `sprache.ausgabe` | Satellite | Lautsprecher als Mediaplayer (Ansagen per `tts.speak`). |

## `ansage.einmischen`

- **Aufruf:** Home-Assistant-Aktion `yapaia.beat_ansage` – nicht direkt beim
  Modul, weil Home Assistant die Stimme erzeugt (Sprachausgabe/TTS).
- **Felder:** `message` (Text, Pflicht), `priority` (`info`, `hinweis`,
  `navigation`), optional `engine` (TTS-Entität) und `language`.
- **Antwort** (mit `return_response`): `{"ok": true, "weg": "gemischt" |
  "lautsprecher"}` oder `{"ok": false, "error": "…"}`. Bei `ok: false` spricht
  der Aufrufer selbst (z. B. über den gewählten Lautsprecher).

## `sprache.ausgabe`

- **Aufruf:** `tts.speak` mit dem `media_player` aus der Partnerliste.
