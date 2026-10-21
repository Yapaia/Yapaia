/**
 * Fastify routes for the add-on registry client (E09-T7, docs/05 §5,
 * Wargame W-11/W-13). Prefix: `/api/v1`.
 *
 *  - GET  /addons/registry       -> the CACHED catalog + its age (W-13:
 *    "Katalog-Cache mit Zeitstempel") + a per-entry `compatible` flag
 *    (Wargame W-11: checked BEFORE install, not just at install time).
 *    NEVER touches the network -- this is what keeps the store usable while
 *    the registry host is unreachable.
 *  - POST /addons/registry/sync  -> fetches + validates + persists a FRESH
 *    catalog. A failure (unreachable host, invalid JSON) leaves the
 *    previously cached catalog completely untouched (`RegistryService.sync`'s
 *    own guarantee) and is reported as a normal `ApiError`; the client is
 *    expected to fall back to its last `GET /addons/registry` result, which
 *    is still valid.
 *
 *  - POST /addons/registry/install {id} -> step 1 of installing a CATALOG
 *    entry (docs/marktplatz.md). The Core takes `download_url`, `sha256` and
 *    `signature` from its OWN cached catalog -- the browser only names the
 *    id, so it can neither swap the hash nor the signature. The account
 *    token goes along only to the configured marketplace. A paid add-on gets
 *    its license activated right away; a failure there does not abort the
 *    install, it is reported (`license`) and enabling stays blocked until a
 *    license exists.
 *
 * Step 2 (confirm) is the ordinary `POST /addons/install/:pendingId/confirm`
 * (`routes.ts`). This module never re-implements sha256/signature
 * verification or the `core_api` install-time gate; `compatible` and
 * `verified` here are ADVISORIES the UI uses before the operator ever gets
 * there (acceptance criterion 2: "inkompatibles Add-on zeigt Sperr-Hinweis
 * statt Install-Button").
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ApiError } from '@yapaia/shared';
import { satisfies, verifyRelease, type MarketplaceKey } from '@yapaia/shared';
import { RegistryService, RegistryError, type RegistryEntry, type RegistryCacheSnapshot } from './registry.js';
import { AddonError } from './errors.js';
import { downloadTarball } from './download.js';
import { MAX_TARBALL_COMPRESSED_BYTES, type InstallService } from './installService.js';
import type { MarketplaceService, LicenseStatus } from './marketplace.js';
import { pendingReply, sendAddonError } from './routes.js';

function createErrorResponse(code: string, message: string): ApiError {
  return { error: { code, message } };
}

function statusForRegistryError(err: RegistryError): number {
  switch (err.code) {
    case 'REGISTRY_UNREACHABLE':
    case 'REGISTRY_INVALID':
      return 502; // upstream (registry host) problem, same convention as DOWNLOAD_FAILED
    default:
      return 500;
  }
}

/** A catalog entry as served to the client: the validated {@link RegistryEntry}
 *  plus the `core_api` compatibility verdict (Wargame W-11) computed against
 *  the RUNNING Core's version -- always freshly computed here (not cached
 *  alongside the entry), so a Core UPDATE changes `compatible` immediately
 *  even without a registry re-sync. */
export interface RegistryEntryView extends RegistryEntry {
  compatible: boolean;
  /** The release signature is valid for exactly this id/version/sha256 and
   *  comes from a trusted key. */
  verified: boolean;
  /** Revoked by the marketplace -- the UI shows a notice, not a button. */
  revoked: boolean;
}

export interface RegistryCatalogReplyData {
  entries: RegistryEntryView[];
  fetched_at: string | null;
  age_ms: number | null;
  source_url: string;
  /** Validation errors from the last successful parse (dropped entries) --
   *  surfaced so an operator can see why an expected entry is missing. */
  errors: string[];
}

async function toEntryView(
  entry: RegistryEntry,
  coreVersion: string,
  marketplace: MarketplaceService | undefined,
  keys: MarketplaceKey[],
): Promise<RegistryEntryView> {
  let verified = false;
  let licensing = entry.licensing;
  if (entry.signature && keys.length > 0) {
    const res = await verifyRelease(entry.signature, keys);
    if (res.ok && res.payload.id === entry.id && res.payload.version === entry.version && res.payload.sha256 === entry.sha256) {
      verified = true;
      // The signed value wins over the unsigned display hint.
      licensing = res.payload.licensing;
    }
  }
  return {
    ...entry,
    licensing,
    compatible: satisfies(coreVersion, entry.core_api),
    verified,
    revoked: marketplace?.revocationFor(entry.id, entry.version) != null,
  };
}

