import { texte } from '../../i18n/index.js';

export const T = texte(
  {
    erforderlich: 'erforderlich',
    empfohlen: 'empfohlen',
    optional: 'optional',
    zuTun: 'Zu tun:',
    trackerGeraet: 'Gerät der Companion App',
    trackerHinweis:
      'Damit läuft die Anzeige weiter, wenn Yapaia nicht offen ist. Die Wahl gilt sofort.',
    keine: '— keine —',
    auswahlFehler: 'Auswahl fehlgeschlagen.',
    pruefFehler:
      'Die Prüfung konnte nicht ausgeführt werden: {meldung} Wenn hier gar nichts ankommt, läuft der Yapaia-Dienst selbst nicht — sehen Sie im Home-Assistant-Add-on unter „Protokoll" nach.',
    pruefFehlerKurz: 'Die Prüfung konnte nicht ausgeführt werden.',
    titel: 'Installation prüfen',
    pruefe: 'Prüfe…',
    erneut: 'Erneut prüfen',
    geprueft: 'Geprüft: {zeit}',
    ladeText: 'Prüfe Kacheln, Routing, Suche, Position, Speicher…',
    statusFehler: 'Die Prüfung antwortete mit Status {status}.',
    formFehler: 'Die Antwort der Prüfung hatte nicht die erwartete Form.',
    listeStatus: 'Die Liste antwortete mit Status {status}.',
    listeForm: 'Die Antwort hatte nicht die erwartete Form.',
    auswahlStatus: 'Die Auswahl antwortete mit Status {status}.',
  },
  {
    erforderlich: 'required',
    empfohlen: 'recommended',
    optional: 'optional',
    zuTun: 'To do:',
    trackerGeraet: 'Companion app device',
    trackerHinweis:
      'This keeps the display running when Yapaia is not open. The choice applies immediately.',
    keine: '— none —',
    auswahlFehler: 'Selection failed.',
    pruefFehler:
      'The check could not be run: {meldung} If nothing arrives here at all, the Yapaia service itself is not running — look under "Log" in the Home Assistant add-on.',
    pruefFehlerKurz: 'The check could not be run.',
    titel: 'Check installation',
    pruefe: 'Checking…',
    erneut: 'Check again',
    geprueft: 'Checked: {zeit}',
    ladeText: 'Checking tiles, routing, search, position, storage…',
    statusFehler: 'The check responded with status {status}.',
    formFehler: 'The response to the check did not have the expected form.',
    listeStatus: 'The list responded with status {status}.',
    listeForm: 'The response did not have the expected form.',
    auswahlStatus: 'The selection responded with status {status}.',
  }
);
