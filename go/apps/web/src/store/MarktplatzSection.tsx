/**
 * Der Add-on-Marktplatz (Yapaia/Addon-server): Adresse, Konto-Token und
 * Entwicklermodus -- nach dem Muster von `KartenserverSection.tsx`.
 *
 * ─── WOFÜR ──────────────────────────────────────────────────────────────────
 * Über den Marktplatz kommen signierte Add-ons, auch kostenpflichtige und
 * Closed-Source (docs/marktplatz.md). Go installiert nur, was der Marktplatz
 * signiert hat; ein kostenpflichtiges Add-on läuft nur mit einer Lizenz für
 * genau diese Installation. Das Token verbindet Go mit dem Konto, in dem die
 * gekauften Add-ons liegen. Es wird nie angezeigt; ein leeres Feld behält das
 * bisherige.
 *
 * Der Entwicklermodus erlaubt unsignierte Pakete (eigene Add-ons beim
 * Entwickeln) und einen Marktplatz ohne https (Test im lokalen Netz). Die
 * Nutzung von Yapaia selbst braucht nie https.
 */

import React, { useEffect, useState } from 'react';
import { useT } from '../i18n/index.js';
import { T } from './texte.js';
import {
  fetchMarktplatz,
  saveMarktplatz,
  setEntwicklermodus,
  StoreApiError,
  type MarktplatzStand,
} from './client.js';

export default function MarktplatzSection({
  gespeichert,
}: {
  gespeichert: () => void;
}): React.ReactElement {
  const t = useT(T);
  const [stand, setStand] = useState<MarktplatzStand | null>(null);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void fetchMarktplatz().then((s) => {
      if (!s) return;
      setStand(s);
      setUrl(s.url);
    });
  }, []);

  const speichern = async (entfernen = false) => {
    setLaeuft(true);
    setMeldung(null);
    try {
      const s = await saveMarktplatz(entfernen ? '' : url.trim(), entfernen ? '' : token.trim());
      setStand(s);
      setUrl(s.url);
      setToken('');
      setMeldung({
        ok: true,
        text: entfernen
          ? t('mpEntfernt')
          : t('mpVerbunden', { name: s.name || s.url, konto: s.token_gesetzt ? t('mpKonto') : '' }),
      });
      gespeichert();
    } catch (err) {
      setMeldung({
        ok: false,
        text: err instanceof StoreApiError ? err.message : t('mpSpeichernFehler'),
      });
    } finally {
      setLaeuft(false);
    }
  };

  const entwicklermodus = async (an: boolean) => {
    setMeldung(null);
    try {
      setStand(await setEntwicklermodus(an));
    } catch (err) {
      setMeldung({
        ok: false,
        text: err instanceof StoreApiError ? err.message : t('mpSpeichernFehler'),
      });
    }
  };

  return (
    <section
      className="rounded-lg border border-slate-200 dark:border-slate-700 p-2"
      data-testid="marktplatz"
    >
      <div className="font-semibold text-xs">{t('mpTitel')}</div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('mpUntertitel')}</p>
      <label className="block mt-2 text-xs">
        {t('mpAdresse')}
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://addons.yapaia.cloud"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-0.5 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-flaeche dark:bg-slate-900 px-2 py-1 text-sm"
          data-testid="marktplatz-url"
        />
      </label>
      <label className="block mt-2 text-xs">
        {t('mpToken')}
        <input
          type="password"
          autoComplete="off"
          placeholder={stand?.token_gesetzt ? t('mpTokenHinterlegt') : t('mpTokenLeer')}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="mt-0.5 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-flaeche dark:bg-slate-900 px-2 py-1 text-sm"
          data-testid="marktplatz-token"
        />
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => void speichern()}
          disabled={laeuft || !url.trim()}
          className="px-2 py-1 rounded-md border border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50"
          data-testid="marktplatz-speichern"
        >
          {laeuft ? t('mpPruefe') : t('mpVerbinden')}
        </button>
        {stand?.url && (
          <button
            onClick={() => void speichern(true)}
            disabled={laeuft}
            className="text-[11px] underline text-slate-500 dark:text-slate-400 disabled:opacity-50"
            data-testid="marktplatz-entfernen"
          >
            {t('mpEntfernen')}
          </button>
        )}
      </div>
      {meldung && (
        <p
          className={`mt-1 text-xs ${meldung.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
          data-testid="marktplatz-meldung"
        >
          {meldung.text}
        </p>
      )}
      <label className="mt-2 flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={stand?.developer_mode ?? false}
          onChange={(e) => void entwicklermodus(e.target.checked)}
          className="mt-0.5"
          data-testid="marktplatz-entwicklermodus"
        />
        <span>
          {t('mpEntwickler')}
          <span className="block text-slate-500 dark:text-slate-400">{t('mpEntwicklerText')}</span>
        </span>
      </label>
      {stand?.installation_id && (
        <p
          className="mt-2 text-[11px] text-slate-500 dark:text-slate-400"
          data-testid="marktplatz-installation"
        >
          {t('mpInstallationsId')} <span className="font-mono">{stand.installation_id}</span>
        </p>
      )}
    </section>
  );
}
