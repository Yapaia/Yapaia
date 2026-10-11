# GL.iNet Cellular für Home Assistant

Eigene Home-Assistant-Integration für GL.iNet-Router mit Firmware 4.x, gebaut für den
**GL-X3000 (Spitz AX)** im Wohnmobil. Sie zeigt den Mobilfunkstatus an und kann
**zwischen SIM 1 und SIM 2 umschalten**, ohne dass man die Router-Oberfläche öffnen muss.
Alles läuft lokal über die JSON-RPC-Schnittstelle des Routers (`http://192.168.8.1/rpc`),
ein Cloud-Konto ist nicht nötig.

> **Status: noch nicht am echten Router getestet.** Anmeldung und Statusabfrage folgen
> Projekten, die bereits am X3000 laufen. Den Befehl zum SIM-Umschalten hat GL.iNet nicht
> dokumentiert, deshalb ist er eine fundierte Annahme. Unten steht, wie man ihn prüft und
> bei Bedarf **ohne Codeänderung** anpasst.

## Entitäten

| Entität | Beschreibung |
|---|---|
| `select.…_sim_karte` | **SIM 1 / SIM 2 umschalten** und die aktive SIM anzeigen |
| `sensor.…_aktive_sim` | Aktive SIM (1 oder 2) |
| `sensor.…_provider` | Netzbetreiber, z. B. Telekom.de |
| `sensor.…_netztyp` | LTE, NR5G-NSA, … |
| `sensor.…_frequenzbander` | Genutzte Bänder, z. B. `B3 + n78` |
| `sensor.…_signalbalken` | 0–5 Balken (aus RSRP berechnet) |
| `sensor.…_rsrp` / `_rsrq` / `_sinr` / `_rssi` | Signalwerte (RSSI standardmäßig deaktiviert) |
| `sensor.…_mobilfunk_datenverbrauch` | Datenzähler des Routers |
| `sensor.…_modem_modell` | z. B. RM520N-GL (Diagnose) |
| `binary_sensor.…_mobilfunkverbindung` | Verbunden ja/nein |
| `button.…_mobilfunk_neu_verbinden` | Modem trennen und neu verbinden |
| `button.…_router_neu_starten` | Router-Neustart (standardmäßig deaktiviert) |

Die genauen Entitäts-IDs hängen vom Gerätenamen und von der Sprache von Home Assistant ab; bitte in der Oberfläche nachsehen und die Beispiele unten entsprechend anpassen. Ist Home Assistant auf Deutsch
eingestellt, erscheinen die Namen auf Deutsch.

Dazu kommt die Aktion **`glinet_cellular.rpc_call`**, mit der man beliebige Router-Befehle
ausprobieren kann (siehe unten).

## Installation

### Über HACS (empfohlen)
1. HACS → ⋮ → *Benutzerdefinierte Repositories* → `https://github.com/Apfelsafft/Yapaia-Router`, Typ *Integration*.
2. „GL.iNet Cellular“ installieren und Home Assistant neu starten.

### Manuell
Den Ordner `custom_components/glinet_cellular` nach `/config/custom_components/` kopieren
und Home Assistant neu starten.

### Einrichten
*Einstellungen → Geräte & Dienste → Integration hinzufügen → „GL.iNet Cellular“*

- Host: `192.168.8.1` (oder die IP deines Routers)
- Benutzername: `root`
- Passwort: das Admin-Passwort der Router-Oberfläche

## Test-Checkliste am Wohnmobil

1. **Einrichten** wie oben. Klappt das, funktioniert die Anmeldung.
2. **Status prüfen:** Stimmen aktive SIM, Provider und Signalwerte mit der Router-Oberfläche überein?
3. **SIM umschalten:** Im Auswahlfeld „SIM-Karte“ die andere SIM wählen. Das Feld zeigt
   die gewünschte SIM sofort an. Innerhalb von etwa 2 Minuten sollte der Router sie
   bestätigen, und Provider und Signal ändern sich.
   - **Klappt es nicht,** erscheint in Home Assistant eine Benachrichtigung
     „SIM-Umschaltung nicht bestätigt“, die die Slot-Konfiguration des Routers enthält.
     Weiter mit dem nächsten Abschnitt.
