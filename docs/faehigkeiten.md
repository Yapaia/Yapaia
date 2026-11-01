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
| `wlan.repeater` | Router | Router als Repeater an einem fremden WLAN: suchen, verbinden, trennen per `yapaia.router_wlan_suchen`, `…_wlan_verbinden` (`ssid`, optional `passwort`, `bssid`, `merken`), `…_wlan_trennen`; Anmeldung im Browser (Captive Portal) als Sensor `…_wlan_anmeldung`. |
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

## `wlan.repeater`

- **Aufruf:** `yapaia.router_wlan_suchen` (Antwort: Liste der WLANs der
  Umgebung), `yapaia.router_wlan_verbinden` (`ssid` Pflicht; ohne `passwort`
  gilt ein beim Router gespeichertes; `merken`, Standard an) und
  `yapaia.router_wlan_trennen`.
- **Zustände:** `…yapaia_router_internet` (Internet über WLAN, Mobilfunk, Kabel
  oder Tethering), `…_wlan_signal`, `…_wlan_anmeldung` (`an`, wenn das WLAN
  eine Anmeldung im Browser verlangt).

## `kamera`

- **Entitäten:** `camera.yapaia_vision_kamera_<n>` je Kanal (Standbild und
  MJPEG-Live-Strom), dazu `select.yapaia_vision_kanal`, wenn sich Kanäle einen
  Grabber teilen.
- **Aufruf:** `yapaia.vision_kanal_waehlen` (`kanal`: Name wie
  „Rückfahrkamera“ oder Nummer). Teilen sich Kanäle einen Grabber, läuft nur
  der gewählte live; die anderen zeigen ihr letztes Bild.

## `sprache.ausgabe`

- **Aufruf:** `tts.speak` mit dem `media_player` aus der Partnerliste.
