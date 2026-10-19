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

export interface DisclaimerStepProps {
  state: OnboardingState;
  onAccept: () => void;
}

export default function DisclaimerStep({ state, onAccept }: DisclaimerStepProps): React.ReactElement {
  const [checked, setChecked] = useState(hasValidConsent(state));
  const accepted = hasValidConsent(state);

  return (
    <div className="space-y-4" data-testid="onboarding-step-disclaimer">
      <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200 space-y-2 max-h-[50vh] overflow-y-auto">
        <p className="font-semibold">Hinweise zur Nutzung und Haftungsausschluss</p>
        <p>
          <strong>Du fährst, nicht Yapaia.</strong> Die Verantwortung für das Führen des Fahrzeugs
          liegt jederzeit bei der Person am Steuer. Verkehrszeichen, Beschilderung und Anweisungen
          vor Ort haben immer Vorrang vor der Navigation. Bediene Yapaia nicht während der Fahrt.
        </p>
        <p>
          <strong>Alle Anzeigen sind Hinweise ohne Gewähr.</strong> Das gilt für Routen,
          Durchfahrtshöhen, Gewichts- und Breitenbeschränkungen, Tempolimits, Spurempfehlungen,
          Verkehrsmeldungen, Rückfahrkamera, Neigung, Reifendruck, Füllstände und Batteriewerte.
          Sensoren und Kartendaten können ausfallen, ungenau, falsch oder veraltet sein. Sie ersetzen
          weder den Blick nach draußen noch eigene Prüfung.
        </p>
        <p>
          Die Kartendaten stammen aus OpenStreetMap (© OpenStreetMap contributors). Höhen-, Gewichts-
          und sonstige Einschränkungen sind dort nicht vollständig erfasst.
        </p>
        <p>
          <strong>Software ohne Gewähr.</strong> Yapaia ist freie Software unter der GNU General
          Public License 3.0 und wird unentgeltlich und ohne Gewährleistung bereitgestellt. Die
          Haftung ist ausgeschlossen, soweit das Gesetz es zulässt; unberührt bleibt die Haftung für
          Vorsatz und grobe Fahrlässigkeit sowie für Schäden aus der Verletzung des Lebens, des
          Körpers oder der Gesundheit nach den gesetzlichen Vorschriften.
        </p>
        <p>Es findet keine Telemetrie ohne deine Zustimmung statt; alle Daten bleiben lokal.</p>
      </div>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5"
          data-testid="onboarding-disclaimer-checkbox"
        />
        <span>
          Ich habe die Hinweise und den Haftungsausschluss gelesen und verstanden. Mir ist bewusst,
          dass alle Anzeigen fehlerhaft sein können und ich als Fahrer für das Fahrzeug
          verantwortlich bleibe.
        </span>
      </label>

      {accepted ? (
        <p
          className="text-xs text-green-700 dark:text-green-400"
          data-testid="onboarding-disclaimer-accepted-status"
        >
          Zugestimmt am {new Date(state.disclaimer!.acceptedAt).toLocaleString('de-DE')} (Version{' '}
          {state.disclaimer!.version}).
        </p>
      ) : (
        <button
          type="button"
          onClick={onAccept}
          disabled={!checked}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="onboarding-disclaimer-accept-button"
        >
          Zustimmen
        </button>
      )}
    </div>
  );
}
