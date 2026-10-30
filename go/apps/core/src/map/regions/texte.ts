import { texte } from '../../i18n.js';

/** Vom Kartenbau erzeugte Notizen und Fehlermeldungen (Anzeige im Karten-Panel).
 *  Zitierte Beschriftungen entsprechen web/src/settings/regions/texte.ts. */
export const T = texte(
  {
    // Varianten
    doneKacheln: 'Kacheln fertig eingewechselt.',
    doneGraph:
      'Routinggraph fertig eingewechselt. Der Dienst startet binnen 30 Sekunden von allein.',
    doneSuche: 'Suchindex fertig. Die Adresssuche ist ab sofort nutzbar — ohne Neustart.',
    nameKacheln: 'Der Kachelbau',
    nameGraph: 'Der Bau des Routinggraphen',
    nameSuche: 'Der Bau des Suchindex',
    // Zeiten, Größen
    stdMin: '{h} Std. {m} Min.',
    nurMin: '{m} Min.',
    nurStd: '{h} Std.',
    unterMinute: 'weniger als 1 Min.',
    kartendaten: 'Kartendaten werden geladen: {von} von {gesamt} ({prozent} %)',
    nochEtwa: ', noch etwa {zeit}',
    // Bau
    keinExtraktPbf:
      'Für die Region "{id}" ist kein OSM-Extrakt hinterlegt (pbfUrl). Ohne Quelle lässt sich nichts bauen.',
    bauStart: 'Bau wird gestartet…',
    bauStartFehler: 'Der Bau konnte nicht gestartet werden: {grund}',
    bauStartWerkzeug:
      'Der Bau konnte nicht gestartet werden: {grund}. Erwartet wurde das Werkzeug {werkzeug} — es gehört zum Add-on-Image.',
    pausiert: 'Pausiert – System ausgelastet ({grund}). Geht von selbst weiter.',
    lastNormal: 'Last wieder normal – Bau geht weiter…',
    ueberlastet:
      '{name} wurde abgebrochen, um das System zu schützen: {grund}. ' +
      'Der bisherige Stand ist unverändert. Große Regionen besser auf einem Rechner ' +
      'mit mehr Arbeitsspeicher bauen und die fertigen Dateien einspielen.',
    codeUnbekannt: 'unbekannt',
    bauFehlgeschlagen:
      '{name} ist mit Code {code} fehlgeschlagen. {zuletzt}' +
      'Die vollständige Ausgabe steht im Add-on-Protokoll (Zeilen mit „[{prefix} {id}]"). Der bisherige Stand ist unverändert.',
    zuletzt: 'Zuletzt: „{zeile}". ',
    abbruch:
      'Bau abgebrochen. Die bisherige Kartendatei ist unverändert — das Skript ' +
      'wechselt erst nach vollständiger Prüfung ein (W-17).',
    // Lastwächter
    nurNochRam: 'nur noch {gb} Arbeitsspeicher frei',
    ramKnapp: 'Arbeitsspeicher über 10 Minuten knapp ({gb} frei)',
    cpu: 'CPU {p} %, ',
    ramFrei: '{cpu}{gb} Arbeitsspeicher frei',
    // Gesamtbau
    keineKarte:
      'Es ist keine Karte installiert. Es gibt also nichts zu bauen — installiere zuerst eine Karte.',
    allesAktuell: 'Alles aktuell — es gab nichts zu bauen.',
    uebersprungen: 'Übersprungen: für „{region}" ist keine OpenStreetMap-Quelle hinterlegt.',
    achtungRouting:
      ' ACHTUNG: im Routing fehlt {fehlt} — der OSM-Extrakt war nicht zu laden. ' +
      'Dorthin lässt sich nicht routen. Erneut „Bauen" versuchen; das Add-on-Protokoll nennt den Grund.',
    schrittFehler: 'Schritt {n} von {m} ({text}) ist fehlgeschlagen. {meldung}',
    gebaut: 'Gebaut: {text}.',
    und: '{liste} und {letztes}',
    teilKarte: 'Karte {region}',
    teilKarten: '{n} Karten',
    teilRouting: 'Routing',
    teilRoutingN: 'Routing über {n} Karten',
    teilSucheN: 'Suche für {n} Karten',
    teilSuche: 'Suche für {liste}',
    schrittRouting: 'Routing bauen ({region})',
    schrittRoutingN: 'Routing bauen ({n} Karten)',
    schrittKarte: 'Karte bauen ({region})',
    schrittSuche: 'Suche bauen ({region})',
    // Extrakt
    keinExtrakt: 'Für die Region "{id}" ist kein OSM-Extrakt hinterlegt.',
    lagerFehler: 'Das Zwischenlager {pfad} ließ sich nicht anlegen: {grund}',
    downloadAbbruch: 'Download abgebrochen',
    extraktLadeFehler:
      'Der OSM-Extrakt ließ sich nicht laden ({grund}). Erneut „Herunterladen" setzt dort fort, wo es abbrach.',
    keinOsm:
      'Das Heruntergeladene ist kein OSM-Extrakt (Kopfkennung „OSMHeader" fehlt) und wurde ' +
      'verworfen. Häufigste Ursache: der Server lieferte eine Fehlerseite statt der Datei.',
    ablegenFehler: 'Der fertige Extrakt ließ sich nicht ablegen: {grund}',
    extraktGeladen:
      'Heruntergeladen. Gebaut wird mit „Fehlendes bauen", zusammen mit den anderen Karten.',
    // Abdeckung
    abdGraph: 'Der neue Routinggraph enthält: {liste}.',
    abdVerliert:
      'Verloren geht das Routing für: {liste} — es ist derzeit im Graphen, aber es liegt kein OSM-Extrakt mehr dafür bereit.',
    abdOhne:
      'Ohne Routing bleiben diese installierten Karten: {liste}. ' +
      'Eine installierte Karte enthält keine Straßendaten für die Routenberechnung — ' +
      'dafür muss für jede Region einmal „Routing bauen" gedrückt werden. Der Graph ' +
      'sammelt danach alles ein, was schon da ist.',
    abdAlle: 'Alle installierten Karten sind damit abgedeckt.',
    // Restzeit
    gleichFertig: 'gleich fertig',
    restEtwa: 'noch etwa {zeit}',
    restMindestens: 'mindestens noch {zeit} (ein Schritt läuft zum ersten Mal)',
    laenger: 'dauert länger als beim letzten Mal',
    laengerDanach: 'dauert länger als beim letzten Mal, danach noch etwa {zeit}',
    // Kartenserver
    ksNote: 'Vom Kartenserver, gebaut am {datum}: {teile}.',
    ksNoteRouting:
      ' Stammt das Routing aus demselben Bau wie das vorhandene, kommt es dazu; sonst ersetzt es den bisherigen Graphen.',
    ksUnbekannt: 'unbekannt',
    ksKarte: 'Karte',
    ksSuche: 'Suche',
    ksSucheIndex: 'Suchindex',
    ksRouting: 'Routing',
    ksLaedt: '{was} wird geladen …',
    ksEntpackt: '{was} wird entpackt …',
    ksInstalliert: 'Wird installiert …',
    ksFertig: 'Installiert: {liste}',
    ksErgaenzt: ' (Routing zum vorhandenen hinzugefügt)',
    ksVerloren:
      '. Das Routing für {liste} stammte aus einem anderen Bau und ist ersetzt worden – dafür die Pakete dieser Länder erneut laden.',
    ksAbgebrochen: 'Abgebrochen',
    ksNichtErreichbar: 'Kartenserver nicht erreichbar ({grund})',
    ksToken: 'Der Kartenserver hat das Token abgelehnt',
    ksHttp: 'Kartenserver antwortet mit HTTP {status}',
    ksValhallaAlt:
      'Dieses Routing braucht Valhalla {paket}, hier läuft {eigene} – bitte Yapaia Go aktualisieren.',
    ksPruefsumme: 'Prüfsumme stimmt nicht ({name})',
    // Routen
    nichtVerfuegbar: 'Einstellungen nicht verfügbar',
    adresseUngueltig: 'Bitte die Adresse mit http:// oder https:// angeben',
    paketLaeuft: 'Es wird schon ein Paket vom Kartenserver geladen',
    bauKachel:
      'Es läuft bereits ein Kachelbau. Zwei Bauten gleichzeitig sind nicht ' +
      'möglich, weil beide dieselben Basisdaten verwenden — der zweite würde ' +
      'auf halb geladene Dateien treffen. Warten Sie das Ende ab oder brechen ' +
      'Sie den laufenden Bau ab.',
    bauSchwer:
      'Es läuft bereits ein Bau. Zwei schwere Bauten gleichzeitig überlasten ' +
      'das Gerät — warten Sie das Ende ab oder brechen Sie den laufenden Bau ab.',
    platzKachel:
      'Nicht genug freier Speicherplatz für den Kachelbau. Der Bau braucht neben ' +
      'der fertigen Datei auch Platz für das Zwischenergebnis.',
    ramKachel:
      'Zu wenig freier Arbeitsspeicher für den Kachelbau. Schalten Sie Photon in ' +
      'der Add-on-Konfiguration ab („photon_enabled: false") und versuchen Sie es ' +
      'erneut — das ist auf einem Gerät mit 8 GB ohnehin die empfohlene ' +
      'Einstellung (W-12).',
    ramGraph:
      'Zu wenig freier Arbeitsspeicher für den Bau des Routinggraphen. Schalten ' +
      'Sie Photon in der Add-on-Konfiguration ab („photon_enabled: false") und ' +
      'versuchen Sie es erneut.',
    ramSuche:
      'Zu wenig freier Arbeitsspeicher für den Bau des Suchindex. Schalten ' +
      'Sie Photon in der Add-on-Konfiguration ab („photon_enabled: false") und ' +
      'versuchen Sie es erneut.',
    ramGesamt:
      'Zu wenig freier Arbeitsspeicher für den Bau. Schalten Sie Photon in ' +
      'der Add-on-Konfiguration ab („photon_enabled: false") und versuchen ' +
      'Sie es erneut.',
    platzKarte:
      'Nicht genug freier Speicherplatz für den Kartenbau. Der Bau braucht neben ' +
      'der fertigen Datei auch Platz für das Zwischenergebnis.',
    platzExtrakt: 'Nicht genug freier Speicherplatz für den OSM-Extrakt.',
    keineQuelle: "Für die Region '{id}' ist kein OSM-Extrakt hinterlegt (pbfUrl).",
    schonGeladen: "Region '{id}' ist bereits heruntergeladen",
    schonGebaut: "Region '{id}' ist gebaut — zum Entfernen die Karte löschen.",
    nichtsEntfernt: 'Während eines Baus wird nichts entfernt.',
    keineKarteGesamt:
      'Es ist keine Karte installiert oder heruntergeladen. Lade zuerst eine Karte ' +
      'herunter — ohne Karte gibt es nichts zu bauen.',
    bauVerwendet:
      'Es läuft gerade ein Bau, der die Daten dieser Karte verwenden kann. ' +
      'Warten Sie das Ende ab oder brechen Sie den laufenden Bau ab.',
    extraktWarten: 'Es läuft gerade ein Bau. Bitte dessen Ende abwarten und dann herunterladen.',
  },
  {
    doneKacheln: 'Tiles switched in.',
    doneGraph: 'Routing graph switched in. The service starts by itself within 30 seconds.',
    doneSuche: 'Search index finished. Address search is usable right away — no restart needed.',
    nameKacheln: 'The tile build',
    nameGraph: 'The routing graph build',
    nameSuche: 'The search index build',
    stdMin: '{h} h {m} min',
    nurMin: '{m} min',
    nurStd: '{h} h',
    unterMinute: 'less than 1 min',
    kartendaten: 'Downloading map data: {von} of {gesamt} ({prozent} %)',
    nochEtwa: ', about {zeit} left',
    keinExtraktPbf:
      'No OSM extract is stored for region "{id}" (pbfUrl). Without a source nothing can be built.',
    bauStart: 'Starting build…',
    bauStartFehler: 'The build could not be started: {grund}',
    bauStartWerkzeug:
      'The build could not be started: {grund}. The tool {werkzeug} was expected — it is part of the add-on image.',
    pausiert: 'Paused – system busy ({grund}). Continues by itself.',
    lastNormal: 'Load back to normal – build continues…',
    ueberlastet:
      '{name} was aborted to protect the system: {grund}. ' +
      'The previous state is unchanged. Better build large regions on a computer ' +
      'with more memory and import the finished files.',
    codeUnbekannt: 'unknown',
    bauFehlgeschlagen:
      '{name} failed with code {code}. {zuletzt}' +
      'The full output is in the add-on log (lines with "[{prefix} {id}]"). The previous state is unchanged.',
    zuletzt: 'Last line: "{zeile}". ',
    abbruch:
      'Build cancelled. The existing map file is unchanged — the script ' +
      'only switches over after a complete check (W-17).',
    nurNochRam: 'only {gb} of memory left',
    ramKnapp: 'Memory tight for over 10 minutes ({gb} free)',
    cpu: 'CPU {p} %, ',
    ramFrei: '{cpu}{gb} of memory free',
    keineKarte: 'No map is installed, so there is nothing to build — install a map first.',
    allesAktuell: 'Everything is up to date — there was nothing to build.',
    uebersprungen: 'Skipped: no OpenStreetMap source is stored for "{region}".',
    achtungRouting:
      ' WARNING: routing is missing {fehlt} — the OSM extract could not be loaded. ' +
      'Routing there is not possible. Try "Build" again; the add-on log gives the reason.',
    schrittFehler: 'Step {n} of {m} ({text}) failed. {meldung}',
    gebaut: 'Built: {text}.',
    und: '{liste} and {letztes}',
    teilKarte: 'map {region}',
    teilKarten: '{n} maps',
    teilRouting: 'routing',
    teilRoutingN: 'routing across {n} maps',
    teilSucheN: 'search for {n} maps',
    teilSuche: 'search for {liste}',
    schrittRouting: 'Build routing ({region})',
    schrittRoutingN: 'Build routing ({n} maps)',
    schrittKarte: 'Build map ({region})',
    schrittSuche: 'Build search ({region})',
    keinExtrakt: 'No OSM extract is stored for region "{id}".',
    lagerFehler: 'The staging area {pfad} could not be created: {grund}',
    downloadAbbruch: 'Download cancelled',
    extraktLadeFehler:
      'The OSM extract could not be downloaded ({grund}). Pressing "Download" again resumes where it stopped.',
    keinOsm:
      'The downloaded file is not an OSM extract (header marker "OSMHeader" missing) and was ' +
      'discarded. Most common cause: the server returned an error page instead of the file.',
    ablegenFehler: 'The finished extract could not be stored: {grund}',
    extraktGeladen: 'Downloaded. It is built with "Build missing", together with the other maps.',
    abdGraph: 'The new routing graph contains: {liste}.',
    abdVerliert:
      'Routing will be lost for: {liste} — it is in the graph at the moment, but no OSM extract is available for it any more.',
    abdOhne:
      'These installed maps stay without routing: {liste}. ' +
      'An installed map contains no road data for route calculation — ' +
      'for that, "Build routing" has to be pressed once for each region. The graph ' +
      'then collects everything that is already there.',
    abdAlle: 'All installed maps are covered.',
    gleichFertig: 'almost done',
    restEtwa: 'about {zeit} left',
    restMindestens: 'at least {zeit} left (one step runs for the first time)',
    laenger: 'taking longer than last time',
    laengerDanach: 'taking longer than last time, then about {zeit} left',
    ksNote: 'From the map server, built on {datum}: {teile}.',
    ksNoteRouting:
      ' If the routing comes from the same build as the existing one, it is added; otherwise it replaces the current graph.',
    ksUnbekannt: 'unknown',
    ksKarte: 'Map',
    ksSuche: 'Search',
    ksSucheIndex: 'Search index',
    ksRouting: 'Routing',
    ksLaedt: '{was}: downloading …',
    ksEntpackt: '{was}: unpacking …',
    ksInstalliert: 'Installing …',
    ksFertig: 'Installed: {liste}',
    ksErgaenzt: ' (routing added to the existing one)',
    ksVerloren:
      '. The routing for {liste} came from a different build and has been replaced – load the packages of those countries again.',
    ksAbgebrochen: 'Cancelled',
    ksNichtErreichbar: 'Map server not reachable ({grund})',
    ksToken: 'The map server rejected the token',
    ksHttp: 'Map server answers with HTTP {status}',
    ksValhallaAlt:
      'This routing needs Valhalla {paket}, but {eigene} is running here – please update Yapaia Go.',
    ksPruefsumme: 'Checksum does not match ({name})',
    nichtVerfuegbar: 'Settings not available',
    adresseUngueltig: 'Please enter the address with http:// or https://',
    paketLaeuft: 'A package is already being downloaded from the map server',
    bauKachel:
      'A tile build is already running. Two builds at the same time are not ' +
      'possible because both use the same base data — the second would ' +
      'run into half-downloaded files. Wait for it to finish or cancel ' +
      'the running build.',
    bauSchwer:
      'A build is already running. Two heavy builds at the same time overload ' +
      'the device — wait for it to finish or cancel the running build.',
    platzKachel:
      'Not enough free disk space for the tile build. Besides the finished file, the build also needs ' +
      'room for the intermediate result.',
    ramKachel:
      'Not enough free memory for the tile build. Switch Photon off in ' +
      'the add-on configuration ("photon_enabled: false") and try again ' +
      '— on a device with 8 GB that is the recommended setting anyway ' +
      '(W-12).',
    ramGraph:
      'Not enough free memory to build the routing graph. Switch ' +
      'Photon off in the add-on configuration ("photon_enabled: false") and ' +
      'try again.',
    ramSuche:
      'Not enough free memory to build the search index. Switch ' +
      'Photon off in the add-on configuration ("photon_enabled: false") and ' +
      'try again.',
    ramGesamt:
      'Not enough free memory for the build. Switch Photon off in ' +
      'the add-on configuration ("photon_enabled: false") and try ' +
      'again.',
    platzKarte:
      'Not enough free disk space for the map build. Besides the finished file, the build also needs ' +
      'room for the intermediate result.',
    platzExtrakt: 'Not enough free disk space for the OSM extract.',
    keineQuelle: "No OSM extract is stored for region '{id}' (pbfUrl).",
    schonGeladen: "Region '{id}' has already been downloaded",
    schonGebaut: "Region '{id}' is built — delete the map to remove it.",
    nichtsEntfernt: 'Nothing is removed while a build is running.',
    keineKarteGesamt:
      'No map is installed or downloaded. Download a map first ' +
      '— without a map there is nothing to build.',
    bauVerwendet:
      'A build is running that may use the data of this map. ' +
      'Wait for it to finish or cancel the running build.',
    extraktWarten: 'A build is running. Please wait for it to finish, then download.',
  }
);
