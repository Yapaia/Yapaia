# Changelog – Yapaia (App fürs Autoradio, früher „Yapaia Cam“)

## 0.5.0

- App heißt jetzt **Yapaia** (Paket `de.yapaia.cam` bleibt, Updates klappen).
- **Hintergrunddienst** (Vordergrunddienst, startet beim Booten und nach
  Updates) mit HTTP-Server auf Port 8080:
  `/kamera/<1–4>.mjpg` (MJPEG), `/kamera/<1–4>.jpg` (Einzelbild),
  `/status` (JSON, je Modul ein Abschnitt), `/kamera/roh.jpg`,
  `/kamera/einstellen?…`, `/kamera/suchen`.
- Bilder über SurfaceTexture + OpenGL (der HAL lehnt YUV-Leser ab bzw.
  stürzt ab), Halbbild ausgeschnitten, gedreht, gespiegelt, 720×480, bis 15 fps.
- Der Wandler zeigt nur einen Eingang: der zuletzt geöffnete Strom gewinnt,
  bei gleichzeitigen Strömen Eingang 3 (Vorrang); die anderen bekommen ihr
  letztes Bild abgedunkelt mit Hinweis. Signalsuche über alle Eingänge alle
  10 min, wenn niemand zusieht.
- Hat eine andere App die Kamera (Hersteller-Ansicht, Rückwärtsgang), wartet
  der Dienst, bis sie frei ist; die Vorschau-Activity pausiert ihn.
- Struktur für weitere Funktionen: `Modul` (Status-Abschnitt + Pfade),
  `YapaiaDienst`, `WebServer`, `KameraModul`, `GlLeser`.

## 0.4.0

- **Rückfahrkamera läuft** (Eonon UX6K Pro Max / Witstek W19): Kamera 1,
  Eingang 3. Wie die Hersteller-App: Vorschau 720×600 plus ungenutzter
  JPEG-Strom; der Puffer enthält zwei Halbbilder, gezeigt wird eines – um 90°
  gedreht, senkrecht gespiegelt, auf die ganze Fläche.
- Darstellung per Extras änderbar und gemerkt: `voll`, `haelfte`, `drehung`,
  `spiegeln`, `spiegelnx`.

## 0.3.0

- Rückfahrkamera: Bei Eonon/Witstek ist Kamera 1 ein Videowandler (TP9951)
  mit vier Eingängen, umgeschaltet über
  `/sys/kernel/mhl_camera_config/mhl_camera_input`. Neuer Knopf „Eingang“,
  Start mit Kamera 1 / Eingang 3 (Rückfahrkamera), Extra `eingang` (0–3).
- Gefunden per ADB: Eingang 2 = vorne, Eingang 3 = hinten, 1 und 4 leer.

## 0.2.1

- Knopf „Senden“ (Entwicklung): schickt Paketliste, Systemeigenschaften,
  Videogeräte und die APKs der Kamera-Apps an den Mini-PC (Port 8765), um
  herauszufinden, wie F-Cam die Cinch-Kamera einschaltet.

## 0.2.0

- Knopf „Update“: holt die neue Version direkt aus Home Assistant
  (`/local/yapaia-cam.json` + `.apk`); langes Drücken ändert die Adresse.
- Probiert auch Kamera-IDs 0–9, die nicht in der Kameraliste stehen.
- Info zeigt die App-Version und die Kameras der alten Kamera-Schnittstelle.

## 0.1.1

- Startet mit 720×480 (bzw. 720×576/640×480) statt der größten gemeldeten
  Größe – die öffnet das Radio nicht (Fehler DEVICE).
- Neuer Knopf „Suchlauf“: probiert alle Auflösungen durch (je 3 s), bis ein
  Bild kommt.
- Fehlermeldung nennt die Auflösung.

## 0.1.0

- Erste Fassung: zeigt die Kameras des Autoradios (Camera2) im Vollbild.
- Leiste mit „Kamera“, „Auflösung“, „Info“; Status mit fps und Hinweis, ob
  gar keine Bilder kommen oder das Bild schwarz ist.
- Info listet alle Kameras mit Richtung, Hardware-Stufe, Vorschaugrößen und Formaten.
- Wahl von Kamera und Auflösung wird gemerkt; Start mit Extra `kamera` möglich.
- Texte auf Deutsch und Englisch (folgt der Android-Sprache).
