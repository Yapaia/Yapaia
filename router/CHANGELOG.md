# Änderungen

## 0.4.0

**WLAN suchen und verbinden**, z. B. mit dem WLAN eines Campingplatzes.

- Neue Aktionen **`yapaia.router_wlan_suchen`** (WLANs der Umgebung als Liste,
  je Name ein Eintrag mit dem stärksten Zugangspunkt), **`…_wlan_verbinden`**
  (Name, Passwort, merken; ohne Passwort nimmt der Router ein gespeichertes)
  und **`…_wlan_trennen`**. Gespeicherte Passwörter verlassen die Integration nicht.
- Neuer Sensor **„WLAN-Anmeldung nötig“** (`binary_sensor.yapaia_router_wlan_anmeldung`):
  an, wenn der Router ein **Captive Portal** erkennt, also eine Anmeldung im
  Browser nötig ist. Attribute `wlan_zustand` und `wlan_fehler` (z. B. falsches Passwort).
- Dazu die Karte `custom:yapaia-wlan-card` im Dashboard „Stellplatz“.
- Kommt mit der Integration 0.6.0 (in Yapaia Go 0.64.2).

## 0.3.0

**Worüber geht der Router ins Internet?** Für die Anzeige im Cockpit-Dashboard.

- Neuer Sensor **„Internet über“** (`sensor.yapaia_router_internet`): WLAN,
  Mobilfunk, Kabel oder Tethering, also die erreichbare Quelle mit dem
  höchsten Rang im Multi-WAN des Routers. Als Attribute die Daten des WLANs,
  mit dem der Router verbunden ist: SSID, Balken, Kanal, BSSID, IP, Gateway
  und Verbindungsdauer.
- Neuer Sensor **„WLAN-Signal“** (dBm).
- Der Router wird alle 15 s abgefragt (bisher 30 s), damit Anzeigen den
  Empfang live zeigen. In den Einstellungen änderbar.
- Die Diagnose schwärzt SSID, BSSID und IPs des WLANs.
- Kommt mit der Integration 0.4.3 (in Yapaia Go 0.50.0).

## 0.2.1

**SIM-Umschaltung am GL-X3000 geht.** Gemeldet: Die Werte stimmen, die
Umschaltung geht nicht.

- In der Oberfläche des Routers nachgesehen, was „Anwenden“ im Dialog
  „SIM-Kartensteckplatz-Einstellungen“ schickt:
  `modem.set_slot_config {bus, enable_switch: false, current_sim: "2"}`.
  Die SIM geht als Text raus, der automatische Wechsel des Routers wird
  dabei ausgeschaltet. Das ist jetzt der erste Umschaltweg und wird beim
  ersten erfolgreichen Wechsel eingelernt.
- Bisher schickte die Integration die ganze Slot-Konfiguration zurück (der
  Router antwortet „Invalid params“) oder `slot: 2` (angenommen, aber ohne
  Wirkung).
- Am echten Router geprüft: Der Aufruf mit der schon aktiven SIM wird ohne
  Fehler angenommen.
- Kommt mit der Integration 0.4.2 (in Yapaia Beat 1.17.1).

## 0.2.0

**Yapaia Router: Gerät in der Integration „Yapaia“, SIM nach Land.**

- Der Router ist jetzt ein Modul der gemeinsamen Integration „Yapaia“
  (Gerät „Yapaia Router“) statt der eigenständigen Integration
  „GL.iNet Cellular“. Einrichten über *Integration hinzufügen → Yapaia →
  GL.iNet-Router*. Entitäten heißen `…yapaia_router_…`.
- **SIM nach Land:** Das Land kommt aus dem Ländercode (MCC) des eingebuchten
  Netzes. Je Land lässt sich die SIM festlegen; an der Grenze schaltet der
  Router um, sobald das neue Land einige Minuten stabil ist. Neu: Sensor
  „Land“, Binärsensor „Roaming“, Schalter „SIM nach Land“, Auslöser „Land
  gewechselt“, „SIM gewechselt“, „SIM-Wechsel fehlgeschlagen“.
- **Umschaltung lernt sich selbst ein:** Beim ersten Wechsel werden die
  bekannten Befehle probiert; gemerkt wird nur der, nach dem der Router die neue
  SIM wirklich meldet. Kein Laptop und keine Entwicklerwerkzeuge mehr nötig.
- Diagnose-Download enthält zusätzlich Ländercode und SIM-Heimatland.

## 0.1.1

- Umgezogen ins Monorepo [Yapaia/yapaia](https://github.com/Yapaia/yapaia) (Ordner `router/`).
  Links zu Doku und Fehlermeldungen zeigen dorthin. Keine Änderung an der Funktion.
- Die Installation über HACS entfällt vorerst (siehe README).

## 0.1.0

- Erste Fassung: Mobilfunkstatus des GL.iNet GL-X3000, SIM-Umschaltung,
  Neuverbinden, Router-Neustart, Diagnose, Aktion `glinet_cellular.rpc_call`.
