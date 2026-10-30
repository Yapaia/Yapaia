import { texte } from '../i18n.js';

/** Texte der Installationsprüfung (preflight.ts): Urteile, Befunde, Handlungsanweisungen.
 *  Zitierte Beschriftungen müssen zu den Texten der Oberfläche passen
 *  (web/src/settings/regions/texte.ts, shell/texte.ts); preflight.test.ts prüft das für Deutsch. */
export const T = texte(
  {
    anf: '„{t}"',
    // Titel
    lblTiles: 'Kartenkacheln',
    lblRouting: 'Routing-Dienst (Valhalla)',
    lblSearch: 'Ortssuche',
    lblPosition: 'Positionsquelle',
    lblMemory: 'Arbeitsspeicher',
    lblDisk: 'Freier Speicherplatz',
    lblMqtt: 'MQTT (zusätzlich, optional)',
    // Geräte
    linkDead: '{pfad} (Verweis zeigt ins Leere)',
    // Kacheln
    tilesRemedy:
      'Für die mitgelieferten Regionen gibt es keine fertige Datei zum Herunterladen — ' +
      'die Kacheln werden aus OpenStreetMap-Daten gebaut. Das geht direkt hier: ' +
      '„Karten verwalten" (🗺️ rechts oben) öffnen und bei jeder gewünschten Karte auf ' +
      '„Herunterladen" drücken. Danach einmal „Fehlendes bauen": das baut alle ' +
      'heruntergeladenen Karten, das Routing über alle und die Suche in einem Lauf. ' +
      'Liechtenstein braucht Minuten, ein Bundesland wie Rheinland-Pfalz deutlich ' +
      'länger; der Fortschritt steht im Panel. ' +
      'Ganz Deutschland ist für dieses Gerät zu groß: auf einem anderen Rechner bauen und ' +
      'die fertige .pmtiles per „Samba share" nach /share/yapaia/tiles/ legen. ' +
      'Ausführlich: docs/installation.md §C.',
    tilesDirMissing: 'Das Kachelverzeichnis {dir} existiert nicht.',
    tilesPartial: 'Keine fertigen Kacheln in {dir}, aber {n} angefangene(r) Download(s) (.part).',
    tilesNone: 'Keine Kacheldatei (*.pmtiles) in {dir}.',
    tilesPartialRemedy:
      'Ein angefangener Download kann in der Oberfläche unter „Einstellungen → ' +
      'Kartenregionen" fortgesetzt werden — er beginnt nicht von vorn. ',
    tilesOk: '{n} Region(en) installiert: {liste}.',
    // Routing
    routingRemedy:
      'Valhalla läuft als Teil des Add-ons, braucht aber einen fertigen Routinggraphen; ' +
      'ohne ihn startet der Dienst nicht. Bauen Sie ihn mit dem Knopf „Routing bauen" ' +
      'im Regionen-Panel (🗺️ rechts oben) — bei einer kleinen Region dauert das Minuten. ' +
      'Der Dienst startet danach binnen 30 Sekunden von allein, ein Neustart des Add-ons ' +
      'ist nicht nötig. Ohne Graph funktionieren Karte, Position und Favoriten weiterhin — ' +
      'nur das Berechnen von Routen nicht. Ausführlich: docs/installation.md §C.',
    routingOk: 'Erreichbar unter {url}.',
    routingDown: 'Unter {url} antwortet nichts.',
    // Suche
    liteCount: '{n} Indizes in {dir}',
    searchBoth: 'Photon läuft ({url}), Lite-Index zusätzlich vorhanden ({groesse}).',
    searchPhoton: 'Photon läuft unter {url}.',
    searchLiteOnly:
      'Photon antwortet nicht, aber der Lite-Index ist da ({pfad}, {groesse}) — die Suche funktioniert darüber.',
    searchLiteNoPhoton:
      'Photon ist abgeschaltet; die Suche läuft über den Lite-Index ({pfad}, {groesse}).',
    searchNone: 'Weder Photon ({url}) noch ein Lite-Index ({pfad}) sind verfügbar.',
    searchNoneNoPhoton: 'Photon ist abgeschaltet und es gibt keinen Lite-Index ({pfad}).',
    searchRemedy:
      'Es gibt zwei Wege, und einer genügt. (1) Lite-Index (empfohlen auf einem ' +
      'Gerät mit 8 GB): braucht wenig Arbeitsspeicher und wird direkt hier ' +
      'gebaut — „Karten verwalten" (🗺️ rechts oben) öffnen und auf „Fehlendes bauen" ' +
      'drücken; das baut Routing und Suche für alle installierten Karten. ' +
      'Liechtenstein braucht Minuten, ein ' +
      'Bundesland länger; der Fortschritt steht im Panel. (2) Photon: in der ' +
      'Add-on-Konfiguration einschalten und den Index importieren; rechnen Sie mit ' +
      'mehreren GB RAM. Ohne beides bleibt die Adresssuche leer — Navigieren zu ' +
      'einem angetippten Punkt und zu Favoriten funktioniert trotzdem.',
    // Position
    trackersFound: 'Gefunden in Home Assistant: {liste}.',
    trackerSetup:
      'Home-Assistant-Companion-App auf dem Telefon/Tablet installieren, dort die ' +
      'Ortung („Standort senden") erlauben — Home Assistant legt dann automatisch ' +
      'eine `device_tracker`-Entität an.',
    gpsdUp: 'gpsd erreichbar unter {host}:{port}.',
    devicesFound: ' Gefunden wurden: {liste}.',
    devicesDeadLink:
      ' Ein Eintrag unter /dev/serial/by-id/ ist nur ein Verweis auf den eigentlichen' +
      ' Anschluss. Zeigt er ins Leere, ist der Name da und das Gerät nicht — dann hilft' +
      ' auch das Eintragen dieses Pfades nicht. Ziehen Sie den Empfänger ab und wieder an' +
      ' und starten Sie das Add-on neu; die Durchreichung wird beim Start des Containers' +
      ' festgelegt.',
    devicesNone:
      ' Im Container ist derzeit gar kein serielles Gerät sichtbar — der Empfänger steckt also nicht, oder die USB-Durchreichung des Supervisors greift nicht.',
    gpsdReason: 'Der gpsd-Dienst meldet: {grund} ',
    gpsdDownDetail: 'gpsd ist eingeschaltet, antwortet aber nicht unter {host}:{port}.',
    gpsdDownRemedy:
      'Prüfen Sie, ob der USB-GPS-Empfänger gesteckt ist und ob das Gerät in der ' +
      'Add-on-Konfiguration unter „USB-Gerät" eingetragen ist.',
    gpsdDownRemedy2:
      ' Der Pfad muss mit einem Schrägstrich beginnen (/dev/serial/by-id/…) — ' +
      'ohne ihn ist es ein relativer Pfad, der ins Leere zeigt. ' +
      'Nach jeder Änderung an dieser Option das Add-on NEU STARTEN: die Optionen ' +
      'werden beim Start des Containers gelesen, Speichern allein ändert nichts. ' +
      'Was der gpsd-Dienst dann tut, steht im Protokoll des Add-ons in einer Zeile, ' +
      'die mit „gpsd:" beginnt. ' +
      'Bitte den Pfad unter /dev/serial/by-id/ eintragen und nicht /dev/ttyACM0: ' +
      'die Nummer verschiebt sich, sobald ein anderer USB-Stick dazukommt. ' +
      'Haben Sie gar keinen USB-Empfänger, ist „usb" als Quelle ' +
      'schlicht die falsche Einstellung — stellen Sie sie auf „companion_app" ' +
      '(Position aus der Home-Assistant-Companion-App) oder auf „none" ' +
      '(Position aus dem Browser). Solange gpsd fehlt, kann Yapaia die Position ' +
      'weiterhin aus dem Browser beziehen — Telefon, Tablet oder Autoradio liefern ' +
      'sie über die Standortfreigabe der Seite (ADR-007: gpsd > Browser > ' +
      'Companion App > Simulator). Achtung: der Browser gibt den Standort nur über ' +
      'HTTPS frei.',
    rutOk:
      'Position vom GPS des RUT50-Routers, Modbus TCP unter {host}:{port} erreichbar. ' +
      'Ob der Router gerade Satelliten empfängt, zeigt die Liste der Positionsquellen.',
    rutDown:
      'Als Positionsquelle ist der RUT50-Router gewählt, aber unter {host}:{port} antwortet kein Modbus-TCP-Server.',
    rutRemedy:
      'Im Router (RutOS-Weboberfläche) unter Services → Modbus → Modbus TCP Server ' +
      'den Server einschalten (Port 502, Device ID 1) und den Zugriff aus dem LAN ' +
      'erlauben. Unter Services → GPS muss GPS eingeschaltet und eine GNSS-Antenne ' +
      'angeschlossen sein. Hat der Router nicht die Adresse 192.168.1.1, die richtige ' +
      'Adresse in der Add-on-Konfiguration unter „rut50_host" eintragen (z. B. ' +
      '„192.168.2.1" oder „192.168.2.1:502") und das Add-on neu starten. Solange der ' +
      'Router nicht antwortet, kann die Position weiterhin aus dem Browser kommen.',
    ownDetail:
      'Eingetragen ist „{id}" — das ist Yapaias EIGENER Fahrzeug-Tracker, ' +
      'also die Position, die diese Navigation selbst nach Home Assistant ' +
      'schreibt. Sie von dort als Eingabe zurückzulesen ergibt einen Kreis: ' +
      'es entsteht nirgends eine neue Position.',
    ownNoOther: 'Home Assistant kennt derzeit keinen anderen `device_tracker` mit Koordinaten. ',
    ownRemedy:
      ' Wählen Sie hier in dieser Prüfung das Gerät der Companion App aus ' +
      '(meist das eigene Telefon) — die Wahl gilt sofort. Seit 0.8.13 steht ' +
      'der eigene Fahrzeug-Tracker nicht mehr in dieser Auswahl.',
    missingDetail:
      'Die eingetragene Entität „{id}" liefert in Home Assistant keine ' +
      'Koordinaten — entweder gibt es sie nicht, oder sie meldet nur „zuhause"/' +
      '„nicht zuhause" (WLAN-Tracker) statt einer Position.',
    missingNone: 'Home Assistant kennt derzeit gar keinen `device_tracker` mit Koordinaten. ',
    missingRemedy:
      ' Wählen Sie das richtige Gerät hier in dieser Prüfung aus (Auswahlfeld ' +
      '„Gerät der Companion App") — die Wahl gilt sofort. Oder lassen Sie sie ' +
      'leer und setzen „gps_source" auf „companion_app", dann sucht Yapaia ' +
      'selbst, solange es genau einen Tracker gibt.',
    trackerOk:
      'Position aus der Home-Assistant-Entität „{id}" (Companion App). ' +
      'Ein Browser-Standort hat weiterhin Vorrang, wenn er verfügbar ist.',
    haDownDetail:
      'Als Positionsquelle ist die Home-Assistant-Companion-App gewählt, aber ' +
      'Home Assistant war nicht erreichbar — welche Tracker es gibt, ließ sich ' +
      'nicht feststellen.',
    haDownRemedy:
      'Das ist meist vorübergehend (Home Assistant startet gerade neu). Bleibt es ' +
      'so, prüfen Sie im Add-on-Protokoll die Zeilen mit „HA states request" und ' +
      'starten Sie das Add-on neu. Als Ausweichweg liefert der Browser die ' +
      'Position, sofern die Seite über HTTPS läuft.',
    autoOk:
      'Position aus der Home-Assistant-Entität „{id}" (Companion App) — ' +
      'automatisch gewählt, weil es genau eine mit Koordinaten gibt. ' +
      'Ein Browser-Standort hat weiterhin Vorrang, wenn er verfügbar ist.',
    noTrackerDetail:
      'Als Positionsquelle ist die Home-Assistant-Companion-App gewählt, aber Home ' +
      'Assistant kennt keine einzige `device_tracker`-Entität mit Koordinaten.',
    noTrackerRemedy:
      ' Ein Tracker, der nur „zuhause"/„nicht zuhause" per WLAN meldet, zählt ' +
      'hier nicht — er hat keine Koordinaten und taugt nicht zum Navigieren.',
    manyDetail:
      'Als Positionsquelle ist die Companion App gewählt, aber es gibt {n} ' +
      'Tracker mit Koordinaten. Yapaia rät nicht, welcher gemeint ist — der zweite ' +
      'könnte das Telefon einer anderen Person sein.',
    manyRemedy:
      ' Wählen Sie den richtigen direkt hier in dieser Prüfung aus — ' +
      'das Auswahlfeld „Gerät der Companion App" steht gleich darunter. Die Wahl ' +
      'gilt sofort, ohne Neustart des Add-ons. (Wer es lieber fest einträgt, kann ' +
      'stattdessen die Add-on-Option „ha_device_tracker" setzen.)',
    noGpsdSim:
      'Kein gpsd konfiguriert. Der Simulator ist eingeschaltet — das ist eine Testquelle, keine echte Position.',
    noGpsd: 'Kein gpsd konfiguriert. Die Position kommt vom Browser des jeweiligen Geräts.',
    noGpsdRemedy:
      'Wenn das so gewollt ist, ist nichts zu tun: erlauben Sie beim ersten Öffnen ' +
      'der Karte den Standortzugriff. Damit der Browser überhaupt fragt, muss die ' +
      'Seite über HTTPS erreichbar sein (bei Home-Assistant-Ingress ist das der Fall, ' +
      'sofern Home Assistant selbst über HTTPS läuft — läuft es über http://, gibt ' +
      'der Browser den Sensor NICHT frei, und daran kann Yapaia nichts ändern). ' +
      'Ohne HTTPS ist der Weg über die Home-Assistant-Companion-App der richtige: ' +
      'in der Add-on-Konfiguration die Quelle auf „companion_app" stellen. Gibt es ' +
      'genau eine `device_tracker`-Entität mit Koordinaten, sucht Yapaia sie selbst; ' +
      'gibt es mehrere, nennt diese Prüfung sie danach beim Namen, und Sie tragen die ' +
      'gewünschte unter „ha_device_tracker" ein. Für einen fest eingebauten ' +
      'USB-Empfänger stattdessen „gps_source" auf „usb" stellen.',
    // Speicher
    memOk: '{gb} insgesamt — genug für Photon neben Valhalla und Home Assistant.',
    memOkNoPhoton: '{gb} insgesamt; Photon ist abgeschaltet, die Suche läuft über den Lite-Index.',
    memWarn:
      '{gb} insgesamt, und Photon ist eingeschaltet. Photon belegt allein ' +
      'mehrere GB; daneben laufen noch Valhalla, der Core und Home Assistant selbst.',
    memRemedy:
      'Empfehlung für dieses Gerät: Photon in der Add-on-Konfiguration abschalten ' +
      '(„photon_enabled: false") und stattdessen den Lite-Suchindex verwenden. Der ' +
      'braucht ein Vielfaches weniger Speicher und deckt dieselbe Ortssuche ab ' +
      '(W-12). Wenn Photon bleiben soll, geben Sie der VM mehr RAM — sonst greift ' +
      'irgendwann der OOM-Killer, und zwar nicht unbedingt bei Photon.',
    // Platte
    diskUnknown: 'Freier Platz für {dir} nicht ermittelbar: {grund}',
    diskUnknownRemedy:
      'Prüfen Sie, ob das Datenverzeichnis des Add-ons vorhanden und beschreibbar ist. ' +
      'Bei einem frisch installierten Add-on legt der erste Start es an.',
    diskOk: '{gb} frei in {dir}.',
    diskLow: 'Nur {gb} frei in {dir}.',
    diskRemedy:
      'Für eine kleine Region (Liechtenstein, ~15 MB) reicht das. Für eine große ' +
      'Region wie Deutschland (~4,5 GB fertige Kacheln, beim Bau zeitweise deutlich ' +
      'mehr) nicht. Vergrößern Sie die Platte der VM, oder entfernen Sie nicht mehr ' +
      'benötigte Karten über „Karten verwalten" (🗺️ rechts oben).',
    // MQTT
    mqttOk:
      'Broker konfiguriert: {url}. Den laufenden Verbindungszustand meldet GET /api/v1/health.',
    mqttNone:
      'Kein MQTT-Broker — nicht nötig: Home Assistant bekommt alle Entitäten, Aktionen und ' +
      'Auslöser über die Integration „Yapaia" (Einstellungen → Geräte & Dienste → Yapaia Go).',
    // Gesamtergebnis
    sumFail:
      '{n} Voraussetzung(en) fehlen, ohne die nicht navigiert werden kann: {liste}. Jeder Punkt unten sagt, was zu tun ist.',
    sumWarn:
      'Navigieren ist möglich. {n} Punkt(e) sind eingeschränkt oder nicht eingerichtet: {liste}.',
    sumOk: 'Alle Voraussetzungen erfüllt.',
    crashed: 'Diese Prüfung konnte nicht ausgeführt werden: {grund}',
    crashedRemedy:
      'Das ist ein Fehler in der Prüfung selbst, nicht zwingend in Ihrer ' +
      'Installation. Bitte melden Sie ihn mit dem obigen Text als Issue.',
  },
  {
    anf: '"{t}"',
    lblTiles: 'Map tiles',
    lblRouting: 'Routing service (Valhalla)',
    lblSearch: 'Place search',
    lblPosition: 'Position source',
    lblMemory: 'Memory',
    lblDisk: 'Free disk space',
    lblMqtt: 'MQTT (additional, optional)',
    linkDead: '{pfad} (link points nowhere)',
    tilesRemedy:
      'There is no ready-made file to download for the bundled regions — ' +
      'the tiles are built from OpenStreetMap data. You can do that right here: ' +
      'open "Manage maps" (🗺️ top right) and press "Download" on every map you want. ' +
      'Then press "Build missing" once: it builds all downloaded maps, routing across ' +
      'all of them and search in a single run. ' +
      'Liechtenstein takes minutes, a federal state such as Rhineland-Palatinate ' +
      'much longer; progress is shown in the panel. ' +
      'All of Germany is too big for this device: build it on another computer and ' +
      'put the finished .pmtiles into /share/yapaia/tiles/ via "Samba share". ' +
      'Details: docs/installation.md §C.',
    tilesDirMissing: 'The tile directory {dir} does not exist.',
    tilesPartial: 'No finished tiles in {dir}, but {n} unfinished download(s) (.part).',
    tilesNone: 'No tile file (*.pmtiles) in {dir}.',
    tilesPartialRemedy:
      'An unfinished download can be resumed in the interface under "Manage maps" — ' +
      'it does not start from scratch. ',
    tilesOk: '{n} region(s) installed: {liste}.',
    routingRemedy:
      'Valhalla runs as part of the add-on but needs a finished routing graph; ' +
      'without it the service does not start. Build it with "Build missing" ' +
      'in the regions panel (🗺️ top right) — for a small region this takes minutes. ' +
      'The service then starts by itself within 30 seconds, no add-on restart ' +
      'is needed. Without a graph, the map, position and favourites keep working — ' +
      'only route calculation does not. Details: docs/installation.md §C.',
    routingOk: 'Reachable at {url}.',
    routingDown: 'Nothing answers at {url}.',
    liteCount: '{n} indexes in {dir}',
    searchBoth: 'Photon is running ({url}), lite index also present ({groesse}).',
    searchPhoton: 'Photon is running at {url}.',
    searchLiteOnly:
      'Photon is not answering, but the lite index is there ({pfad}, {groesse}) — search works through it.',
    searchLiteNoPhoton:
      'Photon is switched off; search runs on the lite index ({pfad}, {groesse}).',
    searchNone: 'Neither Photon ({url}) nor a lite index ({pfad}) is available.',
    searchNoneNoPhoton: 'Photon is switched off and there is no lite index ({pfad}).',
    searchRemedy:
      'There are two ways, and one is enough. (1) Lite index (recommended on a ' +
      'device with 8 GB): needs little memory and is built right here — ' +
      'open "Manage maps" (🗺️ top right) and press "Build missing"; ' +
      'that builds routing and search for all installed maps. ' +
      'Liechtenstein takes minutes, a federal state ' +
      'longer; progress is shown in the panel. (2) Photon: switch it on in the ' +
      'add-on configuration and import the index; expect several GB of RAM. ' +
      'Without either, address search stays empty — navigating to a tapped ' +
      'point and to favourites still works.',
    trackersFound: 'Found in Home Assistant: {liste}.',
    trackerSetup:
      'Install the Home Assistant Companion app on the phone/tablet and allow ' +
      'location tracking ("Send location") there — Home Assistant then creates ' +
      'a `device_tracker` entity automatically.',
    gpsdUp: 'gpsd reachable at {host}:{port}.',
    devicesFound: ' Found: {liste}.',
    devicesDeadLink:
      ' An entry under /dev/serial/by-id/ is only a link to the actual' +
      ' port. If it points nowhere, the name is there but the device is not — then' +
      ' entering this path does not help either. Unplug the receiver and plug it in again' +
      ' and restart the add-on; the passthrough is fixed when the container starts.',
    devicesNone:
      ' No serial device is visible in the container at all — so the receiver is not plugged in, or the Supervisor’s USB passthrough is not working.',
    gpsdReason: 'The gpsd service reports: {grund} ',
    gpsdDownDetail: 'gpsd is switched on but does not answer at {host}:{port}.',
    gpsdDownRemedy:
      'Check that the USB GPS receiver is plugged in and that the device is entered ' +
      'in the add-on configuration under "USB device".',
    gpsdDownRemedy2:
      ' The path must start with a slash (/dev/serial/by-id/…) — ' +
      'without it, it is a relative path that points nowhere. ' +
      'After every change to this option RESTART the add-on: the options ' +
      'are read when the container starts, saving alone changes nothing. ' +
      'What the gpsd service does then is shown in the add-on log on a line ' +
      'starting with "gpsd:". ' +
      'Please enter the path under /dev/serial/by-id/ and not /dev/ttyACM0: ' +
      'the number shifts as soon as another USB stick is added. ' +
      'If you have no USB receiver at all, "usb" as the source is ' +
      'simply the wrong setting — set it to "companion_app" ' +
      '(position from the Home Assistant Companion app) or to "none" ' +
      '(position from the browser). While gpsd is missing, Yapaia can still get the ' +
      'position from the browser — phone, tablet or car radio supply it ' +
      'through the page’s location permission (ADR-007: gpsd > browser > ' +
      'Companion app > simulator). Note: the browser only shares the location over ' +
      'HTTPS.',
    rutOk:
      'Position from the GPS of the RUT50 router, Modbus TCP reachable at {host}:{port}. ' +
      'Whether the router currently receives satellites is shown in the list of position sources.',
    rutDown:
      'The RUT50 router is selected as position source, but no Modbus TCP server answers at {host}:{port}.',
    rutRemedy:
      'In the router (RutOS web interface) under Services → Modbus → Modbus TCP Server ' +
      'switch the server on (port 502, device ID 1) and allow access from the LAN. ' +
      'Under Services → GPS, GPS must be switched on and a GNSS antenna ' +
      'connected. If the router does not have the address 192.168.1.1, enter the correct ' +
      'address in the add-on configuration under "rut50_host" (e.g. ' +
      '"192.168.2.1" or "192.168.2.1:502") and restart the add-on. As long as the ' +
      'router does not answer, the position can still come from the browser.',
    ownDetail:
      'Entered is "{id}" — that is Yapaia’s OWN vehicle tracker, ' +
      'i.e. the position this navigation itself writes to Home Assistant. ' +
      'Reading it back from there as input makes a loop: ' +
      'no new position arises anywhere.',
    ownNoOther: 'Home Assistant currently knows no other `device_tracker` with coordinates. ',
    ownRemedy:
      ' Choose the Companion app device here in this check ' +
      '(usually your own phone) — the choice applies immediately. Since 0.8.13 ' +
      'the own vehicle tracker is no longer in this selection.',
    missingDetail:
      'The entered entity "{id}" supplies no coordinates in Home Assistant — ' +
      'either it does not exist, or it only reports "home"/' +
      '"not home" (Wi-Fi tracker) instead of a position.',
    missingNone: 'Home Assistant currently knows no `device_tracker` with coordinates at all. ',
    missingRemedy:
      ' Choose the right device here in this check (selection field ' +
      '"Companion app device") — the choice applies immediately. Or leave it ' +
      'empty and set "gps_source" to "companion_app"; Yapaia then looks ' +
      'for it itself as long as there is exactly one tracker.',
    trackerOk:
      'Position from the Home Assistant entity "{id}" (Companion app). ' +
      'A browser location still takes precedence when available.',
    haDownDetail:
      'The Home Assistant Companion app is selected as position source, but ' +
      'Home Assistant was not reachable — which trackers exist could not ' +
      'be determined.',
    haDownRemedy:
      'This is usually temporary (Home Assistant is restarting). If it stays ' +
      'that way, check the add-on log for lines with "HA states request" and ' +
      'restart the add-on. As a fallback the browser supplies the ' +
      'position, provided the page runs over HTTPS.',
    autoOk:
      'Position from the Home Assistant entity "{id}" (Companion app) — ' +
      'chosen automatically because there is exactly one with coordinates. ' +
      'A browser location still takes precedence when available.',
    noTrackerDetail:
      'The Home Assistant Companion app is selected as position source, but Home ' +
      'Assistant knows no `device_tracker` entity with coordinates at all.',
    noTrackerRemedy:
      ' A tracker that only reports "home"/"not home" via Wi-Fi does not count ' +
      'here — it has no coordinates and is no use for navigating.',
    manyDetail:
      'The Companion app is selected as position source, but there are {n} ' +
      'trackers with coordinates. Yapaia does not guess which one is meant — the second ' +
      'could be someone else’s phone.',
    manyRemedy:
      ' Choose the right one directly here in this check — ' +
      'the "Companion app device" selection field is right below. The choice ' +
      'applies immediately, without restarting the add-on. (If you prefer to set it ' +
      'permanently, set the add-on option "ha_device_tracker" instead.)',
    noGpsdSim:
      'No gpsd configured. The simulator is switched on — that is a test source, not a real position.',
    noGpsd: 'No gpsd configured. The position comes from the browser of the respective device.',
    noGpsdRemedy:
      'If that is intended, there is nothing to do: allow location access the first time ' +
      'you open the map. For the browser to ask at all, the ' +
      'page must be reachable over HTTPS (with Home Assistant ingress it is, ' +
      'provided Home Assistant itself runs over HTTPS — if it runs over http://, ' +
      'the browser does NOT release the sensor, and Yapaia cannot change that). ' +
      'Without HTTPS, the route via the Home Assistant Companion app is the right one: ' +
      'set the source to "companion_app" in the add-on configuration. If there is ' +
      'exactly one `device_tracker` entity with coordinates, Yapaia finds it itself; ' +
      'if there are several, this check names them afterwards, and you enter the ' +
      'one you want under "ha_device_tracker". For a permanently installed ' +
      'USB receiver, set "gps_source" to "usb" instead.',
    memOk: '{gb} in total — enough for Photon alongside Valhalla and Home Assistant.',
    memOkNoPhoton: '{gb} in total; Photon is switched off, search runs on the lite index.',
    memWarn:
      '{gb} in total, and Photon is switched on. Photon alone takes ' +
      'several GB; Valhalla, the core and Home Assistant itself run alongside.',
    memRemedy:
      'Recommendation for this device: switch Photon off in the add-on configuration ' +
      '("photon_enabled: false") and use the lite search index instead. It ' +
      'needs far less memory and covers the same place search ' +
      '(W-12). If Photon is to stay, give the VM more RAM — otherwise ' +
      'sooner or later the OOM killer steps in, and not necessarily at Photon.',
    diskUnknown: 'Free space for {dir} could not be determined: {grund}',
    diskUnknownRemedy:
      'Check that the add-on’s data directory exists and is writable. ' +
      'On a freshly installed add-on, the first start creates it.',
    diskOk: '{gb} free in {dir}.',
    diskLow: 'Only {gb} free in {dir}.',
    diskRemedy:
      'That is enough for a small region (Liechtenstein, ~15 MB). For a large ' +
      'region such as Germany (~4.5 GB of finished tiles, temporarily much ' +
      'more during the build) it is not. Enlarge the VM’s disk, or remove maps ' +
      'you no longer need via "Manage maps" (🗺️ top right).',
    mqttOk:
      'Broker configured: {url}. The current connection state is reported by GET /api/v1/health.',
    mqttNone:
      'No MQTT broker — not needed: Home Assistant gets all entities, actions and ' +
      'triggers through the "Yapaia" integration (Settings → Devices & services → Yapaia Go).',
    sumFail:
      '{n} requirement(s) missing, without which navigation is not possible: {liste}. Each item below says what to do.',
    sumWarn: 'Navigation is possible. {n} item(s) are limited or not set up: {liste}.',
    sumOk: 'All requirements met.',
    crashed: 'This check could not be run: {grund}',
    crashedRemedy:
      'This is an error in the check itself, not necessarily in your ' +
      'installation. Please report it as an issue with the text above.',
  }
);
