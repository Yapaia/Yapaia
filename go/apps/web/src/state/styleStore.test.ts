/**
 * Unit tests for the style selection/options store (E01-T4).
 *
 * Actual localStorage read/write is exercised end-to-end by
 * `apps/web/e2e/styles.spec.ts` (real browser) — these tests run under
 * Node (no `window`, see `vitest.config.ts` `environment: 'node'`, same as
 * `viewMode.test.ts`), so they cover the in-memory state transitions only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStyleStore, normalizeStoredOptions, beschriftungsFeld } from './styleStore';
import { useSprache } from '../i18n/index.js';
import { DEFAULT_STYLE_ID, DEFAULT_STYLE_OPTIONS, kachelSprache } from '../map/styleClient';

describe('styleStore', () => {
  beforeEach(() => {
    useStyleStore.setState({ styleId: DEFAULT_STYLE_ID, options: DEFAULT_STYLE_OPTIONS });
  });

  it('starts with the default style id and options', () => {
    expect(useStyleStore.getState().styleId).toBe('yapaia-light');
    expect(useStyleStore.getState().options).toEqual({
      lang: 'auto',
      labelScale: '1.0',
      poi: 'full',
      poiAus: [],
    });
  });

  it('setStyleId updates the selected style', () => {
    useStyleStore.getState().setStyleId('yapaia-dark');
    expect(useStyleStore.getState().styleId).toBe('yapaia-dark');
  });

  it('setLang updates only the lang option, leaving others untouched', () => {
    useStyleStore.getState().setLabelScale('1.2');
    useStyleStore.getState().setLang('name_de');
    expect(useStyleStore.getState().options).toEqual({
      lang: 'name_de',
      labelScale: '1.2',
      poi: 'full',
      poiAus: [],
    });
  });

  it('setLabelScale updates only the labelScale option', () => {
    useStyleStore.getState().setLabelScale('1.2');
    expect(useStyleStore.getState().options.labelScale).toBe('1.2');
    expect(useStyleStore.getState().options.lang).toBe('auto');
  });

  it('setPoi updates only the poi option', () => {
    useStyleStore.getState().setPoi('reduced');
    expect(useStyleStore.getState().options.poi).toBe('reduced');
    expect(useStyleStore.getState().options.lang).toBe('auto');
  });

  it('setStyleId does not throw when window/localStorage is unavailable (Node test env)', () => {
    expect(() => useStyleStore.getState().setStyleId('yapaia-contrast')).not.toThrow();
  });

  /**
   * ─── DIE ALTE, KAPUTTE WAHL ───────────────────────────────────────────────
   * Bis 0.3.6 speicherte „Deutsch" den Wert `name:de` — ein Feld, das es in
   * den Kacheln nicht gibt (siehe `apps/core/src/map/styles/options.ts`). Wer
   * es gewaehlt hatte, sah eine Karte ganz ohne Beschriftung. Beim Update
   * steht dieser Wert weiter im Browser: er muss auf das echte Feld zeigen
   * und nicht wortlos auf „Original" zurueckfallen — sonst waere die
   * Einstellung nach dem Update einfach verschwunden.
   */
  it('biegt eine vor 0.3.7 gespeicherte Sprachwahl auf das echte Feld um', () => {
    expect(normalizeStoredOptions({ lang: 'name:de' as never }).lang).toBe('name_de');
    expect(normalizeStoredOptions({ lang: 'name:en' as never }).lang).toBe('name_en');
  });

  it('laesst die uebrigen gespeicherten Optionen dabei unangetastet', () => {
    expect(
      normalizeStoredOptions({
        lang: 'name:de' as never,
        labelScale: '1.2',
        poi: 'off',
        poiAus: ['poi-tanken'],
      }),
    ).toEqual({
      lang: 'name_de',
      labelScale: '1.2',
      poi: 'off',
      poiAus: ['poi-tanken'],
    });
  });

  it('faellt bei unbrauchbar Gespeichertem auf die Vorgaben zurueck', () => {
    expect(normalizeStoredOptions({ lang: 'name:fr' as never, poi: 'viele' as never })).toEqual(
      DEFAULT_STYLE_OPTIONS,
    );
  });

  // ─── AUTOMATISCH (0.70.5) ──────────────────────────────────────────────────
  it('„Automatisch" folgt der Sprache von Home Assistant', () => {
    expect(kachelSprache('auto', 'de')).toBe('name_de');
    expect(kachelSprache('auto', 'en')).toBe('name_en');
    // Eine ausdrückliche Wahl gewinnt immer.
    expect(kachelSprache('name', 'de')).toBe('name');
    expect(kachelSprache('name_en', 'de')).toBe('name_en');
  });

  it('beschriftungsFeld löst „Automatisch" mit der aktuellen Sprache auf', () => {
    const vorher = useSprache.getState().sprache;
    useSprache.getState().setzen('en');
    expect(beschriftungsFeld()).toBe('name_en');
    useSprache.getState().setzen('de');
    expect(beschriftungsFeld()).toBe('name_de');
    useStyleStore.getState().setLang('name');
    expect(beschriftungsFeld()).toBe('name');
    useSprache.getState().setzen(vorher);
  });

  it('ein vor 0.70.5 gespeichertes „Original" wird zu „Automatisch"', () => {
    // Bis 0.70.4 stand `name` als Vorgabe in jeder gespeicherten Menge.
    expect(normalizeStoredOptions({ lang: 'name' }).lang).toBe('auto');
  });

  it('ein ab 0.70.5 gewähltes „Original" bleibt erhalten', () => {
    expect(normalizeStoredOptions({ lang: 'name', langFassung: 2 } as never).lang).toBe('name');
    expect(normalizeStoredOptions({ lang: 'auto', langFassung: 2 } as never).lang).toBe('auto');
    expect(normalizeStoredOptions({ lang: 'name_de' }).lang).toBe('name_de');
  });
});
