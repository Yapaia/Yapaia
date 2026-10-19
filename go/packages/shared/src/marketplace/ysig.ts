/**
 * `ysig1` -- the signed-token format of the add-on marketplace
 * (`docs/marktplatz.md`). One format for three payload types: a signed
 * release, a per-installation license and the revocation list.
 *
 *   ysig1.<base64url(JSON payload)>.<base64url(Ed25519 signature)>
 *
 * The signature covers the ASCII bytes `ysig1.<payload>`. Verification uses
 * WebCrypto (`globalThis.crypto.subtle`, Ed25519), which exists in Node >= 20
 * and in current browsers -- so the SAME code runs in the Core, in the web app
 * and inside an add-on (via `@yapaia/addon-sdk`'s `verifyLicense`).
 *
 * This module never throws on hostile input: every failure is a
 * `{ ok: false, reason }` result, because every token it sees is untrusted
 * remote input.
 */

export const YSIG_PREFIX = 'ysig1';

/** A public key the verifier trusts. `public_key` is base64url of the 32 raw
 *  Ed25519 bytes; `kid` is the first 16 hex chars of sha256 over them. */
export interface MarketplaceKey {
  kid: string;
  public_key: string;
}

export type AddonLicensing = 'free' | 'paid';

export interface ReleasePayload {
  typ: 'addon-release';
  kid: string;
  iat: number;
  id: string;
  version: string;
  sha256: string;
  licensing: AddonLicensing;
  publisher: string;
}

export interface LicensePayload {
  typ: 'addon-license';
  kid: string;
  iat: number;
  license_id: string;
  addon_id: string;
  installation_id: string;
  account: string;
  /** Unix seconds, or `null` for a license that never expires. */
  exp: number | null;
}

export interface RevocationEntry {
  id: string;
  /** `null` revokes every version of the add-on. */
  version: string | null;
  reason: string;
}

export interface RevocationsPayload {
  typ: 'revocations';
  kid: string;
  iat: number;
  entries: RevocationEntry[];
}

export type YsigPayload = ReleasePayload | LicensePayload | RevocationsPayload;

export type YsigResult<T> = { ok: true; payload: T } | { ok: false; reason: string };

/** Bounds on untrusted input, so a hostile index cannot make us parse
 *  megabytes per entry. */
const MAX_TOKEN_LENGTH = 64 * 1024;

// -- minimal WebCrypto/encoding typings ---------------------------------------
// `@yapaia/shared` compiles against plain ES2020 (no DOM lib), so the few
// globals used here are typed locally instead of widening the whole package.
interface SubtleLike {
  importKey(format: 'raw', key: Uint8Array, alg: { name: 'Ed25519' }, extractable: boolean, usages: string[]): Promise<unknown>;
  verify(alg: { name: 'Ed25519' }, key: unknown, signature: Uint8Array, data: Uint8Array): Promise<boolean>;
  digest(alg: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}
interface CryptoGlobals {
  crypto?: { subtle?: SubtleLike };
  TextEncoder: new () => { encode(s: string): Uint8Array };
  TextDecoder: new (label?: string, opts?: { fatal?: boolean }) => { decode(b: Uint8Array): string };
}
const g = globalThis as unknown as CryptoGlobals;

function subtle(): SubtleLike | null {
  return g.crypto?.subtle ?? null;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64URL_LOOKUP: Record<string, number> = Object.fromEntries([...B64URL].map((c, i) => [c, i]));

/** Strict base64url (no padding) -> bytes, `null` on any foreign character. */
export function base64UrlDecode(input: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(input) || input.length % 4 === 1) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of input) {
    buffer = (buffer << 6) | B64URL_LOOKUP[ch];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64URL[(buffer >> bits) & 0x3f];
    }
    buffer &= 0xff;
  }
  if (bits > 0) out += B64URL[(buffer << (6 - bits)) & 0x3f];
  return out;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `kid` of a base64url public key, or `null` if the key is not 32 bytes. */
export async function keyIdOf(publicKey: string): Promise<string | null> {
  const raw = base64UrlDecode(publicKey);
  const s = subtle();
  if (!raw || raw.length !== 32 || !s) return null;
  const digest = new Uint8Array(await s.digest('SHA-256', raw));
  return toHex(digest).slice(0, 16);
}

