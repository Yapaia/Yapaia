/**
 * Das Design-Schema von der Integration (docs/integration-protokoll.md §8a).
 *
 * Die Integration schickt das Schema, das für Go gilt; Go merkt es sich (auch
 * über Neustarts) und gibt es an die eigene Oberfläche weiter
 * (`GET /api/v1/design`), die daraus ihre Farben setzt (apps/web/src/design/).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { tokenPasst } from './protokoll.js';

export interface DesignNachricht {
  schema: {
    id: string;
    name?: string;
    hell?: boolean;
    css: Record<string, string>;
    deko?: Record<string, unknown>;
  };
  eigenes?: boolean;
  schriften?: string;
}

function gueltig(d: unknown): d is DesignNachricht {
  const s = (d as DesignNachricht | null)?.schema;
  return (
    !!s && typeof s === 'object' && typeof s.id === 'string' && !!s.css && typeof s.css === 'object'
  );
}

export class DesignSpeicher {
  private stand: DesignNachricht | null = null;

  constructor(private readonly pfad: string | null) {
    if (!pfad) return;
    try {
      const d: unknown = JSON.parse(readFileSync(pfad, 'utf-8'));
      if (gueltig(d)) this.stand = d;
    } catch {
      // noch keins
    }
  }

  aktuell(): DesignNachricht | null {
    return this.stand;
  }

  setzen(d: DesignNachricht): void {
    this.stand = d;
    if (!this.pfad) return;
    try {
      mkdirSync(dirname(this.pfad), { recursive: true });
      writeFileSync(this.pfad, JSON.stringify(d));
    } catch {
      // nicht schlimm: kommt beim nächsten Verbinden wieder
    }
  }
}

export async function registriereDesign(
  fastify: FastifyInstance,
  speicher: DesignSpeicher,
  token: string
): Promise<void> {
  fastify.post('/yapaia/v1/design', async (request, reply) => {
    if (!tokenPasst(token, request.headers.authorization))
      return reply.code(401).send({ ok: false, fehler: 'Token fehlt oder falsch' });
    if (!gueltig(request.body)) return reply.code(400).send({ ok: false, fehler: 'schema fehlt' });
    speicher.setzen(request.body);
    request.log.info({ schema: request.body.schema.id }, 'Design');
    return { ok: true };
  });
  fastify.get('/api/v1/design', async (_request, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return speicher.aktuell() ?? {};
  });
}
