# Yapaia Vision

Bringt analoge Kameras – Rückfahrkamera, Türkamera, Kamera im Heck – über
einen USB-Video-Grabber als Kameras in Home Assistant.

## Einrichten

1. Grabber einstecken (unter Proxmox: das USB-Gerät an die HA-VM durchreichen).
2. Add-on starten. Im Protokoll steht, welcher Grabber gefunden wurde und
   welcher Kanal auf welchen Eingang geht.
3. Home Assistant meldet **„Yapaia Vision gefunden“** – hinzufügen. Beim
   ersten Mal installiert das Add-on die Yapaia-Integration; dann einmal
   Home Assistant neu starten.

Ohne Grabber: **Testbild** einschalten. Jeder Kanal zeigt dann seinen Namen
und die Uhrzeit – so lässt sich alles bis zum Dashboard prüfen.

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
