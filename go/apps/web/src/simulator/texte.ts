import { texte } from '../i18n/index.js';

export const T = texte(
  {
    gesperrt:
      'Der GPS-Simulator ist gesperrt. Einschalten in Home Assistant unter Einstellungen → Add-ons → Yapaia Go → Konfiguration → „gps_simulator“, danach das Add-on neu starten.',
    keine_antwort: 'Der Simulator hat nicht geantwortet.',
    testfahrt: 'Testfahrt',
    testfahrt_titel: 'Testfahrt (GPS-Simulator)',
    erklaerung:
      'Fährt die geplante Route mit den jeweiligen Tempolimits ab. Die echte GPS-Position wird dabei ersetzt.',
    keine_route:
      'Noch keine Route geplant — erst ein Ziel wählen, dann lässt sich die Fahrt starten.',
    abfahren: '▶ Route abfahren',
    weiter: '▶ Weiter',
    pause: '⏸ Pause',
    stopp: '⏹ Stopp',
    zeitraffer: 'Zeitraffer',
    von: '{ist} von {gesamt}',
    simulierte_fahrzeit: '(simulierte Fahrzeit)',
  },
  {
    gesperrt:
      'The GPS simulator is locked. Enable it in Home Assistant under Settings → Add-ons → Yapaia Go → Configuration → “gps_simulator”, then restart the add-on.',
    keine_antwort: 'The simulator did not respond.',
    testfahrt: 'Test drive',
    testfahrt_titel: 'Test drive (GPS simulator)',
    erklaerung:
      'Drives along the planned route at the respective speed limits. The real GPS position is replaced meanwhile.',
    keine_route:
      'No route planned yet — choose a destination first, then the drive can be started.',
    abfahren: '▶ Drive route',
    weiter: '▶ Resume',
    pause: '⏸ Pause',
    stopp: '⏹ Stop',
    zeitraffer: 'Fast forward',
    von: '{ist} of {gesamt}',
    simulierte_fahrzeit: '(simulated driving time)',
  }
);
