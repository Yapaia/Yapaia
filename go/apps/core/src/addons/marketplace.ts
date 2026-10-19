/* eslint-disable no-undef -- `fetch`/`Response`/`URL`/`AbortSignal` sind Standard-Globale in Node 22. */
/**
 * Die Verbindung zum Add-on-Marktplatz (`docs/marktplatz.md`).
 *
 * Hält, was Go über den Marktplatz weiß, und ist die EINE Stelle, die
 * entscheidet, welchen Signaturen Go vertraut:
 *
 *  - Adresse, Konto-Token und die beim Speichern festgehaltenen Schlüssel
 *    (`addons.marketplace`), nach dem Muster des Kartenservers: das Token geht
 *    nie zurück an die Oberfläche, ein leeres Token behält das bisherige.
 *  - den Entwicklermodus (`addons.developer_mode`): erlaubt unsignierte Pakete
 *    und `http` zum Marktplatz. Ohne ihn verlangt Go `https` -- aber NUR für
 *    die Verbindung zum Marktplatz. Go selbst und Home Assistant laufen
 *    weiter über `http` im lokalen Netz.
 *  - die Installations-Id (`addons.installation_id`), an die Lizenzen
 *    gebunden sind,
 *  - die Lizenzen (`addons.licenses`) und die Sperrliste
 *    (`addons.revocations`).
 *
 * Alles, was vom Marktplatz kommt, ist unvertrauenswürdig, bis die Signatur
 * geprüft ist (`@yapaia/shared` `verify*`).
 */

import { randomUUID } from 'node:crypto';
import {
  OFFICIAL_MARKETPLACE_KEYS,
  isMarketplaceKey,
  isRevoked,
  keyIdOf,
  verifyLicenseToken,
  verifyRevocations,
  type MarketplaceKey,
  type RevocationEntry,
} from '@yapaia/shared';
import { AddonError } from './errors.js';

export const MARKETPLACE_SETTINGS_KEY = 'addons.marketplace';
export const DEVELOPER_MODE_SETTINGS_KEY = 'addons.developer_mode';
export const INSTALLATION_ID_SETTINGS_KEY = 'addons.installation_id';
export const LICENSES_SETTINGS_KEY = 'addons.licenses';
export const REVOCATIONS_SETTINGS_KEY = 'addons.revocations';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_KEYS = 16;

export interface MarketplaceConnection {
  url: string;
  token: string;
  name: string;
  keys: MarketplaceKey[];
}

/** What the UI sees -- never the token itself. */
export interface MarketplaceView {
  url: string;
  name: string;
  token_gesetzt: boolean;
  keys: string[];
  developer_mode: boolean;
  installation_id: string;
}

export interface LicenseStatus {
  licensing: 'free' | 'paid' | 'unsigned';
  installation_id: string;
  token: string | null;
  valid: boolean;
  /** Why `valid` is false, for the UI. */
  reason?: string;
}

/** Just the settings ops this service needs (structural, like `registry.ts`). */
export interface MarketplaceSettings {
  get(key: string): unknown;
  patch(values: Record<string, unknown>): Record<string, unknown>;
}

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trims and validates a marketplace base URL. `https` is required unless
 *  `allowHttp` (developer mode). Returns `null` for anything else. */
export function normalizeMarketplaceUrl(raw: string, allowHttp: boolean): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

