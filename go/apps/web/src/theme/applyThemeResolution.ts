/**
 * Die eine Stelle, die ein aufgelöstes Thema anwendet: die `dark`-Klasse an
 * `<html>` (Tailwind `darkMode: 'class'`) und der passende Kartenstil -- im
 * selben Takt, ohne `await` dazwischen, damit Oberfläche und Karte nie einen
 * Bildaufbau lang auseinanderliegen (E07-T3).
 *
 * ─── SEIT 0.21: NUR NOCH UMSCHALTEN, NIE ÜBERSCHREIBEN ─────────────────────
 * Bis 0.20 schrieb diese Funktion die Stilwahl auf `yapaia-light` bzw.
 * `yapaia-dark` um -- mit einer Ausnahme für „Kontrast" und einer Regel, wann
 * überhaupt geschrieben werden durfte. Gemeldet wurde, was davon übrig blieb:
 * wer einen anderen Stil wählte, verlor den Wechsel zwischen Hell und Dunkel
 * (dunkles Thema mit heller Karte), oder er verlor beim nächsten Wechsel
 * seine Wahl.
 *
 * Jetzt hat jedes Thema seinen eigenen Platz (`state/styleStore.ts`), und
 * hier wird nur gesagt, welcher gilt. Was auf den Plätzen liegt, bestimmt
 * allein der Fahrer im Kartenmenü.
 */

import { designDunkel } from '../design/design.js';
import type { ThemeResolution } from './resolveTheme.js';
import { useStyleStore } from '../state/styleStore.js';

function setDarkClass(isDark: boolean): void {
  if (typeof document === 'undefined') return;
  // Ein Yapaia-Design-Schema gibt hell/dunkel für die Oberfläche vor (design/design.ts)
  document.documentElement.classList.toggle('dark', designDunkel() ?? isDark);
}

/** UI-Klasse und Kartenstil im selben Takt. */
export function applyThemeResolution(resolution: ThemeResolution): void {
  setDarkClass(resolution.theme === 'dark');
  useStyleStore.getState().setThema(resolution.theme);
}
