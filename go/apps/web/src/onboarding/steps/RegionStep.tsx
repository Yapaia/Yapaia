/**
 * Onboarding step 3: region select + download, with a real RAM/disk-check
 * display (E08-T5, W-12/W-18). Reuses the EXISTING region-manager client
 * (`settings/regions/client.ts`, same `POST /api/v1/map/regions` W-18
 * disk-pre-check the standalone RegionsPanel drives) rather than
 * reimplementing region download -- this is just a wizard-shaped UI on top
 * of it. Skippable (first skippable step, task: "überspringbar ab Schritt
 * 3").
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchCatalog,
  fetchInstalledRegions,
  deleteExtrakt,
  fetchJob,
  startDownload,
  startExtraktDownload,
  startGesamtbau,
  RegionApiError,
  type CatalogRegion,
  type InstalledRegion,
  type JobSnapshot,
} from '../../settings/regions/client.js';
import { kartenliste, type Karteneintrag } from '../../settings/regions/kartenliste.js';
import { fetchSystemResources } from '../client.js';
import { useT, tx } from '../../i18n/index.js';
import { T } from '../texte.js';
import {
  recommendPhotonOff,
  LOW_DISK_THRESHOLD_BYTES,
  type SystemResources,
} from '../resourceRecommendation.js';

const JOB_POLL_INTERVAL_MS = 400;

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatApiError(err: RegionApiError): string {
  if (err.code === 'INSUFFICIENT_SPACE') {
    const required =
      typeof err.details?.requiredBytes === 'number'
        ? formatBytes(err.details.requiredBytes)
        : tx(T, 'unbekannt');
    const free =
      typeof err.details?.freeBytes === 'number'
        ? formatBytes(err.details.freeBytes)
        : tx(T, 'unbekannt');
    return tx(T, 'platzMangel', { req: required, free });
  }
  if (err.code === 'ALREADY_INSTALLED') return tx(T, 'schonInstalliert');
  if (err.code === 'BUILD_IN_PROGRESS') return tx(T, 'bauLaeuftSchon');
  if (err.code === 'ALREADY_DOWNLOADED') return tx(T, 'schonGeladen');
  return err.message || tx(T, 'unbekannterFehler');
}

export default function RegionStep(): React.ReactElement {
  const t = useT(T);
  const [installed, setInstalled] = useState<InstalledRegion[]>([]);
  const [catalog, setCatalog] = useState<CatalogRegion[]>([]);
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [downloads, setDownloads] = useState<
    Record<string, { jobId: string; job: JobSnapshot | null }>
  >({});
  const [errorByRegion, setErrorByRegion] = useState<Record<string, string>>({});
  /** Der gemeinsame Bau aller heruntergeladenen Karten (0.59.0). */
  const [bau, setBau] = useState<{ jobId: string; job: JobSnapshot | null } | null>(null);
  const [bauFehler, setBauFehler] = useState('');

  const downloadsRef = useRef(downloads);
  useEffect(() => {
    downloadsRef.current = downloads;
  }, [downloads]);

  const refresh = useCallback(async () => {
    const [installedRegions, catalogRegions, sysResources] = await Promise.all([
      fetchInstalledRegions(),
      fetchCatalog(),
      fetchSystemResources(),
    ]);
    setInstalled(installedRegions);
    setCatalog(catalogRegions);
    setResources(sysResources);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      const active = Object.entries(downloadsRef.current).filter(
        ([, s]) => !s.job || (s.job.status !== 'done' && s.job.status !== 'error')
      );
      if (active.length === 0) return;
      void Promise.all(
        active.map(async ([regionId, s]) => {
          const job = await fetchJob(s.jobId);
          setDownloads((prev) =>
            prev[regionId] ? { ...prev, [regionId]: { jobId: s.jobId, job } } : prev
          );
          if (job && (job.status === 'done' || job.status === 'error')) {
            void refresh();
          }
        })
      );
    }, JOB_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Der gemeinsame Bau hat einen eigenen Takt: er dauert Minuten bis Stunden,
  // alle paar hundert Millisekunden zu fragen bringt nichts.
  useEffect(() => {
    if (!bau || (bau.job && (bau.job.status === 'done' || bau.job.status === 'error'))) return;
    const interval = setInterval(() => {
      void fetchJob(bau.jobId).then((job) => {
        setBau((prev) => (prev && prev.jobId === bau.jobId ? { ...prev, job } : prev));
        if (job && (job.status === 'done' || job.status === 'error')) void refresh();
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [bau, refresh]);

  // ─── ERST HERUNTERLADEN, DANN GEMEINSAM BAUEN ─────────────────────────────
  // Bis 0.58.0 rief dieser Schritt fuer JEDE Region den Download einer
  // fertigen Datei auf -- die es fuer die mitgelieferten Regionen nicht gibt
  // („gibt es keine Download-Quelle"). 0.58.1 baute stattdessen sofort.
  //
  // Seit 0.59.0, gewuenscht: „Wenn man mehrere Karten zusammen bauen will
  // sollte man sie erst alle runterladen und dann gemeinsam bauen." Eine
  // Karte zum Bauen wird hier nur heruntergeladen; „Jetzt bauen" unten baut
  // alle zusammen -- Karten, Routing ueber alle, Suche. Fertige Dateien (etwa
  // vom Kartenserver) werden wie bisher direkt installiert.
  const handleInstall = useCallback(async (eintrag: Karteneintrag) => {
    setErrorByRegion((prev) => ({ ...prev, [eintrag.id]: '' }));
    try {
      const jobId =
        eintrag.quelle === 'download' || eintrag.quelle === 'kartenserver'
          ? await startDownload(eintrag.id)
          : await startExtraktDownload(eintrag.id);
      setDownloads((prev) => ({ ...prev, [eintrag.id]: { jobId, job: null } }));
    } catch (err) {
      const message = err instanceof RegionApiError ? formatApiError(err) : tx(T, 'startFehler');
      setErrorByRegion((prev) => ({ ...prev, [eintrag.id]: message }));
    }
  }, []);

  const handleVerwerfen = useCallback(
    async (regionId: string) => {
      setErrorByRegion((prev) => ({ ...prev, [regionId]: '' }));
      try {
        await deleteExtrakt(regionId);
        setDownloads((prev) => {
          const rest = { ...prev };
          delete rest[regionId];
          return rest;
        });
        await refresh();
      } catch (err) {
        const message =
          err instanceof RegionApiError ? formatApiError(err) : tx(T, 'verwerfFehler');
        setErrorByRegion((prev) => ({ ...prev, [regionId]: message }));
      }
    },
    [refresh]
  );

  const handleBauen = useCallback(async () => {
    setBauFehler('');
    try {
      const jobId = await startGesamtbau(false);
      setBau({ jobId, job: null });
    } catch (err) {
      setBauFehler(err instanceof RegionApiError ? formatApiError(err) : tx(T, 'bauStartFehler'));
    }
  }, []);

  const karten = kartenliste(installed, catalog);
  const downloadableCatalog = karten.filter(
    (eintrag) =>
      eintrag.zustand === 'verfuegbar' ||
      eintrag.zustand === 'geladen' ||
      eintrag.zustand === 'ohne_quelle'
  );
  const geladen = karten.filter((eintrag) => eintrag.zustand === 'geladen');
  const ladenLaeuft = Object.values(downloads).some(
    (s) => !s.job || (s.job.status !== 'done' && s.job.status !== 'error')
  );
  const bauLaeuft = Boolean(
    bau && (!bau.job || (bau.job.status !== 'done' && bau.job.status !== 'error'))
  );
  const photonOffRecommended = resources ? recommendPhotonOff(resources) : false;

  return (
    <div className="space-y-4" data-testid="onboarding-step-region">
      {resources && (
        <div
          className="rounded-md border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1"
          data-testid="onboarding-resources-display"
        >
          <p>
            {t('freierSpeicher')}{' '}
            <span data-testid="onboarding-disk-free" className="font-medium">
              {formatBytes(resources.disk_free_bytes)}
            </span>{' '}
            {t('von')} {formatBytes(resources.disk_total_bytes)}
          </p>
          <p>
            {t('freierRam')}{' '}
            <span data-testid="onboarding-mem-free" className="font-medium">
              {formatBytes(resources.mem_free_bytes)}
            </span>{' '}
            {t('von')} {formatBytes(resources.mem_total_bytes)}
          </p>
          {photonOffRecommended && (
            <p
              className="text-amber-700 dark:text-amber-400 font-medium pt-1"
              data-testid="onboarding-photon-off-recommendation"
            >
              {t('photonAus', { schwelle: formatBytes(LOW_DISK_THRESHOLD_BYTES) })}
            </p>
          )}
        </div>
      )}

      <section>
        <h3 className="font-semibold mb-2">{t('installierte')}</h3>
        {installed.length === 0 && (
          <p
            className="text-slate-500 dark:text-slate-400 text-xs"
            data-testid="onboarding-regions-installed-empty"
          >
            {t('nochKeine')}
          </p>
        )}
        <ul className="space-y-2">
          {installed.map((region) => (
            <li
              key={region.region}
              className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs"
              data-testid={`onboarding-installed-region-${region.region}`}
            >
              {region.region} · {formatBytes(region.size_bytes)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold mb-2">{t('verfuegbare')}</h3>
        <ul className="space-y-2">
          {downloadableCatalog.map((entry) => {
            const download = downloads[entry.id];
            const job = download?.job;
            const isActive =
              !!download && (!job || (job.status !== 'done' && job.status !== 'error'));
            return (
              <li
                key={entry.id}
                className="border border-slate-200 dark:border-slate-700 rounded-lg p-2"
                data-testid={`onboarding-catalog-region-${entry.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <div className="font-medium">{entry.name}</div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {formatBytes(entry.groesseBytes)}
                    </div>
                  </div>
                  {/* Ohne jede Quelle kein Knopf: einer, der nicht
                      funktionieren KANN, schickt auf Fehlersuche. */}
                  {entry.quelle !== null && entry.zustand !== 'geladen' && (
                    <button
                      type="button"
                      onClick={() => void handleInstall(entry)}
                      disabled={isActive || bauLaeuft}
                      className="shrink-0 px-2 py-1 rounded-md border border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 text-xs disabled:opacity-50"
                      data-testid={`onboarding-download-button-${entry.id}`}
                    >
                      {t('herunterladen')}
                    </button>
                  )}
                  {entry.zustand === 'geladen' && (
                    <button
                      type="button"
                      onClick={() => void handleVerwerfen(entry.id)}
                      disabled={bauLaeuft}
                      className="shrink-0 px-2 py-1 rounded-md border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300 text-xs disabled:opacity-50"
                      data-testid={`onboarding-verwerfen-button-${entry.id}`}
                    >
                      {t('verwerfen')}
                    </button>
                  )}
                </div>
                {entry.zustand === 'geladen' && !isActive && (
                  <p
                    className="mt-1 text-xs text-blue-700 dark:text-blue-300"
                    data-testid={`onboarding-geladen-${entry.id}`}
                  >
                    {t('heruntergeladen')}
                  </p>
                )}
                {entry.quelle === 'bau' && entry.grosserBau && (
                  <p
                    className="mt-1 text-xs text-amber-700 dark:text-amber-400"
                    data-testid={`onboarding-grosser-bau-${entry.id}`}
                  >
                    {entry.hinweis ?? t('grosseRegion')}
                  </p>
                )}
                {entry.zustand === 'ohne_quelle' && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {entry.hinweis ?? t('keineQuelle')}
                  </p>
                )}
                {job && !(job.status === 'done' && entry.zustand === 'geladen') && (
                  <div className="mt-1" data-testid={`onboarding-download-progress-${entry.id}`}>
                    {/* Ein Bau hat keinen messbaren Fortschritt (siehe
                        `RegionsPanel.tsx`): der Balken laeuft unbestimmt,
                        darunter steht die letzte Ausgabezeile. */}
                    <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={
                          job.totalBytes === null
                            ? 'h-full w-1/3 bg-blue-500 animate-pulse'
                            : 'h-full bg-blue-500 transition-[width]'
                        }
                        style={
                          job.totalBytes === null
                            ? undefined
                            : { width: `${Math.round(job.progress * 100)}%` }
                        }
                      />
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {job.status === 'error'
                        ? t('fehlerMit', { text: job.error?.message ?? t('vorgangFehlgeschlagen') })
                        : job.status === 'done'
                          ? (job.note ?? t('fertigPunkt'))
                          : job.totalBytes === null
                            ? (job.note ?? t('laeuft'))
                            : `${Math.round(job.progress * 100)}%`}
                    </div>
                  </div>
                )}
                {errorByRegion[entry.id] && (
                  <p
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                    data-testid={`onboarding-region-error-${entry.id}`}
                  >
                    {errorByRegion[entry.id]}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ─── DER GEMEINSAME BAU ───────────────────────────────────────────
          Erst wenn alle gewünschten Karten heruntergeladen sind. Er baut die
          Karten, dann das Routing EINMAL über alle (sonst endet es an der
          Grenze), dann die Suche. */}
      {(geladen.length > 0 || bau) && (
        <section
          className="rounded-lg border border-emerald-300 dark:border-emerald-700 p-3 space-y-2"
          data-testid="onboarding-bauen"
        >
          <div className="text-xs">
            {geladen.length > 0 ? (
              <>
                <span className="font-medium">{t('bereitZumBauen')}</span>{' '}
                {geladen.map((eintrag) => eintrag.name).join(', ')}. {t('weitereKarten')}
              </>
            ) : (
              t('werdenGebaut')
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleBauen()}
            disabled={bauLaeuft || ladenLaeuft || geladen.length === 0}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium disabled:opacity-50"
            data-testid="onboarding-bauen-button"
          >
            {bauLaeuft ? t('baut') : t('jetztBauen')}
          </button>
          {ladenLaeuft && !bauLaeuft && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('nochDownload')}</p>
          )}
          {bau?.job && (
            <div
              className="text-xs text-slate-600 dark:text-slate-300"
              data-testid="onboarding-bau-status"
            >
              {bau.job.status === 'error'
                ? t('fehlerMit', { text: bau.job.error?.message ?? t('bauFehlgeschlagen') })
                : bau.job.status === 'done'
                  ? `✓ ${bau.job.note ?? t('fertigMitPunkt')}`
                  : [
                      bau.job.gesamt
                        ? t('bauSchritt', {
                            n: bau.job.gesamt.schritt,
                            gesamt: bau.job.gesamt.schritte,
                            text: bau.job.gesamt.schrittText,
                          })
                        : t('bauLaeuft'),
                      bau.job.gesamt?.restText,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              {bau.job.status === 'running' && (
                <p className="mt-1 text-slate-500 dark:text-slate-400">{t('bauHintergrund')}</p>
              )}
            </div>
          )}
          {bauFehler && (
            <p
              className="text-xs text-red-600 dark:text-red-400"
              data-testid="onboarding-bau-fehler"
            >
              {bauFehler}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
