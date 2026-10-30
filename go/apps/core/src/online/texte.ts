import { texte } from '../i18n.js';

/** Texte der Online-Dienste (Sprache folgt der Einstellung, siehe ../i18n.ts). */
export const T = texte(
  {
    // Ortsmerkmale (OSM)
    motorhomeYes: 'Wohnmobile erlaubt',
    motorhomeNo: 'Keine Wohnmobile',
    caravansYes: 'Wohnwagen erlaubt',
    capacity: '{v} Stellplätze',
    maxstay: 'Höchstdauer: {v}',
    power: 'Strom',
    drinkingWater: 'Trinkwasser',
    waterPoint: 'Frischwasser',
    dump: 'Entsorgung',
    toilets: 'Toiletten',
    shower: 'Duschen',
    wifi: 'WLAN',
    dogYes: 'Hunde erlaubt',
    dogNo: 'Keine Hunde',
    wheelchair: 'Rollstuhlgerecht',
    // Verkehrsurteil
    keineAutobahn: 'Keine Autobahn genannt — es wurde nichts abgefragt.',
    keineDaten:
      'Für {strassen} liegen KEINE Daten vor — dort kann etwas sein, das hier nicht steht.',
    zwischenspeicher:
      'Für {strassen} stammen die Daten aus dem Zwischenspeicher (bis zu {min} Minuten alt).',
    nichtsGemeldet: 'Aktuell ist nichts gemeldet.',
    meldungen: '{n} Meldung(en) auf der Strecke.',
    // Tankerkönig
    tkNetz: 'Tankerkönig nicht erreichbar: {grund}',
    tkFehler: 'Tankerkönig: {text}',
    unbekannterFehler: 'unbekannter Fehler',
    // Diagnose
    httpStatus:
      'Der Dienst antwortete mit {status}. Die Adresse lässt sich im Browser öffnen, dann steht dort meist der Grund.',
    keinJson:
      'Die Antwort kam an, war aber kein JSON. Häufigste Ursache: ein Portal im Netz (Hotspot, Gastzugang) schiebt eine Anmeldeseite dazwischen.',
    erhalten: 'Antwort erhalten.',
    zeitUeberschreitung:
      'Keine Antwort innerhalb von {ms} ms. Entweder ist gerade kein Netz da, oder der Dienst ist langsam.',
    verbindungFehlt: 'Die Verbindung kam nicht zustande: {grund}.',
    mehrdeutig:
      'Mehrdeutig: die Antwort führt mehrere Listen ({listen}). Yapaia rät hier NICHT — welche gemeint ist, muss im Quelltext eingetragen werden.',
    keineListe:
      'In der Antwort war überhaupt keine Liste zu finden. Der Aufbau ist ein anderer als angenommen.',
    listeLeer:
      'Liste unter „{key}" gefunden, sie ist leer. Das kann stimmen — auf einer Autobahn ohne Baustelle ist das der Normalfall.',
    listeUnbrauchbar:
      'Liste unter „{key}" mit {n} Einträgen — aber KEINER war brauchbar. Die Felder heißen anders als erwartet.',
    listeKopf: 'Liste unter „{key}": {n} Einträge',
    ohneTitel: 'davon {n} ohne Titel übersprungen',
    keineKoordinaten:
      'aber KEINER hat Koordinaten — auf die Karte kann davon nichts. Die Feldnamen stehen unten; dieser Dienst ist anders aufgebaut als die übrigen',
    teilsKoordinaten: '{n} ohne Koordinaten (nicht zeichenbar)',
    alleKoordinaten: 'alle mit Koordinaten',
    strassenliste: 'Autobahn — Straßenliste',
    nichtsGeprueft: 'Es wurde nichts geprüft.',
    keinDienst:
      'Kein einziger Dienst war erreichbar. Sehr wahrscheinlich ist gerade kein Internet da — für die Navigation ist das folgenlos, sie arbeitet offline.',
    urteilMitDaten:
      '{a} von {b} Diensten antworteten, und {c} davon lieferten Daten mit Koordinaten.',
    urteilNurText:
      '{satz} Bei {n} weiteren kamen Einträge an, denen die Koordinaten fehlen — die stehen im Text, aber nicht auf der Karte. Die Feldnamen dazu stehen in der jeweiligen Zeile.',
    urteilNichtsBrauchbar:
      '{a} von {b} Diensten antworteten. Listen wurden gefunden, aber es kamen keine brauchbaren Einträge — entweder ist gerade nichts gemeldet, oder die Felder heißen anders als erwartet.',
    urteilAufbau:
      '{a} von {b} Diensten antworteten, aber der Aufbau der Antworten ist ein anderer als angenommen. Die Einzelzeilen nennen die gefundenen Felder.',
    // Routen (Online-Status, Fehler)
    onAn: 'Online-Dienste sind eingeschaltet. Yapaia fragt sie nur ab, wenn Sie es anstoßen oder während einer Fahrt danach verlangt wird; die Navigation selbst arbeitet weiterhin offline.',
    onAus:
      'Online-Dienste sind ausgeschaltet. Yapaia verlässt damit nie das Haus. Einschalten in der Add-on-Konfiguration unter „online" → „enabled".',
    dienstAutobahn:
      'Baustellen, Sperrungen, Warnungen, Rastanlagen und LKW-Parkplätze auf Bundesautobahnen.',
    dienstOrt:
      'Infos zu einem angetippten Ort: Öffnungszeiten, Website, Telefon, Wikipedia-Auszug und Bilder. Hinaus gehen nur Koordinaten und Name dieses Ortes.',
    dienstTanken:
      'Aktuelle Spritpreise deutscher Tankstellen in der Tankstellensuche. Braucht einen kostenlosen Schlüssel von tankerkoenig.de; hinaus geht nur die auf etwa 5 km gerundete Gegend der gefundenen Tankstellen.',
    tankerAus:
      'Spritpreise brauchen eingeschaltete Online-Dienste und einen Tankerkönig-Schlüssel (Add-on-Konfiguration → „online").',
    onlineAus:
      'Die Online-Dienste sind ausgeschaltet. Einschalten in der Add-on-Konfiguration unter „online" → „enabled"; danach verlässt eine Anfrage das Haus.',
    zahlenAngeben: 'lat und lon (und rad) als Zahlen angeben.',
    positionUngueltig: 'lat/lon fehlen oder liegen außerhalb der Erde.',
  },
  {
    motorhomeYes: 'Motorhomes allowed',
    motorhomeNo: 'No motorhomes',
    caravansYes: 'Caravans allowed',
    capacity: '{v} pitches',
    maxstay: 'Maximum stay: {v}',
    power: 'Electricity',
    drinkingWater: 'Drinking water',
    waterPoint: 'Fresh water',
    dump: 'Waste disposal',
    toilets: 'Toilets',
    shower: 'Showers',
    wifi: 'Wi-Fi',
    dogYes: 'Dogs allowed',
    dogNo: 'No dogs',
    wheelchair: 'Wheelchair accessible',
    keineAutobahn: 'No motorway given — nothing was queried.',
    keineDaten:
      'There is NO data for {strassen} — there may be something there that is not listed here.',
    zwischenspeicher: 'Data for {strassen} comes from the cache (up to {min} minutes old).',
    nichtsGemeldet: 'Nothing is currently reported.',
    meldungen: '{n} report(s) along the route.',
    tkNetz: 'Tankerkönig unreachable: {grund}',
    tkFehler: 'Tankerkönig: {text}',
    unbekannterFehler: 'unknown error',
    httpStatus:
      'The service answered with {status}. Open the address in a browser — the reason is usually shown there.',
    keinJson:
      'A response arrived but it was not JSON. Most common cause: a portal on the network (hotspot, guest access) puts a login page in the way.',
    erhalten: 'Response received.',
    zeitUeberschreitung:
      'No response within {ms} ms. Either there is no network at the moment, or the service is slow.',
    verbindungFehlt: 'The connection could not be made: {grund}.',
    mehrdeutig:
      'Ambiguous: the response contains several lists ({listen}). Yapaia does NOT guess — which one is meant must be entered in the source code.',
    keineListe:
      'No list could be found in the response at all. The structure differs from what was assumed.',
    listeLeer:
      'List under "{key}" found, it is empty. That may be right — on a motorway without roadworks it is the normal case.',
    listeUnbrauchbar:
      'List under "{key}" with {n} entries — but NONE was usable. The fields are named differently than expected.',
    listeKopf: 'List under "{key}": {n} entries',
    ohneTitel: '{n} of them skipped for lacking a title',
    keineKoordinaten:
      'but NONE has coordinates — none of them can go on the map. The field names are listed below; this service is structured differently from the others',
    teilsKoordinaten: '{n} without coordinates (cannot be drawn)',
    alleKoordinaten: 'all with coordinates',
    strassenliste: 'Motorway — road list',
    nichtsGeprueft: 'Nothing was checked.',
    keinDienst:
      'Not a single service was reachable. Most likely there is no internet at the moment — this has no effect on navigation, which works offline.',
    urteilMitDaten:
      '{a} of {b} services answered, and {c} of them delivered data with coordinates.',
    urteilNurText:
      '{satz} For {n} more, entries arrived that lack coordinates — they are in the text but not on the map. The field names are given in the respective row.',
    urteilNichtsBrauchbar:
      '{a} of {b} services answered. Lists were found, but no usable entries came back — either nothing is reported at the moment, or the fields are named differently than expected.',
    urteilAufbau:
      '{a} of {b} services answered, but the structure of the responses differs from what was assumed. The individual rows list the fields found.',
    onAn: 'Online services are switched on. Yapaia only queries them when you trigger it or when one is requested during a journey; navigation itself still works offline.',
    onAus:
      'Online services are switched off. Yapaia therefore never leaves the house. Switch on in the add-on configuration under "online" → "enabled".',
    dienstAutobahn:
      'Roadworks, closures, warnings, service areas and lorry parks on federal motorways.',
    dienstOrt:
      'Information on a tapped place: opening hours, website, telephone, Wikipedia extract and pictures. Only the coordinates and name of that place leave the house.',
    dienstTanken:
      'Current fuel prices at German petrol stations in the fuel station search. Needs a free key from tankerkoenig.de; only the area of the stations found, rounded to about 5 km, leaves the house.',
    tankerAus:
      'Fuel prices need online services switched on and a Tankerkönig key (add-on configuration → "online").',
    onlineAus:
      'The online services are switched off. Switch on in the add-on configuration under "online" → "enabled"; after that a request leaves the house.',
    zahlenAngeben: 'Give lat and lon (and rad) as numbers.',
    positionUngueltig: 'lat/lon are missing or lie outside the Earth.',
  }
);
