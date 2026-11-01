# GPS vom eigenen Endgerät (Telefon, iPad, Android-Autoradio)

Telefon, iPad und Android-Autoradio haben alle einen GPS-Sensor, und Yapaia
wird ohnehin im Browser bedient. Diese Seite erklärt, wie die Position dieser
Geräte in die Navigation kommt und warum der naheliegende Weg oft nicht
funktioniert.

Es gibt **zwei Wege**: den Browser-Standort und die Home-Assistant-Companion-App.
Welche Quelle Yapaia benutzt, steht unter **⚙ → 🩺 Installation prüfen**. Die
Einrichtung aller Quellen ist im [User Manual](manual.md#where-your-position-comes-from)
(englisch) und in [`yapaia_go/DOCS.md`](../yapaia_go/DOCS.md) beschrieben.

---

## 1 Browser-Standort

Yapaia liest die Position über die Standortfreigabe des Browsers
(`navigator.geolocation`, hohe Genauigkeit) und schickt jeden Fix an den Core.

- Die Quellen haben diese Rangfolge: USB-/Netzwerk-GPS (`gpsd`) vor dem
  GPS-Empfänger eines Teltonika-Routers (`rut50`) vor dem Browser vor der
  Companion App vor dem Simulator. Ist kein GPS-Empfänger angeschlossen,
  **gewinnt der Browser automatisch**; du musst nichts umstellen.
- Die Add-on-Option `gps_source` (`usb`, `network`, `rut50`, `companion_app`,
  `none`) schaltet nur die jeweilige Quelle ein. Browser-Positionen werden bei
  **jedem** Wert angenommen.
- Im Einrichtungsassistenten (Schritt „GPS") steht „Browser-Standort" zur
  Auswahl.

### Voraussetzung: sicherer Kontext (HTTPS)

Der Browser gibt den Standort nur in einem **sicheren Kontext** frei. Das ist
eine Regel des Browsers; weder Yapaia noch das Add-on können sie umgehen. Bei
einem Aufruf über einfaches HTTP (z. B. `http://homeassistant.local:8123/…`)
erscheint der Hinweis „Standortzugriff nicht verfügbar (unsicherer Kontext)",
auf iPad-Safari, Telefon und Autoradio gleichermaßen.

Häufige Irrtümer:

- **„Ingress ist doch HTTPS."** Nein. Ingress übernimmt das Protokoll von Home
  Assistant. Wer HA über `http://…:8123` erreicht, bekommt auch Yapaia über
  HTTP.
- **„`.local` ist doch lokal, also sicher."** Nein. Die Ausnahme gilt nur für
  `localhost`, `127.0.0.0/8` und `::1`, nicht für einen mDNS-Namen oder eine
  LAN-IP.
- **„Dann eben ein zweiter Port."** Ändert nichts; entscheidend ist das
  Protokoll.

### Was hilft

| Weg | Aufwand | Offline-tauglich | Bewertung |
|---|---|---|---|
| **Companion App** (siehe Abschnitt 2) | App installieren | ja | Braucht kein HTTPS; empfohlen, wenn das Telefon liefern soll. |
| **USB-GPS am Mini-PC** (`gps_source: usb`) | Hardware | ja | Umgeht die Frage vollständig und ist am genauesten. |
| **Eigenes Zertifikat für einen echten Namen** (z. B. Let's Encrypt per DNS-01, `ha.meinedomain.de` → LAN-IP) | einmalig mittel, per HA-Add-on machbar | ja; Internet nur zur Verlängerung alle 90 Tage | Keine Zertifikatswarnung, funktioniert auf allen Geräten gleich, auch im Autoradio-Browser. |
| **Selbstsigniertes Zertifikat** | gering | ja | Funktioniert nach einmaliger Bestätigung je Gerät; manche Autoradio-Browser lassen das nicht zu. Rückfallebene. |
| **Nabu Casa Cloud** (`https://….ui.nabu.casa`) | Abo, keine Einrichtung | nein, braucht Internet | Zum Ausprobieren gut, zum Fahren ungeeignet. |

Für ein eigenes Zertifikat ergänzt du in der `configuration.yaml` von Home
Assistant `http: ssl_certificate` und `ssl_key` (mit dem Add-on „File editor"
ohne SSH möglich).

---

## 2 Home-Assistant-Companion-App

Auf Telefon, iPad und Android-Autoradio läuft (oder kann laufen) die
**Home Assistant Companion App**. Sie meldet die Position als
`device_tracker.<gerät>` an Home Assistant, auch im Hintergrund und bei
gesperrtem Bildschirm; Yapaia liest diese Entität.

| | Browser | Companion App |
|---|---|---|
| HTTPS nötig | **ja** | nein |
| Bildschirm aus / Tab im Hintergrund | Safari friert den Tab ein, Chrome-Android drosselt ihn; Positionen bleiben aus | läuft weiter |
| Genauigkeit | hoch, solange der Tab vorn ist | hoch im „High Accuracy Mode", sonst gröber und in Intervallen |
| Latenz | ~1 s | je nach Einstellung Sekunden bis Minuten |
| Einrichtung | keine | App installieren, Ortung erlauben |

Die Companion App ist **träger** als der Browser: Für eine Abbiegeanweisung in
200 m ist ein Intervall von 30 s zu lang. Sie ist deshalb eine zusätzliche
Quelle unterhalb des Browsers, kein Ersatz.

**Einrichten:**

1. In der Add-on-Konfiguration `gps_source: companion_app` setzen.
2. In Yapaia **⚙ → 🩺 Installation prüfen** öffnen und unter „Gerät der
   Companion App" dein Telefon wählen. Das gilt sofort, ohne Neustart. Gibt es
   genau einen Kandidaten, wählt Yapaia ihn selbst; bei mehreren fragt es,
   statt zu raten.
3. Optional trägst du die Entität in der Add-on-Option „Gerät der Companion
   App" (`ha_device_tracker`) von Hand ein, z. B. `device_tracker.mein_telefon`.

---

## 3 Mehrere Geräte gleichzeitig

Senden zwei Geräte dauerhaft eine Browser-Position, aber an verschiedenen
Orten (z. B. Telefon zu Hause, Tablet im Wohnmobil), springt die Position
hin und her. Die Plausibilitätsprüfung (ab dem vierten abgelehnten Sprung in
Folge wird die neue Position übernommen, z. B. nach einer Fähre) fängt das
nicht ab. Öffne Yapaia deshalb zur Navigation nur auf dem Gerät, das im
Fahrzeug liegt.

---

## 4 Bildschirm wach halten

Yapaia hält den Bildschirm an, solange die App zu sehen ist. Auf Geräten ohne
Wake-Lock-Schnittstelle (HTTP-Aufruf, iPad) geschieht das über ein winziges,
stummes Video; die Musikwiedergabe wird dadurch nicht unterbrochen. Ein in den
Hintergrund gewechselter Tab bleibt trotzdem eingefroren: Die Positionsquelle
Browser setzt dann aus (siehe Abschnitt 2).