4. **Diagnose:** *Geräte & Dienste → GL.iNet Cellular → ⋮ → Diagnose herunterladen*.
   Die Datei enthält die rohen Router-Antworten. IMEI, ICCID, MAC und Passwort sind
   darin geschwärzt. Mit dieser Datei lässt sich jede Unstimmigkeit schnell beheben.

## Wenn das SIM-Umschalten nicht klappt

**So arbeitet die Integration standardmäßig:** Sie liest die aktuelle Slot-Konfiguration
mit `modem.get_slot_config` aus, ersetzt darin die SIM-Nummer (Feld `slot`, `sim`,
`current_sim` …) und schickt das Ergebnis an `modem.set_slot_config` zurück.
Der genaue Aufruf steht im Home-Assistant-Log, gekennzeichnet mit „SIM switch:“.

**Den richtigen Aufruf finden:**
1. Die Router-Oberfläche am Laptop öffnen, **F12** drücken und den Tab **Netzwerk** wählen.
2. In der Oberfläche unter *Internet → Cellular → SIM Card Slot Settings* die SIM umschalten.
3. Die Anfrage an `rpc` anklicken und unter **Payload** nachsehen. Sie hat ungefähr diese Form:
   ```json
   {"jsonrpc":"2.0","id":1,"method":"call",
    "params":["<sid>","modem","set_slot_config",{"bus":"0001:01:00.0","slot":2}]}
   ```

**Ohne Codeänderung übernehmen:**
*Geräte & Dienste → GL.iNet Cellular → Konfigurieren*
- **RPC-Aufruf zum SIM-Umschalten:** `modem.set_slot_config`, also `service.method` aus der Payload
- **Parameter (JSON):** das letzte Objekt aus der Payload, mit Platzhaltern:
  ```json
  {"bus": "{bus}", "slot": "{sim}"}
  ```
  `"{sim}"` wird durch die Zahl 1 oder 2 ersetzt, `"{bus}"` durch die Modem-Adresse.

**Befehle direkt ausprobieren:**
*Entwicklerwerkzeuge → Aktionen → „RPC-Aufruf (roh)“*, zum Beispiel:
```yaml
action: glinet_cellular.rpc_call
data:
  service: modem
  method: get_slot_config
  params:
    bus: "0001:01:00.0"
```
Mit „Aktion ausführen“ erscheint die Antwort des Routers direkt darunter.

## Beispiele

### Dashboard-Karte
```yaml
type: entities
title: Mobilfunk
entities:
  - entity: select.x3000_sim_karte
  - entity: binary_sensor.x3000_mobilfunkverbindung
  - entity: sensor.x3000_provider
  - entity: sensor.x3000_netztyp
  - entity: sensor.x3000_signalbalken
  - entity: sensor.x3000_rsrp
  - entity: sensor.x3000_frequenzbander
  - entity: sensor.x3000_mobilfunk_datenverbrauch
  - entity: button.x3000_mobilfunk_neu_verbinden
```

### Automation: bei schlechtem Netz auf die andere SIM wechseln
```yaml
alias: Mobilfunk – SIM wechseln bei schlechtem Signal
triggers:
  - trigger: numeric_state
    entity_id: sensor.x3000_rsrp
    below: -115
    for: "00:05:00"
  - trigger: state
    entity_id: binary_sensor.x3000_mobilfunkverbindung
    to: "off"
    for: "00:03:00"
actions:
  - action: select.select_next
    target:
      entity_id: select.x3000_sim_karte
    data:
      cycle: true
mode: single
max_exceeded: silent
```
Damit die Automation nicht ständig hin- und herspringt, eventuell noch eine Bedingung
ergänzen, z. B. „letzter Wechsel länger als 30 Minuten her“.

## Technische Notizen

- Anmeldung: `challenge` → `crypt(passwort, salt)` → `login` → `sid`. Läuft die Sitzung ab, meldet sich die Integration automatisch neu an.
- Abgefragt werden `modem.get_info`, `modem.get_status`, `modem.get_cells_info` und `modem.get_slot_config`, alle 30 Sekunden (in den Optionen einstellbar).
- Die Passwort-Verschlüsselung (md5/sha256/sha512-crypt) ist in reinem Python umgesetzt und braucht keine zusätzlichen Pakete.
- Tests: `pip install pytest-homeassistant-custom-component passlib && pytest` (enthält einen simulierten Router).

Lizenz: MIT
