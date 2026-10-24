# Ducato-CAN: Fahrzeugdaten vom Karosserie-CAN

**Stand: Planung, noch keine Firmware.** Hier sammeln wir alles, um die Fahrzeugdaten des
Basisfahrzeugs (Fiat Ducato 250, Baujahr 2015, 2.3 MultiJet) **nur lesend** in Yapaia zu holen:
Verbrauch, Restreichweite, Tankinhalt, Türen und Zentralverriegelung, Tempomat.

## Warum direkt am CAN und nicht per Bluetooth-OBD-Dongle?

Die interessanten Werte stehen **nicht** in den Standard-OBD-Daten (Mode 01). Kombiinstrument,
Body Computer und Motorsteuergerät schicken sie sich ständig selbst auf dem **Karosserie-CAN
(B-CAN, 50 kbit/s)** zu. Man liest sie am besten passiv mit, statt sie abzufragen.

Ein BLE-ELM327-Dongle am [`btcollector/`](../btcollector/) taugt dafür wenig:

- ELM327-Dongles sind fürs Abfragen gebaut. Dauerndes Mitlesen (`ATMA`) bei 50 kbit/s über BLE ist wackelig.
- Den Bus an Pin 1/9 kann kein bekannter ELM327-Dongle mitlesen.
- Der btcollector (ESP32-C3) hält schon zwei BLE-Verbindungen und scannt dauernd.

