# Änderungen

## 0.1.0

Erste Fassung.

- Analoge Kameras über einen USB-Video-Grabber (z. B. EasyCAP 4CH USB DVR)
  als Kameras in Home Assistant: `camera.yapaia_vision_kamera_1` …,
  Standbild und Live-Bild.
- Teilen sich die Kanäle einen Grabber, läuft der gewählte live; umschalten
  über `select.yapaia_vision_kanal`, die Aktion `yapaia.vision_kanal_waehlen`
  oder die Seite des Add-ons.
- **Testbild** ohne Hardware: jeder Kanal zeigt seinen Namen und die Uhrzeit.