async function toReplyData(
  snapshot: RegistryCacheSnapshot,
  coreVersion: string,
  marketplace?: MarketplaceService,
): Promise<RegistryCatalogReplyData> {
  const keys = marketplace?.trustedKeys() ?? [];
  return {
    entries: await Promise.all(snapshot.entries.map((e) => toEntryView(e, coreVersion, marketplace, keys))),
    fetched_at: snapshot.fetchedAt,
    age_ms: snapshot.ageMs,
    source_url: snapshot.sourceUrl,
    errors: snapshot.errors,
  };
}

export interface AddonRegistryPluginOptions {
  /** Injectable for tests; if omitted a real `RegistryService` (backed by a
   *  fresh `SettingsService`) is built. */
  service?: RegistryService;
  /** The running Core's version (Wargame W-11), same value `addonsPlugin`
   *  gets -- required unless `service` is injected directly. */
  coreVersion?: string;
  /** docs/marktplatz.md: verification hints, revocations, paid downloads. */
  marketplace?: MarketplaceService;
  /** Needed for `POST /addons/registry/install` and the post-sync
   *  `reconcile()`; without it the install route answers 503. */
  installService?: InstallService;
  /** Injectable for tests. */
  downloadImpl?: typeof downloadTarball;
}

export const addonRegistryPlugin: FastifyPluginAsync<AddonRegistryPluginOptions> = async (fastify, opts) => {
  if (!opts.service && !opts.coreVersion) {
    throw new Error('addonRegistryPlugin: either `service` or `coreVersion` must be provided');
  }
  const coreVersion = opts.coreVersion ?? '0.0.0';
  const service = opts.service ?? new RegistryService();

  const { marketplace, installService } = opts;
  const download = opts.downloadImpl ?? downloadTarball;

  fastify.get<{ Reply: { data: RegistryCatalogReplyData } }>('/addons/registry', async (_request, reply) => {
    reply.code(200).send({ data: await toReplyData(service.getCachedCatalog(), coreVersion, marketplace) });
  });

  fastify.post<{ Reply: { data: RegistryCatalogReplyData } | ApiError }>(
    '/addons/registry/sync',
    async (_request, reply) => {
      try {
        const snapshot = await service.sync();
        // Revocations ride along with every sync; a failure there must not
        // fail the catalog sync -- the previous (signed) list stays in force.
        if (marketplace) {
          await marketplace.syncRevocations(snapshot.sourceUrl).catch((e: unknown) => {
            fastify.log.warn({ err: e instanceof Error ? e.message : String(e) }, 'marketplace: revocations not refreshed');
          });
        }
        if (installService) {
          const disabled = await installService.reconcile();
          if (disabled.length) fastify.log.warn({ disabled }, 'add-ons disabled after sync (revoked or unlicensed)');
        }
        reply.code(200).send({ data: await toReplyData(snapshot, coreVersion, marketplace) });
      } catch (err) {
        if (err instanceof RegistryError) {
          reply.code(statusForRegistryError(err)).send(createErrorResponse(err.code, err.message));
          return;
        }
        reply
          .code(500)
          .send(createErrorResponse('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error'));
      }
    },
  );

  fastify.post<{ Body: { id?: unknown } }>('/addons/registry/install', async (request, reply) => {
    if (!installService) {
      reply.code(503).send(createErrorResponse('NOT_AVAILABLE', 'Installing from the catalog is not available'));
      return;
    }
    const id = request.body?.id;
    const entry = typeof id === 'string' ? service.getCachedCatalog().entries.find((e) => e.id === id) : undefined;
    if (!entry) {
      reply.code(404).send(createErrorResponse('NOT_FOUND', `No catalog entry with id "${String(id)}" -- sync the catalog first`));
      return;
    }
    try {
      const headers = marketplace?.downloadHeaders(entry.download_url) ?? {};
      const bytes = await download({ url: entry.download_url, maxBytes: MAX_TARBALL_COMPRESSED_BYTES, headers });
      const result = await installService.beginInstallFromUrl(bytes, entry.sha256, entry.signature ?? undefined);

      let license: { valid: boolean; reason?: string } | null = null;
      if (result.release?.licensing === 'paid' && marketplace) {
        let status: LicenseStatus | { valid: false; reason: string } = await marketplace.licenseStatus(entry.id, 'paid');
        if (!status.valid) {
          status = await marketplace.activateLicense(entry.id).catch((e: unknown) => ({
            valid: false as const,
            reason: e instanceof Error ? e.message : String(e),
          }));
        }
        license = status.valid ? { valid: true } : { valid: false, reason: status.reason };
      }
      reply.code(202).send({ data: { ...pendingReply(result), license } });
    } catch (err) {
      if (err instanceof AddonError) {
        sendAddonError(reply, err);
        return;
      }
      reply.code(500).send(createErrorResponse('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error'));
    }
  });
};
