# Yapaia Vision

Analoge Kameras über einen USB-Video-Grabber als Kameras in Home Assistant –
Teil von [Yapaia](../README.md).

- `yapaia_vision/` – das Add-on (Python, ffmpeg, v4l2)
- `tests/` – `pytest -q tests` (ohne Hardware und ohne ffmpeg; den echten
  ffmpeg-Lauf mit Testbild prüft der Image-Bau in `.github/workflows/vision.yml`)

## Grabber

Unterstützt ist, was der Kernel von Home Assistant OS als Video-Gerät
(`/dev/videoN`) bereitstellt – dort sind die Treiber `usbtv`, `stk1160`,
`em28xx`, `cx231xx` und `uvcvideo` enthalten. Welcher Chip in einem
4-Kanal-Stick steckt, verrät erst `lsusb`; das Add-on schreibt Treiber,
Gerät und Eingänge ins Protokoll und auf seine Seite (*Technik*).

Der **EasyCAP002 „4CH USB DVR“** (Somagic SMI2021CBE, `1c88:0007`) hat
keinen Kernel-Treiber. Vision bringt dafür `somagic-init`/`somagic-capture`
von [easycap-somagic-linux](https://github.com/pimartos/easycap-somagic-linux)
(GPL) mit (`yapaia/somagic.py`); die Firmware stellt der Nutzer aus dem
Windows-Treiber bereit (siehe `DOCS.md`).

Bei den meisten 4-Kanal-Sticks läuft unter Linux nur ein Eingang zur selben
Zeit. Vision schaltet dann um (siehe `DOCS.md`).