/** Shape check for a key list coming from settings or `GET /v1/meta`. */
export function isMarketplaceKey(value: unknown): value is MarketplaceKey {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kid === 'string' &&
    /^[a-f0-9]{16}$/.test(v.kid) &&
    typeof v.public_key === 'string' &&
    base64UrlDecode(v.public_key)?.length === 32
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses and verifies a token against `keys`. Checks the format, that the
 * payload's `kid` names one of `keys`, and the Ed25519 signature. Says
 * nothing about the payload's MEANING -- the typed wrappers below do that.
 */
export async function verifyYsig(token: unknown, keys: readonly MarketplaceKey[]): Promise<YsigResult<Record<string, unknown>>> {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: 'token missing or too long' };
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== YSIG_PREFIX) {
    return { ok: false, reason: 'not a ysig1 token' };
  }
  const payloadBytes = base64UrlDecode(parts[1]);
  const signature = base64UrlDecode(parts[2]);
  if (!payloadBytes || !signature || signature.length !== 64) {
    return { ok: false, reason: 'token is not valid base64url' };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new g.TextDecoder('utf-8', { fatal: true }).decode(payloadBytes));
  } catch {
    return { ok: false, reason: 'payload is not JSON' };
  }
  if (!isObject(payload) || typeof payload.kid !== 'string' || typeof payload.typ !== 'string') {
    return { ok: false, reason: 'payload lacks typ/kid' };
  }
  const key = keys.find((k) => k.kid === payload.kid);
  if (!key) return { ok: false, reason: `unknown signing key ${payload.kid}` };
  const s = subtle();
  const rawKey = base64UrlDecode(key.public_key);
  if (!s || !rawKey || rawKey.length !== 32) return { ok: false, reason: 'no usable public key' };
  try {
    const cryptoKey = await s.importKey('raw', rawKey, { name: 'Ed25519' }, false, ['verify']);
    const signed = new g.TextEncoder().encode(`${YSIG_PREFIX}.${parts[1]}`);
    const valid = await s.verify({ name: 'Ed25519' }, cryptoKey, signature, signed);
    if (!valid) return { ok: false, reason: 'signature does not match' };
  } catch {
    return { ok: false, reason: 'signature could not be checked' };
  }
  return { ok: true, payload };
}

const SHA256_RE = /^[a-f0-9]{64}$/;

/** Verifies an `addon-release` token. */
export async function verifyRelease(token: unknown, keys: readonly MarketplaceKey[]): Promise<YsigResult<ReleasePayload>> {
  const res = await verifyYsig(token, keys);
  if (!res.ok) return res;
  const p = res.payload;
  if (
    p.typ !== 'addon-release' ||
    typeof p.id !== 'string' ||
    typeof p.version !== 'string' ||
    typeof p.sha256 !== 'string' ||
    !SHA256_RE.test(p.sha256) ||
    (p.licensing !== 'free' && p.licensing !== 'paid') ||
    typeof p.publisher !== 'string' ||
    typeof p.iat !== 'number'
  ) {
    return { ok: false, reason: 'not a valid addon-release payload' };
  }
  return { ok: true, payload: p as unknown as ReleasePayload };
}

export interface LicenseExpectation {
  addonId: string;
  installationId: string;
  /** Unix seconds; defaults to now. */
  now?: number;
}

/** Verifies an `addon-license` token AND that it belongs to this add-on on
 *  this installation and has not expired. */
export async function verifyLicenseToken(
  token: unknown,
  keys: readonly MarketplaceKey[],
  expect: LicenseExpectation,
): Promise<YsigResult<LicensePayload>> {
  const res = await verifyYsig(token, keys);
  if (!res.ok) return res;
  const p = res.payload;
  if (
    p.typ !== 'addon-license' ||
    typeof p.license_id !== 'string' ||
    typeof p.addon_id !== 'string' ||
    typeof p.installation_id !== 'string' ||
    typeof p.account !== 'string' ||
    typeof p.iat !== 'number' ||
    !(p.exp === null || typeof p.exp === 'number')
  ) {
    return { ok: false, reason: 'not a valid addon-license payload' };
  }
  if (p.addon_id !== expect.addonId) return { ok: false, reason: 'license is for another add-on' };
  if (p.installation_id !== expect.installationId) return { ok: false, reason: 'license is for another installation' };
  const now = expect.now ?? Math.floor(Date.now() / 1000);
  if (typeof p.exp === 'number' && p.exp < now) return { ok: false, reason: 'license expired' };
  return { ok: true, payload: p as unknown as LicensePayload };
}

/** Verifies a `revocations` token; malformed entries are dropped. */
export async function verifyRevocations(
  token: unknown,
  keys: readonly MarketplaceKey[],
): Promise<YsigResult<RevocationsPayload>> {
  const res = await verifyYsig(token, keys);
  if (!res.ok) return res;
  const p = res.payload;
  if (p.typ !== 'revocations' || !Array.isArray(p.entries) || typeof p.iat !== 'number') {
    return { ok: false, reason: 'not a valid revocations payload' };
  }
  const entries: RevocationEntry[] = [];
  for (const e of p.entries.slice(0, 10_000)) {
    if (!isObject(e) || typeof e.id !== 'string') continue;
    entries.push({
      id: e.id,
      version: typeof e.version === 'string' ? e.version : null,
      reason: typeof e.reason === 'string' ? e.reason.slice(0, 500) : '',
    });
  }
  return { ok: true, payload: { typ: 'revocations', kid: p.kid as string, iat: p.iat, entries } };
}

/** Whether `revocations` covers this add-on version. */
export function isRevoked(entries: readonly RevocationEntry[], id: string, version: string): RevocationEntry | null {
  return entries.find((e) => e.id === id && (e.version === null || e.version === version)) ?? null;
}
