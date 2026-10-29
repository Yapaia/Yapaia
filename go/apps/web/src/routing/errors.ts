import { tx } from '../i18n/index.js';
import { T } from './texte.js';

/**
 * Maps routing error codes to user-facing messages (German/English) (E03-T3, E03-T6).
 * `NO_POSITION` (409, thrown by the Core when `origin: 'current'` can't be
 * resolved because there's no live GPS fix) gets a dedicated, actionable
 * hint; `OUT_OF_COVERAGE` (422, E03-T6) gets a hint about downloading regions.
 * Everything else falls back to the Core's own message.
 */
export function friendlyRoutingErrorMessage(code: string, message: string): string {
  switch (code) {
    case 'NO_POSITION':
      return tx(T, 'keinePosition');
    case 'NO_ACTIVE_PROFILE':
      return tx(T, 'keinProfilAktivieren');
    case 'OUT_OF_COVERAGE':
      return tx(T, 'ausserhalbAbdeckung');
    default:
      return message;
  }
}
