# Drittlizenzen

Yapaia selbst steht unter der **GNU General Public License 3.0 oder später**
(`GPL-3.0-or-later`, siehe [`LICENSE`](LICENSE)). Es nutzt Bausteine und Daten
anderer, die unter eigenen Lizenzen stehen. Diese Datei nennt sie – und wo der
Quelltext zu finden ist, wo eine Lizenz das verlangt.

## Ausnahme: Add-on-SDK und Beispiel-Add-ons (Apache-2.0)

Diese Teile stehen **nicht** unter der GPL, sondern unter der freizügigen
**Apache License 2.0** (jeweils eigene `LICENSE`-Datei):

- `go/packages/addon-sdk` – das SDK, das in jedes Add-on für Yapaia Go
  eingebaut wird,
- `go/addons-examples/poi-campsites` und `go/addons-examples/track-recorder` –
  die Beispiel-Add-ons zum Abschauen.

Grund: Wer ein Add-on schreibt, baut das SDK mit ein. Stünde es unter der GPL,
müsste jedes Add-on ebenfalls GPL sein. So entscheidet jeder Add-on-Autor
selbst über die Lizenz seines Add-ons – auch geschlossen oder kostenpflichtig.
Yapaia Go selbst (Navigation, Karte, Routing) bleibt GPL-3.0-or-later. Das SDK
übernimmt aus dem GPL-Teil nur Typbeschreibungen der Schnittstelle, keinen
ausführbaren Code.

## Kartendaten

| Daten | Lizenz | Pflicht |
|---|---|---|
| OpenStreetMap | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | Namensnennung „© OpenStreetMap contributors“ – steht in jeder Karte. Aus OSM abgeleitete Datenbanken (Kacheln, Routing-Graph, Suchindex), die weitergegeben werden, bleiben unter der ODbL. |

## Yapaia Go

Alle Abhängigkeiten, die mit Go ausgeliefert werden, stehen unter freizügigen
Lizenzen (MIT, ISC, BSD, Apache-2.0); die vollständige, maschinell erzeugte
Liste steht in [`go/docs/licenses.md`](go/docs/licenses.md). Dazu kommen die
Dienste im Add-on-Image:

| Baustein | Lizenz |
|---|---|
| Valhalla (Routing) | MIT |
| Photon (Adresssuche, optional) | Apache-2.0 |
| Planetiler (Kartenbau) | Apache-2.0 |
| MapLibre GL JS (Kartenanzeige) | BSD-3-Clause |

## Yapaia Beat

| Baustein | Lizenz | Quelltext |
|---|---|---|
| welle.io / welle-cli (DAB+) | GPL-2.0 | [github.com/AlbrechtL/welle.io](https://github.com/AlbrechtL/welle.io); die Version und die Änderungen von Yapaia stehen in [`beat/yapaia_beat/Dockerfile`](beat/yapaia_beat/Dockerfile) |
| redsea (RDS) | MIT | [github.com/windytan/redsea](https://github.com/windytan/redsea) |

## Yapaia Vision

| Baustein | Lizenz | Quelltext |
|---|---|---|
| easycap-somagic-linux | GPL-2.0 | [github.com/pimartos/easycap-somagic-linux](https://github.com/pimartos/easycap-somagic-linux), Fassung in [`vision/yapaia_vision/Dockerfile`](vision/yapaia_vision/Dockerfile) |
| FFmpeg (Debian-Paket) | GPL-2.0+ / LGPL-2.1+ | über die Debian-Quellpakete |

Die Firmware des EasyCAP-Grabbers ist **nicht** Teil von Yapaia. Sie wird auf
dem Gerät des Nutzers aus dem Treiber des Herstellers gelesen und nie
weitergegeben.

## Geräte (ESPHome)

Die YAML-Dateien unter `devices/` und `satellite/` gehören zu Yapaia
(GPL-3.0-or-later). Die Firmware, die ESPHome daraus baut, enthält ESPHome
selbst (GPL-3.0 / MIT) und wird von jedem Nutzer selbst erzeugt.

## Home Assistant

Die Integration unter `integration/` läuft in Home Assistant (Apache-2.0) und
nutzt nur dessen öffentliche Schnittstellen.
