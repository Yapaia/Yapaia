import { texte } from '../i18n.js';

/** Meldungen der Home-Assistant-Anbindung (Ansage-Prüfung, Sprachsteuerung einrichten, Befehlskanal). */
export const T = texte(
  {
    testAnsage: 'Das ist eine Testansage von Yapaia.',
    keineVerbindung: 'Keine Verbindung zu Home Assistant.',
    keineVerbindungAddon: 'Keine Verbindung zu Home Assistant (nur im Add-on verfügbar).',
    haKeineAntwort: 'Home Assistant hat nicht geantwortet.',
    haKeineSpracheHttp: 'Home Assistant lieferte keine Sprache (HTTP {status}).',
    haKeineSprache: 'Home Assistant lieferte keine Sprache.',
    keinLautsprecher: 'Kein Lautsprecher für Ansagen gewählt.',
    keinTts: 'In Home Assistant ist keine Sprachausgabe (TTS) eingerichtet.',
    ansageGing: 'Die Ansage ging an {ziel} (Stimme {stimme}).',
    ansageAbgelehnt: '{ziel} hat die Ansage nicht angenommen (Stimme {stimme})',
    mitFehler: ': {fehler}',
    mitHttp: ' (HTTP {status}).',
    punkt: '.',
    keinText: 'Kein Text.',
    radioAus: 'Ansagen ins Radio sind ausgeschaltet.',
    keinBeatModul:
      'Kein Yapaia-Modul meldet die Fähigkeit „ansage.einmischen“ – Yapaia Beat ist nicht eingerichtet.',
    beatFehlt:
      'Yapaia Beat ist in Home Assistant nicht eingerichtet (media_player.yapaia_beat fehlt).',
    beatSpieltNicht: 'Yapaia Beat spielt gerade nicht.',
    aktionFehlt:
      'Die Aktion yapaia.beat_ansage fehlt: Yapaia Beat auf 1.14 oder neuer aktualisieren und Home Assistant neu starten.',
    ttsDauer: ' Die Sprache zu erzeugen dauerte {s} s.',
    beatGemischt: 'Yapaia Beat hat die Ansage ins Radio gemischt.{dauer}',
    beatFehler: 'Yapaia Beat: {fehler}',
    aktionUnbekannt:
      'Home Assistant kennt die Aktion yapaia.beat_ansage nicht: Home Assistant neu starten.',
    beatNichtGesprochen: 'Yapaia Beat konnte die Ansage nicht sprechen',
    beatNichtGesprochenHttp: ' (HTTP {status})',
    beatNichtGesprochenEnde:
      '. Häufigster Grund: in Home Assistant ist keine Sprachausgabe (TTS) eingerichtet. Details stehen im Protokoll von Home Assistant.',
    // Sprachsteuerung einrichten
    keineAutomation: 'Home Assistant erlaubt Yapaia nicht, Automationen anzulegen.',
    automationAbgelehnt: 'Home Assistant lehnte die Automation ab (HTTP {status}).',
    haNichtErreichbar: 'Home Assistant nicht erreichbar: {grund}',
    integrationFehlt:
      'Die Integration „Yapaia" ist noch nicht mit Yapaia Go verbunden – ohne sie gibt es yapaia.go_befehl nicht. ' +
      'Einstellungen → Geräte & Dienste → „Yapaia Go“ einrichten.',
    // Befehlskanal
    wsZeit: 'Home Assistant hat nicht rechtzeitig geantwortet.',
    wsNichtErreichbar: 'Home Assistant ist nicht erreichbar.',
    wsBeendet: 'Home Assistant hat die Verbindung beendet.',
    wsAuth: 'Home Assistant hat die Anmeldung abgelehnt.',
  },
  {
    testAnsage: 'This is a test announcement from Yapaia.',
    keineVerbindung: 'No connection to Home Assistant.',
    keineVerbindungAddon: 'No connection to Home Assistant (only available in the add-on).',
    haKeineAntwort: 'Home Assistant did not answer.',
    haKeineSpracheHttp: 'Home Assistant returned no speech (HTTP {status}).',
    haKeineSprache: 'Home Assistant returned no speech.',
    keinLautsprecher: 'No speaker chosen for announcements.',
    keinTts: 'No text-to-speech (TTS) is set up in Home Assistant.',
    ansageGing: 'The announcement was sent to {ziel} (voice {stimme}).',
    ansageAbgelehnt: '{ziel} did not accept the announcement (voice {stimme})',
    mitFehler: ': {fehler}',
    mitHttp: ' (HTTP {status}).',
    punkt: '.',
    keinText: 'No text.',
    radioAus: 'Announcements into the radio are switched off.',
    keinBeatModul:
      'No Yapaia module reports the capability "ansage.einmischen" – Yapaia Beat is not set up.',
    beatFehlt: 'Yapaia Beat is not set up in Home Assistant (media_player.yapaia_beat is missing).',
    beatSpieltNicht: 'Yapaia Beat is not playing at the moment.',
    aktionFehlt:
      'The action yapaia.beat_ansage is missing: update Yapaia Beat to 1.14 or newer and restart Home Assistant.',
    ttsDauer: ' Generating the speech took {s} s.',
    beatGemischt: 'Yapaia Beat mixed the announcement into the radio.{dauer}',
    beatFehler: 'Yapaia Beat: {fehler}',
    aktionUnbekannt:
      'Home Assistant does not know the action yapaia.beat_ansage: restart Home Assistant.',
    beatNichtGesprochen: 'Yapaia Beat could not speak the announcement',
    beatNichtGesprochenHttp: ' (HTTP {status})',
    beatNichtGesprochenEnde:
      '. Most common reason: no text-to-speech (TTS) is set up in Home Assistant. Details are in the Home Assistant log.',
    keineAutomation: 'Home Assistant does not allow Yapaia to create automations.',
    automationAbgelehnt: 'Home Assistant rejected the automation (HTTP {status}).',
    haNichtErreichbar: 'Home Assistant not reachable: {grund}',
    integrationFehlt:
      'The "Yapaia" integration is not yet connected to Yapaia Go – without it, yapaia.go_befehl does not exist. ' +
      'Set up "Yapaia Go" under Settings → Devices & services.',
    wsZeit: 'Home Assistant did not answer in time.',
    wsNichtErreichbar: 'Home Assistant is not reachable.',
    wsBeendet: 'Home Assistant closed the connection.',
    wsAuth: 'Home Assistant rejected the login.',
  }
);
