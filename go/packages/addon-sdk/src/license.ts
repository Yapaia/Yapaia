// SPDX-License-Identifier: Apache-2.0
/**
 * `verifyLicense()` -- the check a PAID add-on runs on its own license
 * (`docs/marktplatz.md`). It trusts only the official marketplace keys that
 * are compiled into this SDK (`OFFICIAL_MARKETPLACE_KEYS` in
 * `@yapaia/shared`), never the keys a Core was configured with -- so a Core
 * pointed at some other marketplace cannot mint licenses for your add-on.
 *
 * Bundle the SDK into your add-on (as the reference add-ons do) so the keys
 * travel with your code.
 */

import { OFFICIAL_MARKETPLACE_KEYS, verifyLicenseToken, type LicensePayload, type MarketplaceKey } from '@yapaia/shared';

export interface VerifyLicenseOptions {
  addonId: string;
  installationId: string;
  /** Overrides the official keys -- for tests against a staging marketplace
   *  only. A production build should not pass this. */
  keys?: readonly MarketplaceKey[];
  /** Unix seconds; defaults to now. */
  now?: number;
}

export type VerifyLicenseResult = { valid: true; license: LicensePayload } | { valid: false; reason: string };

export async function verifyLicense(token: string | null | undefined, opts: VerifyLicenseOptions): Promise<VerifyLicenseResult> {
  const keys = opts.keys ?? OFFICIAL_MARKETPLACE_KEYS;
  if (keys.length === 0) return { valid: false, reason: 'no marketplace keys known' };
  const res = await verifyLicenseToken(token, keys, {
    addonId: opts.addonId,
    installationId: opts.installationId,
    now: opts.now,
  });
  return res.ok ? { valid: true, license: res.payload } : { valid: false, reason: res.reason };
}
