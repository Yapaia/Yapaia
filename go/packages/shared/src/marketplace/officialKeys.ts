// SPDX-License-Identifier: Apache-2.0
/**
 * Die offiziellen Signaturschlüssel des Yapaia-Marktplatzes
 * (`docs/marktplatz.md`).
 *
 * Go vertraut diesen Schlüsseln immer, zusätzlich zu denen des eingetragenen
 * Marktplatzes. `verifyLicense()` im Add-on-SDK kennt NUR diese -- ein
 * kostenpflichtiges Add-on prüft seine Lizenz damit gegen genau diese Liste.
 *
 * Eintragen: `install.sh` des Addon-Servers gibt nach `keygen` den
 * öffentlichen Schlüssel und die `kid` aus. Beide hier ergänzen, nie einen
 * alten Schlüssel löschen, solange noch Lizenzen damit im Umlauf sind.
 *
 * Solange die Liste leer ist, gelten nur die Schlüssel des eingetragenen
 * Marktplatzes -- das reicht zum Testen.
 */

import type { MarketplaceKey } from './ysig';

export const OFFICIAL_MARKETPLACE_KEYS: readonly MarketplaceKey[] = [];
