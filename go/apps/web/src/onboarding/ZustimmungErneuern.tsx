/**
 * Erneute Zustimmung zu den Hinweisen, wenn sich ihr Wortlaut geaendert hat.
 *
 * Der Assistent (`OnboardingWizard.tsx`) erscheint nur, solange die
 * Einrichtung NICHT abgeschlossen ist. Wer sie laengst hinter sich hat und
 * einer aelteren Fassung zugestimmt hatte (`DISCLAIMER_VERSION`), saehe die
 * neue nie -- und „Navigation starten" bliebe still gesperrt
 * (`selectNavigationAllowed`). Deshalb hier nur dieser eine Schritt, ohne den
 * Rest der Einrichtung noch einmal durchlaufen zu muessen.
 */

import React from 'react';
import DisclaimerStep from './steps/DisclaimerStep.js';
import { hasValidConsent } from './state.js';
import { useOnboardingStore } from './store.js';

export default function ZustimmungErneuern(): React.ReactElement | null {
  const store = useOnboardingStore();
  const accept = useOnboardingStore((s) => s.acceptDisclaimerConsent);

  if (!store.loaded || store.forcedOpen || !store.state) return null;
  if (!store.state.completed || hasValidConsent(store.state)) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      data-testid="zustimmung-erneuern"
    >
      <div className="w-full max-w-lg rounded-lg bg-flaeche dark:bg-slate-800 p-5 shadow-xl space-y-3 text-slate-900 dark:text-slate-100">
        <h2 className="text-lg font-semibold">Die Hinweise zur Nutzung wurden aktualisiert</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Bitte lies sie einmal und stimme zu. Bis dahin lässt sich keine neue Navigation starten.
        </p>
        <DisclaimerStep state={store.state} onAccept={() => void accept()} />
      </div>
    </div>
  );
}
