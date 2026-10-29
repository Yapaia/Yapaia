/**
 * Onboarding step 2: the mandatory, VERSIONED liability disclaimer consent
 * (E08-T5, docs/00 §"Rechtliches / Sicherheit"). This is the gate: the
 * wizard's "Weiter" button (in `OnboardingWizard.tsx`) stays disabled until
 * `hasValidConsent` is true, and `RoutingPanel.tsx`'s "Navigation starten"
 * reads the exact same `hasValidConsent` check independently -- see
 * `onboarding/store.ts#selectNavigationAllowed`.
 */

import React, { useState } from 'react';
import { hasValidConsent, type OnboardingState } from '../state.js';
import { gebiet, useSprache, useT } from '../../i18n/index.js';
import { T } from '../texte.js';

export interface DisclaimerStepProps {
  state: OnboardingState;
  onAccept: () => void;
}

export default function DisclaimerStep({
  state,
  onAccept,
}: DisclaimerStepProps): React.ReactElement {
  const t = useT(T);
  const sprache = useSprache((s) => s.sprache);
  const [checked, setChecked] = useState(hasValidConsent(state));
  const accepted = hasValidConsent(state);

  return (
    <div className="space-y-4" data-testid="onboarding-step-disclaimer">
      <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200 space-y-2 max-h-[50vh] overflow-y-auto">
        <p className="font-semibold">{t('dTitel')}</p>
        <p>
          <strong>{t('d1Fett')}</strong>
          {t('d1')}
        </p>
        <p>
          <strong>{t('d2Fett')}</strong>
          {t('d2')}
        </p>
        <p>{t('d3')}</p>
        <p>
          <strong>{t('d4Fett')}</strong>
          {t('d4')}
        </p>
        <p>{t('d5')}</p>
      </div>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5"
          data-testid="onboarding-disclaimer-checkbox"
        />
        <span>{t('dHaken')}</span>
      </label>

      {accepted ? (
        <p
          className="text-xs text-green-700 dark:text-green-400"
          data-testid="onboarding-disclaimer-accepted-status"
        >
          {t('zugestimmt', {
            datum: new Date(state.disclaimer!.acceptedAt).toLocaleString(gebiet(sprache)),
            version: state.disclaimer!.version,
          })}
        </p>
      ) : (
        <button
          type="button"
          onClick={onAccept}
          disabled={!checked}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="onboarding-disclaimer-accept-button"
        >
          {t('zustimmen')}
        </button>
      )}
    </div>
  );
}
