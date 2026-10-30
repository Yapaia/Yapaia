/**
 * Alle Texte des Kerns (`texte.ts` je Bereich): gleiche Platzhalter in de/en.
 * Gleiche Schlüssel erzwingt schon `texte()` beim Typprüfen.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setzeSprachQuelle, texte, tx, kernSprache, type Texte } from './i18n.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const dateien = (readdirSync(HIER, { recursive: true }) as string[])
  .filter((d) => d.endsWith('texte.ts'))
  .map((d) => join(HIER, d));
const platzhalter = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

afterEach(() => setzeSprachQuelle(() => null));

describe('i18n (Kern)', () => {
  it('jede texte.ts: gleiche Schlüssel und Platzhalter in de und en', async () => {
    expect(dateien.length).toBeGreaterThan(0);
    for (const datei of dateien) {
      const modul = (await import(pathToFileURL(datei).href)) as Record<string, unknown>;
      for (const [name, wert] of Object.entries(modul)) {
        const t = wert as Texte<string>;
        if (!t || typeof t !== 'object' || !t.de || !t.en) continue;
        expect(Object.keys(t.en).sort(), `${datei} ${name}`).toEqual(Object.keys(t.de).sort());
        for (const k of Object.keys(t.de))
          expect(platzhalter(t.en[k]), `${datei} ${name}.${k}`).toBe(platzhalter(t.de[k]));
      }
    }
  });

  it('ohne Einstellung deutsch, mit language=en englisch', () => {
    const T = texte({ rest: 'noch {km} km' }, { rest: '{km} km left' });
    expect(kernSprache()).toBe('de');
    expect(tx(T, 'rest', { km: 3 })).toBe('noch 3 km');
    setzeSprachQuelle(() => 'en');
    expect(tx(T, 'rest', { km: 3 })).toBe('3 km left');
  });
});
