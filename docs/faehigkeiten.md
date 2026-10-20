# Fähigkeiten der Yapaia-Module

Eine **Fähigkeit** ist ein Vertrag zwischen Modulen (siehe
[`integration-protokoll.md`](integration-protokoll.md#8-module-untereinander), Abschnitt 8): Ein Modul meldet sie in seiner
Beschreibung, die Integration gibt sie in der Partnerliste weiter, und andere
Module nutzen sie **nur, wenn der Partner sie meldet** – nie anhand des
Modulnamens.

| Fähigkeit | Wer bietet sie | Was sie zusagt |
|---|---|---|
| `navigation` | Go | Offline-Navigation; Ziel, Ankunft, Restweg als Entitäten. |
| `radio` | Beat | UKW/DAB+-Radio als Mediaplayer. |
| `ansage.einmischen` | Beat | Ansagen werden ins laufende Radio gemischt (Musik leiser, Ansage, Musik zurück). |
| `mobilfunk` | Router | Mobilfunkstatus: Land (`land_code`), Roaming, Anbieter, Signal als Entitäten `…yapaia_router_<schlüssel>`. |
| `mobilfunk.sim_wechsel` | Router | SIM 1/2 umschalten per Aktion `yapaia.router_sim_waehlen` (`sim`); Ergebnis über die Ereignisse `sim_gewechselt` / `sim_wechsel_fehlgeschlagen`. |
| `kamera` | Vision | Kameras als Entitäten `camera.yapaia_vision_kamera_<n>`; Kanal wählen per `yapaia.vision_kanal_waehlen` (`kanal`: Name oder Nummer). |
| `sprache.eingabe` | Satellite | Mikrofon für den Home-Assistant-Sprachassistenten. |
| `sprache.ausgabe` | Satellite | Lautsprecher als Mediaplayer (Ansagen per `tts.speak`). |

## `navigation`

- **Aufruf:** Home-Assistant-Aktionen `yapaia.go_ziel_setzen` (Felder `ziel`
  als Text oder `ort` mit `latitude`/`longitude`), `yapaia.go_zwischenziel_einfuegen`
  (`ort`, optional `name`), `yapaia.go_navigation_pausieren`,
  `…_fortsetzen`, `…_beenden`, `yapaia.go_profil_waehlen` (`wert`) und
  `yapaia.go_befehl` (`text`; Antwort im Ergebnis als `antwort`).
- **Zustände:** `ankunft`, `restweg`, `ziel`, `zustand`, `tempo`,
  `tempolimit`, `standort` (`{breite, laenge, genauigkeit}`) als Entitäten
  `…yapaia_go_<schlüssel>`.
- **Ereignisse:** `ziel_erreicht` (`ziel`), `zu_schnell` (`tempo`,
  `grenze_kmh`), `gps_verloren`, `neuberechnung_fehlgeschlagen`.

## `radio`

- **Aufruf:** Home-Assistant-Aktion `yapaia.beat_befehl` (`text`; Antwort im
  Ergebnis als `antwort`) – ein gesprochener Satz wie „Spiel SWR3“, „Radio
  aus“, „Nächster Sender“, „Radio lauter“ oder „Wechsle die Ausgabe auf
  Wohnzimmer“. Beat legt dafür die Automation „Yapaia Beat Sprachbefehle“ an.
- Daneben die Entitäten und Aktionen des Beat-Teils der Integration
  (`media_player.yapaia_beat`, `yapaia.beat_abspielen` …).

## `ansage.einmischen`

- **Aufruf:** Home-Assistant-Aktion `yapaia.beat_ansage` – nicht direkt beim
  Modul, weil Home Assistant die Stimme erzeugt (Sprachausgabe/TTS).
- **Felder:** `message` (Text, Pflicht), `priority` (`info`, `hinweis`,
  `navigation`), optional `engine` (TTS-Entität) und `language`.
- **Antwort** (mit `return_response`): `{"ok": true, "weg": "gemischt" |
  "lautsprecher"}` oder `{"ok": false, "error": "…"}`. Bei `ok: false` spricht
  der Aufrufer selbst (z. B. über den gewählten Lautsprecher).

## `kamera`

- **Entitäten:** `camera.yapaia_vision_kamera_<n>` je Kanal (Standbild und
  MJPEG-Live-Strom), dazu `select.yapaia_vision_kanal`, wenn sich Kanäle einen
  Grabber teilen.
- **Aufruf:** `yapaia.vision_kanal_waehlen` (`kanal`: Name wie
  „Rückfahrkamera“ oder Nummer). Teilen sich Kanäle einen Grabber, läuft nur
  der gewählte live; die anderen zeigen ihr letztes Bild.

## `sprache.ausgabe`

- **Aufruf:** `tts.speak` mit dem `media_player` aus der Partnerliste.
