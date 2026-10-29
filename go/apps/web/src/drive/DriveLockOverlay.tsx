/**
 * The Speed-Lock overlay UI (E07-T4, docs/06 §4): replaces a locked
 * surface's content with "Während der Fahrt gesperrt" + an "Ich bin
 * Beifahrer" button that runs a 5-second countdown, then unlocks (remembered
 * for the session -- see `driveLockStore.ts`'s `sessionStorage` persistence).
 *
 * Purely presentational + the countdown START/CANCEL wiring; the countdown
 * itself (real timer, session-remember) lives in `driveLockStore.ts`. Used by
 * `DriveLockGate.tsx`, which decides WHETHER to render this in place of a
 * surface's normal content.
 */

import React from 'react';
import { useDriveLockStore } from './driveLockStore.js';
import { useT } from '../i18n/index.js';
import { T } from './texte.js';

export default function DriveLockOverlay(): React.ReactElement {
  const t = useT(T);
  const countdownRemainingMs = useDriveLockStore((state) => state.countdownRemainingMs);
  const startPassengerOverride = useDriveLockStore((state) => state.startPassengerOverride);
  const cancelCountdown = useDriveLockStore((state) => state.cancelPassengerOverrideCountdown);

  const countingDown = countdownRemainingMs !== null;
  const remainingS = countingDown ? Math.ceil((countdownRemainingMs as number) / 1000) : null;

  return (
    <div
      className="p-4 space-y-3 text-center"
      data-testid="drive-lock-overlay"
      role="alertdialog"
      aria-label={t('gesperrt')}
    >
      <p className="text-2xl" aria-hidden="true">
        🔒
      </p>
      <p className="font-semibold text-slate-800 dark:text-slate-100">{t('gesperrt')}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('gesperrt_text')}</p>
      {countingDown ? (
        <div className="space-y-2">
          <p
            className="text-sm font-medium text-amber-700 dark:text-amber-400"
            data-testid="drive-lock-countdown"
            role="status"
            aria-live="polite"
          >
            {t('entsperre_in', { s: remainingS ?? '' })}
          </p>
          <button
            type="button"
            onClick={cancelCountdown}
            aria-label={t('freigabe_abbrechen')}
            className="min-h-[48px] px-4 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300"
            data-testid="drive-lock-cancel-button"
          >
            {t('abbrechen')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startPassengerOverride}
          aria-label={t('beifahrer_aria')}
          className="min-h-[48px] w-full px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          data-testid="drive-lock-passenger-button"
        >
          {t('beifahrer')}
        </button>
      )}
    </div>
  );
}
