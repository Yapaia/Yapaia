# Ducato-CAN: Fahrzeugdaten von den CAN-Bussen am Diagnoseport

**Stand: Planung, noch keine Firmware.** Hier sammeln wir alles, um die Fahrzeugdaten des
Basisfahrzeugs (Fiat Ducato 250, Baujahr 2015, 2.3 MultiJet) **nur lesend** in Yapaia zu holen.
Am Diagnoseport liegen drei CAN-Paare. Ein ESP32 soll alle drei gleichzeitig mitlesen.

## Was wir haben wollen

| Priorität | Werte |
|---|---|
| **hoch** | Zentralverriegelung (auf/zu), Bordcomputer: Momentan- und Durchschnittsverbrauch, Restreichweite |
| **hoch** | Tempomat: Hauptschalter an/aus, Regelung aktiv, eingestellte Geschwindigkeit |
| mittel | Uhrzeit, Kilometerstand, Geschwindigkeit, Lenkwinkel, Warnleuchten im Kombi |
| nebenbei | alles andere, was wir beim Mitschneiden finden (Licht, Türen einzeln, Tank, Batterie …) |

## Warum direkt am CAN und nicht per Bluetooth-OBD-Dongle?

Die interessanten Werte stehen **nicht** in den Standard-OBD-Daten (Mode 01). Die Steuergeräte
schicken sie sich ständig selbst zu. Man liest sie am besten passiv mit, statt sie abzufragen.

Ein BLE-ELM327-Dongle am [`btcollector/`](../btcollector/) taugt dafür wenig:

- ELM327-Dongles sind fürs Abfragen gebaut. Dauerndes Mitlesen (`ATMA`) über BLE ist wackelig.
- Ein ELM327 liest nur das Paar an Pin 6/14, nicht die anderen beiden.
- Der btcollector (ESP32-C3) hält schon zwei BLE-Verbindungen und scannt dauernd.

Deshalb bekommt der Ducato ein **eigenes ESPHome-Gerät** mit drei CAN-Kanälen, über ein
OBD-Y-Kabel am Diagnoseport.

## Nur mitlesen oder auch abfragen?

- **Mitlesen (passiv):** Der CAN-Controller läuft im **Nur-Hören-Modus**. Er sendet kein einziges Bit,
  nicht einmal Empfangsbestätigungen. Das Fahrzeug merkt nichts davon. **Das ist der Hauptweg.**
- **Abfragen (PIDs, Diagnose):** Man schickt eine Anfrage, und ein Steuergerät antwortet. Das ändert
  nichts am Fahrzeug, ist aber technisch ein Senden auf den Bus.

Abfragen kommen nur infrage für Werte, die nie von allein auf dem Bus erscheinen (Kandidat:
Tempomat-Sollgeschwindigkeit). Das entscheiden wir erst, wenn das Mitlesen ausgereizt ist. Bis
dahin bleiben **alle drei Kanäle im Nur-Hören-Modus**.

## Welche Busse liegen am Diagnoseport? (Recherche)

### Fiat-Architektur

