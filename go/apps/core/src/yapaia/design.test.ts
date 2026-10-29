import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesignSpeicher, registriereDesign } from './design.js';

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('Design (Protokoll §8a)', () => {
  it('nimmt das Schema mit Token an, merkt es sich und gibt es der Oberfläche', async () => {
    dir = mkdtempSync(join(tmpdir(), 'design-'));
    const pfad = join(dir, 'design.json');
    const app = Fastify();
    await registriereDesign(app, new DesignSpeicher(pfad), 'geheim');
    expect((await app.inject({ method: 'GET', url: '/api/v1/design' })).json()).toEqual({});
    const daten = {
      schema: { id: 'sport', hell: false, css: { '--y-grund': '#0a0d14' } },
      eigenes: true,
    };
    expect(
      (await app.inject({ method: 'POST', url: '/yapaia/v1/design', payload: daten })).statusCode
    ).toBe(401);
    const kopf = { authorization: 'Bearer geheim' };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/yapaia/v1/design',
          payload: { x: 1 },
          headers: kopf,
        })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/yapaia/v1/design',
          payload: daten,
          headers: kopf,
        })
      ).statusCode
    ).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/design' })).json()).toEqual(daten);
    // nach Neustart noch da
    expect(new DesignSpeicher(pfad).aktuell()).toEqual(daten);
    await app.close();
  });
});