export class MarketplaceService {
  private readonly settings: MarketplaceSettings;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: { settings: MarketplaceSettings; fetchImpl?: FetchImpl }) {
    this.settings = opts.settings;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  // --- stored state ---------------------------------------------------------

  connection(): MarketplaceConnection | null {
    const raw = this.settings.get(MARKETPLACE_SETTINGS_KEY);
    if (!isObject(raw) || typeof raw.url !== 'string' || raw.url === '') return null;
    // An http address saved in developer mode is not used once it is off --
    // the account token never travels unencrypted outside developer mode.
    if (!normalizeMarketplaceUrl(raw.url, this.developerMode())) return null;
    return {
      url: raw.url,
      token: typeof raw.token === 'string' ? raw.token : '',
      name: typeof raw.name === 'string' ? raw.name : '',
      keys: Array.isArray(raw.keys) ? raw.keys.filter(isMarketplaceKey).slice(0, MAX_KEYS) : [],
    };
  }

  developerMode(): boolean {
    return this.settings.get(DEVELOPER_MODE_SETTINGS_KEY) === true;
  }

  setDeveloperMode(enabled: boolean): void {
    this.settings.patch({ [DEVELOPER_MODE_SETTINGS_KEY]: enabled });
  }

  /** Created once, on first use, and never changed afterwards. */
  installationId(): string {
    const existing = this.settings.get(INSTALLATION_ID_SETTINGS_KEY);
    if (typeof existing === 'string' && /^[0-9a-f-]{36}$/.test(existing)) return existing;
    const id = randomUUID();
    this.settings.patch({ [INSTALLATION_ID_SETTINGS_KEY]: id });
    return id;
  }

  /** The official keys plus those pinned for the configured marketplace. */
  trustedKeys(): MarketplaceKey[] {
    const pinned = this.connection()?.keys ?? [];
    const kids = new Set(OFFICIAL_MARKETPLACE_KEYS.map((k) => k.kid));
    return [...OFFICIAL_MARKETPLACE_KEYS, ...pinned.filter((k) => !kids.has(k.kid))];
  }

  view(): MarketplaceView {
    const c = this.connection();
    return {
      url: c?.url ?? '',
      name: c?.name ?? '',
      token_gesetzt: Boolean(c?.token),
      keys: (c?.keys ?? []).map((k) => k.kid),
      developer_mode: this.developerMode(),
      installation_id: this.installationId(),
    };
  }

  /** Whether `url` points at the configured marketplace -- the only host the
   *  account token is ever sent to. */
  isMarketplaceUrl(url: string): boolean {
    const c = this.connection();
    if (!c) return false;
    try {
      const target = new URL(url);
      const base = new URL(c.url);
      return target.origin === base.origin && target.pathname.startsWith(`${base.pathname.replace(/\/+$/, '')}/`);
    } catch {
      return false;
    }
  }

  // --- configuration ----------------------------------------------------------

  /**
   * Saves the marketplace: checks the address, fetches `GET /v1/meta`, pins
   * its keys. An empty `url` removes the connection; an empty `token` keeps
   * the stored one. Throws {@link AddonError} with a German message.
   */
  async configure(input: { url: string; token?: string }): Promise<MarketplaceView> {
    const rawUrl = input.url.trim();
    if (rawUrl === '') {
      this.settings.patch({ [MARKETPLACE_SETTINGS_KEY]: null });
      return this.view();
    }
    const url = normalizeMarketplaceUrl(rawUrl, this.developerMode());
    if (!url) {
      throw new AddonError(
        'MARKETPLACE_URL_INVALID',
        this.developerMode()
          ? 'Bitte die Adresse mit http:// oder https:// angeben.'
          : 'Der Marktplatz braucht eine https://-Adresse. Für Tests im lokalen Netz den Entwicklermodus einschalten.',
      );
    }
    const previous = this.connection();
    const token = input.token?.trim() || (previous && previous.url === url ? previous.token : '');

    const meta = await this.getJson(`${url}/v1/meta`);
    if (!isObject(meta) || !Array.isArray(meta.keys)) {
      throw new AddonError('MARKETPLACE_INVALID', 'Unter dieser Adresse antwortet kein Yapaia-Marktplatz.');
    }
    const keys: MarketplaceKey[] = [];
    for (const k of meta.keys.slice(0, MAX_KEYS)) {
      // The kid must really be derived from the key -- a server cannot make
      // one key masquerade as another (e.g. an official one).
      if (isMarketplaceKey(k) && (await keyIdOf(k.public_key)) === k.kid) {
        keys.push({ kid: k.kid, public_key: k.public_key });
      }
    }
    if (keys.length === 0) {
      throw new AddonError('MARKETPLACE_INVALID', 'Der Marktplatz nennt keinen gültigen Signaturschlüssel.');
    }
    if (token) await this.getJson(`${url}/v1/account`, token);

    const name = typeof meta.name === 'string' ? meta.name.slice(0, 100) : '';
    this.settings.patch({ [MARKETPLACE_SETTINGS_KEY]: { url, token, name, keys } });
    return this.view();
  }

  // --- licenses ----------------------------------------------------------------

  private licenses(): Record<string, string> {
    const raw = this.settings.get(LICENSES_SETTINGS_KEY);
    if (!isObject(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'));
  }

  async licenseStatus(addonId: string, licensing: LicenseStatus['licensing']): Promise<LicenseStatus> {
    const installation_id = this.installationId();
    const token = this.licenses()[addonId] ?? null;
    if (!token) {
      return { licensing, installation_id, token: null, valid: false, reason: 'Keine Lizenz hinterlegt' };
    }
    const res = await verifyLicenseToken(token, this.trustedKeys(), { addonId, installationId: installation_id });
    return res.ok
      ? { licensing, installation_id, token, valid: true }
      : { licensing, installation_id, token, valid: false, reason: res.reason };
  }

  /** Asks the marketplace for a license for this installation, verifies and
   *  stores it. */
  async activateLicense(addonId: string): Promise<LicenseStatus> {
    const c = this.requireAccount();
    const installationId = this.installationId();
    const body = await this.getJson(`${c.url}/v1/licenses/activate`, c.token, {
      method: 'POST',
      body: JSON.stringify({ addon_id: addonId, installation_id: installationId }),
    });
    const token = isObject(body) ? body.license : undefined;
    const res = await verifyLicenseToken(token, this.trustedKeys(), { addonId, installationId });
    if (!res.ok) {
      throw new AddonError('LICENSE_INVALID', `Der Marktplatz hat eine ungültige Lizenz geliefert (${res.reason}).`);
    }
    this.settings.patch({ [LICENSES_SETTINGS_KEY]: { ...this.licenses(), [addonId]: token } });
    return { licensing: 'paid', installation_id: installationId, token: token as string, valid: true };
  }

  removeLicense(addonId: string): void {
    const rest = this.licenses();
    if (!(addonId in rest)) return;
    delete rest[addonId];
    this.settings.patch({ [LICENSES_SETTINGS_KEY]: rest });
  }

  /** Headers for a download from the marketplace -- empty for any other host. */
  downloadHeaders(url: string): Record<string, string> {
    const c = this.connection();
    if (!c || !c.token || !this.isMarketplaceUrl(url)) return {};
    return { authorization: `Bearer ${c.token}`, 'x-yapaia-installation': this.installationId() };
  }

  // --- revocations -----------------------------------------------------------

  revocations(): RevocationEntry[] {
    const raw = this.settings.get(REVOCATIONS_SETTINGS_KEY);
    if (!isObject(raw) || !Array.isArray(raw.entries)) return [];
    return raw.entries as RevocationEntry[];
  }

  revocationFor(id: string, version: string): RevocationEntry | null {
    return isRevoked(this.revocations(), id, version);
  }

  /** Fetches and stores the signed revocation list. Keeps the old list on any
   *  failure, and never accepts an OLDER list than the stored one. */
  async syncRevocations(): Promise<RevocationEntry[]> {
    const c = this.connection();
    if (!c) return this.revocations();
    const body = await this.getJson(`${c.url}/v1/revocations`);
    const res = await verifyRevocations(isObject(body) ? body.token : undefined, this.trustedKeys());
    if (!res.ok) throw new AddonError('REVOCATIONS_INVALID', `Sperrliste ungültig (${res.reason})`);
    const stored = this.settings.get(REVOCATIONS_SETTINGS_KEY);
    const storedIat = isObject(stored) && typeof stored.iat === 'number' ? stored.iat : 0;
    if (res.payload.iat < storedIat) return this.revocations();
    this.settings.patch({ [REVOCATIONS_SETTINGS_KEY]: { iat: res.payload.iat, entries: res.payload.entries } });
    return res.payload.entries;
  }

  // --- HTTP -------------------------------------------------------------------

  private requireAccount(): MarketplaceConnection {
    const c = this.connection();
    if (!c) throw new AddonError('MARKETPLACE_NOT_CONFIGURED', 'Es ist kein Marktplatz eingetragen.');
    if (!c.token) throw new AddonError('MARKETPLACE_NO_ACCOUNT', 'Für dieses Add-on wird ein Marktplatz-Konto (Token) gebraucht.');
    return c;
  }

  private async getJson(url: string, token?: string, init: RequestInit = {}): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        ...init,
        headers: {
          accept: 'application/json',
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AddonError(
        'MARKETPLACE_UNREACHABLE',
        `Marktplatz nicht erreichbar (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const code = isObject(body) && isObject(body.error) && typeof body.error.code === 'string' ? body.error.code : '';
      if (res.status === 401) throw new AddonError('MARKETPLACE_TOKEN_REJECTED', 'Der Marktplatz hat das Konto-Token abgelehnt.');
      if (code === 'NOT_ENTITLED') throw new AddonError('NOT_ENTITLED', 'Dieses Add-on ist nicht in deinem Marktplatz-Konto.');
      if (code === 'ACTIVATION_LIMIT') {
        throw new AddonError('ACTIVATION_LIMIT', 'Die Lizenz ist schon auf der erlaubten Zahl von Installationen aktiviert.');
      }
      throw new AddonError('MARKETPLACE_ERROR', `Marktplatz antwortet mit HTTP ${res.status}${code ? ` (${code})` : ''}`);
    }
    return body;
  }
}
