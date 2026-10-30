import { texte } from '../i18n.js';

/** Bordhinweise (Sprache folgt der Einstellung, siehe ../i18n.ts). */
export const T = texte(
  {
    grauwasser: 'Grauwasser bei {p}.',
    frischwasser: 'Frischwasser nur noch {p}.',
    batterie: 'Bordbatterie bei {p} — für die Nacht besser einen Platz mit Strom.',
    frost: 'Außen {t} °C — Frostschutz für die Wasseranlage prüfen.',
  },
  {
    grauwasser: 'Grey water at {p}.',
    frischwasser: 'Fresh water down to {p}.',
    batterie: 'Leisure battery at {p} — better find a pitch with hook-up for the night.',
    frost: 'Outside {t} °C — check frost protection for the water system.',
  }
);
