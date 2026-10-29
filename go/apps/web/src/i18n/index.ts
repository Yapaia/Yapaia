/**
 * Sprachen der Oberfläche (docs/sprachen.md): Deutsch oder sonst Englisch.
 *
 * Die Sprache kommt aus der Einstellung `language` des Kerns -- die setzt die
 * Integration aus der HA-Sprache (Protokoll §8b) oder die Einrichtung. Ohne
 * Einstellung gilt die Sprache des Browsers.
 *
 * Texte stehen je Bereich in einer Datei `texte.ts`:
 *
 *   export const T = texte(
 *     { laden: 'Lade …', rest: 'noch {min} min' },
 *     { laden: 'Loading …', rest: '{min} min left' },
 *   );
 *
 * `texte()` erzwingt schon beim Typprüfen dieselben Schlüssel in beiden
 * Sprachen; `i18n.test.ts` prüft zusätzlich die Platzhalter {name}.
 * In Komponenten: `const t = useT(T); t('rest', { min: 3 })`; außerhalb von
 * React: `tx(T, 'laden')` (liest die aktuelle Sprache, ohne neu zu zeichnen).
 */

import { useCallback } from 'react';
import { create } from 'zustand';

export type Sprache = 'de' | 'en';
export type Werte = Record<string, string | number>;
export interface Texte<K extends string> {
  de: Record<K, string>;
  en: Record<K, string>;
}

export function texte<K extends string>(de: Record<K, string>, en: Record<K, string>): Texte<K> {
  return { de, en };
}

export function spracheAus(wert: unknown): Sprache | null {
  if (typeof wert !== 'string' || !wert) return null;
  return wert.toLowerCase().startsWith('de') ? 'de' : 'en';
}

function browserSprache(): Sprache {
  const nav = typeof navigator !== 'undefined' ? navigator.language : undefined;
  return spracheAus(nav) ?? 'de';
}

interface SprachZustand {
  sprache: Sprache;
  setzen: (s: Sprache) => void;
}

export const useSprache = create<SprachZustand>((set) => ({
  sprache: browserSprache(),
  setzen: (sprache) => {
    set({ sprache });
    if (typeof document !== 'undefined') document.documentElement.lang = sprache;
  },
}));

function format(text: string, werte?: Werte): string {
  return werte ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(werte[k] ?? '')) : text;
}

/** Text in der aktuellen Sprache (außerhalb von React; zeichnet nicht neu). */
export function tx<K extends string>(t: Texte<K>, schluessel: K, werte?: Werte): string {
  const sp = useSprache.getState().sprache;
  return format(t[sp][schluessel] ?? t.en[schluessel] ?? schluessel, werte);
}

/** Hook: Übersetzer für einen Bereich; zeichnet beim Sprachwechsel neu. */
export function useT<K extends string>(t: Texte<K>): (schluessel: K, werte?: Werte) => string {
  const sp = useSprache((s) => s.sprache);
  // Stabil bis zum Sprachwechsel: `t` darf in Abhängigkeiten von useEffect/useCallback stehen
  return useCallback(
    (schluessel: K, werte?: Werte) =>
      format(t[sp][schluessel] ?? t.en[schluessel] ?? schluessel, werte),
    [t, sp]
  );
}

/** Gebiet für Zahlen, Datum, Uhrzeit (`toLocaleString(gebiet())`). */
export function gebiet(sprache: Sprache = useSprache.getState().sprache): string {
  return sprache === 'de' ? 'de-DE' : 'en-GB';
}

/** Die Einstellung `language` vom Kern holen (beim Start und jede Minute, SprachController). */
export async function spracheHolen(): Promise<void> {
  try {
    // Alle Einstellungen statt `settings/language`: das antwortet ohne
    // Einstellung mit 404, und das stünde dann als Fehler in der Konsole.
    const r = await fetch(`${import.meta.env.BASE_URL}api/v1/settings`, { cache: 'no-store' });
    if (!r.ok) return;
    const daten = ((await r.json()) as { data?: { language?: unknown } }).data;
    const s = spracheAus(daten?.language);
    if (s && s !== useSprache.getState().sprache) useSprache.getState().setzen(s);
  } catch {
    // ohne Kern bleibt die Browsersprache
  }
}
