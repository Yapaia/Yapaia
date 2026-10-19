/**
 * Fastify routes for the add-on marketplace connection (`docs/marktplatz.md`).
 * Prefix: `/api/v1`, behind the ordinary Core auth guard.
 *
 *  - GET    /addons/marketplace                 -> address, name, pinned key ids,
 *    whether an account token is stored (never the token), developer mode,
 *    installation id.
 *  - PUT    /addons/marketplace {url, token?}   -> save (checks `GET /v1/meta`,
 *    pins its keys). Empty `url` removes it, empty `token` keeps the old one.
 *  - PUT    /addons/marketplace/developer-mode {enabled}
 *  - GET    /addons/:id/license                 -> license status. Also readable
 *    BY the add-on itself for its own id (`scopeMatrix.ts`, no scope) -- that
 *    is what the SDK's `license.get()` calls.
 *  - POST   /addons/:id/license/activate        -> ask the marketplace for a
 *    license for this installation.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ApiError } from '@yapaia/shared';
import { AddonError } from './errors.js';
import { AddonRepository } from './repository.js';
import type { MarketplaceService } from './marketplace.js';
import { sendAddonError } from './routes.js';

function createErrorResponse(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export interface AddonMarketplacePluginOptions {
  marketplace: MarketplaceService;
  repository?: AddonRepository;
}

export const addonMarketplacePlugin: FastifyPluginAsync<AddonMarketplacePluginOptions> = async (fastify, opts) => {
  const { marketplace } = opts;
  const repository = opts.repository ?? new AddonRepository();

  fastify.get('/addons/marketplace', async (_request, reply) => {
    reply.code(200).send({ data: marketplace.view() });
  });

  fastify.put<{ Body: { url?: unknown; token?: unknown } }>('/addons/marketplace', async (request, reply) => {
    const url = typeof request.body?.url === 'string' ? request.body.url : '';
    const token = typeof request.body?.token === 'string' ? request.body.token : undefined;
    try {
      reply.code(200).send({ data: await marketplace.configure({ url, token }) });
    } catch (err) {
      sendAddonError(reply, err);
    }
  });

  fastify.put<{ Body: { enabled?: unknown } }>('/addons/marketplace/developer-mode', async (request, reply) => {
    if (typeof request.body?.enabled !== 'boolean') {
      reply.code(400).send(createErrorResponse('VALIDATION_ERROR', '"enabled" must be a boolean'));
      return;
    }
    marketplace.setDeveloperMode(request.body.enabled);
    reply.code(200).send({ data: marketplace.view() });
  });

  fastify.get<{ Params: { id: string } }>('/addons/:id/license', async (request, reply) => {
    const record = repository.getById(request.params.id);
    if (!record) {
      reply.code(404).send(createErrorResponse('NOT_FOUND', `No add-on installed with id "${request.params.id}"`));
      return;
    }
    const status = await marketplace.licenseStatus(record.id, record.licensing);
    // Free and unsigned add-ons need no license -- "valid" means "may run".
    reply.code(200).send({ data: record.licensing === 'paid' ? status : { ...status, valid: true, reason: undefined } });
  });

  fastify.post<{ Params: { id: string } }>('/addons/:id/license/activate', async (request, reply) => {
    try {
      const record = repository.getById(request.params.id);
      if (!record) throw new AddonError('NOT_FOUND', `No add-on installed with id "${request.params.id}"`);
      reply.code(200).send({ data: await marketplace.activateLicense(record.id) });
    } catch (err) {
      sendAddonError(reply, err);
    }
  });
};