Fiat beschreibt für den Ducato zwei CAN-Netze ([Fiat eLearn](https://aftersales.fiat.com/elearnsections/frmMainPage.aspx?nodeID=250011353&languageID=2&markID=5&modelID=250000000&valID=250000005&prodID=250000000&modelName=professional+-+250+-+ducato&langDesc=italiano&sectionName=Diagnosi+per+DTC&validityName=3.0+JTD+EURO+V/EURO5)):

| Netz | Bitrate | Wer hängt dran (typisch) |
|---|---|---|
| **C-CAN** (Antrieb, Fahrdynamik) | 500 kbit/s | Motorsteuergerät, ABS/ESP mit Lenkwinkelsensor, Airbag, Body Computer, Kombiinstrument |
| **B-CAN** (Karosserie, Komfort) | 50 kbit/s | Body Computer, Kombiinstrument, Radio, Klima, Einparkhilfe, Reifendruck, Alarm |

Der **Body Computer** ist der Knoten zwischen beiden Netzen und weckt den Bus beim Einschalten der
Zündung. Die Adern heißen beim B-CAN „CAN-B A/B“ statt „H/L“. Das spricht für einen
**fehlertoleranten Low-Speed-CAN** (ISO 11898-3). Bestätigt ist das aber nicht.

Daneben gibt es Leitungen, die **kein CAN** sind: einen Eindraht-Bus (A-Bus) für Wischer und
Außenlicht, LIN (z. B. Batteriesensor) und K-Lines.

### Pinbelegung: was die Quellen sagen

Die Quellen widersprechen sich, je nach Baujahr. Die Spalte „2015 (vermutet)“ ist unsere beste
Schätzung und muss gemessen werden.

| Pins | X250 bis 2014 | 2015 (vermutet) | Quellen |
|---|---|---|---|
| **6 / 14** | B-CAN 50 kbit/s (bei einem 2009er gemessen) | **C-CAN 500 kbit/s** | danderik88 (2009: 50k auf 6/14); AlfaOBD führt den Ducato (250/255) mit C-CAN auf 6/14 |
| **1 / 9** | K-Line ABS (Pin 1), Body Computer (Pin 9) | **B-CAN 50 kbit/s** | AlfaOBD (B-CAN auf 1/9, Adapter „gelb“); wican-fw #176/#870 (neuere Ducato/ProMaster: B-CAN 50k auf 1/9) |
| **3 / 11** | K-Line Airbag (Pin 3), K-Line Alarm/ZV (Pin 11) | **unklar:** dritter CAN oder zwei K-Lines | AlfaOBD hat einen eigenen Adapter („blau“) für 3/11; bei Chrysler/ProMaster liegt dort ein weiterer CAN (CAN-IHS, 125k) |
| 7 | K-Line Motor (KWP2000) | K-Line Motor, eventuell unbelegt | danderik88 |
| 16 / 4, 5 | Dauerplus / Masse | Dauerplus / Masse | |

**Was das heißt:** Wenn an 3/11 tatsächlich CAN liegt, ist es eine Sache für die Messung in
Schritt 1. Liegen dort K-Lines (Airbag, Alarm und Zentralverriegelung), wäre das für uns auch
interessant: Die Zentralverriegelung könnte dann zusätzlich auf einer K-Line abzufragen sein.

### Woher die Wunschwerte vermutlich kommen

| Wert | Vermuteter Bus | Grund | bekannt? |
|---|---|---|---|
| Zentralverriegelung | B-CAN | Body Computer meldet sie ans Kombi (Symbol, Alarm) | nein |
| einzelne Türen | B-CAN | Body Computer → Kombi | nur „irgendeine Tür“ (0x380) |
| Verbrauch, Reichweite | B-CAN | Kombi rechnet und sendet (0x603, 0x643) | ja, beim 2009er |
| Tempomat an/aus, aktiv | C-CAN | Motorsteuergerät → Kombi (Kontrollleuchte) | nein |
| Tempomat Sollgeschwindigkeit | C-CAN oder nur im Motorsteuergerät | Kombi zeigt sie meist nicht an, dann gibt es auch keine Botschaft | nein, eventuell nur per Abfrage |
| Uhrzeit, Kilometerstand | B-CAN | 0x683, 0x603 | ja, beim 2009er |
| Geschwindigkeit | C-CAN (ABS) und B-CAN | 0x286 beim 2009er auf B-CAN | ja, beim 2009er |
| Lenkwinkel | C-CAN | Lenkwinkelsensor gehört zum ESP | nein, nur wenn ESP verbaut ist |
| Warnleuchten | B-CAN und C-CAN | Kombi bekommt sie vom Body Computer, Motor, ABS, Airbag | einzelne (Handbremse, Gurt, Tankreserve) |

### Komme ich an weitere Busse?

- **Am Diagnoseport selbst:** Mehr als die drei Paare gibt es dort wohl nicht. In Schritt 1 messen wir
  zur Sicherheit auch Pin 2/10 und 12/13 durch (bei anderen Fiat-Modellen bzw. beim ProMaster ab 2022 belegt).
- **Hinter dem Diagnoseport:** Je nach Baujahr ist der Diagnoseport nur über den Body Computer
  angebunden. Dann sieht man am Port nicht jeden Verkehr. Wer **alles** vom C-CAN will, greift ihn
  direkt ab, z. B. am Stecker des Kombiinstruments. Das ist ein Eingriff in den Kabelbaum und kommt erst,
  wenn uns am Port etwas fehlt.
- **Am Radio:** Hinter dem Radio liegt meist B-CAN an. Für uns bringt das nichts, was wir nicht auch am
  Port bekommen.
- **A-Bus, LIN, K-Line:** Das sind andere Protokolle. Dafür bräuchte es eigene Transceiver
  (z. B. L9637D für K-Line). Das bleibt außen vor, solange CAN reicht.

## Signaltabelle

Ausgangspunkt sind die IDs vom X250 (2009) aus
[danderik88/fiat-ducato-x250-wican](https://github.com/danderik88/fiat-ducato-x250-wican). Dort
liefen sie auf dem B-CAN (beim 2009er an Pin 6/14). Für **unseren** Wagen sind sie alle noch ungeprüft.

Status: `ungeprüft` = nur aus der Quelle, `vermutet` = bei uns gesehen, Formel unsicher,
`bestätigt` = bei uns gesehen und mit der Anzeige abgeglichen.

| Signal | Bus | ID | Bytes / Bits | Formel | Einheit | Status |
|---|---|---|---|---|---|---|
| Bremspedal | B | 0x180 | b0 Bit 7 | | an/aus | ungeprüft |
| Standlicht / Abblendlicht / Fernlicht | B | 0x180 | b1 Bit 5 / 3 / 4 | | an/aus | ungeprüft |
| Nebelschlussleuchte | B | 0x180 | b1 Bit 1 | | an/aus | ungeprüft |
| Blinker links / rechts | B | 0x180 | b2 0x40 / 0x20 | | an/aus | ungeprüft |
| Drehzahl | B | 0x281 | b5, b6 | (b6·256 + b5) / 8 | U/min | ungeprüft |
| Kühlmitteltemperatur | B | 0x281 | b3 | b3 − 40 | °C | ungeprüft |
| Motor läuft | B | 0x281 | | Drehzahl > 300 | an/aus | ungeprüft |
| Geschwindigkeit | B | 0x286 | b2, b3 | (b2·256 + b3) / 16 | km/h | ungeprüft |
| Handbremse | B | 0x380 | b0 Bit 5 | | an/aus | ungeprüft |
| irgendeine Tür offen | B | 0x380 | b1 | = 0x0C | an/aus | ungeprüft |
| Rückwärtsgang | B | 0x380 | b2 Bit 2 | | an/aus | ungeprüft |
| Starterbatterie | B | 0x380 | b3 | b3 · 0,16 | V | ungeprüft |
| Tankreserve | B | 0x380 | b4 Bit 1 | | an/aus | ungeprüft |
| Tankinhalt | B | 0x380 | b5 | Kalibrierung offen | l | ungeprüft |
| Fahrergurt offen | B | 0x39A | b2 Bit 0 | | an/aus | ungeprüft |
| Kilometerstand | B | 0x603 | 20 Bit ab unterem Nibble b1 | | km | ungeprüft |
| **Restreichweite** | B | 0x603 | b4 Bit 2–0 + b5 (11 Bit) | | km | ungeprüft |
| **Momentanverbrauch** | B | 0x603 | b0 + oberes Nibble b1, BCD | | l/100 km | ungeprüft |
| **Durchschnittsverbrauch** (Fahrt) | B | 0x643 | b0 + oberes Nibble b1, BCD | | l/100 km | ungeprüft |
| Durchschnittsgeschwindigkeit | B | 0x643 | b2 | | km/h | ungeprüft |
| Fahrtzeit | B | 0x643 | b3 h, b4 min, BCD | | h:min | ungeprüft |
| Fahrtstrecke | B | 0x643 | 20 Bit aus b5, b6, oberes Nibble b7 | · 0,1 | km | ungeprüft |
| Uhrzeit im Kombi | B | 0x683 | b0 h, b1 min, BCD | | h:min | ungeprüft |
| **Zentralverriegelung** | B? | ? | ? | | auf/zu | offen |
| einzelne Türen (Fahrer, Beifahrer, Schiebetür, Heck) | B? | ? | ? | | auf/zu | offen |
| **Tempomat Hauptschalter** | C? | ? | ? | | an/aus | offen |
| **Tempomat Regelung aktiv** | C? | ? | ? | | an/aus | offen |
| **Tempomat Sollgeschwindigkeit** | C? | ? | ? | | km/h | offen |
| Lenkwinkel | C? | ? | ? | | ° | offen |
| Geschwindigkeit (ABS) | C? | ? | ? | | km/h | offen |
| Warnleuchten (Motor, ABS, Airbag, Öl, Batterie …) | B/C? | ? | ? | | an/aus | offen |

Bytes werden ab b0 gezählt. Beim letzten Frame vor Zündung aus meldet 0x380 den Tankinhalt als 0.
Diesen Wert verwerfen.

Gefundene Signale kommen zusätzlich in eine DBC-Datei (`ducato.dbc` in diesem Ordner). Sie ist die
Vorlage für die ESPHome-Sensoren und lässt sich in SavvyCAN laden.

## Hardware: ein ESP32 mit drei CAN-Kanälen

### Aufbau

```
OBD-Y-Kabel ─┬─ Pin 6/14 ── Transceiver ─── CAN-Controller 1 (im ESP32-C6) ─┐
             ├─ Pin 1/9  ── Transceiver ─── MCP2515 über SPI ────────────────┤ ESP32-C6 ── WLAN ── Home Assistant
             ├─ Pin 3/11 ── Transceiver ─── CAN-Controller 2 (im ESP32-C6) ─┘
             ├─ Pin 4/5  ── Masse
             └─ Pin 16   ── Schutz ── 12 V → 5 V → 3,3 V
```

**Warum ein ESP32-C6?** Der klassische ESP32, der S3 und der C3 haben nur **einen** CAN-Controller.
Der **C6 hat zwei** (der P4 hat drei, aber kein eigenes WLAN). ESPHome legt für jedes
`esp32_can` einen eigenen Controller an, beim C6 also bis zu zwei. Den dritten Kanal übernimmt ein
**MCP2515** über SPI. Auch der kann in ESPHome im Nur-Hören-Modus laufen.

**Warum der MCP2515 auf den B-CAN?** Bei 50 kbit/s kommen wenige Frames pro Sekunde. Das schafft
ein MCP2515 über SPI locker. Die beiden schnelleren Busse laufen auf den eingebauten Controllern.
Welches Paar welche Bitrate hat, steht erst nach Schritt 1 fest. Die Zuordnung oben ist der Plan.

**Bauteileliste, Schaltplan und Verdrahtungsliste:** [`hardware/`](hardware/README.md).
Dort gibt es vier Pläne (A–D). Welcher gebaut wird, entscheidet die Messung in Schritt 1.

### Pins am ESP32-C6-DevKitC-1

| Funktion | GPIO | Stiftleiste |
|---|---|---|
| CAN-Controller 1 TX / RX | 2 / 3 | J1-12 / J1-13 |
| CAN-Controller 2 TX / RX | 6 / 7 | J1-5 / J1-6 |
| MCP2515 SCK / MOSI / MISO / CS | 18 / 19 / 20 / 21 | J3-10 / 9 / 8 / 7 |
| MCP2515 INT | 22 | J3-6 |
| TJA1055 ERR (optional) | 23 | J3-5 |

Frei bleiben die Startpins (GPIO4, 5, 8, 9, 15), USB (12/13) und die Log-Ausgabe (16/17).
GPIO3 und GPIO7 können den ESP32 aus dem Tiefschlaf wecken, wenn der Bus aktiv wird.

### Worauf es ankommt

- **3,3-V-Transceiver:** SN65HVD230 je Kanal. **Keine fertigen MCP2515-Module** mit
  TJA1050: Der braucht 5 V und passt nicht zu den 3,3-V-Pins des ESP32. Der MCP2515 selbst läuft
  mit 3,3 V und braucht einen Quarz (8 MHz).
- **Keine Abschlusswiderstände:** Die Busse im Auto sind schon abgeschlossen.
- **B-CAN eventuell fehlertolerant:** Ein normaler Transceiver liest so einen Bus meist trotzdem mit,
  solange beide Adern intakt sind (der 2009er wurde so gelesen). Falls nicht, kommt auf diesen Kanal
  ein **TJA1055T/3** (Variante für 3,3-V-Logik), Plan B oder D.
- **Nur lesen, dreifach abgesichert:** Nur-Hören-Modus in der Firmware, Sendeeingang der Transceiver
  per Steckbrücke abgetrennt, Sendetreiber im SN65HVD230 abgeschaltet.
- **Schutz:** Sicherung, Verpolschutz, TVS-Diode im Bordnetz, CAN-Schutzdiode (PESD1CAN) je Kanal.
- **Bauform:** zuerst Lochraster. Wenn alle Kanäle laufen, wird daraus eine kleine Platine.

## Einkaufsliste

### Das Gerät im Fahrzeug

Vollständige Liste mit Stückzahlen je Plan: [`hardware/README.md`](hardware/README.md#bauteileliste).
Kurzfassung: ESP32-C6-DevKitC-1, 3× SN65HVD230, 1× TJA1055T/3, MCP2515 mit 8-MHz-Quarz,
Traco TSR 1-2450, Sicherung, Schutzdioden, OBD-Y-Kabel mit **allen 16 Pins** und OBD-Stecker mit
Litzen. Alles für alle Pläne zusammen: ca. **75 €**.

### Zum Messen und Mitschneiden

| # | Teil | Beispiel | ca. € | Hinweis |
|---|---|---|---|---|
| 9 | OBD-Breakout-Box mit LEDs | „OBD2 Breakout Box“ mit 16 Pins und Messbuchsen | 15–25 | jeden Pin messen und beliebige Pins auf den Mitschneider legen |
| 10 | USB-CAN-Adapter für den Laptop | CANable 2.0 (candleLight/slcan) | 25–40 | für die erste Messung, bevor das ESP32-Gerät fertig ist. Liest einen Bus auf einmal. **Abschluss-Jumper offen lassen.** |
| 11 | Multimeter | | – | |

Fürs Messen ca. **40–65 €**.

### Ruhestrom

Pin 16 führt Dauerplus. Ein ESP32 mit WLAN zieht etwa 80–100 mA, das sind **rund 2 Ah pro Tag aus
der Starterbatterie**. Es gibt zwei Wege:

- **Einfach:** Versorgung über Zündungsplus oder D+. Bei Fahrzeug aus schläft der Bus nach
  ein paar Minuten ohnehin.
- **Elegant:** Versorgung über Pin 16, dazu Tiefschlaf mit Aufwecken über einen Pegelwechsel am RX-Pin
  eines Transceivers, sobald der Bus wieder aktiv wird.

Das entscheiden wir beim Einbau.

## Software

Dieselbe Hardware läuft in zwei Phasen mit unterschiedlicher Firmware.

### Phase 1: Signale suchen

| Werkzeug | Wofür |
|---|---|
| **CANable + [SavvyCAN](https://www.savvycan.com/)** | erste Messung am Laptop, ein Bus nach dem anderen, im Nur-Hören-Modus. Funktioniert sofort, ohne eigene Firmware. |
| **Mitschneide-Firmware für das ESP32-Gerät** (bauen wir) | alle drei Busse **gleichzeitig** mitschneiden und per WLAN an SavvyCAN liefern (GVRET-Protokoll, mehrere Busse). Die fertige Firmware ESP32RET kann weder den C6 noch zwei Controller plus MCP2515, deshalb schreiben wir eine kleine eigene. |
| **SavvyCAN** | *Sniffer* (welche Bytes ändern sich gerade), *Flow View* (Verlauf einzelner Bytes), *Frame Info* (welche Bits kippen bei einer Aktion). DBC-Dateien laden, um Gefundenes anzuzeigen. |
| **Python-Auswertung** (bauen wir, mit `python-can` und `cantools`) | Aufnahmen vergleichen (Ruhe gegen Aktion), Bytes suchen, die zu einer bekannten Anzeige passen (z. B. 80, 81, 82 km/h beim Tempomat), Zähler und Prüfsummen erkennen. Ergebnis sind Vorschläge für die Signaltabelle. |

Gemeinsames Vorgehen: Aufnahmen machen (siehe Schritt 3), ins Repo nach `aufnahmen/` legen, Claude
wertet sie mit den Python-Skripten aus und schlägt Signale vor, die Prüfung passiert wieder im Auto.

### Phase 2: Dauerbetrieb mit ESPHome

Geprüft im ESPHome-Quellcode:

- `esp32_can` kann mehrfach angelegt werden, so oft der Chip Controller hat (C6: zwei). Option
  `mode: LISTENONLY` gibt es.
- `mcp2515` hat ebenfalls `mode: LISTENONLY` und `clock: 8MHZ` / `16MHZ`.
- Beide können 50 und 500 kbit/s.

Skizze (Bitraten und Pins nach der Messung anpassen):

```yaml
spi:
  clk_pin: GPIO18
  mosi_pin: GPIO19
  miso_pin: GPIO20

canbus:
  - platform: esp32_can
    id: can_c          # Pin 6/14
    tx_pin: GPIO2
    rx_pin: GPIO3
    can_id: 0          # wird im Nur-Hören-Modus nicht benutzt
    bit_rate: 500KBPS
    mode: LISTENONLY
  - platform: esp32_can
    id: can_3          # Pin 3/11
    tx_pin: GPIO6
    rx_pin: GPIO7
    can_id: 0
    bit_rate: 125KBPS  # unbekannt
    mode: LISTENONLY
  - platform: mcp2515
    id: can_b          # Pin 1/9
    cs_pin: GPIO21
    clock: 8MHZ
    can_id: 0
    bit_rate: 50KBPS
    mode: LISTENONLY
```

Die Sensoren entstehen aus der DBC-Datei mit `on_frame` und einem Lambda, im gleichen Stil wie die
Reifendrucksensoren im btcollector. Ob drei Busse und WLAN auf dem C6 zusammen stabil laufen,
testen wir als Erstes beim Bau.

## Anleitung zum Messen und Mitschneiden

### Schritt 1: Den OBD-Port vermessen

Ziel: herausfinden, welcher Bus an welchen Pins liegt.

**Ohne Spannung (Widerstand):** Zündung aus, Fahrzeug abschließen und ca. 10 Minuten warten, bis die
Busse schlafen. Dann an der Breakout-Box messen:

| Messung | Bedeutung |
|---|---|
| Paar ≈ 60 Ω | klassischer CAN mit zwei Abschlusswiderständen |
| Paar mehrere hundert Ω bis kΩ | eher fehlertoleranter Low-Speed-CAN |
| Paar ohne Durchgang | nicht belegt, oder zwei K-Lines (dann einzeln gegen Masse messen) |
| Pin 4/5 gegen Fahrzeugmasse ≈ 0 Ω | Masse in Ordnung |

**Mit Spannung (Zündung an, Motor aus), gemessen gegen Pin 4/5:**

| Messung | Bedeutung |
|---|---|
| Pin 16 ≈ 12 V, auch bei Zündung aus | Dauerplus |
| ein Pin ≈ 12 V in Ruhe, flackert bei Diagnose | K-Line |
| beide Adern ≈ 2,5 V | **klassischer CAN**, SN65HVD230 passt |
| eine Ader ≈ 0 V, die andere ≈ 5 V | **fehlertoleranter Low-Speed-CAN** (ISO 11898-3), TJA1055T/3 (Plan B/D) |

Ergebnis hier eintragen:

| Pin(s) | Widerstand | Spannung | Bus | Bitrate |
|---|---|---|---|---|
| 6 / 14 | | | | |
| 1 / 9 | | | | |
| 3 / 11 | | | | |
| 2 / 10 | | | | |
| 12 / 13 | | | | |
| 7 | – | | | – |
| 16 | – | | | – |

### Schritt 2: Bitrate finden mit SavvyCAN

> **Immer im Nur-Hören-Modus.** Bei falscher Bitrate kann ein aktiver Teilnehmer Fehlerframes erzeugen und
> den Bus stören. Im Nur-Hören-Modus kann nichts passieren.

1. CANable an der Breakout-Box mit CAN-H, CAN-L und Masse verbinden, zuerst ein Paar, das in Schritt 1 nach CAN aussah.
2. In SavvyCAN unter *Connection → Add Device* den Adapter wählen, **Listen Only** einschalten.
3. Zündung an. Bitraten der Reihe nach probieren: 50, 125, 500 kbit/s. Die richtige liefert saubere Frames ohne Fehler.
4. Für jedes Paar wiederholen. Ergebnis in die Tabelle oben eintragen.
5. Auf dem B-CAN prüfen, ob die IDs aus der Signaltabelle auftauchen (0x180, 0x281, 0x286, 0x380, 0x603, 0x643, 0x683).

### Schritt 3: Gezielte Aufnahmen

Jede Aktion als eigene Aufnahme speichern (*File → Save Log*, als GVRET-CSV). Mit dem Handy notieren
oder filmen, wann was passiert ist. Mit dem CANable jede Aufnahme auf **jedem** CAN-Paar wiederholen,
mit dem ESP32-Gerät alle drei auf einmal. Die Aufnahmen kommen nach `aufnahmen/` in diesem Ordner.
Sie enthalten keine Geheimnisse, aber die Fahrgestellnummer kann auf dem Bus auftauchen. Vor dem
Einchecken danach suchen.

| Aufnahme | Ablauf | Gesucht |
|---|---|---|
| `01_ruhe` | Zündung an, 60 s nichts tun | Grundrauschen zum Vergleich |
| `02_zv` | 3× abschließen und aufschließen mit der Fernbedienung, je 5 s Pause, danach 3× mit dem Taster innen | Zentralverriegelung |
| `03_tueren` | Fahrertür, Beifahrertür, Schiebetür und Hecktür je einzeln öffnen und schließen | einzelne Türen |
| `04_warnleuchten` | Zündung aus, Zündung an (Lampentest), 30 s warten, Motor starten | Warnleuchten: Beim Lampentest sind alle an, danach gehen sie einzeln aus |
| `05_lenkung` | Motor an, im Stand Lenkrad ganz links, Mitte, ganz rechts, Mitte, je 5 s Pause | Lenkwinkel |
| `06_uhr` | Uhr im Kombi um eine Stunde verstellen und zurück | Uhrzeit |
| `07_fahrt_basis` | normale Fahrt, dabei Reichweite, Momentanverbrauch und Durchschnitt auf dem Display fotografieren | Bordcomputer, Geschwindigkeit, Kilometer |
| `08_tempomat` | bei ca. 80 km/h: Hauptschalter ein, SET, 3× SET+, 2× SET−, CANC, RES, Hauptschalter aus; zwischen den Aktionen je 5 s warten | Tempomat an/aus, aktiv, Sollgeschwindigkeit |
| `09_tanken` | Füllstand vor und nach dem Tanken | Tankinhalt kalibrieren |

**Auswerten in SavvyCAN:**

- **Sniffer:** zeigt live, welche Bytes sich ändern. Am besten zu zweit: eine Person drückt Tasten, die andere schaut zu.
- **Flow View:** Verlauf der Bytes einer ID. Beim Tempomat ein Byte suchen, das bei SET+ und SET− in
  Schritten springt (80 → 81 → 82 oder ein Vielfaches davon).
- **Frame Info:** welche Bits sich bei einer Aktion ändern. So findet man Statusbits wie „verriegelt“.

### Schritt 4: Ergebnis festhalten

Jedes gefundene Signal in die [Signaltabelle](#signaltabelle) und in `ducato.dbc` eintragen und den
Status hochsetzen.

Falls die Tempomat-Sollgeschwindigkeit auf keinem Bus auftaucht, kennt sie nur das
Motorsteuergerät. Dann bekommen wir sie nur per Abfrage (siehe
[Nur mitlesen oder auch abfragen?](#nur-mitlesen-oder-auch-abfragen)). Das klären wir dann separat.

## Quellen

- [danderik88/fiat-ducato-x250-wican](https://github.com/danderik88/fiat-ducato-x250-wican): entschlüsselte IDs des X250 (2009), B-CAN 50 kbit/s an Pin 6/14, K-Line fürs Motorsteuergerät
- [meatpiHQ/wican-fw#176](https://github.com/meatpiHQ/wican-fw/issues/176) und [#870](https://github.com/meatpiHQ/wican-fw/issues/870): neuere Ducato/ProMaster mit C-CAN 500 kbit/s an Pin 6/14 und B-CAN 50 kbit/s an Pin 1/9
- [AlfaOBD-Hilfe](https://www.alfaobd.com/androidhelp.html): Ducato (250/255) mit C-CAN an 6/14 und B-CAN an 1/9; eigene Adapter für 1/9 und 3/11
- [Fiat eLearn, Ducato 250: Architektur der Elektronik](https://aftersales.fiat.com/elearnsections/frmMainPage.aspx?nodeID=250011353&languageID=2&markID=5&modelID=250000000&valID=250000005&prodID=250000000&modelName=professional+-+250+-+ducato&langDesc=italiano&sectionName=Diagnosi+per+DTC&validityName=3.0+JTD+EURO+V/EURO5): C-CAN 500 kbit/s, B-CAN 50 kbit/s, Body Computer als zentraler Knoten
- [Pinbelegung Fiat-Diagnoseport (pinoutguide.com)](https://pinoutguide.com/CarElectronics/fiat_car_obd_ii_pinout.shtml): ältere Belegung mit K-Lines an 1, 3, 7, 9 und 11
- ESPHome-Quellcode ([`esp32_can`](https://github.com/esphome/esphome/tree/dev/esphome/components/esp32_can), [`mcp2515`](https://github.com/esphome/esphome/tree/dev/esphome/components/mcp2515)): mehrere Controller, Nur-Hören-Modus
- ESP-IDF `soc_caps.h`: Zahl der CAN-Controller je Chip (ESP32/S3/C3: 1, C5/C6: 2, P4: 3)
