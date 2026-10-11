# Yapaia Satellite

Ein **Home-Assistant-Sprachsatellit** auf dem **AI-Thinker ESP32 Audio Kit
V2.2 (A436)** – ESP32-A1S mit Audio-Codec ES8388, zwei Board-Mikrofonen,
Lautsprecher-Verstärker und sechs Tasten. Gebaut mit
[ESPHome](https://esphome.io/), eingerichtet komplett über die
Home-Assistant-Oberfläche.

- **Spracheingabe** über die beiden Board-Mikrofone
- **Sprachausgabe** und Musik über den angeschlossenen Lautsprecher
  (Home-Assistant-Mediaplayer; Ansagen werden über laufende Musik gelegt)
- **Aktivierungswort** wahlweise in Home Assistant (openWakeWord – auch ein
  eigenes Wort wie „Yapaia“) oder auf dem Gerät („Okay Nabu“, „Hey Jarvis“)
- **Tasten** zum Sprechen, Stummschalten, für Lautstärke und Stopp
- **Status-LED**: leuchtet beim Zuhören, blinkt beim Verarbeiten, flackert bei
  einem Fehler

## Was man braucht

- AI-Thinker ESP32 Audio Kit V2.2 mit **ES8388** (Aufdruck „A436“). Ältere
  Boards mit dem Codec AC101 (Aufdruck z. B. „2957“) passen **nicht**.
- Lautsprecher am Lautsprecher-Stecker (weiße 2-polige Buchse).
- Micro-USB-Kabel (Daten, nicht nur Strom) und ein Netzteil.
- Home Assistant mit dem Add-on **ESPHome Device Builder** und einer
  Sprachassistent-Pipeline (Einstellungen → Sprachassistenten).

## Einrichten

Alles geht über die Home-Assistant-Oberfläche. Zum **ersten** Aufspielen
steckt das Board per USB am Rechner, auf dem Home Assistant läuft
(Mini-PC); danach kommen Updates über WLAN.

1. **Board anschließen:** die Micro-USB-Buchse **„UART“** mit dem
   Home-Assistant-Rechner verbinden. (Die Buchse „POWER“ ist nur Strom.)
2. **Gerät anlegen:** Home Assistant → **ESPHome Device Builder** →
   **„+ New Device“** → Namen `yapaia-satellite` eingeben → „Next“ →
   **ESP32** wählen → „Skip“ (noch nicht installieren).
3. **Konfiguration einsetzen:** beim neuen Gerät auf **„Edit“** tippen. Die
   Zeilen `api:` / `encryption:` / `key:` mit dem erzeugten Schlüssel **behalten**,
   alles andere durch den Inhalt von
   [`yapaia-satellite.beispiel.yaml`](yapaia-satellite.beispiel.yaml) ersetzen
   und dort bei `key:` den eigenen Schlüssel eintragen. WLAN-Name und
   -Passwort kommen aus den „Secrets“ des Device Builders (oben rechts
   „Secrets“: `wifi_ssid`, `wifi_password`).
4. **Aufspielen:** „Save“ → **„Install“** → **„Plug into the computer running
   ESPHome Device Builder“** → den USB-Anschluss des Boards wählen. Der erste
   Bau dauert einige Minuten.
   - Bricht das Aufspielen mit „Failed to connect“ ab: die Taste **BOOT**
     gedrückt halten, kurz **RST** drücken, BOOT loslassen und erneut
     installieren.
5. **Übernehmen:** Home Assistant meldet unter Einstellungen → Geräte ein neues
   ESPHome-Gerät „Yapaia Satellite“ → **Hinzufügen**. Der Assistent für
   Sprachsatelliten führt durch Pipeline und Aktivierungswort.

Danach kann das Board an ein beliebiges USB-Netzteil (Buchse „POWER“ oder
„UART“). Updates: im Device Builder **„Install“ → „Wirelessly“**.

## Bedienung

| Taste | Wirkung |
|---|---|
| **KEY1** | Sprechen (nochmal drücken: abbrechen) |
| **KEY3** | Mikrofon stumm an/aus |
| **KEY4** / **KEY5** | leiser / lauter |
| **KEY6** | Stopp – Antwort, Ansage oder Musik beenden |
| KEY2 | frei (teilt sich die Leitung mit der SD-Karte) |

In Home Assistant erscheinen außerdem:

- **Aktivierungswort-Erkennung**: *In Home Assistant* (Standard), *Auf dem
  Gerät* oder *Nur Taste*.
- **Mikrofon stumm**, **Status-LED**, **Lautsprecher-Verstärker**
- Mediaplayer „Yapaia Satellite“ – für Musik, Durchsagen und
  `tts.speak`-Ansagen aus Automationen.
- **Tonausgang** und **Mikrofon-Eingang** (Diagnose, siehe unten).

### Welches Aktivierungswort?

- **In Home Assistant** (Standard): Der Satellit schickt den Ton an Home
  Assistant, das Add-on **openWakeWord** erkennt das Wort. Dort sind eigene
  Wörter möglich – die Anleitung für **„Yapaia“** steht im Yapaia-Go-Repo unter
  `docs/aktivierungswort-yapaia.md`. Braucht dauerhaft etwas WLAN.
- **Auf dem Gerät**: „Okay Nabu“ oder „Hey Jarvis“ wird auf dem ESP32 selbst
  erkannt (microWakeWord), ohne Dauer-Stream. Der ESP32-A1S ist dafür
  langsamer als die Home-Assistant-Voice-Geräte; erkennt er schlecht, auf
  „In Home Assistant“ zurückstellen.
- **Nur Taste**: hört nur nach KEY1.

## Wenn etwas nicht klappt

- **Kein Ton aus dem Lautsprecher:** „Lautsprecher-Verstärker“ muss an sein.
  „Tonausgang“ testweise auf LINE1 oder LINE2 stellen (Standard: BOTH). Die
  Auswahl gilt bis zum Neustart; dauerhaft über `speaker_output` (unten).
- **Spracherkennung versteht nichts / Aktivierungswort reagiert nicht:**
  „Mikrofon-Eingang“ testweise auf LINE2 oder DIFFERENCE stellen. Ist es zu
  leise oder zu laut: `mic_gain` anpassen (Standard 4).
- **LED leuchtet dauernd und geht beim Zuhören aus:** `led_inverted: "false"`.
- **Protokoll ansehen:** Device Builder → beim Gerät **„Logs“** →
  „Wirelessly“.

Einstellungen, die dauerhaft gelten sollen, kommen in die eigene Gerätedatei
unter `substitutions:`:

```yaml
substitutions:
  name: yapaia-satellite
  friendly_name: Yapaia Satellite
  speaker_output: LINE2   # LINE1 | LINE2 | BOTH
  mic_input: LINE1        # LINE1 | LINE2 | DIFFERENCE
  mic_gain: "6"
  led_inverted: "true"
```

## Technik

| Teil | Anschluss |
|---|---|
| ES8388 (I²C) | SDA GPIO33, SCL GPIO32 |
| I²S | MCLK GPIO0, BCLK GPIO27, LRCK GPIO25, DOUT GPIO26, DIN GPIO35 |
| Verstärker (NS4150) | GPIO21 |
| Tasten | KEY1 GPIO36, KEY3 GPIO19, KEY4 GPIO23, KEY5 GPIO18, KEY6 GPIO5 |
| LED D4 | GPIO22 |

Mikrofon und Lautsprecher teilen sich einen I²S-Bus (der Codec macht beides);
beide laufen deshalb mit 16 kHz. Musik wird darauf umgerechnet – für Sprache
ideal, für Musik ausreichend.

- [`yapaia-satellite.yaml`](yapaia-satellite.yaml) – das Paket mit der ganzen
  Gerätelogik
- [`yapaia-satellite.beispiel.yaml`](yapaia-satellite.beispiel.yaml) – Vorlage
  für die eigene Gerätedatei
- `ci/test.yaml` – die CI baut damit bei jeder Änderung die Firmware
