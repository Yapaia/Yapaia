# Yapaia Cam

Android-App fürs Autoradio: zeigt die dort angeschlossenen Kameras (Front per
USB-UVC, Rückfahrkamera per Cinch) direkt über Camera2 – ohne Browser und
ohne https-Umweg.

## Stufe 1 (jetzt): Anzeige und Diagnose

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
3. Auf dem Radio im Dashboard **Rangieren** auf „Yapaia Cam installieren“
   tippen (lädt `/local/yapaia-cam.apk`), beim ersten Mal „Unbekannte Apps
   installieren“ erlauben, installieren, Kamera-Berechtigung erlauben.

Updates: `versionCode`/`versionName` in `app/build.gradle.kts` hochzählen,
CHANGELOG ergänzen, Schritt 1–3 wiederholen. Der Schlüssel muss derselbe
bleiben, sonst lehnt Android das Update ab.
