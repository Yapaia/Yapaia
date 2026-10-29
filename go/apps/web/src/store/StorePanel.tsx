/**
 * Add-on Store panel (E09-T7, docs/05 §5, Wargame W-11/W-13). Follows the
 * SAME toggle-FAB + floating panel pattern as `RegionsPanel.tsx` (E01-T5) --
 * top-right, stacked BELOW MapLibre's own NavigationControl AND RegionsPanel's
 * FAB (`top-36` vs. RegionsPanel's `top-20` -- see the `return`'s own comment
 * for the exact pixel math) so the two "Store" surfaces (the region/map one
 * and this add-on one, see `driveLock.ts`'s `'store'` vs. `'addon-store'`
 * doc comment) never overlap each other OR MapLibre's zoom/compass controls.
 *
 * Structure:
 *  - "Katalog" tab: registry catalog cards (icon, description, scope
 *    preview, screenshots) -> click opens the detail view (in-panel, no
 *    router in this app) -> "Installieren" starts the two-step
 *    scope-confirm flow that already exists server-side (E09-T1) -> a local
 *    "job progress" state machine narrates begin/confirm/done.
 *    core_api-INCOMPATIBLE entries render a blocking notice INSTEAD of an
 *    install button (acceptance criterion 2, Wargame W-11) -- computed by
 *    the Core (`compatible` field) so this is never re-implemented here.
 *  - "Updates" tab: every INSTALLED add-on that has a newer, VALID registry
 *    entry, installed-version vs. registry-version, with the SAME
 *    compatibility gate as the catalog. Also the only place this app
 *    currently offers enable/disable/uninstall for an installed add-on (no
 *    other surface exists yet -- see `apps/web/src/addons/` header docs) --
 *    and, for an `events.publish` add-on, the E09-T8 "In Home Assistant
 *    verfügbar" MQTT-republish toggle, which takes effect immediately
 *    server-side (no restart/reconnect).
 *  - Offline banner (W-13): the cache's age ("Stand: ..."), a manual sync
 *    button, and an ALWAYS-VISIBLE, upload-install section that is called
 *    out more prominently the moment a sync fails or nothing has ever been
 *    synced -- "the store must stay usable with cache + upload" holds even
 *    if a user never manually retries the sync button.
 *  - Marketplace (docs/marktplatz.md, `MarktplatzSection.tsx`): address,
 *    account token, developer mode. Catalog installs send only the id; the
 *    Core verifies the signature. Entries show "Geprüft" or "Unsigniert",
 *    paid ones their price; a revoked entry shows a notice, never a button.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { compareVersions } from '@yapaia/shared';
import { useUiStore } from '../ui/store.js';
import DriveLockGate from '../drive/DriveLockGate.js';
import { fetchAddons, type InstalledAddon } from '../addons/client.js';
import {
  fetchRegistryCatalog,
  syncRegistry,
  beginInstallFromCatalog,
  activateLicense,
  beginInstallFromUpload,
  confirmPendingInstall,
  enableAddon,
  disableAddon,
  setAddonMqttEnabled,
  uninstallAddonById,
  arrayBufferToBase64,
  StoreApiError,
  type RegistryCatalog,
  type RegistryEntryView,
  type PendingInstall,
} from './client.js';

import { TOP_RIGHT_INSET_PX, topRightSlotPx } from '../shell/mapControlLayout.js';
import MarktplatzSection from './MarktplatzSection.js';
import { useT } from '../i18n/index.js';
import { T } from './texte.js';
type InstallFlowState =
  | { kind: 'idle' }
  | { kind: 'beginning'; label: string }
  | { kind: 'confirming'; label: string; pending: PendingInstall }
  | { kind: 'installing'; label: string }
  | { kind: 'done'; label: string }
  | { kind: 'error'; label: string; message: string };

function formatCacheAge(
  ageMs: number | null,
  t: (k: keyof typeof T.de, w?: Record<string, number>) => string
): string {
  if (ageMs === null) return t('nieSync');
  if (ageMs < 60_000) return t('geradeEben');
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return t(minutes === 1 ? 'standMin1' : 'standMinN', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(hours === 1 ? 'standStd1' : 'standStdN', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t(days === 1 ? 'standTag1' : 'standTagN', { n: days });
  const weeks = Math.floor(days / 7);
  return t(weeks === 1 ? 'standWoche1' : 'standWocheN', { n: weeks });
}

/** True when `registryVersion` is a genuinely newer semver than
 *  `installedVersion` (not merely "different" -- a downgraded/rolled-back
 *  registry entry is never offered as an "update"). Never throws: an
 *  unparsable version pair is treated as "no update" rather than crashing
 *  the Updates tab over one bad comparison. */
