# Dashboard „Rangieren“

Für Parkmanöver: links Rückfahr- und Frontkamera des Autoradios, darunter der Reifendruck;
rechts die Nivellierung (Wohnmobil von der Seite und von hinten, kippt mit der
Neigung), darunter Licht Dinette (OUT2) und Aufbautür.

## Karten

**`custom:yapaia-nivellierung-card`** (`nivellierung-card.js`): Seiten- und
Heckansicht, Libelle und wie viele Millimeter man an welcher Seite anheben
muss. Werte kommen von einem Neigungssensor am ESP „heizung“ (`sensor.heizung_neigung_vorne_hinten`,
`sensor.heizung_neigung_links_rechts`). Im grafischen Editor einstellbar:
Sensoren (Grad, optional mm), Vorzeichen umkehren, Radstand, Spurweite,
Toleranz und wie stark die Grafik die Neigung überhöht.
Positiv heißt „vorne höher“ bzw. „rechts höher“; kippt eine Ansicht verkehrt
herum, im Editor „umkehren“ anhaken.

**`custom:yapaia-reifen-card`** (`reifen-card.js`): Wohnmobil von oben, an
jedem Rad Druck, Temperatur und Spannung der Sensorbatterie (TPMS über den
btcollector, `sensor.btcollector_{fl,fr,rl,rr}_*`) und wie alt der Wert ist.
Farbe nach Abweichung vom Solldruck (grün/gelb/rot), grau ohne Wert. Im Editor:
Sensoren je Rad, Solldruck vorne/hinten, Toleranzen, Batterie-Warnschwelle,
ab wann Werte als alt gelten.

**`custom:yapaia-kamera-card`** (`kamera-card.js`): Livebild einer
`camera.*`-Entität. Ohne Kamera oder ohne Bild steht ein Platzhalter da.
Im Editor: Kamera, Seitenverhältnis, Bild spiegeln, Platzhaltertext.

## Kameras

Die Kameras hängen am Autoradio (Videowandler mit vier Eingängen) und kommen
über die Yapaia-App (`cam/`, Port 8080) als MJPEG nach Home Assistant:

| Entität | Eingang | Adresse |
|---|---|---|
| `camera.radio_ruckfahrkamera` („Radio Rückfahrkamera“) | 3 | `http://192.168.8.194:8080/kamera/3.mjpg` |
| `camera.radio_frontkamera` („Radio Frontkamera“) | 2 | `…/kamera/2.mjpg` |
| `camera.radio_kamera_1` („Radio Kamera 1“) | 1 (frei) | `…/kamera/1.mjpg` |
| `camera.radio_kamera_4` („Radio Kamera 4“) | 4 (frei) | `…/kamera/4.mjpg` |

Angelegt mit der eingebauten **MJPEG-Integration** (Einstellungen → Geräte &
Dienste → Integration hinzufügen → MJPEG): Name, MJPEG-URL `…/<n>.mjpg`,
Standbild-URL `…/<n>.jpg`, ohne Benutzer/Passwort.

Ob an einem Eingang ein Bild ankommt, melden `binary_sensor.radio_kamera_<n>_signal`
(command_line in `configuration.yaml`, liest `/status` alle 30 s):

```yaml
command_line:
  - binary_sensor:
      name: Radio Kamera 1 Signal
      unique_id: yapaia_radio_kamera_1_signal
      command: curl -s -m 4 http://192.168.8.194:8080/status
      value_template: "{{ 'ON' if value_json.kamera.eingaenge[0].signal else 'OFF' }}"
      scan_interval: 30
  # … ebenso 2, 3, 4 (eingaenge[1] … [3])
```

Im Dashboard: Rückfahr- und Frontkamera nebeneinander. Der Wandler zeigt nur
einen Eingang gleichzeitig – die Rückfahrkamera hat Vorrang, die Frontkamera
zeigt dann ihr letztes Bild mit Hinweis. Kamera 1 und 4 erscheinen nur, wenn
ihr Signal-Sensor `on` ist. Die frühere Karte auf `camera.yapaia_vision_kamera_1`
(Yapaia Vision, EasyCAP am Mini-PC) bleibt als Ersatz: Sie erscheint nur,
wenn das Radio keine Rückfahrkamera liefert (Radio aus, kein Signal).
Seitenverhältnis `3:2` (die App liefert 720 × 480).

## Einspielen

```sh
python3 dashboards/deploy.py --dashboard rangieren
```

Legt `/yapaia-rangieren` an (oder überschreibt dessen Konfiguration) und
kopiert die Karten nach `/config/www/yapaia-dashboards/`.

## Yapaia-App installieren

Der Knopf „Yapaia-App installieren“ öffnet `/local/yapaia-cam.html`; die Seite lädt `yapaia-cam.apk?v=<Version>` (siehe
`cam/README.md`) – gedacht fürs Autoradio, damit man die Adresse nicht tippen muss.
Das `?v=` umgeht den Zwischenspeicher. Danach reicht der Knopf „Update“ in der App.
