/**
 * Category -> icon mapping for favorite chips (E05-T3). Plain emoji, same
 * lightweight approach as `search/icons.ts` -- no icon library dependency.
 */
import type { Favorite } from '@yapaia/shared';
import { tx } from '../i18n/index.js';
import { T } from './texte.js';

const CATEGORY_ICONS: Record<Favorite['category'], string> = {
  home: '🏠',
  campsite: '⛺',
  poi: '📌',
  custom: '⭐',
};

export function iconForFavoriteCategory(category: Favorite['category']): string {
  return CATEGORY_ICONS[category] ?? '⭐';
}

export const FAVORITE_CATEGORIES: Favorite['category'][] = ['home', 'campsite', 'poi', 'custom'];

const CATEGORY_LABEL_KEYS = {
  home: 'kategorieHome',
  campsite: 'kategorieCampsite',
  poi: 'kategoriePoi',
  custom: 'kategorieCustom',
} as const;

/** Beschriftung der Kategorie in der aktuellen Sprache. */
export function favoriteCategoryLabel(category: Favorite['category']): string {
  return tx(T, CATEGORY_LABEL_KEYS[category]);
}
