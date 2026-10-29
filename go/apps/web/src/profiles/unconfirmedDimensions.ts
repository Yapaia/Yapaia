/**
 * Wann der Hinweis „diese Masse hat nie jemand bestaetigt" zu zeigen ist --
 * als reine Funktion, damit die Regel pruefbar ist, ohne eine Komponente zu
 * rendern.
 */

import type { VehicleProfile } from '@yapaia/shared';
import { gebiet, tx } from '../i18n/index.js';
import { T } from './texte.js';

/**
 * Wahr, solange die Abmessungen des AKTIVEN Profils nie von einem Menschen
 * bestaetigt wurden.
 *
 * `null` beim aktiven Profil (noch nicht geladen) ergibt bewusst `false`:
 * ein Hinweis, der beim Start kurz aufblitzt und wieder verschwindet, wird
 * als Fehler gelesen und nicht als Warnung. Sobald das Profil da ist,
 * entscheidet allein `dimensions_confirmed_at`.
 */
export function needsDimensionConfirmation(profile: VehicleProfile | null): boolean {
  if (!profile) return false;
  return profile.dimensions_confirmed_at === null;
}

/**
 * Die Masse, mit denen tatsaechlich geroutet wird -- als Text fuer den
 * Hinweis.
 *
 * Sie stehen ABSICHTLICH im Hinweis. Eine allgemeine Warnung („bitte Profil
 * pruefen") wird weggeklickt; „3,00 m hoch" ist bei einem 3,20-m-Fahrzeug
 * sofort als falsch zu erkennen. Genau diese eine Zahl ist der Grund fuer
 * die ganze Anzeige.
 */
export function formatDimensions(profile: VehicleProfile): string {
  const g = gebiet();
  const m = (value: number): string =>
    value.toLocaleString(g, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const t = (value: number): string => value.toLocaleString(g);
  return `${m(profile.height_m)} m ${tx(T, 'hoch')} · ${m(profile.width_m)} m ${tx(T, 'breit')} · ${m(profile.length_m)} m ${tx(T, 'lang')} · ${t(profile.weight_t)} t`;
}
