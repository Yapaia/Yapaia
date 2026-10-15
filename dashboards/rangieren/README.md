# Dashboard „Rangieren“

Für Parkmanöver: links das Bild der Rückfahrkamera, rechts die Nivellierung
(Wohnmobil von der Seite und von hinten, kippt mit der Neigung), darunter
Licht Dinette und Aufbautür.

## Karten

**`custom:yapaia-nivellierung-card`** (`nivellierung-card.js`): Seiten- und
Heckansicht, Libelle und wie viele Millimeter man an welcher Seite anheben
muss. Werte kommen vom Heizungs-ESP (`sensor.heizung_neigung_vorne_hinten`,
`sensor.heizung_neigung_links_rechts`). Im grafischen Editor einstellbar:
Sensoren (Grad, optional mm), Vorzeichen umkehren, Radstand, Spurweite,
Toleranz und wie stark die Grafik die Neigung überhöht.
Positiv heißt „vorne höher“ bzw. „rechts höher“; kippt eine Ansicht verkehrt
herum, im Editor „umkehren“ anhaken.

**`custom:yapaia-kamera-card`** (`kamera-card.js`): Livebild einer
`camera.*`-Entität. Ohne Kamera (noch der Fall) steht ein Platzhalter da.
Im Editor: Kamera, Seitenverhältnis, Bild spiegeln, Platzhaltertext.

## Offen

- Welcher Ausgang des Smartwomo-ESP die Dinette schaltet, ist noch unbekannt;
  die Kachel zeigt vorerst auf `light.smartwomo_ausgang_out1`.
- Die Rückfahrkamera ist noch nicht in Home Assistant. Sobald es sie gibt, in
  der Kamerakarte die Entität eintragen.

## Einspielen

```sh
python3 dashboards/deploy.py --dashboard rangieren
```

Legt `/yapaia-rangieren` an (oder überschreibt dessen Konfiguration) und
kopiert die Karten nach `/config/www/yapaia-dashboards/`.
