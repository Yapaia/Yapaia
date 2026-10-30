/**
 * Sprache der Texte, die der Kern selbst erzeugt (docs/sprachen.md):
 * Bordhinweise, Verkehrsmeldungen, Prüfhinweise, Antworten auf Sprachbefehle.
 *
 * Quelle ist die Einstellung `language` (gesetzt von der Integration aus der
 * HA-Sprache, Protokoll §8b, oder von der Einrichtung). Ohne Einstellung
 * bleibt der Kern deutsch -- so war er bisher, und Tests erwarten das.
 *
 *   const T = texte({ voll: 'Tank voll' }, { voll: 'Tank full' });
 *   tx(T, 'voll')
 *
 * `texte()` erzwingt beim Typprüfen dieselben Schlüssel in beiden Sprachen;
 * `i18n.test.ts` prüft die Platzhalter {name}.
 */

export type Sprache = 'de' | 'en';
export type Werte = Record<string, string | number>;
export interface Texte<K extends string> {
  de: Record<K, string>;
  en: Record<K, string>;
}

export function texte<K extends string>(de: Record<K, string>, en: Record<K, string>): Texte<K> {
  return { de, en };
}

let quelle: () => unknown = () => null;

/** Beim Start: woher die Sprache kommt (index.ts: Einstellung `language`). */
export function setzeSprachQuelle(fn: () => unknown): void {
  quelle = fn;
}

export function kernSprache(): Sprache {
  const wert = quelle();
  return typeof wert === 'string' && wert.toLowerCase().startsWith('en') ? 'en' : 'de';
}

export function tx<K extends string>(t: Texte<K>, schluessel: K, werte?: Werte): string {
  const text = t[kernSprache()][schluessel] ?? t.en[schluessel] ?? schluessel;
  return werte ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(werte[k] ?? '')) : text;
}

/** Gebiet für Zahlen/Datum (`toLocaleString(gebiet())`). */
export function gebiet(): string {
  return kernSprache() === 'de' ? 'de-DE' : 'en-GB';
}
