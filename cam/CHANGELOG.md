# Changelog – Yapaia (App fürs Autoradio, früher „Yapaia Cam“)

## 0.7.4

- **Assist lauter:** Die Antwort läuft jetzt über den Musik-Kanal (gleicher
  Lautstärkeregler wie DAB) und wird digital verstärkt (`antwort_laut`,
  Standard 2,5). Ab dem Weckwort wird DAB/Musik leiser gedreht, bis die
  Antwort fertig ist (`ducken=1`) – hilft auch der Spracherkennung.

## 0.7.3

- **Assist-Antwort ganz:** Das Ende der Antwort wurde abgeschnitten, weil die
  Wiedergabe beim letzten Datenpaket schon freigegeben wurde. Jetzt wartet
  sie, bis alles abgespielt ist (plus 300 ms Stille).

## 0.7.2

- **DAB-Steuerung:** Die App verbindet sich mit dem Mediendienst von
  DABdream (wie Android Auto) und liest Sender, Titel und Senderliste.
  `/dab/befehl?aktion=play|pause|weiter|zurueck|starten`,
  `/dab/sender?name=…`, Status unter `dab`. In HA wird daraus der
  Mediaplayer „Radio DAB“.

## 0.7.1

- **Assist hört dich ganz:** Das hintere Mikro schneidet über die normale
  Aufnahmeart alles Leise auf exakt Null ab (in Ruhe 98 %), Sätze kamen
  zerhackt bei Whisper an („Wischberg.“). Der Satellit nimmt jetzt über die
  Aufnahmeart „Camcorder“ auf – gleiches Mikro, ohne dieses Tor. Einstellbar
  mit `quelle=` (camcorder, mic, erkennung, unprocessed, gespraech).
  Android-Rauschfilter standardmäßig aus.

## 0.7.0

- **Sprachsatellit für Home Assistant (Wyoming, Port 10700):** HA verbindet
  sich über die Integration „Wyoming Protocol“ (Zeroconf `_wyoming._tcp` oder
  Host/Port von Hand). Das Radio streamt das hintere Mikro (16 kHz mono,
  digitale Verstärkung, Rauschfilter von Android) und lässt HA ab dem
  Weckwort arbeiten (openWakeWord in HA). Erkanntes Weckwort: kurzer Ton;
  die Antwort kommt über die Radio-Lautsprecher.
  `/assist/einstellen?an=&mikro=&verstaerkung=&rauschfilter=`, Status unter `assist`.
  Die Mikro-Dauermessung pausiert, solange der Satellit streamt.

## 0.6.4

- **Stereo-Test beider Mikros:** `/mikro/stereo?s=5[&maske=frontback|stereo][&quelle=…]`
  nimmt zwei Kanäle gleichzeitig auf und meldet Pegel je Kanal, Korrelation
  und Pegel der Differenz; die Aufnahme liegt unter `/mikro/stereo.wav`.
  Während der Aufnahme pausiert die Dauermessung.

## 0.6.3

- **Frontkamera:** Eingang 1 öffnet jetzt standardmäßig mit Format 3; dort
  hängt die Frontkamera. Die Rückkameras an Eingang 2 und 3 bleiben bei 4.

## 0.6.2

- **Videoformat je Eingang:** `/kamera/format?eingang=1..4&wert=N` stellt
  `config_single` für einen Eingang ein (Standard 4, ohne `wert` zurück).
  Grund: Die Hersteller-App F-Cam öffnet die Frontkamera mit Eingang 2 und
  Format 3. Der Status zeigt das Format je Eingang.

## 0.6.1

- **Rohwerte:** `/sensoren/roh` – alle lesbaren Dateien unter `/sys/class/wits/`
  (misc, mcu, swc, tkey, version) und alle wits-/CAN-Eigenschaften (ohne
  Geräte-IDs), dazu ein Änderungsprotokoll (letzte 40 Änderungen; in
  `/status` die letzten 15). `/sensoren/vergessen` leert es.
- Stumm im eigenen Player (Android-Stummschaltung wirkt am Radio nicht),
  `/anzeige/dunkel|hell`, `mhl_camera_config_single` wird vor jedem Öffnen
  auf 4 gesetzt, minSdk 28.

## 0.6.0

- **Live-Eingang wählbar:** `/kamera/live?eingang=1–4` (0 = automatisch) hält
  den Wandler fest auf einem Eingang; `/kamera/live.mjpg` folgt der Auswahl.
  `/status` → `kamera.live`, `kamera.aktiver_eingang`.
- **Sensoren** (`/status` → `sensoren`): Zündung, Rückwärtsgang, Handbremse,
  Licht, Blinker (Sysfs, 1 s), Bordspannung, Quelle, Vordergrund-App,
  Audiofokus, CAN (Tür, Radar, Lenkwinkel), Lautstärke, Helligkeit, GPS, WLAN,
  Temperaturen, Lüfter. Zündung/Rückwärtsgang sofort per Webhook
  `yapaia_radio_zustand` an HA (plus Lebenszeichen jede Minute).
- **Mikrofone** (`/mikro/…`): beide eingebauten Mikros wählbar, Pegel
  (dBFS) auf Abruf oder laufend, Probeaufnahme `aufnahme.wav` (16 kHz mono).
- **Player:** eigener DLNA-Renderer (`/dlna/geraet.xml`, SSDP) für HA
  `dlna_dmr`; spielt HTTP-Streams/URLs, Lautstärke, Stumm, Pause, Stopp.
  Direkt: `/player/spielen?url=…`.
- **Tasten:** Bedienungshilfe „Yapaia-Tasten“ meldet jeden Druck (Code,
  Name, kurz/lang, Quelle) per Webhook `yapaia_radio_taste`; Lernmodus,
  Tasten benennen, optional abfangen (`/tasten/…`).
- **Lautstärke anheben** (`/audio/…`): Loudness, App-Anhebung
  (LoudnessEnhancer, auch global), MCU `audio_vol`/`audio_output_gain` in
  begrenzten Schritten, „Werkswerte“. `audio_ch_gain` nur lesbar.
- Webserver versteht POST/SOAP (Kopfzeilen, Körper); HA-Adresse
  `/einstellen?ha=http://…:8123`.

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