function isNewerVersion(registryVersion: string, installedVersion: string): boolean {
  try {
    return compareVersions(registryVersion, installedVersion) > 0;
  } catch {
    return false;
  }
}

function ScopePreview({ scopes }: { scopes: string[] }): React.ReactElement {
  const t = useT(T);
  if (scopes.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">{t('keineBerechtigungen')}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1" data-testid="scope-preview">
      {scopes.map((scope) => (
        <li
          key={scope}
          className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[11px] text-slate-700 dark:text-slate-200"
          data-testid={`scope-badge-${scope}`}
        >
          {scope}
        </li>
      ))}
    </ul>
  );
}

/** Blocking notice shown INSTEAD OF an install/update button for a
 *  core_api-incompatible entry (acceptance criterion 2, W-11). */
function IncompatibleNotice({ entry }: { entry: RegistryEntryView }): React.ReactElement {
  const t = useT(T);
  return (
    <p
      className="text-xs rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1"
      data-testid={`incompatible-notice-${entry.id}`}
    >
      {t('inkompatibel', { api: entry.core_api })}
    </p>
  );
}

/** Signature + price badges of a catalog entry (docs/marktplatz.md). */
function TrustBadges({ entry }: { entry: RegistryEntryView }): React.ReactElement {
  const t = useT(T);
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid={`trust-badges-${entry.id}`}>
      {entry.verified ? (
        <span className="rounded bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 text-[11px] text-emerald-800 dark:text-emerald-300">
          {t('geprueft')}
          {entry.publisher ? ` · ${entry.publisher}` : ''}
        </span>
      ) : (
        <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[11px] text-amber-800 dark:text-amber-300">
          {t('unsigniert')}
        </span>
      )}
      {entry.licensing === 'paid' && (
        <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[11px]">
          {entry.price_label ?? t('kostenpflichtig')}
        </span>
      )}
    </span>
  );
}

/** Notice INSTEAD of an install button: incompatible (W-11) or revoked. */
function EntryBlocker({ entry }: { entry: RegistryEntryView }): React.ReactElement | null {
  const t = useT(T);
  if (entry.revoked) {
    return (
      <p
        className="text-xs rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1"
        data-testid={`revoked-notice-${entry.id}`}
      >
        {t('gesperrt')}
      </p>
    );
  }
  if (!entry.compatible) return <IncompatibleNotice entry={entry} />;
  return null;
}

