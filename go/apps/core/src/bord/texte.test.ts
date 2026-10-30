import { afterEach, describe, expect, it } from 'vitest';
import { setzeSprachQuelle } from '../i18n.js';
import { bordBefunde, STANDARD_SCHWELLEN } from './regeln.js';
import { verkehrUrteil } from '../online/verkehr.js';
import { gesamturteil } from '../online/diagnose.js';
import { parseCoordinates } from '../search/coordinateParser.js';

afterEach(() => setzeSprachQuelle(() => null));

const werte = {
  grauwasser_prozent: 90,
  frischwasser_prozent: null,
  batterie_prozent: null,
  aussentemperatur_c: -2.5,
};

describe('Kern-Texte folgen der Sprache', () => {
  it('Bordhinweise deutsch und englisch', () => {
    expect(bordBefunde(werte, STANDARD_SCHWELLEN).map((b) => b.text)).toEqual([
      'Grauwasser bei 90 %.',
      'Außen -2,5 °C — Frostschutz für die Wasseranlage prüfen.',
    ]);
    setzeSprachQuelle(() => 'en');
    expect(bordBefunde(werte, STANDARD_SCHWELLEN).map((b) => b.text)).toEqual([
      'Grey water at 90 %.',
      'Outside -2.5 °C — check frost protection for the water system.',
    ]);
  });

  it('Verkehrsurteil, Diagnose und Koordinaten englisch', () => {
    setzeSprachQuelle(() => 'en');
    expect(verkehrUrteil({ strassen: [], meldungen: [] } as never)).toBe(
      'No motorway given — nothing was queried.'
    );
    expect(gesamturteil([])).toBe('Nothing was checked.');
    expect(parseCoordinates('48.1, 11.5')?.name).toBe('Coordinates');
  });
});
