/**
 * Edit-mode toolbar (E07-T2 acceptance criteria 3/1): the explicit
 * Save/Cancel controls plus "Reset to default" (behind a confirmation
 * dialog, task requirement). Purely presentational -- `Shell.tsx` owns all
 * the actual draft-mutation logic (`editModel.ts`); this component only
 * calls the callbacks it's given.
 */

import React from 'react';
import { T } from '../texte.js';
import { useT } from '../../i18n/index.js';

export interface EditToolbarProps {
  onSave: () => void;
  onCancel: () => void;
  onRequestReset: () => void;
}

export function EditToolbar({
  onSave,
  onCancel,
  onRequestReset,
}: EditToolbarProps): React.ReactElement {
  const t = useT(T);
  return (
    <div
      data-testid="edit-toolbar"
      className="fixed top-2 right-2 z-50 flex gap-2 rounded-lg bg-slate-900/95 p-2 shadow-lg"
    >
      <button
        type="button"
        data-testid="edit-reset-button"
        aria-label={t('aufStandardAria')}
        title={t('aufStandardAria')}
        onClick={onRequestReset}
        className="rounded bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-600"
      >
        ↺
      </button>
      <button
        type="button"
        data-testid="edit-cancel-button"
        aria-label={t('abbrechenAria')}
        title={t('abbrechenTitel')}
        onClick={onCancel}
        className="rounded bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-600"
      >
        ✕
      </button>
      <button
        type="button"
        data-testid="edit-save-button"
        aria-label={t('layoutSpeichern')}
        title={t('speichern')}
        onClick={onSave}
        className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        ✓
      </button>
    </div>
  );
}

export interface ResetConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/** Custom in-DOM confirmation (deliberately NOT `window.confirm`, which is
 *  unstyleable, blocks the whole page, and Playwright can only drive via a
 *  separate `page.on('dialog', ...)` side-channel rather than ordinary
 *  `getByTestId` assertions like every other flow in this app's e2e suite). */
export function ResetConfirmDialog({
  onConfirm,
  onCancel,
}: ResetConfirmDialogProps): React.ReactElement {
  const t = useT(T);
  return (
    <div
      data-testid="edit-reset-confirm"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
    >
      <div className="max-w-xs rounded-lg bg-slate-900 p-4 text-slate-100 shadow-xl">
        <p className="mb-3 text-sm">{t('resetFrage')}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="edit-reset-confirm-cancel"
            onClick={onCancel}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600"
          >
            {t('abbrechen')}
          </button>
          <button
            type="button"
            data-testid="edit-reset-confirm-yes"
            onClick={onConfirm}
            className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-500"
          >
            {t('zuruecksetzen')}
          </button>
        </div>
      </div>
    </div>
  );
}
