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
  fetchJob,
  startBuild,
  startDownload,
  RegionApiError,
  type CatalogRegion,
  type InstalledRegion,
  type JobSnapshot,
} from '../../settings/regions/client.js';
import { kartenliste, type Karteneintrag } from '../../settings/regions/kartenliste.js';
import { fetchSystemResources } from '../client.js';
import { recommendPhotonOff, LOW_DISK_THRESHOLD_BYTES, type SystemResources } from '../resourceRecommendation.js';

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
      typeof err.details?.requiredBytes === 'number' ? formatBytes(err.details.requiredBytes) : 'unbekannt';
    const free = typeof err.details?.freeBytes === 'number' ? formatBytes(err.details.freeBytes) : 'unbekannt';
    return `Nicht genug freier Speicherplatz: benötigt ${required}, verfügbar ${free}.`;
  }
  if (err.code === 'ALREADY_INSTALLED') return 'Diese Region ist bereits installiert.';
  if (err.code === 'BUILD_IN_PROGRESS') return 'Es läuft bereits ein Kartenbau. Bitte dessen Ende abwarten.';
  return err.message || 'Unbekannter Fehler.';
}

export default function RegionStep(): React.ReactElement {
  const [installed, setInstalled] = useState<InstalledRegion[]>([]);
  const [catalog, setCatalog] = useState<CatalogRegion[]>([]);
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [downloads, setDownloads] = useState<Record<string, { jobId: string; job: JobSnapshot | null }>>({});
  const [errorByRegion, setErrorByRegion] = useState<Record<string, string>>({});

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
        ([, s]) => !s.job || (s.job.status !== 'done' && s.job.status !== 'error'),
      );
      if (active.length === 0) return;
      void Promise.all(
        active.map(async ([regionId, s]) => {
          const job = await fetchJob(s.jobId);
          setDownloads((prev) => (prev[regionId] ? { ...prev, [regionId]: { jobId: s.jobId, job } } : prev));
          if (job && (job.status === 'done' || job.status === 'error')) {
            void refresh();
          }
        }),
      );
    }, JOB_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // ─── HERUNTERLADEN ODER BAUEN ─────────────────────────────────────────────
  // Bis 0.58.0 rief dieser Schritt fuer JEDE Region den Download auf. Die
  // mitgelieferten Regionen haben aber keine fertige Datei (`url`), sondern
  // nur einen OSM-Extrakt (`pbfUrl`) -- sie werden GEBAUT. Jede Region endete
  // deshalb auf einer frischen Installation mit „gibt es keine
  // Download-Quelle". Welcher Weg gilt, entscheidet jetzt dieselbe Stelle wie
  // in „Karten verwalten" (`kartenliste.ts`): die Quelle der Karte.
  const handleInstall = useCallback(async (eintrag: Karteneintrag) => {
    setErrorByRegion((prev) => ({ ...prev, [eintrag.id]: '' }));
    try {
      const jobId =
        eintrag.quelle === 'download' || eintrag.quelle === 'kartenserver'
          ? await startDownload(eintrag.id)
          : await startBuild(eintrag.id);
      setDownloads((prev) => ({ ...prev, [eintrag.id]: { jobId, job: null } }));
    } catch (err) {
      const message =
        err instanceof RegionApiError ? formatApiError(err) : 'Der Vorgang konnte nicht gestartet werden.';
      setErrorByRegion((prev) => ({ ...prev, [eintrag.id]: message }));
    }
  }, []);

  const downloadableCatalog = kartenliste(installed, catalog).filter(
    (eintrag) => eintrag.zustand === 'verfuegbar' || eintrag.zustand === 'ohne_quelle',
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
            Freier Speicherplatz:{' '}
            <span data-testid="onboarding-disk-free" className="font-medium">
              {formatBytes(resources.disk_free_bytes)}
            </span>{' '}
            von {formatBytes(resources.disk_total_bytes)}
          </p>
          <p>
            Freier Arbeitsspeicher:{' '}
            <span data-testid="onboarding-mem-free" className="font-medium">
              {formatBytes(resources.mem_free_bytes)}
            </span>{' '}
            von {formatBytes(resources.mem_total_bytes)}
          </p>
          {photonOffRecommended && (
            <p
              className="text-amber-700 dark:text-amber-400 font-medium pt-1"
              data-testid="onboarding-photon-off-recommendation"
            >
              Weniger als {formatBytes(LOW_DISK_THRESHOLD_BYTES)} frei: Wir empfehlen, den
              Online-Suchdienst „Photon“ in den Einstellungen zu deaktivieren, um Arbeitsspeicher
              zu sparen.
            </p>
          )}
        </div>
      )}

      <section>
        <h3 className="font-semibold mb-2">Installierte Regionen</h3>
        {installed.length === 0 && (
          <p className="text-slate-500 dark:text-slate-400 text-xs" data-testid="onboarding-regions-installed-empty">
            Noch keine Karte installiert.
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
        <h3 className="font-semibold mb-2">Verfügbare Regionen</h3>
        <ul className="space-y-2">
          {downloadableCatalog.map((entry) => {
            const download = downloads[entry.id];
            const job = download?.job;
            const isActive = !!download && (!job || (job.status !== 'done' && job.status !== 'error'));
            return (
              <li
                key={entry.id}
                className="border border-slate-200 dark:border-slate-700 rounded-lg p-2"
                data-testid={`onboarding-catalog-region-${entry.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <div className="font-medium">{entry.name}</div>
                    <div className="text-slate-500 dark:text-slate-400">{formatBytes(entry.groesseBytes)}</div>
                  </div>
                  {/* Ohne jede Quelle kein Knopf: einer, der nicht
                      funktionieren KANN, schickt auf Fehlersuche. */}
                  {entry.quelle !== null && (
                    <button
                      type="button"
                      onClick={() => void handleInstall(entry)}
                      disabled={isActive}
                      className="shrink-0 px-2 py-1 rounded-md border border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 text-xs disabled:opacity-50"
                      data-testid={`onboarding-download-button-${entry.id}`}
                    >
                      {entry.quelle === 'bau' ? 'Bauen' : 'Herunterladen'}
                    </button>
                  )}
                </div>
                {entry.quelle === 'bau' && entry.grosserBau && (
                  <p
                    className="mt-1 text-xs text-amber-700 dark:text-amber-400"
                    data-testid={`onboarding-grosser-bau-${entry.id}`}
                  >
                    {entry.hinweis ?? 'Große Region: der Kartenbau dauert auf diesem Gerät mehrere Stunden.'}
                  </p>
                )}
                {entry.zustand === 'ohne_quelle' && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {entry.hinweis ?? 'Für diese Karte ist keine Quelle hinterlegt.'}
                  </p>
                )}
                {job && (
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
                        style={job.totalBytes === null ? undefined : { width: `${Math.round(job.progress * 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {job.status === 'error'
                        ? `Fehler: ${job.error?.message ?? 'Vorgang fehlgeschlagen'}`
                        : job.status === 'done'
                          ? (job.note ?? 'Fertig')
                          : job.totalBytes === null
                            ? (job.note ?? 'Läuft…')
                            : `${Math.round(job.progress * 100)}%`}
                    </div>
                  </div>
                )}
                {errorByRegion[entry.id] && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400" data-testid={`onboarding-region-error-${entry.id}`}>
                    {errorByRegion[entry.id]}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
