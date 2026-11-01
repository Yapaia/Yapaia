# Kiosk-Betrieb

Yapaia Go läuft im Wohnmobil typischerweise als **Vollbild-Kiosk** auf einem
Mini-PC (N100-Klasse): keine Adressleiste, kein versehentliches Wegnavigieren —
der Bildschirm zeigt ausschließlich die App, startet automatisch nach dem Boot
und erholt sich selbstständig von einem Absturz. Dieses Dokument ist die
Betriebsanleitung dafür.

## 1. Voraussetzung: der Core läuft und liefert die App aus

Der Kiosk-Browser öffnet eine normale HTTP(S)-Adresse des Core — bei der
Compose-Installation standardmäßig `http://localhost:8080/`. Der Core liefert
die App selbst aus; ein separater Webserver ist nicht nötig.

> **Als Home-Assistant-Add-on** veröffentlicht Yapaia Go keinen eigenen Port
> (nur Ingress). Der Kiosk-Browser öffnet dann Home Assistant selbst
> (`http(s)://<ha>:8123/`) und dort Yapaia Go in der Seitenleiste; die
> Anmeldung übernimmt die Home-Assistant-Sitzung. Die Adressen
> `http://localhost:8080/` unten gelten für die Compose-Installation.

## 2. Browserwahl und Vollbild-Flags

### Option A: Chromium/Chrome direkt (`--kiosk`)

```sh
chromium \
  --kiosk \
  --app=http://localhost:8080/ \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --disable-features=TranslateUI
```

- `--kiosk`: Vollbild ohne Fenster-Rahmen; lässt sich nicht versehentlich
  schließen — gewollt für ein fest verbautes Touch-Display ohne Tastatur.
- `--app=<url>`: keine Adressleiste, kein Tab-Streifen, selbst wenn `--kiosk`
  ausfällt.
