# Design-Schemata

Ein gemeinsames Aussehen für alle Yapaia-Oberflächen: Add-ons (Go, Beat,
Vision), Dashboards und Karten, später die ESPHome-Displays. Ein **Schema**
legt Farben, Schriften, Formen und etwas Deko fest – **nicht den Aufbau**
einer Seite. Die Go-Karte im Schema „Retro“ hat Retro-Farben, -Schrift und
-Knöpfe, aber keine Streifen quer über die Karte.

## Auswahl

Alles über die Integration „Yapaia“ (kommt mit jedem Add-on):

| Wo | Entität | Was |
|---|---|---|
| Gerät **Yapaia Design** | `select.yapaia_design_schema` | ein Schema für alles |
| Gerät **Yapaia Design** | `select.yapaia_design_ha_design` | Home Assistant selbst umfärben: **Nicht ändern** (Standard), „Wie gesamt“ oder ein bestimmtes Schema |
| Gerät eines Moduls (Go, Beat, Vision, Router) | `select.<gerät>_design` | eigenes Schema oder **Wie gesamt**; Attribut `gilt` = das geltende |

- Das Gerät „Yapaia Design“ legt die Integration beim ersten Start selbst an.
- **HA-Design** nur auf Wunsch: viele haben ihr eigenes Home-Assistant-Design.
  Gewählt schreibt die Integration `themes/yapaia.yaml` (ein Theme je Schema,
  „Yapaia Retro“ …), lädt die Themes neu und setzt das gewählte als Standard
  (hell und dunkel). Wer im eigenen Profil ein Theme gewählt hat, behält es.
  Zurück auf „Nicht ändern“ setzt nur die eigene Änderung zurück
  („default“). Lädt HA keine Themes aus `themes/`, kommt eine Meldung mit dem
  nötigen Eintrag (`frontend: themes: !include_dir_merge_named themes`).
- Gespeichert in `.storage/yapaia.design`.

## Schnittstelle für Oberflächen

Die Integration liefert unter `/yapaia_design/` aus:

| Datei | Inhalt |
|---|---|
| `schemata.json` | alle Schemata mit fertigen CSS-Variablen (`css`) |
| `yapaia-design.js` | Hilfe für Karten: `YapaiaDesign.waehle(hass, {wahl, quelle})`, `.anwenden(el, schema)`, `.optionen()` |
| `schriften/` | die Schriften (lokal, SIL OFL 1.1) und `schriften.css` |

- WebSocket `yapaia/design` (optional `modul: "<kennung>"`) → `gesamt`,
  `module`, `ha_design`, `schemata`, mit `modul` auch `gilt`.
  `yapaia/design/setzen` (nur Admin): `gesamt` bzw. `modul` + `schema` (`null` = wie gesamt).
- Ereignis `yapaia_design_geaendert` bei jeder Änderung.
- **Karten** haben die Option `design`: `auto` (Standard) oder eine Schema-ID.
  Bei `auto` gilt das Design des zugehörigen Moduls, sonst das Gesamt-Schema.
  `waehle()` liest das synchron aus `hass.states` (Attribut `gilt` der
  Modul-Auswahl, Zustand von `select.yapaia_design_schema`) – ändert sich eine
  Auswahl, zeichnet die Karte ohnehin neu. Jede Karte hat Rückfallfarben im
  CSS (`var(--y-akzent, #c9895b)`), sieht also ohne die Integration aus wie vorher.

  | Karte | folgt bei `auto` |
  |---|---|
  | Cockpit Sport | Modul Go (`select.yapaia_go_design`) |
  | Beat-Karte | Modul Beat; Schemata mit `deko.holz` → Holzgehäuse, sonst modern in Schemafarben; altes `style: retro/modern` gilt als feste Wahl |
  | WLAN | Modul Router |
  | Stellplatz Stil, Rangieren (Kamera, Nivellierung, Reifen) | Gesamt-Schema |
