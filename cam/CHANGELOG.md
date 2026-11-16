# Changelog – Yapaia Cam

## 0.3.1

- Videowandler wie die Hersteller-App ansprechen: Vorschau 720×600 plus
  ein ungenutzter JPEG-Strom in voller Größe (sonst zwei gedrehte Hälften).
- Extra `spiegeln` (true/false) kippt das Bild senkrecht; wird gemerkt.

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
