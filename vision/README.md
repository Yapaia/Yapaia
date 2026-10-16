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

Bei den meisten 4-Kanal-Sticks läuft unter Linux nur ein Eingang zur selben
Zeit. Vision schaltet dann um (siehe `DOCS.md`).