- **Add-on-Oberflächen** bekommen das geltende Schema über ihre Verbindung zur
  Integration (`POST /yapaia/v1/design`, [Protokoll §8a](integration-protokoll.md#8a-design)),
  merken es sich und reichen es an ihre Seite weiter (`GET api/design`); die
  setzt nur die CSS-Variablen auf `:root`. Beat und Vision ab 1.18.0 bzw. 0.3.0.

### CSS-Variablen

Jede Oberfläche benutzt nur diese Namen, nie feste Farben:

| Variable | Bedeutung |
|---|---|
| `--y-grund` | Seitenhintergrund |
| `--y-flaeche`, `--y-flaeche2` | Karten/Kacheln, zweite Ebene (Leisten, Seitenspalte) |
| `--y-rand` | Linien und Rahmen |
| `--y-text`, `--y-text-gedaempft` | Text, Nebentext |
| `--y-akzent`, `--y-akzent-text` | Hauptakzent (Knöpfe, aktive Elemente) und Text darauf |
| `--y-akzent2` | zweiter Akzent (Hervorhebung, „an“) |
| `--y-ok`, `--y-warnung`, `--y-fehler`, `--y-info` | Zustände |
| `--y-schrift-anzeige`, `--y-gewicht-anzeige` | Überschriften, große Zahlen |
| `--y-schrift-text`, `--y-gewicht-text` | Fließtext, Bedienelemente |
| `--y-schrift-zahlen`, `--y-gewicht-zahlen` | Messwerte |
| `--y-radius`, `--y-radius-klein` | Ecken großer bzw. kleiner Elemente |
| `--y-rand-breite`, `--y-schatten` | Rahmenstärke, Schatten |
| `--y-auf-akzent2` | lesbarer Text auf `akzent2` (abgeleitet) |
| `--y-seite`, `--y-seite-text` | Seitenspalte (`deko.seite`, sonst `flaeche2`) und Text darauf (abgeleitet) |
| `--y-grund-rgb`, `--y-flaeche-rgb`, `--y-flaeche2-rgb`, `--y-text-rgb`, `--y-akzent-rgb`, `--y-akzent-text-rgb`, `--y-seite-text-rgb` | „r, g, b“ für `rgba(var(--y-grund-rgb), .8)` – die WebView des Autoradios kennt kein `color-mix()` |
| optional: `--y-streifen-1…3`, `--y-lcd-grund/-text/-leuchten` | Deko, nur wenn das Schema sie hat |

Am Element setzt `anwenden` außerdem `data-y-schema="<id>"`,
`data-y-hell="true|false"` und `data-y-streifen`, `data-y-hoehenlinien`,
`data-y-holz`, `data-y-lcd` („true|false“, für Deko per CSS). Deko (Streifen, Höhenlinien, Holz) zeichnet eine
Oberfläche nur, wenn das Schema sie anbietet (`deko` in `schemata.json`).

## Die Schemata

| ID | Name | Herkunft |
|---|---|---|
| `sport` | Sport | Dashboard Cockpit Sport |
| `retro` | Retro | Stellplatz Stil „Retro“ (Standard) |
| `magazin` | Magazin | Stellplatz Stil „Magazin“ |
| `mix` | Mix | Stellplatz Stil „Mix“ |
| `beat-modern` | Beat Modern | Oberfläche von Yapaia Beat |
| `beat-retro` | Beat Retro | Beat-Karte „Retro“ (Holz & LCD) |

## Ein neues Schema anlegen

Kein Code nötig:

1. Eine vorhandene Datei in `design/schemata/` kopieren, z. B.
   `retro.json` → `wald.json`. Der Dateiname ist die ID (klein, a–z, 0–9, `-`).
2. `id`, `name`, `beschreibung`, `hell` und die Werte anpassen. Alle Farben in
   `farben` sind Pflicht (Liste oben), `#rrggbb`. Editoren mit JSON-Schema
   helfen über `design/schema.json`.
3. Neue Schrift? In `design/schriften_holen.py` unter `SCHRIFTEN` eintragen
   (nur Schriften mit freier Lizenz, z. B. Google Fonts/OFL) und das Skript
   ausführen; die Lizenzzeile in `…/design/www/schriften/OFL.txt` ergänzen.
   Sonst eine Systemschrift (`system-ui`) nehmen.
4. `python3 design/erzeugen.py` ausführen – schreibt `schemata.json` und die
   HA-Themes. Die CI prüft mit `--pruefen`, ob das Schema gültig ist und die
   erzeugten Dateien aktuell sind.
5. Kontrast prüfen: Text auf `grund` und `flaeche` mindestens 4,5 : 1,
   `akzent_text` auf `akzent` ebenso.
6. In der Tabelle oben eintragen, Integration-Version und CHANGELOG des
   bringenden Add-ons hochziehen (die Integration kommt mit den Add-ons).

### Felder einer Schema-Datei

```json
{
  "id": "retro", "name": "Retro", "beschreibung": "…", "hell": true,
  "farben": { "grund": "#F4ECDC", "flaeche": "…", "flaeche2": "…", "rand": "…", "text": "…",
              "text_gedaempft": "…", "akzent": "…", "akzent_text": "…", "akzent2": "…",
              "ok": "…", "warnung": "…", "fehler": "…", "info": "…" },
  "schrift": { "anzeige": { "familie": "Fraunces", "gewicht": 900 },
               "text": { "familie": "DM Sans", "gewicht": 400 },
               "zahlen": { "familie": "Fraunces", "gewicht": 900 },
               "ersatz": "Georgia, serif" },
  "form": { "radius": 32, "radius_klein": 16, "rand_breite": 2, "schatten": "none" },
  "deko": { "streifen": ["#3B2A20", "#C8551F", "#E3A72F"] }
}
```

`deko` ist frei erweiterbar; bekannt sind `streifen` (Farbliste), `seite`
(Farbe einer Seitenspalte), `hoehenlinien`, `holz` (true/false) und `lcd`
(`grund`, `text`, `leuchten`). Eine neue Deko-Art braucht Code in den
Oberflächen, die sie zeichnen sollen – unbekannte Einträge werden ignoriert.

## Stufen

1. ✅ Format, Schemata, Generator, HA-Themes, Doku, CI-Prüfung
2. ✅ Auswahl in der Integration (gesamt, je Modul, HA-Design)
3. ✅ Karten: Cockpit Sport, Stellplatz Stil, Rangieren, WLAN, Beat-Karte
4. Add-on-Oberflächen: ✅ Beat, ✅ Vision, Go (feste Tailwind-Farben auf Variablen umstellen)
5. ESPHome-Displays: der Generator gibt zusätzlich Farben/Schriften für ESPHome aus
