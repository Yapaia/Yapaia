import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync, sign, createHash, type KeyObject } from 'node:crypto';
import {
  base64UrlDecode,
  base64UrlEncode,
  keyIdOf,
  isMarketplaceKey,
  verifyRelease,
  verifyLicenseToken,
  verifyRevocations,
  isRevoked,
  type MarketplaceKey,
} from './ysig';

function makeKey(): { key: MarketplaceKey; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const x = publicKey.export({ format: 'jwk' }).x as string;
  const kid = createHash('sha256').update(Buffer.from(x, 'base64url')).digest('hex').slice(0, 16);
  return { key: { kid, public_key: x }, privateKey };
}

function signToken(payload: Record<string, unknown>, privateKey: KeyObject): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(null, Buffer.from(`ysig1.${body}`), privateKey).toString('base64url');
  return `ysig1.${body}.${sig}`;
}

const SHA = 'a'.repeat(64);

describe('ysig1', () => {
  const { key, privateKey } = makeKey();
  const release = { typ: 'addon-release', kid: key.kid, iat: 1, id: 'com.x.y', version: '1.0.0', sha256: SHA, licensing: 'paid', publisher: 'x' };

  it('base64url round-trips and matches Node', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base64UrlEncode(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
    expect([...(base64UrlDecode(Buffer.from(bytes).toString('base64url')) ?? [])]).toEqual([...bytes]);
    expect(base64UrlDecode('ab+c')).toBeNull();
  });

  it('computes kid like the server does', async () => {
    expect(await keyIdOf(key.public_key)).toBe(key.kid);
    expect(isMarketplaceKey(key)).toBe(true);
    expect(isMarketplaceKey({ kid: 'x', public_key: key.public_key })).toBe(false);
  });

  it('accepts a release signed by a trusted key', async () => {
    const res = await verifyRelease(signToken(release, privateKey), [key]);
    expect(res.ok && res.payload.licensing).toBe('paid');
  });

  it('rejects an unknown key, a tampered payload and garbage', async () => {
    const other = makeKey();
    expect((await verifyRelease(signToken(release, other.privateKey), [key])).ok).toBe(false);
    const token = signToken(release, privateKey);
    const [, , sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...release, licensing: 'free' })).toString('base64url');
    expect((await verifyRelease(`ysig1.${forged}.${sig}`, [key])).ok).toBe(false);
    for (const bad of [null, '', 'ysig1', 'ysig1.a.b', 'x.y.z', 42]) {
      expect((await verifyRelease(bad, [key])).ok).toBe(false);
    }
  });

  it('checks license binding and expiry', async () => {
    const lic = { typ: 'addon-license', kid: key.kid, iat: 1, license_id: 'l', addon_id: 'com.x.y', installation_id: 'inst-1', account: 'a', exp: null };
    const t = signToken(lic, privateKey);
    expect((await verifyLicenseToken(t, [key], { addonId: 'com.x.y', installationId: 'inst-1' })).ok).toBe(true);
    expect((await verifyLicenseToken(t, [key], { addonId: 'com.x.z', installationId: 'inst-1' })).ok).toBe(false);
    expect((await verifyLicenseToken(t, [key], { addonId: 'com.x.y', installationId: 'inst-2' })).ok).toBe(false);
    const expired = signToken({ ...lic, exp: 100 }, privateKey);
    expect((await verifyLicenseToken(expired, [key], { addonId: 'com.x.y', installationId: 'inst-1', now: 200 })).ok).toBe(false);
    // A release token is not a license.
    expect((await verifyLicenseToken(signToken(release, privateKey), [key], { addonId: 'com.x.y', installationId: 'inst-1' })).ok).toBe(false);
  });

  it('parses revocations', async () => {
    const t = signToken({ typ: 'revocations', kid: key.kid, iat: 1, entries: [{ id: 'com.x.y', version: null, reason: 'bad' }, 'junk'] }, privateKey);
    const res = await verifyRevocations(t, [key]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.payload.entries).toHaveLength(1);
    expect(isRevoked(res.payload.entries, 'com.x.y', '2.0.0')?.reason).toBe('bad');
    expect(isRevoked(res.payload.entries, 'com.x.z', '2.0.0')).toBeNull();
  });
});
