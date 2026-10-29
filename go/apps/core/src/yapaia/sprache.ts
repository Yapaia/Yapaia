/**
 * Die Sprache von Home Assistant (docs/integration-protokoll.md §8b).
 *
 * Die Integration schickt die HA-Sprache (`de`/`en`); Go legt sie als
 * Einstellung `language` ab -- dieselbe, die die Einrichtung setzt und die
 * Routing-Anweisungen nutzen. Die Oberfläche liest sie über
 * `GET /api/v1/settings/language` (apps/web/src/i18n/).
 */

import type { FastifyInstance } from 'fastify';
import { tokenPasst } from './protokoll.js';

export const SPRACHEN = ['de', 'en'] as const;
export type Sprache = (typeof SPRACHEN)[number];

interface Einstellungen {
  get(key: string): unknown;
  patch(values: Record<string, unknown>): unknown;
}

export async function registriereHaSprache(
  fastify: FastifyInstance,
  einstellungen: Einstellungen,
  token: string
): Promise<void> {
  fastify.post('/yapaia/v1/sprache', async (request, reply) => {
    if (!tokenPasst(token, request.headers.authorization))
      return reply.code(401).send({ ok: false, fehler: 'Token fehlt oder falsch' });
    const wert = (request.body as { sprache?: unknown } | null)?.sprache;
    if (typeof wert !== 'string')
      return reply.code(400).send({ ok: false, fehler: 'sprache fehlt' });
    const sprache: Sprache = (SPRACHEN as readonly string[]).includes(wert)
      ? (wert as Sprache)
      : 'en';
    if (einstellungen.get('language') !== sprache) einstellungen.patch({ language: sprache });
    request.log.info({ sprache }, 'Sprache');
    return { ok: true };
  });
}
