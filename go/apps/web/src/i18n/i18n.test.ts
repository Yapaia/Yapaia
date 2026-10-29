/**
 * Alle Texte (`texte.ts` je Bereich): in de und en dieselben Platzhalter.
 * Gleiche Schlüssel erzwingt schon `texte()` beim Typprüfen.
 */
import { describe, it, expect } from 'vitest';
import { spracheAus, texte, tx, useSprache, type Texte } from './index.js';

const dateien = import.meta.glob<Record<string, unknown>>('../**/texte.ts', { eager: true });
const platzhalter = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

describe('i18n', () => {
  it('jede texte.ts: gleiche Schlüssel und Platzhalter in de und en', () => {
    for (const [datei, modul] of Object.entries(dateien)) {
      for (const [name, wert] of Object.entries(modul)) {
        const t = wert as Texte<string>;
        if (!t || typeof t !== 'object' || !t.de || !t.en) continue;
        expect(Object.keys(t.en).sort(), `${datei} ${name}`).toEqual(Object.keys(t.de).sort());
        for (const k of Object.keys(t.de))
          expect(platzhalter(t.en[k]), `${datei} ${name}.${k}`).toBe(platzhalter(t.de[k]));
      }
    }
  });

  it('wählt de oder sonst en und setzt Platzhalter ein', () => {
    expect(spracheAus('de-AT')).toBe('de');
    expect(spracheAus('fr')).toBe('en');
    const T = texte({ rest: 'noch {min} min' }, { rest: '{min} min left' });
    useSprache.getState().setzen('en');
    expect(tx(T, 'rest', { min: 3 })).toBe('3 min left');
    useSprache.getState().setzen('de');
    expect(tx(T, 'rest', { min: 3 })).toBe('noch 3 min');
  });
});
