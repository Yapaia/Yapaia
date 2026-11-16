# Changelog – Yapaia Cam

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