export default function StorePanel({
  eingebettet = false,
}: { eingebettet?: boolean } = {}): React.ReactElement {
  // Eingebettet (im ⚙-Menü, shell/EinstellungsMenue.tsx) ist der Inhalt immer offen.
  const t = useT(T);
  const [isOpen, setIsOpen] = useState(eingebettet);
  const [tab, setTab] = useState<'catalog' | 'updates'>('catalog');
  const [catalog, setCatalog] = useState<RegistryCatalog>({
    entries: [],
    fetchedAt: null,
    ageMs: null,
    sourceUrl: '',
    errors: [],
  });
  const [installed, setInstalled] = useState<InstalledAddon[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [installFlow, setInstallFlow] = useState<InstallFlowState>({ kind: 'idle' });
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  // Mirrors RegionsPanel's `useUiStore`-driven open: some OTHER surface can
  // programmatically open this panel later (`useUiStore.openAddonStorePanel()`,
  // e.g. a future "no compatible add-on installed" notice elsewhere in the
  // app), the same way RoutingPanel opens RegionsPanel today.
  const addonStorePanelOpen = useUiStore((state) => state.addonStorePanel.isOpen);
  useEffect(() => {
    if (addonStorePanelOpen) setIsOpen(true);
  }, [addonStorePanelOpen]);

  const refresh = useCallback(async () => {
    const [freshCatalog, freshInstalled] = await Promise.all([
      fetchRegistryCatalog(),
      fetchAddons(),
    ]);
    setCatalog(freshCatalog);
    setInstalled(freshInstalled);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!isOpen || loaded) return;
    void refresh();
  }, [isOpen, loaded, refresh]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const fresh = await syncRegistry();
      setCatalog(fresh);
    } catch (err) {
      setSyncError(
        err instanceof StoreApiError
          ? t('registryFehlerMit', { grund: err.message })
          : t('registryFehler')
      );
    } finally {
      setSyncing(false);
    }
  }, [t]);

  const installedIds = useMemo(() => new Set(installed.map((a) => a.id)), [installed]);
  const installedById = useMemo(() => new Map(installed.map((a) => [a.id, a])), [installed]);
  const catalogEntries = useMemo(
    () => catalog.entries.filter((e) => !installedIds.has(e.id)),
    [catalog.entries, installedIds]
  );
  const updateEntries = useMemo(
    () =>
      catalog.entries
        .map((entry) => ({ entry, installedAddon: installedById.get(entry.id) }))
        .filter(
          (row): row is { entry: RegistryEntryView; installedAddon: InstalledAddon } =>
            row.installedAddon !== undefined &&
            isNewerVersion(row.entry.version, row.installedAddon.version)
        ),
    [catalog.entries, installedById]
  );
  const selectedEntry = useMemo(
    () => catalog.entries.find((e) => e.id === selectedEntryId) ?? null,
    [catalog.entries, selectedEntryId]
  );

  const runInstallFlow = useCallback(
    async (label: string, begin: () => Promise<PendingInstall>) => {
      setInstallFlow({ kind: 'beginning', label });
      try {
        const pending = await begin();
        setInstallFlow({ kind: 'confirming', label, pending });
      } catch (err) {
        setInstallFlow({
          kind: 'error',
          label,
          message: err instanceof StoreApiError ? err.message : t('startFehler'),
        });
      }
    },
    [t]
  );

  const handleInstallFromRegistry = useCallback(
    (entry: RegistryEntryView) => {
      void runInstallFlow(entry.name, () => beginInstallFromCatalog(entry.id));
    },
    [runInstallFlow]
  );

  const handleUploadSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ''; // allow re-selecting the same file later
      if (!file) return;
      void runInstallFlow(file.name, async () => {
        const buffer = await file.arrayBuffer();
        return beginInstallFromUpload(arrayBufferToBase64(buffer));
      });
    },
    [runInstallFlow]
  );

  const handleConfirmInstall = useCallback(async () => {
    if (installFlow.kind !== 'confirming') return;
    const { label, pending } = installFlow;
    setInstallFlow({ kind: 'installing', label });
    try {
      await confirmPendingInstall(pending.pendingId);
      setInstallFlow({ kind: 'done', label });
      await refresh();
    } catch (err) {
      setInstallFlow({
        kind: 'error',
        label,
        message: err instanceof StoreApiError ? err.message : t('installFehler'),
      });
    }
  }, [installFlow, refresh, t]);

  const cancelInstallFlow = useCallback(() => setInstallFlow({ kind: 'idle' }), []);

  const handleToggleEnabled = useCallback(
    async (addon: InstalledAddon) => {
      setLifecycleError(null);
      try {
        if (addon.enabled) await disableAddon(addon.id);
        else await enableAddon(addon.id);
        await refresh();
      } catch (err) {
        setLifecycleError(err instanceof StoreApiError ? err.message : t('aktionFehler'));
      }
    },
    [refresh, t]
  );

  // E09-T8: "In Home Assistant verfügbar" -- MQTT-republish toggle, only
  // rendered for add-ons that actually declare `events.publish` (see the
  // installed-add-ons list below). Purely a REST call + refresh; the Core
  // applies it immediately (no restart/reconnect involved on either side).
  const handleToggleMqtt = useCallback(
    async (addon: InstalledAddon) => {
      setLifecycleError(null);
      try {
        await setAddonMqttEnabled(addon.id, !addon.mqtt_enabled);
        await refresh();
      } catch (err) {
        setLifecycleError(err instanceof StoreApiError ? err.message : t('aktionFehler'));
      }
    },
    [refresh, t]
  );

  const handleActivateLicense = useCallback(
    async (id: string) => {
      setLifecycleError(null);
      try {
        await activateLicense(id);
        await refresh();
      } catch (err) {
        setLifecycleError(err instanceof StoreApiError ? err.message : t('lizenzFehler'));
      }
    },
    [refresh, t]
  );

  const handleUninstall = useCallback(
    async (id: string) => {
      setLifecycleError(null);
      try {
        await uninstallAddonById(id);
        await refresh();
      } catch (err) {
        setLifecycleError(err instanceof StoreApiError ? err.message : t('deinstFehler'));
      }
    },
    [refresh, t]
  );

  const toggleOpen = useCallback(() => setIsOpen((open) => !open), []);

  // W-13: the upload path is offered PROMINENTLY whenever the registry is
  // unreachable -- either the last sync attempt failed, or nothing has ever
  // been synced at all (a fresh/offline-since-day-one install).
  const registryUnreachable = syncError !== null || catalog.fetchedAt === null;

  // `top-36`: MapLibre's own NavigationControl claims the very top of this
  // corner (`top-0`..~`top-20`, see RegionsPanel's identical comment), and
  // RegionsPanel's own FAB already sits at `top-20` (spans to
  // `top-20 + 48px = 128px`) -- this is the NEXT free slot below both,
  // confirmed against gestures.spec.ts's zoom-in-button click (a `top-4`
  // placement here intercepted MapLibre's zoom control).
  return (
    <div
      className={eingebettet ? '' : 'fixed z-10'}
      style={eingebettet ? undefined : { top: topRightSlotPx('store'), right: TOP_RIGHT_INSET_PX }}
    >
      {isOpen && (
        <div
          className={
            eingebettet
              ? 'space-y-4 text-sm text-slate-800 dark:text-slate-100'
              : 'absolute top-14 right-0 mb-2 w-96 max-h-[calc(var(--sicht-h,100vh)*0.75)] overflow-y-auto rounded-xl bg-flaeche/95 dark:bg-slate-800/95 shadow-xl p-4 text-sm text-slate-800 dark:text-slate-100 space-y-4'
          }
          data-testid="store-panel"
        >
          <DriveLockGate controlId="addon-store">
            {/* Cache status + sync (W-13) -- shown REGARDLESS of tab. */}
            <section className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  data-testid="store-cache-status"
                  className="text-xs text-slate-500 dark:text-slate-400"
                >
                  {formatCacheAge(catalog.ageMs, t)}
                </span>
                <button
                  onClick={() => void handleSync()}
                  disabled={syncing}
                  className="shrink-0 px-2 py-1 rounded-md border border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50"
                  data-testid="store-sync-button"
                >
                  {syncing ? t('synchronisiere') : t('registryAktualisieren')}
                </button>
              </div>
              {syncError && (
                <p
                  className="text-xs text-red-600 dark:text-red-400"
                  data-testid="store-sync-error"
                >
                  {syncError}
                </p>
              )}
            </section>

            <MarktplatzSection gespeichert={() => void handleSync()} />

            {/* Upload-install: always available, called out when offline. */}
            <section
              className={
                registryUnreachable
                  ? 'rounded-lg border-2 border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 p-2 space-y-1'
                  : 'rounded-lg border border-slate-200 dark:border-slate-700 p-2 space-y-1'
              }
              data-testid="store-upload-section"
            >
              <h3 className="font-semibold text-xs">
                {registryUnreachable ? t('uploadOffline') : t('uploadTitel')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('uploadText')}</p>
              <input
                type="file"
                accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
                onChange={handleUploadSelected}
                className="text-xs"
                data-testid="store-upload-input"
              />
            </section>

            {selectedEntry ? (
              <section data-testid="store-detail-view" className="space-y-2">
                <button
                  onClick={() => setSelectedEntryId(null)}
                  className="text-xs text-blue-600 dark:text-blue-400"
                  data-testid="store-detail-back"
                >
                  {t('zurueck')}
                </button>
                <div className="flex items-center gap-2">
                  {selectedEntry.icon && (
                    <img src={selectedEntry.icon} alt="" className="w-10 h-10 rounded" />
                  )}
                  <div>
                    <div className="font-semibold" data-testid="store-detail-name">
                      {selectedEntry.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {t('version', { v: selectedEntry.version, api: selectedEntry.core_api })}
                    </div>
                  </div>
                </div>
                <TrustBadges entry={selectedEntry} />
                <p className="text-xs" data-testid="store-detail-description">
                  {selectedEntry.description}
                </p>
                <div>
                  <h4 className="text-xs font-semibold mb-1">{t('angefragteBerechtigungen')}</h4>
                  <ScopePreview scopes={selectedEntry.scopes} />
                </div>
                {selectedEntry.screenshots.length > 0 && (
                  <div
                    className="flex gap-2 overflow-x-auto"
                    data-testid="store-detail-screenshots"
                  >
                    {selectedEntry.screenshots.map((src) => (
                      <img
                        key={src}
                        src={src}
                        alt=""
                        className="h-20 rounded border border-slate-200 dark:border-slate-700"
                      />
                    ))}
                  </div>
                )}
                {EntryBlocker({ entry: selectedEntry }) ?? (
                  <button
                    onClick={() => handleInstallFromRegistry(selectedEntry)}
                    className="w-full px-2 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
                    data-testid={`install-button-${selectedEntry.id}`}
                  >
                    {t('installieren')}
                  </button>
                )}
              </section>
            ) : (
              <>
                <nav
                  className="flex gap-1 border-b border-slate-200 dark:border-slate-700"
                  role="tablist"
                >
                  <button
                    role="tab"
                    aria-selected={tab === 'catalog'}
                    onClick={() => setTab('catalog')}
                    className={`px-2 py-1 text-xs font-semibold ${tab === 'catalog' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
                    data-testid="store-tab-catalog"
                  >
                    {t('katalog')}
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'updates'}
                    onClick={() => setTab('updates')}
                    className={`px-2 py-1 text-xs font-semibold ${tab === 'updates' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
                    data-testid="store-tab-updates"
                  >
                    {t('updates')}
                    {updateEntries.length > 0 ? ` (${updateEntries.length})` : ''}
                  </button>
                </nav>

                {tab === 'catalog' && (
                  <section className="space-y-2" data-testid="store-catalog">
                    {loaded && catalogEntries.length === 0 && (
                      <p
                        className="text-xs text-slate-500 dark:text-slate-400"
                        data-testid="store-catalog-empty"
                      >
                        {t('keineAddons')}
                      </p>
                    )}
                    <ul className="space-y-2">
                      {catalogEntries.map((entry) => (
                        <li
                          key={entry.id}
                          className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1"
                          data-testid={`catalog-entry-${entry.id}`}
                        >
                          <button
                            className="flex items-start gap-2 w-full text-left"
                            onClick={() => setSelectedEntryId(entry.id)}
                            data-testid={`catalog-entry-open-${entry.id}`}
                          >
                            {entry.icon && (
                              <img src={entry.icon} alt="" className="w-8 h-8 rounded shrink-0" />
                            )}
                            <span>
                              <span className="font-medium block">{entry.name}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                                v{entry.version} · {entry.description}
                              </span>
                            </span>
                          </button>
                          <TrustBadges entry={entry} />
                          <ScopePreview scopes={entry.scopes} />
                          {EntryBlocker({ entry }) ?? (
                            <button
                              onClick={() => handleInstallFromRegistry(entry)}
                              className="px-2 py-1 rounded-md border border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30"
                              data-testid={`install-button-${entry.id}`}
                            >
                              {t('installieren')}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {tab === 'updates' && (
                  <section className="space-y-2" data-testid="store-updates">
                    {lifecycleError && (
                      <p
                        className="text-xs text-red-600 dark:text-red-400"
                        data-testid="store-lifecycle-error"
                      >
                        {lifecycleError}
                      </p>
                    )}
                    {loaded && updateEntries.length === 0 && (
                      <p
                        className="text-xs text-slate-500 dark:text-slate-400"
                        data-testid="updates-empty"
                      >
                        {t('alleAktuell')}
                      </p>
                    )}
                    <ul className="space-y-2">
                      {updateEntries.map(({ entry, installedAddon }) => (
                        <li
                          key={entry.id}
                          className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1"
                          data-testid={`update-entry-${entry.id}`}
                        >
                          <div className="font-medium">{entry.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {t('installiertVerfuegbar', {
                              alt: installedAddon.version,
                              neu: entry.version,
                            })}
                          </div>
                          {EntryBlocker({ entry }) ?? (
                            <button
                              onClick={() => handleInstallFromRegistry(entry)}
                              className="px-2 py-1 rounded-md border border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30"
                              data-testid={`update-button-${entry.id}`}
                            >
                              {t('updateInstallieren')}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    {installed.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-xs mb-1">{t('installierteAddons')}</h3>
                        <ul className="space-y-2">
                          {installed.map((addon) => (
                            <li
                              key={addon.id}
                              className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 flex items-center justify-between gap-2"
                              data-testid={`installed-addon-${addon.id}`}
                            >
                              <span>
                                <span className="font-medium block">{addon.name}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  v{addon.version} · {addon.enabled ? t('aktiv') : t('deaktiviert')}
                                  {addon.licensing === 'paid' && ` · ${t('lizenzpflichtig')}`}
                                  {addon.licensing === 'unsigned' && ` · ${t('unsigniertKlein')}`}
                                </span>
                              </span>
                              <span className="flex gap-1 shrink-0 flex-wrap justify-end">
                                {/* E09-T8: only meaningful for an add-on that
                                    actually declares `events.publish` -- no
                                    events, nothing for this toggle to affect. */}
                                {addon.manifest.permissions.includes('events.publish') && (
                                  <button
                                    onClick={() => void handleToggleMqtt(addon)}
                                    aria-pressed={addon.mqtt_enabled}
                                    className={`px-2 py-1 rounded-md border text-xs ${
                                      addon.mqtt_enabled
                                        ? 'border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400'
                                        : 'border-slate-300 dark:border-slate-600'
                                    }`}
                                    data-testid={`toggle-mqtt-${addon.id}`}
                                  >
                                    {addon.mqtt_enabled ? t('inHaAn') : t('inHa')}
                                  </button>
                                )}
                                {addon.licensing === 'paid' && !addon.enabled && (
                                  <button
                                    onClick={() => void handleActivateLicense(addon.id)}
                                    className="px-2 py-1 rounded-md border border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 text-xs"
                                    data-testid={`activate-license-${addon.id}`}
                                  >
                                    {t('lizenzAktivieren')}
                                  </button>
                                )}
                                <button
                                  onClick={() => void handleToggleEnabled(addon)}
                                  className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-xs"
                                  data-testid={`toggle-enabled-${addon.id}`}
                                >
                                  {addon.enabled ? t('deaktivieren') : t('aktivieren')}
                                </button>
                                <button
                                  onClick={() => void handleUninstall(addon.id)}
                                  className="px-2 py-1 rounded-md border border-red-300 text-red-600 dark:border-red-700 dark:text-red-400 text-xs"
                                  data-testid={`uninstall-button-${addon.id}`}
                                >
                                  {t('deinstallieren')}
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}

            {/* Install flow: begin -> scope-confirm -> job progress. */}
            {installFlow.kind !== 'idle' && (
              <section
                className="rounded-lg border border-slate-300 dark:border-slate-600 p-2 space-y-2"
                data-testid="install-flow"
              >
                {installFlow.kind === 'beginning' && (
                  <p className="text-xs" data-testid="install-progress">
                    {t('pruefe', { name: installFlow.label })}
                  </p>
                )}
                {installFlow.kind === 'confirming' && (
                  <div className="space-y-2" data-testid="scope-confirm-dialog">
                    <p className="text-xs font-semibold">
                      {installFlow.pending.isUpdate
                        ? t('updateBestaetigen')
                        : t('installationBestaetigen')}
                      : {installFlow.pending.manifest.name} v{installFlow.pending.manifest.version}
                    </p>
                    {installFlow.pending.release ? (
                      <p
                        className="text-xs text-emerald-700 dark:text-emerald-400"
                        data-testid="scope-confirm-signed"
                      >
                        {t('signiert', { publisher: installFlow.pending.release.publisher })}
                        {installFlow.pending.release.licensing === 'paid' &&
                          ` · ${t('lizenzpflichtig')}`}
                      </p>
                    ) : (
                      <p
                        className="text-xs rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-2 py-1"
                        data-testid="scope-confirm-unsigned"
                      >
                        {t('unsigniertPaket')}
                      </p>
                    )}
                    {installFlow.pending.license && !installFlow.pending.license.valid && (
                      <p
                        className="text-xs text-red-600 dark:text-red-400"
                        data-testid="scope-confirm-license"
                      >
                        {t('lizenzNichtAktiv', {
                          grund: installFlow.pending.license.reason ?? t('unbekannt'),
                        })}
                      </p>
                    )}
                    <ScopePreview scopes={installFlow.pending.permissions} />
                    {installFlow.pending.warnings.map((warning) => (
                      <p
                        key={warning}
                        className="text-xs rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-2 py-1"
                        data-testid="scope-confirm-warning"
                      >
                        {warning}
                      </p>
                    ))}
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleConfirmInstall()}
                        className="px-2 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
                        data-testid="scope-confirm-confirm-button"
                      >
                        {t('bestaetigen')}
                      </button>
                      <button
                        onClick={cancelInstallFlow}
                        className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-xs"
                        data-testid="scope-confirm-cancel-button"
                      >
                        {t('abbrechen')}
                      </button>
                    </div>
                  </div>
                )}
                {installFlow.kind === 'installing' && (
                  <p className="text-xs" data-testid="install-progress">
                    {t('installiere', { name: installFlow.label })}
                  </p>
                )}
                {installFlow.kind === 'done' && (
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className="text-xs text-green-700 dark:text-green-400"
                      data-testid="install-success"
                    >
                      {t('installiert', { name: installFlow.label })}
                    </p>
                    <button
                      onClick={cancelInstallFlow}
                      className="text-xs text-slate-500 dark:text-slate-400"
                      data-testid="install-flow-dismiss"
                    >
                      {t('schliessen')}
                    </button>
                  </div>
                )}
                {installFlow.kind === 'error' && (
                  <div className="space-y-1">
                    <p
                      className="text-xs text-red-600 dark:text-red-400"
                      data-testid="install-error"
                    >
                      {installFlow.message}
                    </p>
                    <button
                      onClick={cancelInstallFlow}
                      className="text-xs text-slate-500 dark:text-slate-400"
                      data-testid="install-flow-dismiss"
                    >
                      {t('schliessen')}
                    </button>
                  </div>
                )}
              </section>
            )}
          </DriveLockGate>
        </div>
      )}

      {!eingebettet && (
        <button
          onClick={toggleOpen}
          className="w-12 h-12 rounded-full bg-flaeche/90 dark:bg-slate-800/90 shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 text-lg"
          aria-label={t('addonStore')}
          aria-expanded={isOpen}
          title={t('addonStore')}
          data-testid="store-panel-toggle"
        >
          🧩
        </button>
      )}
    </div>
  );
}
