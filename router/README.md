# Yapaia Router

Mobilfunk des **GL.iNet-Routers** (Firmware 4.x, gebaut für den **GL-X3000 Spitz AX**)
in Home Assistant – als Gerät **„Yapaia Router“** in der Integration „Yapaia“.
Das Wichtigste: **SIM 1 / SIM 2 umschalten**, von Hand oder **automatisch nach
Land** beim Grenzübertritt. Alles läuft lokal über die Schnittstelle des Routers
(`http://192.168.8.1/rpc`), ohne Cloud-Konto.

Der Code liegt in der gemeinsamen Integration:
[`integration/custom_components/yapaia/router/`](../integration/custom_components/yapaia/router/).

> **Status:** noch nicht am echten Router getestet. Anmeldung und Statusabfrage
> folgen Projekten, die am X3000 laufen. Den Befehl zum SIM-Umschalten hat
> GL.iNet nicht dokumentiert – deshalb lernt die Integration ihn selbst ein
> (unten).

## Einrichten

Die Integration „Yapaia“ kommt mit Yapaia Go oder Yapaia Beat (Add-on starten,
Home Assistant einmal neu starten). Dann:

*Einstellungen → Geräte & Dienste → Integration hinzufügen → **Yapaia** →
„GL.iNet-Router“*

- Adresse: `192.168.8.1` (oder die IP des Routers)
- Benutzername: `root`
- Passwort: das Admin-Passwort der Router-Oberfläche

Wer vorher die eigenständige Integration **„GL.iNet Cellular“** benutzt hat:
diese unter *Geräte & Dienste* löschen (und eine HACS-Quelle
`Apfelsafft/Yapaia-Router` entfernen). Die Entitäten heißen jetzt
`…yapaia_router_…` (siehe unten).

## Entitäten

| Entität | Was sie zeigt / tut |
|---|---|
| `select.yapaia_router_sim` | **SIM 1 / SIM 2 umschalten**, zeigt die aktive SIM |
| `switch.yapaia_router_automatik` | **SIM nach Land** an/aus |
| `sensor.yapaia_router_land` | Land des eingebuchten Netzes (Attribute `land_code`, `mcc`) |
| `binary_sensor.yapaia_router_roaming` | Roaming ja/nein |
| `sensor.yapaia_router_aktive_sim`, `…_anbieter`, `…_netztyp`, `…_baender` | aktive SIM, Netzbetreiber, LTE/5G, Frequenzbänder |
| `sensor.yapaia_router_signalbalken`, `…_rsrp`, `…_rsrq`, `…_sinr`, `…_rssi` | Signal (RSSI zunächst deaktiviert) |
| `sensor.yapaia_router_datenverbrauch` | Datenzähler des Routers |
| `binary_sensor.yapaia_router_verbunden` | Mobilfunkverbindung |
| `sensor.yapaia_router_umschaltung` | Stand der SIM-Umschaltung (Diagnose) |
| `button.yapaia_router_neu_verbinden`, `…_neustart` | neu verbinden, Router-Neustart (deaktiviert) |

**Aktionen:** `yapaia.router_sim_waehlen` (`sim: 1|2`), `…_neu_verbinden`,
`…_router_neustart`, `…_automatik_an` / `…_automatik_aus` und
`yapaia.router_rpc` (Router-Aufruf roh, für Fachleute; Antwort als Ergebnis).

**Auslöser** (im Automationen-Editor beim Gerät „Yapaia Router“):
*Land gewechselt*, *SIM gewechselt*, *SIM-Wechsel fehlgeschlagen*.

## SIM nach Land (Grenzübertritt)

Das Modem bucht sich immer in ein Netz des Landes ein, in dem es steht – auch
im Roaming. Dessen **Ländercode (MCC)** sagt also, wo man ist, ganz ohne GPS.

*Geräte & Dienste → Yapaia → Yapaia Router → Konfigurieren:*

- **SIM nach Land** einschalten (oder der Schalter am Gerät)
- **Länder für SIM 1**, z. B. `DE`
- **Länder für SIM 2**, z. B. `AT, CH, IT`
- **Alle anderen Länder:** nicht wechseln / SIM 1 / SIM 2
- **Wartezeit nach Landwechsel** (Standard 3 min): in Grenznähe bucht sich das
  Modem manchmal kurz ins Nachbarland ein. Gewechselt wird erst, wenn das neue
  Land so lange stabil ist; nach einem automatischen Versuch frühestens nach
  15 Minuten wieder.

Ohne Automatik lässt sich dasselbe mit dem Auslöser *Land gewechselt* und der
Aktion *SIM wählen* selbst bauen.

**Wichtig:** In der Router-Oberfläche die eigene **Auto-Switch**-Funktion des
Routers ausschalten – zwei, die umschalten, arbeiten gegeneinander.

## Wie die Umschaltung eingelernt wird

GL.iNet dokumentiert den Umschaltbefehl nicht. Beim **ersten Umschalten**
probiert die Integration die bekannten Befehle der Reihe nach. Nach jedem
angenommenen Befehl wartet sie bis zu 90 s, ob der Router die neue SIM
**wirklich meldet**. Der erste, der wirkt, wird gemerkt und künftig sofort
benutzt (`sensor.yapaia_router_umschaltung`, Attribut `umschaltweg`). Das erste
Umschalten kann deshalb einige Minuten dauern; die Auswahl zeigt währenddessen
schon die gewünschte SIM.

**Wirkt keiner,** erscheint eine Benachrichtigung mit allen Versuchen. Dann bitte
*Geräte & Dienste → Yapaia → Yapaia Router → ⋮ → Diagnose herunterladen* und die
Datei weitergeben: Sie enthält die rohen Router-Antworten (IMEI, IMSI, ICCID, MAC
und Passwort geschwärzt). Damit lässt sich der richtige Aufruf finden und unter
*Konfigurieren → Umschaltbefehl / Umschalt-Parameter* eintragen, ganz ohne
Codeänderung. Platzhalter in den Parametern: `"{sim}"` und `"{bus}"`.

## Beispiel: Dashboard-Karte

```yaml
type: entities
title: Mobilfunk
entities:
  - entity: select.yapaia_router_sim
  - entity: switch.yapaia_router_automatik
  - entity: sensor.yapaia_router_land
  - entity: binary_sensor.yapaia_router_roaming
  - entity: sensor.yapaia_router_anbieter
  - entity: sensor.yapaia_router_netztyp
  - entity: sensor.yapaia_router_signalbalken
  - entity: sensor.yapaia_router_datenverbrauch
  - entity: button.yapaia_router_neu_verbinden
```

## Technisches

- Anmeldung: `challenge` → `crypt(passwort, salt)` → `login` → `sid`; läuft die
  Sitzung ab, meldet sich die Integration neu an. Die Passwort-Verschlüsselung
  (md5/sha256/sha512-crypt) ist in reinem Python umgesetzt.
- Abgefragt werden `modem.get_info`, `modem.get_status`, `modem.get_cells_info`
  und `modem.get_slot_config`, alle 30 s (einstellbar).
- Der Ländercode wird tolerant gesucht (`mcc`, sonst die ersten drei Ziffern der
  PLMN, in Status und Zellinfo); Roaming aus dem Feld des Routers oder aus dem
  Vergleich mit der IMSI der SIM.
- Tests: `integration/tests/test_router*.py` mit einem nachgebauten Router.

Lizenz: MIT (siehe `LICENSE`).
