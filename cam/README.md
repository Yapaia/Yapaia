# Yapaia (App fürs Autoradio)

Android-App fürs Autoradio (Paket `de.yapaia.cam`, früher „Yapaia Cam“).
Ein Hintergrunddienst stellt die Kameras des Radios Home Assistant als
MJPEG-Streams bereit; die Vorschau-Activity zeigt sie direkt am Radio.

## Dienst (ab 0.5.0)

Vordergrunddienst `YapaiaDienst`, startet beim Booten (`BOOT_COMPLETED`), nach
Updates und beim Öffnen der App. HTTP auf Port **8080**:

| Pfad | Inhalt |
|---|---|
| `/status` | JSON: `app`, `version`, `adressen`, `module` und je Modul ein Abschnitt (`kamera`: aktiver Eingang, fps, belegt, je Eingang Signal/Helligkeit/Streuung) |
| `/kamera/<1–4>.mjpg` | MJPEG-Strom des Eingangs |
| `/kamera/<1–4>.jpg` | Einzelbild |
| `/kamera/roh.jpg` | nächstes Bild unverändert (720×600, beide Halbbilder) |
| `/kamera/einstellen?…` | Darstellung: `haelfte` (0–4), `drehung`, `spiegelnx`, `spiegelny`, `breite`, `hoehe`, `qualitaet`, `rand=l,o,r,u`, `vorrang=3,2`, `standard` |
| `/kamera/suchen` | Signalsuche anstoßen |

**Ein Eingang zur Zeit:** Der TP9951 hat einen Decoder mit vier umschaltbaren
Eingängen; umschalten geht nur bei geschlossener Kamera (sonst Fehler
DEVICE, ~1 s). Regeln: Der zuletzt geöffnete Strom bekommt den Wandler; kommen
mehrere Ströme innerhalb von 4 s (Dashboard mit zwei Kameras), gewinnt der
Eingang aus `vorrang` (Standard 3 = Rückfahrkamera). Andere Ströme bekommen
ihr letztes Bild abgedunkelt mit Hinweis („Standbild“). Einzelbilder anderer
Eingänge kommen bis 30 s aus dem Zwischenspeicher, sonst wird umgeschaltet.
Nach 20 s ohne Anfrage schließt der Dienst die Kamera; nach 60 s Ruhe prüft
er alle 10 min jeden Eingang kurz (Signal = Bilder kommen und Streuung der
Helligkeit ≥ 6).

**Andere Apps:** Die Hersteller-Kameraansicht (`com.wits.misc`, auch beim
Rückwärtsgang) hat dieselbe Priorität wie der Dienst – wer zuletzt öffnet,
gewinnt. Der Dienst öffnet deshalb nie, solange die Kamera woanders offen
ist, und wartet nach einer Verdrängung, bis sie frei wird. Die
Vorschau-Activity pausiert den Dienst.

**Bild:** Der HAL liefert nur die Kombination Vorschau (720×600, PRIVATE) +
JPEG 1920×4344 (nie abgeholt); YUV-Leser lehnt er ab oder der Kamera-Provider
stürzt ab. Der Dienst liest die Vorschau deshalb über eine SurfaceTexture mit
OpenGL ES aus (`GlLeser`). Danach stand einmal `mhl_camera_config_single` auf
7 statt 4 (Bild kaputt, auch in der Hersteller-App) – mit `echo 4 >` behoben.

**Neue Funktionen** (Sensoren, Audio …) kommen als eigene Klasse, die `Modul`
umsetzt, in `YapaiaDienst.module` – sie bekommt einen Abschnitt in `/status`
und die Pfade `/<name>/…`.

Home Assistant: MJPEG-Integration je Eingang (siehe
`dashboards/rangieren/README.md`).

## Vorschau-Activity: Anzeige und Diagnose

- **Kamera** – nächste Kamera, **Auflösung** – nächste Vorschaugröße,
  **Info** – alles, was Android über die Kameras meldet.
- Status oben: fps, „keine Bilder“ (Kamera liefert nichts) oder „Bild ist
  schwarz“ (Bilder kommen, sind aber dunkel – z. B. falsche Größe/Norm).
- Tippen aufs Bild blendet die Leiste aus. Kamera und Auflösung werden gemerkt.
- Start mit bestimmter Kamera: Intent-Extra `kamera` = Kamera-ID.
- **Update** holt die neue Version aus Home Assistant (`/local/yapaia-cam.json`
  und `.apk`); langes Drücken ändert die Adresse (Standard `http://192.168.8.235/local/`).

Texte auf Deutsch und Englisch nach der Android-Sprache (`res/values*`).
Design-Schemata kommen, sobald die App mit Home Assistant spricht (Stufe 2:
Stream an go2rtc/Vision).

## Eonon UX6K Pro Max (Witstek W19)

- Kamera 0 nicht öffnen – sie bringt den Kameradienst zum Absturz.
- Kamera 1 ist ein Videowandler TP9951 mit vier Eingängen, gewählt über
  `/sys/kernel/mhl_camera_config/mhl_camera_input` (0–3). Im Wohnmobil:
  **Eingang 2 = vorne, Eingang 3 = Rückfahrkamera**, 1 und 4 leer.
- Der Bildpuffer enthält zwei Halbbilder übereinander, Android dreht um 270°.
  Die App zeigt deshalb nur eine Hälfte, um 90° gedreht und gespiegelt
  (Standard, sobald die Eingangsdatei existiert).
- Start aus HA o. Ä.: Activity `de.yapaia.cam/.MainActivity`, Extras
  `kamera` (ID), `eingang` (0–3).
- Diagnose: Knopf „Senden“ schickt Pakete, getprop und Videogeräte an einen
  Empfänger auf Port 8765. Per ADB (Entwickleroptionen, Code 861626) ist die
  Shell des Radios root.

## Bauen und Installieren

1. CI baut die APK unsigniert (`.github/workflows/cam.yml`, Artefakt
   `yapaia-cam-unsigniert`).
2. Auf dem Mini-PC: `cam/signieren.sh [Run-ID]` – signiert mit dem Schlüssel
   unter `/data/claude/yapaia-cam/` und legt die APK nach
   `/homeassistant/www/yapaia-cam.apk`.
3. Auf dem Radio im Dashboard **Rangieren** auf „Yapaia-App installieren“
   tippen (lädt `/local/yapaia-cam.apk`), beim ersten Mal „Unbekannte Apps
   installieren“ erlauben, installieren, Kamera-Berechtigung erlauben.

Updates: `versionCode`/`versionName` in `app/build.gradle.kts` hochzählen,
CHANGELOG ergänzen, Schritt 1–3 wiederholen. Der Schlüssel muss derselbe
bleiben, sonst lehnt Android das Update ab.
