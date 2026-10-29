import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registriereHaSprache } from './sprache.js';

function speicher() {
  const werte: Record<string, unknown> = {};
  return {
    werte,
    get: (k: string) => werte[k],
    patch: (v: Record<string, unknown>) => Object.assign(werte, v),
  };
}

describe('Sprache (Protokoll §8b)', () => {
  it('legt die HA-Sprache als Einstellung language ab; fremde Sprachen werden Englisch', async () => {
    const app = Fastify();
    const e = speicher();
    await registriereHaSprache(app, e, 'geheim');
    const senden = (
      payload: unknown,
      headers: Record<string, string> = { authorization: 'Bearer geheim' }
    ) =>
      app.inject({
        method: 'POST',
        url: '/yapaia/v1/sprache',
        payload: payload as object,
        headers,
      });
    expect((await senden({ sprache: 'de' }, {})).statusCode).toBe(401);
    expect((await senden({ x: 1 })).statusCode).toBe(400);
    expect((await senden({ sprache: 'de' })).json()).toEqual({ ok: true });
    expect(e.werte.language).toBe('de');
    await senden({ sprache: 'fr' });
    expect(e.werte.language).toBe('en');
  });
});
