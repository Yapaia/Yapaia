# Erste Schritte

> Eine vollständige Beschreibung aller Funktionen — auch der neueren wie
> Zwischenziele, Bildschirm-Wachhalten, das fertige HA-Dashboard und die
> Companion-App als Positionsquelle — steht im
> [User Manual](manual.md) (englisch). Diese Seite hier ist der schnelle
> Durchlauf für die erste Fahrt.

Diese Anleitung setzt eine erfolgreich abgeschlossene Installation voraus
(siehe [Installations-Guide](installation.md)) und führt einmal komplett
durch: Fahrzeugprofil anlegen → Ziel suchen → Route berechnen → Navigation
starten. Die Screenshots/UI-Beschreibungen orientieren sich am
Grundlayout aus `docs/06-ui-ux-guidelines.md` §1.

## 1. App öffnen

- **HA-Add-on:** über die Home-Assistant-Seitenleiste (Ingress).
- **Compose/Proxmox-LXC:** `http://<Host-IP>:8080/` im Browser.

Du landest im **Explore-Modus**: eine Karte, oben eine Suchleiste, unten ein
einziehbares Favoriten-Panel. Läuft noch kein GPS, zeigt der Positionspunkt
entweder gar nichts oder eine „ungenau"-Kennzeichnung — das ist normal ohne
angeschlossenen Empfänger (siehe unten, „Ohne echtes GPS testen").

## 2. Fahrzeugprofil anlegen

Ohne Profil nutzt die App ein generisches PKW-Profil — für ein Wohnmobil
solltest du zuerst ein eigenes Profil mit den echten Maßen anlegen, **bevor**
du die erste Route berechnest, damit Höhen-/Gewichts-/Breitenbeschränkungen
von Anfang an greifen.

1. **⚙ → 🚐 Fahrzeuge** öffnen.
2. **„+ Neues Profil"** wählen, Werte eintragen:
   - **Höhe** (1,0–4,5 m), **Breite** (1,5–3,0 m), **Länge** (3,0–20,0 m),
     **Gewicht** (1,0–40,0 t) — jeweils inklusive Dachlast/Antenne/Beladung,
     nicht nur die Herstellerangabe.
   - **Durchschnittsgeschwindigkeit** (40–130 km/h) — beeinflusst nur die
     ETA-Berechnung, nicht das Routing selbst.
   - **Vermeiden**: Autobahnen / Mautstraßen / Fähren / unbefestigte
     Straßen — je nach Vorliebe an- oder abwählen.
3. Speichern, dann das neue Profil **aktivieren** (falls es nicht automatisch
   das aktive wird — nur ein Profil ist gleichzeitig aktiv). Welches Fahrzeug
   für eine Route gilt, lässt sich auch direkt in der Routenansicht umstellen.

**Wichtig:** Lies bei einer Profil-Höhe über 2,7 m den eingeblendeten
Warnhinweis zu unvollständigen Kartendaten (siehe
[Troubleshooting W-08](troubleshooting.md#w-08--route-führt-an-einer-zu-engenniedrigen-stelle-vorbei-)) —
er erklärt eine echte, physische Grenze der Kartendaten, keine
Software-Unsicherheit.

## 3. Ziel suchen

1. In die Suchleiste tippen, z. B. `Vaduz` eingeben.
2. Aus der Trefferliste den gewünschten Ort wählen (Tippfehler-Toleranz ist
   eingebaut — auch `Müchen` findet in der Regel `München`).
3. Die App zeigt eine Vorschau: Ziel-Pin, Entfernung, grobe Fahrzeit.

## 4. Route berechnen

1. Auf „Route berechnen" (bzw. direkt auf das gewählte Suchergebnis) tippen.
2. Die App berechnet die Route **mit dem aktiven Fahrzeugprofil** — die
   Route respektiert die eingetragenen Maße (getestet u. a. gegen bekannte
   Unterführungen, siehe `docs/07-testing-qa.md` §3b „Maßrestriktionen").
3. Bei mehreren Alternativen: die erste vorgeschlagene ist die empfohlene.
4. Prüfe die Routenübersicht (Distanz, Dauer, ggf. Warnhinweise zu
   unvollständigen Kartendaten) **bevor** du losfährst.

## 5. Navigation starten

1. „Navigation starten" tippen — die App wechselt in den **Drive-Modus**
   (Kurs-oben-Karte, großes Manöver-Panel, Tempolimit-Anzeige, Bottom-Bar mit
   Tempo/ETA/Restdistanz/Höhe).
2. Sprachansagen beginnen automatisch (Browser-TTS bzw. HA-Media-Player, je
   nach Einstellung).
3. Während der Fahrt: die App reroutet automatisch bei Abweichungen
   (< 3 s, siehe [Troubleshooting W-05](troubleshooting.md#w-05--app-berechnet-nach-einer-abzweigung-automatisch-neu)),
   pausiert bei GPS-Verlust automatisch per Koppelnavigation
   ([W-01](troubleshooting.md#w-01--gps-signal-verloren-tunnel-parkhaus-abschattung))
   und meldet sich mit „Angekommen", sobald das Ziel erreicht ist.
4. Pausieren oder beenden: auf die Leiste mit der Ankunftszeit unten tippen —
   dort öffnet sich das Fahrtmenü mit **⏸ Pause** und **⏹ Stopp**.

## 6. Ohne echtes GPS testen (Simulator)

Für einen ersten Eindruck ohne angeschlossenes GPS-Gerät und ohne echte
Fahrt kann der eingebaute GPS-Simulator („Testfahrer") eine geplante Route
abfahren — jeden Abschnitt mit seinem Tempolimit.

1. **Nur im HA-Add-on:** den Testfahrer einmal freischalten —
   *Einstellungen → Add-ons → Yapaia Go → Konfiguration*, Gruppe
   **Erweitert**, **„Testfahrer freischalten"** einschalten, speichern, Add-on
   neu starten. (Im Add-on ist er absichtlich aus: er verdrängt den echten
   Empfänger.)
2. Eine Route planen (Abschnitte 3–4).
3. **⚙ → 🧪 Testfahrt** öffnen und **▶ Route abfahren** tippen. Mit dem
   Regler **Zeitraffer** (1× bis 32×) läuft die Fahrt schneller.

Danach den Haken im Add-on wieder entfernen; nach dem nächsten Neustart gilt
wieder die echte Positionsquelle. Für Skripte gibt es denselben Simulator als
API (`POST /api/v1/simulator/play`, siehe [`openapi.json`](openapi.json)), u. a.
mit GPX-Dateien und absichtlichen Falschabbiegungen für einen Rerouting-Test.

## 7. Favoriten & Widgets anpassen

- **Favorit anlegen:** in der Routenübersicht „⭐ Als Favorit speichern"
  wählen (Kategorien: Zuhause, Stellplatz, Sehenswürdigkeit, Sonstiges) —
  erscheint danach in der Favoritenleiste unten im Explore-Modus.
- **Bildschirm anpassen:** **⚙ → 🧱 Bildschirm anpassen** — Knöpfe und
  Fenster verschieben und vergrößern; **Zurücksetzen** stellt die
  Standardanordnung wieder her, **Fertig** beendet die Bearbeitung. Die
  Ansicht während der Navigation passt du im Fahrtmenü an.

## 8. Was diese Seite nicht behandelt

Seit 0.6.9 sind einige Dinge dazugekommen, die den ersten Durchlauf nicht
betreffen, aber im Alltag zählen. Alle ausführlich im
[User Manual](manual.md):

- **Zwischenziele** — mehrere Stationen in selbst gewählter Reihenfolge,
  auch während der Fahrt anhängbar.
- **„Da nicht lang"** — langer Druck auf die Routenlinie meidet diesen
  Abschnitt und rechnet neu.
- **Der Bildschirm bleibt an** — kein Antippen mehr an jeder Kreuzung.
  Auf manchen Geräten erst nach einer einmaligen Berührung.
- **Bediensperre ab 10 km/h** — Einstellungen, Editor und Profilbearbeitung
  sperren sich während der Fahrt.
- **Fertiges HA-Dashboard** — liegt unter `/local/yapaia/dashboard.txt`,
  fertig zum Einfügen in den Rohkonfigurationseditor.
- **Bedienen aus Home Assistant** — Pause/Weiter/Beenden, Profilwahl und
  Zieleingabe über das Gerät „Yapaia Go" der Integration „Yapaia".
- **Position aus der Companion-App** — auswählbar unter **⚙ → 🩺
  Installation prüfen**, gilt sofort.
- **Add-ons** — Erweiterungen aus dem Yapaia-Marktplatz unter
  **⚙ → 🧩 Add-on-Store**.
- **Links- oder rechtsgelenkt** — die Bedienknöpfe lassen sich spiegeln.

## Weiter

- Alle Funktionen im Detail? → [User Manual](manual.md) (englisch)
- Etwas funktioniert nicht wie erwartet? → [Troubleshooting](troubleshooting.md)
- Allgemeine Fragen? → [FAQ](faq.md)
- Add-ons installieren? → [User Manual → Add-ons](manual.md#add-ons) (englisch)
- Eigene Add-ons entwickeln? → [Add-on-Entwicklungsleitfaden](addon-dev-guide.md)
