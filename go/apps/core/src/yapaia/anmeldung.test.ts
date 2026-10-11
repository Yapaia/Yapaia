import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integrationBereitstellen, melden, vergleiche } from './anmeldung.js';

const IDENT = { instanz: 'a1', token: 'geheim' };
const still = { info: () => {}, warn: () => {} };

describe('Anmeldung beim Supervisor', () => {
  it('meldet sich mit Hostname, Port, Token und Version', async () => {
    const aufrufe: Array<{ url: string; body?: string }> = [];
    const ok = await melden({
      supervisorToken: 'sv',
      port: 8099,
      ident: IDENT,
      version: '0.44.0',
      logger: still,
      fetch: async (url, init) => {
        aufrufe.push({ url, body: init?.body });
        return { ok: true, status: 200, json: async () => ({ data: { hostname: 'a0d7b954-yapaja-go' } }) };
      },
    });
    expect(ok).toBe(true);
    expect(aufrufe[0].url).toBe('http://supervisor/addons/self/info');
    expect(aufrufe[1].url).toBe('http://supervisor/discovery');
    expect(JSON.parse(aufrufe[1].body!)).toEqual({
      service: 'yapaia',
      config: { modul: 'go', instanz: 'a1', name: 'Yapaia Go', host: 'a0d7b954-yapaja-go', port: 8099, token: 'geheim', protokoll: 1, version: '0.44.0' },
    });
  });

  it('ohne Supervisor oder bei Fehlern: false, nie eine Ausnahme', async () => {
    expect(await melden({ supervisorToken: undefined, port: 1, ident: IDENT, version: '1', logger: still })).toBe(false);
    expect(
      await melden({
        supervisorToken: 'sv', port: 1, ident: IDENT, version: '1', logger: still,
        fetch: async () => Promise.reject(new Error('weg')),
      }),
    ).toBe(false);
  });
});

describe('Integration bereitstellen', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function integration(pfad: string, version: string): void {
    mkdirSync(pfad, { recursive: true });
    writeFileSync(join(pfad, 'manifest.json'), JSON.stringify({ domain: 'yapaia', version }));
    writeFileSync(join(pfad, '__init__.py'), `# ${version}\n`);
  }

  it('installiert, aktualisiert, laesst Neueres und Gleiches stehen', async () => {
    dir = mkdtempSync(join(tmpdir(), 'yapaia-'));
    const quelle = join(dir, 'quelle');
    const ha = join(dir, 'ha');
    const ziel = join(ha, 'custom_components', 'yapaia', '__init__.py');
    integration(quelle, '0.3.0');

    expect(await integrationBereitstellen(quelle, ha)).toBe('installiert');
    expect(readFileSync(ziel, 'utf-8')).toBe('# 0.3.0\n');
    expect(await integrationBereitstellen(quelle, ha)).toBeNull();

    integration(join(ha, 'custom_components', 'yapaia'), '0.2.9');
    expect(await integrationBereitstellen(quelle, ha)).toBe('aktualisiert');

    integration(join(ha, 'custom_components', 'yapaia'), '0.10.0');
    expect(await integrationBereitstellen(quelle, ha)).toBeNull();
    expect(readFileSync(ziel, 'utf-8')).toBe('# 0.10.0\n');
  });

  it('ohne mitgebrachte Integration (leerer Bau-Kontext): nichts', async () => {
    dir = mkdtempSync(join(tmpdir(), 'yapaia-'));
    expect(await integrationBereitstellen(join(dir, 'fehlt'), join(dir, 'ha'))).toBeNull();
  });

  it('vergleicht Versionen numerisch', () => {
    expect(vergleiche('0.10.0', '0.9.9')).toBe(1);
    expect(vergleiche('1.0', '1.0.0')).toBe(0);
    expect(vergleiche('0.2.0', '0.3.0')).toBe(-1);
  });
});
