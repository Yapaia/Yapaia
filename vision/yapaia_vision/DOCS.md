# Yapaia Vision

Bringt analoge Kameras – Rückfahrkamera, Türkamera, Kamera im Heck – über
einen USB-Video-Grabber als Kameras in Home Assistant.

## Einrichten

1. Add-on-Repository hinzufügen: *Einstellungen → Add-ons → Add-on-Store → ⋮ →
   Repositories* → `https://github.com/Yapaia/yapaia`, dann **Yapaia Vision**
   installieren.
2. Grabber einstecken (unter Proxmox: das USB-Gerät an die HA-VM durchreichen).
3. Add-on starten. Im Protokoll steht, welcher Grabber gefunden wurde und
   welcher Kanal auf welchen Eingang geht.
4. Beim ersten Mal installiert das Add-on die Yapaia-Integration; dann einmal
   Home Assistant neu starten. Danach meldet Home Assistant **„Yapaia Vision
   gefunden“** – hinzufügen.

Ohne Grabber: **Testbild** einschalten. Jeder Kanal zeigt dann seinen Namen
und die Uhrzeit – so lässt sich alles bis zum Dashboard prüfen.

## EasyCAP002 „4CH USB DVR“ (Somagic)

`lsusb` zeigt ihn als `1c88:0007 Somagic … SMI Grabber (no firmware)`. Linux
hat keinen Treiber dafür; Vision spricht ihn selbst an, braucht aber die
**Firmware** aus dem Windows-Treiber:

1. Von der CD zum Stick `SmiUsbGrabber3F.sys` oder `SmiUsbGrabber3E.sys`
   nehmen – oder einfach das ganze `Setup.exe`.
2. Auf der Seite von Yapaia Vision hochladen (erscheint, solange die Firmware
   fehlt) oder nach `/share/yapaia-vision/` legen und Vision neu starten.

Danach meldet sich der Stick als `1c88:003e`/`003f` neu an.

**Proxmox:** Den Stick **nach USB-Anschluss** (*Use USB Port*) an die
Home-Assistant-VM durchreichen, nicht nach Kennung (*Use USB Vendor/Device
ID*): Mit der Firmware ändert sich die Kennung, und die Weiterleitung nach
Kennung verlöre ihn.

Welche Buchse welcher Eingang ist, ist bei diesen Sticks nicht immer
aufgedruckt – im Zweifel am Kanal `eingang` (0–3) ändern.

## Kanäle

Unter **Kanäle** ein Eintrag je Kamera, in der Reihenfolge der Eingänge am
Grabber. Der Name wird der Name der Kamera in Home Assistant; die
Entity-ID bleibt beim Umbenennen gleich (`camera.yapaia_vision_kamera_1` …).

Die Zuordnung zu den Eingängen geschieht von selbst:

- **Ein Grabber mit mehreren Eingängen** (die meisten 4-Kanal-Sticks): Kanal 1
  → Eingang 1 usw. Es läuft immer nur **ein** Kanal live – der gewählte. Die
  anderen zeigen ihr letztes Bild.
- **Ein Gerät je Eingang**: Jeder Kanal läuft für sich, alle gleichzeitig.

Passt das nicht, am Kanal `geraet` (z. B. `/dev/video0`) und `eingang` (ab 0)
eintragen.

## Umschalten

- `select.yapaia_vision_kanal` – z. B. in einer Automation beim Einlegen des
  Rückwärtsgangs auf „Rückfahrkamera“.
- Aktion `yapaia.vision_kanal_waehlen` mit `kanal: Rückfahrkamera`.
- Auf der Seite des Add-ons.
- Wer das Live-Bild eines anderen Kanals öffnet, schaltet um – aber nur, wenn
  dem gewählten gerade niemand zusieht.

## Bild

- **Fernsehnorm:** PAL für Kameras aus Europa. Bei falscher Norm rollt das
  Bild oder bleibt schwarz-weiß.
- **Halbbilder entflechten:** gegen Kammzacken bei Bewegung.
- **Aufnahme immer an:** Das Bild ist sofort da. Sonst startet die Aufnahme,
  sobald jemand zusieht, und läuft den **Nachlauf** lang weiter.

## Entitäten

| Entität | Beschreibung |
|---|---|
| `camera.yapaia_vision_kamera_1`, `_2` … | Je Kanal unter **Kanäle** eine Kamera (Standbild und Live-Bild als MJPEG) |
| `select.yapaia_vision_kanal` | Der Kanal, der gerade live läuft (wenn sich Kanäle einen Grabber teilen) |
| `binary_sensor.yapaia_vision_aufnahme` | Ob gerade aufgenommen wird |
| `sensor.yapaia_vision_geraet` | Der gefundene Grabber (Diagnose) |
| `sensor.yapaia_vision_meldung` | Letzte Meldung des Add-ons, z. B. eine fehlende Firmware (Diagnose) |

## Optionen

| Option | Beschreibung |
|---|---|
| `testbild` | Testbild statt Grabber (siehe oben) |
| `geraet` | `auto` oder ein Gerät wie `/dev/video0` |
| `norm` | `PAL`, `NTSC` oder `SECAM` |
| `aufloesung` | z. B. `720x576` (PAL) oder `720x480` (NTSC) |
| `bilder_pro_sekunde` | 1–30 |
| `qualitaet` | JPEG-Qualität, 2 = beste, 31 = kleinste Datenmenge |
| `entflechten` | Halbbilder entflechten |
| `nachlauf_s` | Nachlauf der Aufnahme in Sekunden |
| `immer_an` | Aufnahme immer an |
| `kanaele` | Ein Eintrag je Kamera: `name`, optional `geraet` und `eingang` |
| `install_integration` | Yapaia-Integration installieren bzw. aktualisieren |
| `log_level` | Protokollstufe: `debug`, `info`, `warning`, `error` |

Der Port `8099` ist optional: Wer ihn freigibt, erreicht die Seite und die
MJPEG-Ströme im lokalen Netz auch ohne Home Assistant.
