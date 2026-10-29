import { tx } from '../i18n/index.js';
import { T } from './texte.js';

/**
 * Maps search error codes to a user-facing message (German/English) (E05-T2), same
 * spirit as `apps/web/src/routing/errors.ts`'s `friendlyRoutingErrorMessage`
 * -- a clean, generic message rather than surfacing the raw backend text.
 */
export function friendlySearchErrorMessage(code: string, message: string): string {
  switch (code) {
    case 'VALIDATION_ERROR':
      return tx(T, 'ungueltig');
    case 'RATE_LIMITED':
      return tx(T, 'zuViele');
    default:
      return message || tx(T, 'fehlgeschlagen');
  }
}
