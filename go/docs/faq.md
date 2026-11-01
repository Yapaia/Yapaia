# FAQ

Kurze Antworten auf wiederkehrende Fragen. Für konkrete Fehlerbilder siehe
[Troubleshooting](troubleshooting.md) — dort steht Symptom → Ursache →
Lösung für jeden kritischen Fall.

**Braucht Yapaia Go eine Internetverbindung?**
Nein, im laufenden Betrieb nicht. Karten, Routing (Valhalla) und Suche
(Photon bzw. die eingebaute Lite-Suche) laufen vollständig offline, sobald
eine Kartenregion einmal heruntergeladen und der Routing-Graph gebaut wurde.
Internet wird nur für den Download bzw. das Update von Kartenregionen
gebraucht (siehe [Installations-Guide](installation.md) und das
[Runbook](data-update-runbook.md)) sowie für den Add-on-Marktplatz (ohne
Internet zeigt der Store den zuletzt geladenen Katalog). Zusätzlich lassen sich **Online-Dienste** einschalten
(Vorgabe aus): Baustellen und Sperrungen der Autobahn GmbH, Infos zu einem
angetippten Ort, Spritpreise über Tankerkönig. Die Navigation selbst bleibt
davon unabhängig. Details: [Manual](manual.md#optional-online-services).

**Welches GPS-Gerät wird empfohlen?**
Ein externer USB-GPS-Empfänger mit Fensterhalterung/Außenantenne
(u-blox-Chipsatz-basierte „GPS-Mäuse" sind verbreitet und günstig) statt
eines im Gehäuse verbauten Empfängers — deutlich zuverlässigerer Empfang im
Fahrzeug. Siehe [Installations-Guide → USB-GPS-Durchreichung](installation.md#usb-gps-durchreichung)
für die Einrichtung.

**Kann ich Yapaia Go ohne echtes GPS ausprobieren?**
Ja — der eingebaute GPS-Simulator kann jede berechnete Route (oder eine
GPX-Datei) mit einstellbarer Geschwindigkeit „abfahren". Siehe
[Erste Schritte → Abschnitt 6](erste-schritte.md#6-ohne-echtes-gps-testen-simulator).

**Warum weicht die Route manchmal von der „offensichtlich kürzesten" ab?**
Das aktive Fahrzeugprofil (Höhe/Breite/Länge/Gewicht, ggf. Autobahn-/Maut-/
Fähre-Vermeidung) schränkt die Routenwahl bewusst ein — eine für ein
3,5-t-Wohnmobil zulässige Straße kann für ein 7,5-t-Fahrzeug gesperrt sein.
Prüfe zuerst das aktive Profil (Fahrzeugwahl in der Routenansicht bzw.
**⚙ → 🚐 Fahrzeuge**), bevor du eine Route als „falsch" einordnest.

**Kann sich die App auf fehlende Kartendaten (z. B. eine fehlende
Höhenbeschränkung) verlassen?**
Nein — das ist eine bewusst offen kommunizierte Grenze, kein Software-Bug.
Nicht jede reale Unterführung/Brücke ist in OpenStreetMap mit einer
Maßangabe getaggt. Details und was zu tun ist:
[Troubleshooting: Route führt an einer zu engen/niedrigen Stelle vorbei](troubleshooting.md#w-08--route-führt-an-einer-zu-engenniedrigen-stelle-vorbei-).

**Was passiert, wenn während der Fahrt das GPS-Signal kurz weg ist (Tunnel,
Parkhaus)?**
Die App fährt bis zu 30 Sekunden per Koppelnavigation mit der letzten
bekannten Geschwindigkeit entlang der Route weiter, Sprachansagen laufen
normal weiter (wichtig für Tunnelabfahrten). Details:
[Troubleshooting: GPS-Signal verloren](troubleshooting.md#w-01--gps-signal-verloren-tunnel-parkhaus-abschattung).

**Was passiert, wenn der Browser-Tab abstürzt oder das Kiosk-Gerät während
der Fahrt neu startet?**
Nichts Schlimmes — der eigentliche Navigationszustand lebt im Core-Server,
nicht im Browser. Nach dem Neuladen ist die laufende Navigation innerhalb
weniger Sekunden automatisch wieder da. Details:
[Troubleshooting: Navigation scheint nach Tab-Crash/Neustart weg zu sein](troubleshooting.md#w-19--navigation-scheint-nach-tab-crashneustart-weg-zu-sein).

**Kann ich mehrere Geräte gleichzeitig nutzen (z. B. Tablet im Cockpit +
Handy zum Planen)?**
Ja, alle verbundenen Geräte sehen denselben Navigationszustand — der Core
(der Yapaia-Dienst) ist die alleinige Quelle der Wahrheit. Bei gleichzeitigen
widersprüchlichen Aktionen gilt die zuletzt ausgeführte.

**Ein Vorbehalt, wenn die Position aus dem Browser kommt:** alle Clients
melden an denselben Endpunkt, und es gewinnt der zuletzt eingetroffene Fix.
Im selben Fahrzeug ist das folgenlos — zwei Geräte melden dieselbe Position.
Steht ein Gerät aber woanders (das Telefon zu Hause, ein Browser-Tab in der
Wohnung), springt die angezeigte Position zwischen beiden Orten hin und her.
Wer mehrere Geräte nutzt, ist mit einem USB-Empfänger, dem Router-GPS oder der
Companion-App als Quelle besser bedient.

**Wie installiere/entferne ich ein Add-on sicher?**
Unter **⚙ → 🧩 Add-on-Store**. Add-ons kommen aus dem
**Yapaia-Marktplatz** (`https://addons.yapaia.cloud`): „Registry aktualisieren"
lädt den Katalog; für gekaufte Add-ons unter „Marktplatz" die Adresse
(`https://…`) und den Konto-Token eintragen und „Verbinden" tippen. Go
installiert nur Pakete, die der Marktplatz signiert hat — im Katalog mit
„✓ Geprüft" gekennzeichnet, sonst „Unsigniert". Vor dem Installieren zeigt Go
die angefragten Berechtigungen; bitte wirklich lesen. Kostenpflichtige
Add-ons brauchen eine Lizenz für diese Installation, die Go beim
Installieren holt („Lizenz aktivieren", falls das nicht klappt). Jedes Add-on
läuft in einer Sandbox mit Default-Deny für alles Nicht-Deklarierte und lässt
sich jederzeit sofort deaktivieren oder deinstallieren (Reiter „Updates").
Vom Marktplatz gesperrte Versionen schaltet Go selbst ab.

**Kann ich ein Add-on als Datei installieren?**
Ja, über „Add-on-Datei installieren" (`.tar.gz`, z. B. vom USB-Stick). Solche
Pakete sind nicht signiert und werden nur angenommen, wenn im Abschnitt
„Marktplatz" der **Entwicklermodus** eingeschaltet ist. Der Entwicklermodus
ist für eigene Add-ons und Tests gedacht — sonst ausgeschaltet lassen.
Details: [Manual → Add-ons](manual.md#add-ons),
[Troubleshooting: Add-on verhält sich verdächtig](troubleshooting.md#w-10--add-on-verhält-sich-verdächtig-)
und für Add-on-Autoren der
[Add-on-Entwicklungsleitfaden](addon-dev-guide.md).

**Überlebt ein Update meine Kartendaten und Einstellungen?**
Ja — alle Nutzdaten liegen bewusst außerhalb des jeweiligen Containers
(HA-Add-on: `/share/yapaia`; Compose: der Ordner `./data` neben der
`docker-compose.yml`)
und werden von einem Image-Update nicht angefasst; SQLite-Migrationen legen
zusätzlich automatisch eine Sicherungsdatei an. Vor größeren Updates trotzdem
ein Backup anlegen (siehe [Installations-Guide → B.5](installation.md#b5-backup-vor-einem-update)).
Sollte trotzdem etwas fehlen: [Troubleshooting: Nach einem Update fehlen Kartendaten oder Einstellungen](troubleshooting.md#w-16--nach-einem-update-fehlen-kartendaten-oder-einstellungen-).

**Wo finde ich die REST-API-Referenz für eigene Skripte/Add-ons?**
`docs/03-api-spec.md` für den erzählenden Überblick, und
[`docs/openapi.json`](openapi.json) für die maschinenlesbare, aus dem
tatsächlich laufenden Code generierte OpenAPI-3.1-Spezifikation (Details zur
Generierung: `apps/core/src/openapi/`). Für Add-on-Entwicklung speziell:
der [Add-on-Entwicklungsleitfaden](addon-dev-guide.md).

**Mein Tablet zeigt keine Position, obwohl GPS an ist.**
Sehr wahrscheinlich läuft dein Home Assistant über `http://` statt `https://`.
Browser geben die Standortbestimmung nur über eine gesicherte Verbindung
frei — das ist eine Regel des Browsers, die keine Einstellung in Yapaia
aushebeln kann. Der vorgesehene Weg dafür ist die **Home-Assistant-
Companion-App**: sie meldet an Home Assistant statt an den Browser und tut
das auch bei gesperrtem Bildschirm. Einrichtung: Add-on-Option `gps_source`
auf `companion_app`, dann in Yapaia **⚙ → 🩺 Installation prüfen**, dort die
Auswahlliste unter der Prüfliste
([Manual](manual.md#using-the-home-assistant-companion-app)).

**Der Bildschirm geht während der Fahrt aus.**
Yapaia hält ihn eigentlich wach. Manche Browser erlauben das aber erst,
nachdem der Bildschirm einmal berührt wurde — tippe zu Fahrtbeginn einmal
auf die Karte.

**Brauche ich MQTT für die Home-Assistant-Anbindung?**
Nein. Yapaia Go meldet sich bei der Integration „Yapaia" an (Gerät „Yapaia
Go", mit Entitäten, Aktionen und Auslösern). MQTT gibt es zusätzlich
(`mqtt_enabled`, Vorgabe aus). Details: [Manual](manual.md#home-assistant).

**Mein HA-Dashboard zeigt überall „Entität nicht gefunden".**
Öffne `/local/yapaia/dashboard.txt` im Browser und lies den **Kopf der
Datei**. Dort steht, was Yapaia beim Erzeugen vorgefunden hat. Die häufigste
Ursache: „Yapaia Go" ist in der Integration „Yapaia" noch nicht eingerichtet
(Einstellungen → Geräte & Dienste → „Yapaia Go wurde gefunden. Einrichten?"
bestätigen).

**Wie viel RAM brauche ich mindestens?**
Kommt stark auf Kartengröße und ob Photon-Suche aktiv ist an — für ein Land
etwa 2,4–2,9 GB für Yapaia allein, auf einer geteilten Home-Assistant-Maschine
sind 6 GB oder mehr sinnvoll (Tabelle: [README](../README.md#requirements)). Bei knappem RAM: Photon
deaktivieren (Add-on: Gruppe „Suche" → „Adresssuche mit Photon" aus;
Compose: `PHOTON_ENABLED=false`) —
Suche fällt automatisch auf einen deutlich schlankeren Offline-Index zurück
([Troubleshooting: Suche reagiert nicht mehr / vereinfachte Suche](troubleshooting.md#w-12--suche-reagiert-nicht-mehrvereinfachte-suche)).

**Gibt es Sprachbefehle?**
Ja, auf Deutsch und Englisch: 🎤 in der App oder Home Assistant Assist
(„Yapaia, fahre mich nach …"). Die Befehle werden offline verstanden, ohne KI.
Details: [Manual → Voice commands](manual.md#voice-commands).

**In welcher Sprache läuft Yapaia Go?**
Als Add-on folgt sie der Sprache von Home Assistant (Deutsch, sonst Englisch);
ohne Home Assistant wählst du sie im Einrichtungsassistenten. Die Sprache der Kartenbeschriftung ist eine eigene Wahl unter **⚙ → 🎨 Karte & Darstellung → Sprache der Labels**.
