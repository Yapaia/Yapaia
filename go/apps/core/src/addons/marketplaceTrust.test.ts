/**
 * The marketplace trust rules (`docs/marktplatz.md`):
 *
 *  - unit level (`InstallService` + `MarketplaceService` with in-memory
 *    settings): signature required outside developer mode, signature bound to
 *    bytes/id/version, revocations, license gate on enable, `reconcile()`;
 *  - route level (real `buildServer()` + a local mock marketplace): https rule,
 *    key pinning, catalog install by id with the account token, license
 *    activation, the add-on-facing license endpoint.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { Buffer } from 'node:buffer';
import type { FastifyInstance } from 'fastify';
import { OFFICIAL_MARKETPLACE_KEYS, type MarketplaceKey } from '@yapaia/shared';
import { createDb, closeDb } from '../db/index.js';
import { buildServer } from '../index.js';
import { AddonRepository } from './repository.js';
import { InstallService } from './installService.js';
import { MarketplaceService, normalizeMarketplaceUrl, marketplaceBaseOf, MARKETPLACE_SETTINGS_KEY } from './marketplace.js';
import { AddonError } from './errors.js';
import { AddonStorageService } from './storageService.js';
import { buildValidAddonTarball } from './__fixtures__/buildTarball.js';

// --- signing helpers (what the marketplace server does) ---------------------

interface TestSigner {
  key: MarketplaceKey;
  sign(payload: Record<string, unknown>): string;
}

function makeSigner(): TestSigner {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const x = publicKey.export({ format: 'jwk' }).x as string;
  const kid = createHash('sha256').update(Buffer.from(x, 'base64url')).digest('hex').slice(0, 16);
  const key = { kid, public_key: x };
  return {
    key,
    sign: (payload) => signWith(privateKey, { kid, iat: Math.floor(Date.now() / 1000), ...payload }),
  };
}

function signWith(privateKey: KeyObject, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `ysig1.${body}.${sign(null, Buffer.from(`ysig1.${body}`), privateKey).toString('base64url')}`;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function memorySettings(): { get(k: string): unknown; patch(v: Record<string, unknown>): Record<string, unknown>; store: Record<string, unknown> } {
  const store: Record<string, unknown> = {};
  return {
    store,
    get: (k) => store[k],
    patch: (v) => Object.assign(store, v),
  };
}

// --- unit level ---------------------------------------------------------------

describe('marketplace trust rules (unit)', () => {
  let parent: string;
  let db: ReturnType<typeof createDb>;
  let settings: ReturnType<typeof memorySettings>;
  let marketplace: MarketplaceService;
  let service: InstallService;
  let signer: TestSigner;

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'addon-trust-test-'));
    db = createDb(':memory:');
    settings = memorySettings();
    signer = makeSigner();
    marketplace = new MarketplaceService({ settings });
    // Pin the test key as if `configure()` had fetched it from `/v1/meta`.
    settings.patch({ [MARKETPLACE_SETTINGS_KEY]: { url: 'https://market.test', token: 'acc', name: 'Test', keys: [signer.key] } });
    service = new InstallService({
      repository: new AddonRepository(db),
      coreVersion: '1.4.0',
      addonsRootDir: join(parent, 'addons'),
      addonsStorageRootDir: join(parent, 'storage'),
      addonStorage: new AddonStorageService(memorySettings()),
      trust: marketplace,
    });
  });

  afterEach(() => {
    db.close();
    rmSync(parent, { recursive: true, force: true });
  });

  async function pkg(version = '1.0.0'): Promise<{ bytes: Buffer; id: string; version: string }> {
    const { bytes, manifest } = await buildValidAddonTarball({ manifest: { core_api: '^1.0', version } });
    return { bytes, id: manifest.id, version: manifest.version };
  }

  function release(p: { bytes: Buffer; id: string; version: string }, licensing: 'free' | 'paid' = 'free'): string {
    return signer.sign({ typ: 'addon-release', id: p.id, version: p.version, sha256: sha256(p.bytes), licensing, publisher: 'test' });
  }

  async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AddonError && e.code === code);
  }

  it('refuses an unsigned package outside developer mode, accepts it in developer mode', async () => {
    const p = await pkg();
    await expectCode(service.beginInstallFromUpload(p.bytes), 'SIGNATURE_REQUIRED');
    marketplace.setDeveloperMode(true);
    const pending = await service.beginInstallFromUpload(p.bytes);
    expect(pending.release).toBeNull();
    const record = await service.confirmInstall(pending.pendingId);
    expect(record.licensing).toBe('unsigned');
  });

  it('accepts a valid signature and records licensing + publisher', async () => {
    const p = await pkg();
    const pending = await service.beginInstallFromUpload(p.bytes, undefined, release(p, 'free'));
    expect(pending.release).toMatchObject({ licensing: 'free', publisher: 'test', kid: signer.key.kid });
    const record = await service.confirmInstall(pending.pendingId);
    expect(record).toMatchObject({ licensing: 'free', publisher: 'test' });
  });

  it('refuses a signature for other bytes, another version or an unknown key -- even in developer mode', async () => {
    marketplace.setDeveloperMode(true);
    const p = await pkg();
    const other = await pkg('1.0.1');
    await expectCode(service.beginInstallFromUpload(other.bytes, undefined, release(p)), 'SIGNATURE_INVALID');
    const wrongVersion = signer.sign({ typ: 'addon-release', id: p.id, version: '9.9.9', sha256: sha256(p.bytes), licensing: 'free', publisher: 't' });
    await expectCode(service.beginInstallFromUpload(p.bytes, undefined, wrongVersion), 'SIGNATURE_INVALID');
    const stranger = makeSigner();
    const foreign = stranger.sign({ typ: 'addon-release', id: p.id, version: p.version, sha256: sha256(p.bytes), licensing: 'free', publisher: 't' });
    await expectCode(service.beginInstallFromUpload(p.bytes, undefined, foreign), 'SIGNATURE_INVALID');
    await expectCode(service.beginInstallFromUpload(p.bytes, undefined, 'garbage'), 'SIGNATURE_INVALID');
  });

  it('a paid add-on cannot be enabled without a license for THIS installation', async () => {
    const p = await pkg();
    const pending = await service.beginInstallFromUpload(p.bytes, undefined, release(p, 'paid'));
    await service.confirmInstall(pending.pendingId);
    await expectCode(service.enableChecked(p.id), 'LICENSE_REQUIRED');

    const license = (installation: string, exp: number | null = null): string =>
      signer.sign({ typ: 'addon-license', license_id: 'l1', addon_id: p.id, installation_id: installation, account: 'a', exp });
    settings.patch({ 'addons.licenses': { [p.id]: license('someone-else') } });
    await expectCode(service.enableChecked(p.id), 'LICENSE_REQUIRED');

    settings.patch({ 'addons.licenses': { [p.id]: license(marketplace.installationId()) } });
    expect((await service.enableChecked(p.id)).enabled).toBe(true);

    // Expired -> reconcile() disables it again.
    settings.patch({ 'addons.licenses': { [p.id]: license(marketplace.installationId(), 1) } });
    expect(await service.reconcile()).toEqual([p.id]);
    expect(new AddonRepository(db).getById(p.id)?.enabled).toBe(false);
  });

  it('revocations block install and enable, and reconcile() disables a running add-on', async () => {
    const p = await pkg();
    const pending = await service.beginInstallFromUpload(p.bytes, undefined, release(p));
    await service.confirmInstall(pending.pendingId);
    await service.enableChecked(p.id);

    settings.patch({ 'addons.revocations': { iat: 1, entries: [{ id: p.id, version: null, reason: 'Schadcode' }] } });
    expect(await service.reconcile()).toEqual([p.id]);
    await expectCode(service.enableChecked(p.id), 'ADDON_REVOKED');
    await expectCode(service.beginInstallFromUpload(p.bytes, undefined, release(p)), 'ADDON_REVOKED');
  });

  it('only sends the account token to the configured marketplace', () => {
    expect(marketplace.downloadHeaders('https://market.test/v1/addons/x/1.0.0/download')).toHaveProperty('authorization', 'Bearer acc');
    expect(marketplace.downloadHeaders('https://evil.test/v1/addons/x/1.0.0/download')).toEqual({});
    expect(marketplace.downloadHeaders('https://market.test.evil.test/v1/x')).toEqual({});
  });

  it('derives the marketplace behind a catalog URL (for its revocation list)', () => {
    expect(marketplaceBaseOf('https://addons.yapaia.cloud/v1/index.json')).toBe('https://addons.yapaia.cloud');
    expect(marketplaceBaseOf('https://x.example/sub/v1/index.json')).toBe('https://x.example/sub');
    expect(marketplaceBaseOf('https://raw.githubusercontent.com/o/r/main/index.json')).toBeNull();
    expect(marketplaceBaseOf('http://127.0.0.1:8787/v1/index.json')).toBeNull();
    expect(marketplaceBaseOf(undefined)).toBeNull();
  });

  it('requires https for the marketplace unless developer mode is on', () => {
    expect(normalizeMarketplaceUrl('https://a.example/', false)).toBe('https://a.example');
    expect(normalizeMarketplaceUrl('http://192.168.1.5:8787', false)).toBeNull();
    expect(normalizeMarketplaceUrl('http://192.168.1.5:8787', true)).toBe('http://192.168.1.5:8787');
    expect(normalizeMarketplaceUrl('ftp://a.example', true)).toBeNull();
    expect(normalizeMarketplaceUrl('https://user:pw@a.example', false)).toBeNull();
  });

  it('ignores an http marketplace once developer mode is switched off', () => {
    settings.patch({ [MARKETPLACE_SETTINGS_KEY]: { url: 'http://lan.test:8787', token: 'acc', name: '', keys: [signer.key] } });
    marketplace.setDeveloperMode(true);
    expect(marketplace.connection()?.url).toBe('http://lan.test:8787');
    marketplace.setDeveloperMode(false);
    expect(marketplace.connection()).toBeNull();
    // Only the built-in official keys remain -- the pinned key of the http
    // marketplace is gone.
    expect(marketplace.trustedKeys()).toEqual([...OFFICIAL_MARKETPLACE_KEYS]);
    expect(marketplace.trustedKeys().map((k) => k.kid)).not.toContain(signer.key.kid);
  });
});

// --- route level, against a mock marketplace ----------------------------------

describe('marketplace routes (E2E against a mock marketplace)', () => {
  let server: FastifyInstance;
  let market: Server;
  let marketUrl: string;
  let signer: TestSigner;
  let parent: string;
  let seenAuth: Array<string | undefined>;
  const files = new Map<string, Buffer>();
  let index: unknown[] = [];

  beforeEach(async () => {
    parent = mkdtempSync(join(tmpdir(), 'addon-market-routes-'));
    process.env.ADDONS_DIR = join(parent, 'addons');
    process.env.ADDON_STORAGE_DIR = join(parent, 'storage');
    process.env.DB_PATH = ':memory:';
    delete process.env.ADDONS_REGISTRY_URL;
    closeDb();
    signer = makeSigner();
    seenAuth = [];
    files.clear();
    index = [];

    market = createServer((req: IncomingMessage, res: ServerResponse) => {
      const send = (status: number, body: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      const url = req.url ?? '';
      if (url === '/v1/meta') return send(200, { name: 'Testmarkt', api: 1, keys: [signer.key] });
      if (url === '/v1/account') {
        return req.headers.authorization === 'Bearer good' ? send(200, { account: 'acc_1', entitlements: [] }) : send(401, { error: { code: 'UNAUTHORIZED', message: 'x' } });
      }
      if (url === '/v1/index.json') return send(200, index);
      if (url === '/v1/revocations') return send(200, { token: signer.sign({ typ: 'revocations', entries: [] }) });
      if (url === '/v1/licenses/activate' && req.method === 'POST') {
        let raw = '';
        req.on('data', (c: Buffer) => (raw += c.toString()));
        req.on('end', () => {
          const body = JSON.parse(raw) as { addon_id: string; installation_id: string };
          send(200, {
            license: signer.sign({ typ: 'addon-license', license_id: 'l1', addon_id: body.addon_id, installation_id: body.installation_id, account: 'acc_1', exp: null }),
          });
        });
        return;
      }
      const file = files.get(url);
      if (file) {
        seenAuth.push(req.headers.authorization);
        if (req.headers.authorization !== 'Bearer good') return send(401, { error: { code: 'UNAUTHORIZED', message: 'x' } });
        res.writeHead(200, { 'content-type': 'application/gzip' });
        res.end(file);
        return;
      }
      send(404, { error: { code: 'NOT_FOUND', message: url } });
    });
    await new Promise<void>((r) => market.listen(0, '127.0.0.1', () => r()));
    const addr = market.address();
    marketUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
    await new Promise<void>((r) => market.close(() => r()));
    closeDb();
    delete process.env.ADDONS_DIR;
    delete process.env.ADDON_STORAGE_DIR;
    rmSync(parent, { recursive: true, force: true });
  });

  it('http marketplace is refused without developer mode', async () => {
    const res = await server.inject({ method: 'PUT', url: '/api/v1/addons/marketplace', payload: { url: marketUrl } });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('MARKETPLACE_URL_INVALID');
  });

  it('installs a paid add-on from the catalog by id, activates its license, and serves it to the add-on', async () => {
    await server.inject({ method: 'PUT', url: '/api/v1/addons/marketplace/developer-mode', payload: { enabled: true } });

    const badToken = await server.inject({ method: 'PUT', url: '/api/v1/addons/marketplace', payload: { url: marketUrl, token: 'bad' } });
    expect(badToken.statusCode).toBe(403);

    const saved = await server.inject({ method: 'PUT', url: '/api/v1/addons/marketplace', payload: { url: `${marketUrl}/`, token: 'good' } });
    expect(saved.statusCode).toBe(200);
    const view = JSON.parse(saved.body).data;
    expect(view).toMatchObject({ url: marketUrl, name: 'Testmarkt', token_gesetzt: true, keys: [signer.key.kid] });
    expect(JSON.stringify(view)).not.toContain('good');

    const { bytes, manifest } = await buildValidAddonTarball({ manifest: { core_api: '*' } });
    const path = `/v1/addons/${manifest.id}/${manifest.version}/download`;
    files.set(path, bytes);
    index = [
      {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: 'Test',
        download_url: `${marketUrl}${path}`,
        sha256: sha256(bytes),
        scopes: manifest.permissions,
        core_api: '*',
        licensing: 'paid',
        signature: signer.sign({ typ: 'addon-release', id: manifest.id, version: manifest.version, sha256: sha256(bytes), licensing: 'paid', publisher: 'test' }),
      },
    ];

    const sync = await server.inject({ method: 'POST', url: '/api/v1/addons/registry/sync' });
    expect(sync.statusCode).toBe(200);
    const entry = JSON.parse(sync.body).data.entries[0];
    expect(entry).toMatchObject({ id: manifest.id, verified: true, licensing: 'paid', revoked: false });

    const begin = await server.inject({ method: 'POST', url: '/api/v1/addons/registry/install', payload: { id: manifest.id } });
    expect(begin.statusCode).toBe(202);
    const pending = JSON.parse(begin.body).data;
    expect(pending.release).toMatchObject({ licensing: 'paid' });
    expect(pending.license).toEqual({ valid: true });
    expect(seenAuth).toEqual(['Bearer good']);

    const confirm = await server.inject({ method: 'POST', url: `/api/v1/addons/install/${pending.pending_id}/confirm` });
    expect(confirm.statusCode).toBe(201);
    const enable = await server.inject({ method: 'POST', url: `/api/v1/addons/${manifest.id}/enable` });
    expect(enable.statusCode).toBe(200);

    const license = await server.inject({ method: 'GET', url: `/api/v1/addons/${manifest.id}/license` });
    expect(JSON.parse(license.body).data).toMatchObject({ licensing: 'paid', valid: true, installation_id: view.installation_id });
  });

  it('a tampered catalog hash is caught by the signature, not trusted from the catalog', async () => {
    await server.inject({ method: 'PUT', url: '/api/v1/addons/marketplace/developer-mode', payload: { enabled: true } });
    await server.inject({ method: 'PUT', url: '/api/v1/addons/marketplace', payload: { url: marketUrl, token: 'good' } });
    const { bytes, manifest } = await buildValidAddonTarball({ manifest: { core_api: '*' } });
    const { bytes: evil } = await buildValidAddonTarball({ manifest: { core_api: '*', description: 'evil' } });
    const path = `/v1/addons/${manifest.id}/${manifest.version}/download`;
    files.set(path, evil);
    index = [
      {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: 'Test',
        download_url: `${marketUrl}${path}`,
        sha256: sha256(evil), // the catalog lies consistently ...
        scopes: manifest.permissions,
        core_api: '*',
        // ... but the signature is over the real bytes.
        signature: signer.sign({ typ: 'addon-release', id: manifest.id, version: manifest.version, sha256: sha256(bytes), licensing: 'free', publisher: 'test' }),
      },
    ];
    await server.inject({ method: 'POST', url: '/api/v1/addons/registry/sync' });
    const begin = await server.inject({ method: 'POST', url: '/api/v1/addons/registry/install', payload: { id: manifest.id } });
    expect(begin.statusCode).toBe(403);
    expect(JSON.parse(begin.body).error.code).toBe('SIGNATURE_INVALID');
  });
});
