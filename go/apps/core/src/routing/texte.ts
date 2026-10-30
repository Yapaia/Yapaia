import { texte } from '../i18n.js';

/** Vom Routing erzeugte Meldungen, die Anwender sehen. */
export const T = texte(
  {
    lueckenHinweis:
      '{message} Hinweis: Im Routing fehlt {fehlt} — Ziele dort sind nicht erreichbar. ' +
      'In der Kartenverwaltung „Fehlendes bauen" ausführen.',
    ausserhalb: '{role} liegt außerhalb der installierten Kartenabdeckung.',
    keineRegion: 'keine passende Region im Katalog gefunden.',
    keineRoute:
      'Keine für dein Fahrzeug befahrbare Route gefunden. Überprüfe Fahrzeugabmessungen (Höhe, Breite) und Vermeidungseinstellungen.',
  },
  {
    lueckenHinweis:
      '{message} Note: routing is missing {fehlt} — destinations there cannot be reached. ' +
      'Run "Build missing" in the map management.',
    ausserhalb: '{role} is outside the installed map coverage.',
    keineRegion: 'no suitable region found in the catalogue.',
    keineRoute:
      'No route found that your vehicle can drive. Check the vehicle dimensions (height, width) and the avoidance settings.',
  }
);
