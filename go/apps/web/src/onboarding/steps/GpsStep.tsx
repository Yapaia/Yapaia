/**
 * Onboarding step 5: GPS source select + test with live status (E08-T5).
 * Reuses the EXISTING position-source endpoints (`GET /position/sources`,
 * `PUT /position/source`) and the existing `useGpsSignalState()` hook
 * (`position/gpsSignal.ts`, already drives the GPS-loss banner) for the
 * live fix/no-fix indicator -- no parallel status logic here.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useGpsSignalState } from '../../position/gpsSignal.js';
import {
  fetchPositionSources,
  forcePositionSource,
  startSimulatorTestDrive,
  type PositionSourceName,
  type SourceStatus,
} from '../positionClient.js';
import { useT } from '../../i18n/index.js';
import { T } from '../texte.js';

type Key = keyof typeof T.de;

const SOURCE_LABELS: Record<PositionSourceName, Key> = {
  browser: 'srcBrowser',
  gpsd: 'srcGpsd',
  modbus: 'srcModbus',
  // Diese Zeile fehlte, und der Kern liefert die Quelle trotzdem mit -- die
  // Liste zeigte dafuer einen leeren Eintrag. Wer nachsehen wollte, ob die
  // Companion App liefert, fand nichts.
  ha_tracker: 'srcHa',
  simulator: 'srcSim',
};

const SIGNAL_LABELS: Record<string, Key> = {
  acquiring: 'sigAcquiring',
  live: 'sigLive',
  lost: 'sigLost',
};

export default function GpsStep(): React.ReactElement {
  const t = useT(T);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [forced, setForced] = useState<PositionSourceName | null>(null);
  const signalState = useGpsSignalState();

  const refresh = useCallback(async () => {
    const result = await fetchPositionSources();
    setSources(result.sources);
    setForced(result.forced);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleSelect = useCallback(
    async (source: PositionSourceName) => {
      await forcePositionSource(source);
      if (source === 'simulator') {
        await startSimulatorTestDrive();
      }
      await refresh();
    },
    [refresh]
  );

  return (
    <div className="space-y-4" data-testid="onboarding-step-gps">
      <div
        className="rounded-md border border-slate-200 dark:border-slate-700 p-3 text-sm flex items-center justify-between"
        data-testid="onboarding-gps-signal-status"
        data-signal-state={signalState}
      >
        <span>{t('liveStatus')}</span>
        <span
          className={
            signalState === 'live'
              ? 'text-green-700 dark:text-green-400 font-medium'
              : 'text-slate-500 dark:text-slate-400 font-medium'
          }
        >
          {t(SIGNAL_LABELS[signalState])}
        </span>
      </div>

      <ul className="space-y-2">
        {sources.map((source) => (
          <li
            key={source.name}
            className="flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm"
            data-testid={`onboarding-gps-source-${source.name}`}
          >
            <div>
              <div className="font-medium">{t(SOURCE_LABELS[source.name])}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {source.active ? t('aktiv') : t('inaktiv')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleSelect(source.name)}
              aria-pressed={forced === source.name}
              className={
                forced === source.name
                  ? 'px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium'
                  : 'px-3 py-1.5 rounded-md border border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 text-xs'
              }
              data-testid={`onboarding-gps-select-${source.name}`}
            >
              {forced === source.name ? t('gewaehlt') : t('waehlen')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