Deshalb bekommt der Ducato ein **eigenes ESPHome-Gerät**: einen ESP32 mit CAN-Transceiver, über
ein OBD-Y-Kabel am Diagnoseport, mit [`esp32_can`](https://esphome.io/components/canbus/esp32_can.html).

## Was wir über den Wagen wissen und was nicht

- Baujahr 2015 ist schon der **Facelift (X290, ab 2014)**. Die bekannten Quellen beziehen sich auf den
  älteren X250. Deshalb muss alles am eigenen Wagen nachgemessen werden (siehe unten).
- **Motorsteuergerät:** Beim X250 läuft OBD über die **K-Line an Pin 7** (KWP2000), nicht über CAN.
- **Karosserie-CAN:** Beim X250 (2009) liegt er an **Pin 6/14**, bei neueren Ducato/ProMaster an **Pin 1/9**.
- **Kein Secure Gateway:** Das kam erst etwa 2018. Bei Baujahr 2015 ist der Port offen lesbar.

## Signaltabelle

Ausgangspunkt sind die IDs vom X250 (2009) aus
[danderik88/fiat-ducato-x250-wican](https://github.com/danderik88/fiat-ducato-x250-wican).
Für **unseren** Wagen sind sie alle noch ungeprüft.

Status: `ungeprüft` = nur aus der Quelle, `vermutet` = bei uns gesehen, Formel unsicher,
`bestätigt` = bei uns gesehen und mit der Anzeige abgeglichen.

| Signal | ID | Bytes / Bits | Formel | Einheit | Status |
|---|---|---|---|---|---|
| Bremspedal | 0x180 | b0 Bit 7 | | an/aus | ungeprüft |
| Standlicht / Abblendlicht / Fernlicht | 0x180 | b1 Bit 5 / 3 / 4 | | an/aus | ungeprüft |
| Nebelschlussleuchte | 0x180 | b1 Bit 1 | | an/aus | ungeprüft |
| Blinker links / rechts | 0x180 | b2 0x40 / 0x20 | | an/aus | ungeprüft |
| Drehzahl | 0x281 | b5, b6 | (b6·256 + b5) / 8 | U/min | ungeprüft |
| Kühlmitteltemperatur | 0x281 | b3 | b3 − 40 | °C | ungeprüft |
| Motor läuft | 0x281 | | Drehzahl > 300 | an/aus | ungeprüft |
| Geschwindigkeit | 0x286 | b2, b3 | (b2·256 + b3) / 16 | km/h | ungeprüft |
| Handbremse | 0x380 | b0 Bit 5 | | an/aus | ungeprüft |
| irgendeine Tür offen | 0x380 | b1 | = 0x0C | an/aus | ungeprüft |
| Rückwärtsgang | 0x380 | b2 Bit 2 | | an/aus | ungeprüft |
| Starterbatterie | 0x380 | b3 | b3 · 0,16 | V | ungeprüft |
| Tankreserve | 0x380 | b4 Bit 1 | | an/aus | ungeprüft |
| Tankinhalt | 0x380 | b5 | Kalibrierung offen | l | ungeprüft |
| Fahrergurt offen | 0x39A | b2 Bit 0 | | an/aus | ungeprüft |
| Kilometerstand | 0x603 | 20 Bit ab unterem Nibble b1 | | km | ungeprüft |
| **Restreichweite** | 0x603 | b4 Bit 2–0 + b5 (11 Bit) | | km | ungeprüft |
| **Momentanverbrauch** | 0x603 | b0 + oberes Nibble b1, BCD | | l/100 km | ungeprüft |
| Durchschnittsverbrauch (Fahrt) | 0x643 | b0 + oberes Nibble b1, BCD | | l/100 km | ungeprüft |
| Durchschnittsgeschwindigkeit | 0x643 | b2 | | km/h | ungeprüft |
| Fahrtzeit | 0x643 | b3 h, b4 min, BCD | | h:min | ungeprüft |
| Fahrtstrecke | 0x643 | 20 Bit aus b5, b6, oberes Nibble b7 | · 0,1 | km | ungeprüft |
| Uhrzeit im Kombi | 0x683 | b0 h, b1 min, BCD | | h:min | ungeprüft |
| **Zentralverriegelung** | ? | ? | | auf/zu | offen |
| **einzelne Türen** | ? | ? | | auf/zu | offen |
| **Tempomat aktiv** | ? | ? | | an/aus | offen |
| **Tempomat Sollgeschwindigkeit** | ? | ? | | km/h | offen |

Bytes werden ab b0 gezählt. Beim letzten Frame vor Zündung aus meldet 0x380 den Tankinhalt als 0.
Diesen Wert verwerfen.

## Einkaufsliste

Die Preise sind grobe Schätzungen.

### Das Gerät im Fahrzeug

| # | Teil | Beispiel | ca. € | Hinweis |
|---|---|---|---|---|
| 1 | ESP32 mit eingebautem CAN-Controller | ESP32-S3-DevKitC-1 oder Seeed XIAO ESP32-S3/C3 | 8–15 | Klassischer ESP32, S3, C3 und C6 können CAN. Der S3 hat Reserve für WLAN und CAN. |
| 2 | CAN-Transceiver mit 3,3 V | Modul mit SN65HVD230 oder TCAN1051 | 3–5 | **Den 120-Ω-Abschlusswiderstand auf dem Modul entfernen** (meist „R2“ oder „120“). Der Bus im Auto ist schon abgeschlossen. |
| 2b | *Optional:* fehlertoleranter Transceiver | TJA1055 | 5–10 | Nur, falls der Bus ein Low-Speed-CAN nach ISO 11898-3 ist (siehe Schritt 1) und der SN65 nichts liest |
| 3 | Spannungswandler 12 V → 5 V | Pololu D36V6F5 oder Traco TSR 1-2450 | 6–10 | Eingang bis ca. 36 V, wenig Ruhestrom |
| 4 | Schutz | TVS-Diode SMBJ24A, selbstrückstellende Sicherung 500 mA, Verpolschutz-Diode (z. B. SS34) | 3 | gegen Spannungsspitzen im Bordnetz |
| 5 | OBD-Y-Kabel (1 Stecker auf 2 Buchsen) | **alle 16 Pins belegt** | 10–15 | Billige Kabel führen oft nur einen Teil der Pins durch. Pin 1, 6, 7, 9, 14 und 16 müssen durchgehen. |
| 6 | OBD-Stecker mit offenen Kabelenden | 16-polig mit Litzen | 5–8 | Hängt am zweiten Abgang des Y-Kabels |
| 7 | Kleinkram | verdrilltes Zweidrahtkabel für CAN-H/L, Gehäuse, Lochraster oder JST, Schrumpfschlauch | 10 | |

### Zum Messen und Mitschneiden

| # | Teil | Beispiel | ca. € | Hinweis |
|---|---|---|---|---|
| 8 | OBD-Breakout-Box mit LEDs | „OBD2 Breakout Box“ mit 16 Pins und Messbuchsen | 15–25 | Jeden Pin messen und beliebige Pins auf den Mitschneider legen |
| 9 | USB-CAN-Adapter für den Laptop | CANable 2.0 (candleLight/slcan) | 25–40 | Funktioniert mit [SavvyCAN](https://www.savvycan.com/) (kostenlos) und kann Nur-Hören. **Abschluss-Jumper offen lassen.** |
| 10 | Multimeter | | – | |

Insgesamt ca. **50–70 €** für das Gerät und **40–65 €** fürs Messen.

Statt Teil 9 geht auch Teil 1+2 mit der Firmware **ESP32RET**. SavvyCAN verbindet sich dann per
WLAN. Das ist billiger, aber fummeliger.

### Ruhestrom

Pin 16 führt Dauerplus. Ein ESP32 mit WLAN zieht etwa 80–100 mA, das sind **rund 2 Ah pro Tag aus
der Starterbatterie**. Es gibt zwei Wege:

- **Einfach:** Versorgung über Zündungsplus oder D+. Bei Fahrzeug aus schläft der Karosserie-CAN nach
  ein paar Minuten ohnehin.
- **Elegant:** Versorgung über Pin 16, dazu Tiefschlaf mit Aufwecken über einen Pegelwechsel am RX-Pin
  des Transceivers, sobald der Bus wieder aktiv wird.

Das entscheiden wir beim Einbau.

## Anleitung zum Messen und Mitschneiden

### Schritt 1: Den OBD-Port vermessen

Ziel: herausfinden, welcher Bus an welchen Pins liegt.

**Ohne Spannung (Widerstand):** Zündung aus, Fahrzeug abschließen und ca. 10 Minuten warten, bis die
Busse schlafen. Dann an der Breakout-Box messen:

| Messung | Bedeutung |
|---|---|
| Pin 6 ↔ 14 ≈ 60 Ω | klassischer CAN mit zwei Abschlusswiderständen |
| Pin 6 ↔ 14 mehrere hundert Ω bis kΩ | eher fehlertoleranter Low-Speed-CAN |
| Pin 1 ↔ 9 | gleiche Auswertung; kein Durchgang heißt nicht belegt |
| Pin 4/5 gegen Fahrzeugmasse ≈ 0 Ω | Masse in Ordnung |

**Mit Spannung (Zündung an, Motor aus), gemessen gegen Pin 4/5:**

| Messung | Bedeutung |
|---|---|
| Pin 16 ≈ 12 V, auch bei Zündung aus | Dauerplus |
| Pin 7 ≈ 12 V | K-Line vorhanden, also Motorsteuergerät über KWP |
| CAN-H und CAN-L beide ≈ 2,5 V | **klassischer CAN**, SN65HVD230 passt |
| CAN-H ≈ 0 V, CAN-L ≈ 5 V | **fehlertoleranter Low-Speed-CAN** (ISO 11898-3), eher TJA1055 |

Ergebnis hier eintragen:

| Pin(s) | Widerstand | Spannung | Bus |
|---|---|---|---|
| 6 / 14 | | | |
| 1 / 9 | | | |
| 7 | – | | |
| 16 | – | | |

### Schritt 2: Mitschneiden mit SavvyCAN

> **Immer im Nur-Hören-Modus.** Bei falscher Bitrate kann ein aktiver Teilnehmer Fehlerframes erzeugen und
> den Bus stören. Im Nur-Hören-Modus kann nichts passieren.

1. CANable an der Breakout-Box mit CAN-H, CAN-L und Masse verbinden. Zuerst das Paar, das in Schritt 1 aktiv aussah.
2. In SavvyCAN unter *Connection → Add Device* den Adapter wählen, **Listen Only** einschalten und die Bitrate auf **50 kbit/s** stellen.
3. Zündung an. Wenn Frames kommen, passt alles. Wenn nichts oder nur Fehler kommen, nacheinander 125 und
   500 kbit/s probieren und danach das andere Pin-Paar.
4. Prüfen, ob die IDs aus der Signaltabelle auftauchen (0x180, 0x281, 0x286, 0x380, 0x603, 0x643, 0x683).

### Schritt 3: Gezielte Aufnahmen

Jede Aktion als eigene Aufnahme speichern (*File → Save Log*, als GVRET-CSV). Mit dem Handy notieren,
wann was passiert ist. Die Aufnahmen kommen nach `aufnahmen/` in diesem Ordner. Sie enthalten keine
Geheimnisse, aber die Fahrgestellnummer kann auf dem Bus auftauchen. Vor dem Einchecken danach suchen.

| Aufnahme | Ablauf | Gesucht |
|---|---|---|
| `01_ruhe` | Zündung an, 60 s nichts tun | Grundrauschen zum Vergleich |
| `02_zv` | 3× abschließen und aufschließen mit der Fernbedienung, je 5 s Pause, danach 3× mit dem Taster innen | Zentralverriegelung |
| `03_tueren` | Fahrertür, Beifahrertür, Schiebetür und Hecktür je einzeln öffnen und schließen | einzelne Türen |
| `04_fahrt_basis` | normale Fahrt, dabei Reichweite und Momentanverbrauch auf dem Display fotografieren | Verbrauch und Reichweite prüfen |
| `05_tempomat` | bei ca. 80 km/h: Tempomat ein, SET, 3× SET+, 2× SET−, CANC, RES, aus; zwischen den Aktionen je 5 s warten | Tempomat aktiv und Sollgeschwindigkeit |
| `06_tanken` | Füllstand vor und nach dem Tanken | Tankinhalt kalibrieren |

**Auswerten in SavvyCAN:**

- **Sniffer:** zeigt live, welche Bytes sich ändern. Am besten zu zweit: eine Person drückt Tasten, die andere schaut zu.
- **Flow View:** Verlauf der Bytes einer ID. Beim Tempomat ein Byte suchen, das bei SET+ und SET− in
  Schritten springt (80 → 81 → 82 oder ein Vielfaches davon).
- **Frame Info:** welche Bits sich bei einer Aktion ändern. So findet man Statusbits wie „verriegelt“.

### Schritt 4: Ergebnis festhalten

Jedes gefundene Signal in die [Signaltabelle](#signaltabelle) eintragen und den Status hochsetzen.
Daraus werden später die ESPHome-Sensoren mit `esp32_can`, `on_frame` und einem Lambda, im gleichen
Stil wie die Reifendrucksensoren im btcollector.

Falls der Tempomat auf dem Karosserie-CAN nicht auftaucht, liegt die Info nur im Motorsteuergerät.
Dann bekommen wir sie nur per KWP-Abfrage über die K-Line (Pin 7, z. B. mit einem L9637D). Das klären
wir dann separat.

## Quellen

- [danderik88/fiat-ducato-x250-wican](https://github.com/danderik88/fiat-ducato-x250-wican): entschlüsselte IDs des X250 (2009), K-Line fürs Motorsteuergerät
- [meatpiHQ/wican-fw#870](https://github.com/meatpiHQ/wican-fw/issues/870): Karosserie-CAN an Pin 1/9 mit 50 kbit/s bei neueren Ducato/ProMaster
- [AlfaOBD-Hilfe](https://www.alfaobd.com/androidhelp.html): B-CAN an Pin 1/9 bei manchen Ducato, ELM327 nur an Pin 6/14
- [Fiat Forum: B-CAN mitlesen mit ELM (`ATTPC`/`ATMA`)](https://www.fiatforum.com/threads/stilo-can-bus-question.174029/latest)
- [ESPHome `esp32_can`](https://esphome.io/components/canbus/esp32_can.html)
