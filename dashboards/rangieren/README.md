# Dashboard „Rangieren“

Für Parkmanöver: links das Bild der Rückfahrkamera, darunter der Reifendruck;
rechts die Nivellierung (Wohnmobil von der Seite und von hinten, kippt mit der
Neigung), darunter Licht Dinette (OUT2) und Aufbautür.

## Karten

**`custom:yapaia-nivellierung-card`** (`nivellierung-card.js`): Seiten- und
Heckansicht, Libelle und wie viele Millimeter man an welcher Seite anheben
muss. Werte kommen vom Heizungs-ESP (`sensor.heizung_neigung_vorne_hinten`,
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

## Kamera

- Die Rückfahrkamera kommt von Yapaia Vision (`camera.yapaia_vision_kamera_1`,
  hier NTSC 720x480, daher 3:2).

## Einspielen

```sh
python3 dashboards/deploy.py --dashboard rangieren
```

Legt `/yapaia-rangieren` an (oder überschreibt dessen Konfiguration) und
kopiert die Karten nach `/config/www/yapaia-dashboards/`.
