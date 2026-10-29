/**
 * Geolocation Hints Component (E02-T2)
 *
 * Displays W-03 hints for:
 * - Insecure context (non-HTTPS, non-localhost)
 * - Permission denied
 * - Not supported
 * - Other errors
 */

import React, { useState } from 'react';
import { useT } from '../i18n/index.js';
import { T } from './texte.js';
import type { BrowserSourceState, BrowserSourceError } from './browserSource';

interface GeolocationHintsProps {
  sourceState: BrowserSourceState;
}

export default function GeolocationHints({
  sourceState,
}: GeolocationHintsProps): React.ReactElement | null {
  const t = useT(T);
  const [visible, setVisible] = useState(true);

  if (sourceState.status !== 'error' || !sourceState.error || !visible) {
    return null;
  }

  const renderError = (error: BrowserSourceError): React.ReactElement => {
    switch (error) {
      case 'insecure-context':
        return (
          <div className="space-y-2">
            <p className="font-semibold">{t('unsichererKontext')}</p>
            <p className="text-sm">{t('unsichererText')}</p>
            {/* „Nutze Home Assistant Ingress (immer HTTPS)" stand hier bis
                2026-09-02 und war schlicht falsch: Ingress erbt das Protokoll
                von Home Assistant selbst. Wer HA über http://…:8123 aufruft,
                bekommt auch Ingress über HTTP -- der Hinweis schickte genau
                die Betroffenen im Kreis. */}
            <p className="text-sm">{t('wegeHelfen')}</p>
            <ul className="text-sm list-disc list-inside space-y-1">
              <li>{t('weg1')}</li>
              <li>{t('weg2')}</li>
              <li>{t('weg3')}</li>
            </ul>
          </div>
        );

      case 'permission-denied':
        return (
          <div className="space-y-2">
            <p className="font-semibold">{t('verweigert')}</p>
            <p className="text-sm">{t('verweigertText')}</p>
            <p className="text-sm">{t('empfohlen')}</p>
            <ul className="text-sm list-disc list-inside space-y-1">
              <li>{t('lsg1')}</li>
              <li>{t('lsg2')}</li>
              <li>{t('lsg3')}</li>
            </ul>
          </div>
        );

      case 'not-supported':
        return (
          <div className="space-y-2">
            <p className="font-semibold">{t('nichtUnterstuetzt')}</p>
            <p className="text-sm">{t('nichtUnterstuetztText')}</p>
            <p className="text-sm">{t('stattdessenGpsd')}</p>
          </div>
        );

      case 'position-unavailable':
      case 'timeout':
        return (
          <div className="space-y-2">
            <p className="font-semibold">{t('keinSignal')}</p>
            <p className="text-sm">{t('keinSignalText')}</p>
            <ul className="text-sm list-disc list-inside space-y-1">
              <li>{t('grund1')}</li>
              <li>{t('grund2')}</li>
              <li>{t('grund3')}</li>
            </ul>
            <p className="text-sm">{t('tipp')}</p>
          </div>
        );

      default:
        return (
          <div className="space-y-2">
            <p className="font-semibold">{t('fehlerAbruf')}</p>
            <p className="text-sm">{t('fehlerAbrufText')}</p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none">
      <div className="absolute top-4 left-4 right-4 pointer-events-auto">
        {/* `data-testid` added in E10-T1 so docs/07 §5 flow 11
            (`e2e/flow-11-permission-denied.spec.ts`) can assert this banner
            directly instead of text-matching a loose `page.locator('text=...')`.
            Purely additive: no styling or behaviour change. */}
        <div
          data-testid="geolocation-hint"
          data-geolocation-error={sourceState.error}
          className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 shadow-lg"
        >
          <div className="flex gap-3">
            <div className="flex-shrink-0 text-lg">⚠️</div>
            <div className="flex-1">{renderError(sourceState.error)}</div>
            <button
              onClick={() => setVisible(false)}
              className="flex-shrink-0 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              aria-label={t('schliessen')}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