- `--noerrdialogs`, `--disable-infobars`, `--disable-session-crashed-bubble`:
  unterdrücken die Chromium-Meldungen („Chrome wurde nicht richtig beendet —
  Wiederherstellen?") nach einem Absturz. Sie würden sonst vor dem
  App-eigenen Dialog „Navigation fortsetzen?" (Abschnitt 4) erscheinen.
- Die App fordert im Web-App-Manifest `display: fullscreen` an — das greift,
  wenn du sie wie in Abschnitt 6 **installierst**, statt `--kiosk` zu nutzen.

### Option B: Fully Kiosk Browser (Android-Tablets)

Für ein Android-Tablet als Zweitbildschirm oder Fahrerdisplay ist
[Fully Kiosk Browser](https://www.fully-kiosk.com/) eine verbreitete Wahl:

1. **Start-URL:** `http://<core-host>:8080/`.
2. **Web Content Settings → Load in Overview Mode:** aus (die App bringt ihr
   eigenes Layout mit).
3. **Kiosk-Modus:** „Enable Kiosk Mode", „Auto-launch on Boot" (Abschnitt 3)
   und „Screen Always On" einschalten.
4. **Motion/Screensaver:** deaktivieren — der Bildschirm darf während der Fahrt
   nie schlafen gehen.
5. **Watchdog → „Restart App if Not Responding":** aktivieren — das ist das
   Gegenstück zum `Restart=always` des systemd-Dienstes unten.

## 3. Autostart nach dem Boot

### systemd (Linux-Mini-PC, empfohlen für Option A)

`/etc/systemd/system/yapaia-kiosk.service`:

```ini
[Unit]
Description=Yapaia Go Kiosk
After=graphical.target network-online.target yapaia-core.service
Wants=network-online.target

[Service]
Type=simple
User=kiosk
Environment=DISPLAY=:0
ExecStart=/usr/bin/chromium --kiosk --app=http://localhost:8080/ \
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --disable-pinch --overscroll-history-navigation=0
# Chromium immer neu starten, egal warum es beendet wurde (Absturz, OOM-Kill,
# GPU-Treiber-Hang). Der Navigationszustand liegt im Core und geht dabei nicht
# verloren.
Restart=always
RestartSec=2

[Install]
WantedBy=graphical.target
```

```sh
sudo systemctl enable --now yapaia-kiosk.service
```

`yapaia-core.service` (analog, z. B. `ExecStart=docker compose -f
/opt/yapaia/docker-compose.yml up`) muss **vor** dem Kiosk-Dienst starten
(`After=`), sonst zeigt der erste Start nur einen Verbindungsfehler; das
`Restart=always` fängt das aber ab, sobald der Core hochkommt.

### Fully Kiosk Browser (Android)

Einstellungen → „Other Settings" → „Start on Device Boot" aktivieren. Wenn das
Gerät es anbietet, zusätzlich die Android-Option „Kiosk-Modus/Launcher", damit
Fully als Standard-Launcher fest verankert ist.

## 4. Absturz und Neustart

Der Navigationszustand lebt im Core, nicht im Browser-Tab. Ein abstürzender
oder neu startender Browser (OOM-Kill, GPU-Hang, Stromausfall mit Neustart des
Mini-PCs) verliert dadurch nichts; der Kiosk muss nur dafür sorgen, dass
Browser und Core wieder hochkommen (Abschnitt 3). Den Rest übernimmt die App:

- **Nur der Browser wurde neu gestartet**, der Core lief weiter: Die App zeigt
  „Navigation fortsetzen?". Ein Tipp auf „Fortsetzen" übernimmt die laufende
  Navigation sofort, in der Regel in weniger als 3 Sekunden.
- **Auch der Core wurde neu gestartet** (z. B. Stromausfall): Die Navigation
  startet nicht von allein, aber die zuletzt aktive Route ist gemerkt. Derselbe
  Dialog „Navigation fortsetzen?" berechnet sie auf Wunsch neu.
- **Keine laufende Navigation:** Es erscheint kein Dialog, die App öffnet
  normal.
- Ist der Core kurz nicht erreichbar, blockiert die App nicht, sondern läuft
  ohne Dialog weiter.

Fahrzeugprofile, Favoriten und Einstellungen liegen in der Datenbank des Core
und überstehen jeden Neustart. Ausnahme: Die Anordnung unter „Bildschirm
anpassen" gilt je Gerät und liegt im Browser; sie übersteht einen Neustart,
aber nicht das Löschen der Browserdaten.

Im Kiosk-Betrieb musst du dafür nichts einstellen.

## 5. Offline-Start und Updates (PWA)

- **Offline-Start:** Beim ersten Laden legt die App ihre Oberfläche im Browser
  ab. Startet der Browser später ohne Verbindung zum Core (z. B. kurzer
  WLAN-Aussetzer), erscheint die App-Hülle trotzdem sofort, kein weißer
  Bildschirm.
- **Nie zwischengespeichert:** Kartenkacheln und alle API-Antworten kommen
  immer live vom Core. Gecachte Daten wären nach einem Update oder mitten in
  der Fahrt falsch.
- **Updates:** Neue App-Versionen laden sich im Hintergrund. Der sichtbare
  Neustart (Banner „Update verfügbar." mit „Neu laden") kommt **nie während
  der Fahrt**, sondern erst im Stand. Ein Neustart des Kiosk-Prozesses ist
  dafür nicht nötig.
- **Persistenter Speicher:** Die App bittet den Browser bei jedem Start,
  ihre Daten nicht bei Speicherknappheit zu löschen. Maßgeblich bleibt
  trotzdem die Datenbank im Core.

## 6. Als App installieren (optional, statt `--kiosk`)

Chromium und Fully können die PWA regulär „installieren" (Vollbild ohne
Browser-Oberfläche, Symbol im Launcher):

1. `http://localhost:8080/` in Chromium öffnen.
2. Adressleisten-Symbol „Installieren" bzw. Menü → „App installieren"
   wählen.
3. Die installierte App startet im Vollbildmodus. Der Autostart (Abschnitt 3)
   zeigt dann auf die installierte App statt auf `chromium --kiosk --app=...`.

Hinweis: Installieren funktioniert nur über HTTPS oder `localhost`.
