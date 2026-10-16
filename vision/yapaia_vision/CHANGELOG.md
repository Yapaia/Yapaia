# Änderungen

## 0.2.1

- **Stick ohne USB-Konfiguration** (gesehen unter Proxmox: „can't set config
  #1, error -32“): Vision setzt sie jetzt selbst per USB-Reset, statt mit
  „Failed to claim device interface“ zu scheitern.
- **Firmware aus `SmiUsbGrabber3C.sys`** (DC60) geht jetzt auch für den
  EasyCAP002: Er meldet sich damit als `1c88:003c`, behält aber seine vier
  Eingänge.

## 0.2.0

**EasyCAP002 „4CH USB DVR“ (Somagic SMI2021CBE).** Für diesen Chip hat Linux
keinen Treiber – Vision bringt jetzt die Programme von easycap-somagic-linux
mit, die den Stick direkt über USB ansprechen. Alle vier Eingänge, einer zur
Zeit (umschalten wie gehabt).

- Der Stick braucht beim Einstecken eine **Firmware** aus seinem
  Windows-Treiber. Die darf Yapaia nicht mitliefern: Auf der Seite von Vision
  die Datei `SmiUsbGrabber3F.sys` bzw. `SmiUsbGrabber3E.sys` von der CD zum
  Stick hochladen (auch `Setup.exe` geht) oder nach `/share/yapaia-vision/`
  legen. Vision merkt sie sich und lädt sie bei jedem Start.
- **Proxmox:** den Stick nach USB-Anschluss durchreichen, nicht nach Kennung –
  mit der Firmware meldet er sich unter neuer Kennung neu an.

## 0.1.0

Erste Fassung.

- Analoge Kameras über einen USB-Video-Grabber (z. B. EasyCAP 4CH USB DVR)
  als Kameras in Home Assistant: `camera.yapaia_vision_kamera_1` …,
  Standbild und Live-Bild.
- Teilen sich die Kanäle einen Grabber, läuft der gewählte live; umschalten
  über `select.yapaia_vision_kanal`, die Aktion `yapaia.vision_kanal_waehlen`
  oder die Seite des Add-ons.
- **Testbild** ohne Hardware: jeder Kanal zeigt seinen Namen und die Uhrzeit.
