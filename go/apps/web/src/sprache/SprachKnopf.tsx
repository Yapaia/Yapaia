/** Der 🎤-Knopf: öffnet das Sprachfenster. */

import React from 'react';
import { useSprachStore } from './sprachStore.js';
import { useT } from '../i18n/index.js';
import { T } from './texte.js';

export default function SprachKnopf({
  className = '',
}: {
  className?: string;
}): React.ReactElement {
  const t = useT(T);
  const oeffne = useSprachStore((s) => s.oeffne);
  return (
    <button
      type="button"
      onClick={oeffne}
      aria-label={t('sprachbefehl')}
      title={t('sprachbefehl')}
      className={`pointer-events-auto flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-flaeche/95 text-lg shadow-md hover:bg-slate-100 dark:bg-slate-800/95 dark:hover:bg-slate-700 ${className}`}
      data-testid="sprach-knopf"
    >
      🎤
    </button>
  );
}
