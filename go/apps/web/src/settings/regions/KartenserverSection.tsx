/**
 * Der eigene Kartenserver (Yapaia/map-server): Adresse und Token.
 *
 * ─── WOFÜR ──────────────────────────────────────────────────────────────────
 * Gewünscht: „Dann kann Go sie von dort runterladen." Ein VPS baut Karte,
 * Suchindex und Routing für beliebig zusammengefasste Regionen; Go lädt das
 * fertige Paket statt stundenlang selbst zu bauen. Die Pakete erscheinen dann
 * in der Kartenliste darüber, mit dem Knopf „Installieren" bzw. „Update".
 *
 * Das Token wird nie angezeigt -- auch nicht nach dem Speichern. Ein leeres
 * Feld behält das bisherige, damit man die Adresse ändern kann, ohne das
 * Token erneut vom Server abschreiben zu müssen.
 */

import React, { useEffect, useState } from 'react';
import { useT } from '../../i18n/index.js';
import { T } from './texte.js';
import {
  fetchKartenserver,
  RegionApiError,
  saveKartenserver,
  type KartenserverStand,
} from './client';

export default function KartenserverSection({
  stand,
  gespeichert,
}: {
  /** Was der Kern beim letzten Katalogabruf gemeldet hat. */
  stand: KartenserverStand | null;
  /** Nach dem Speichern: Katalog neu holen, damit die Pakete erscheinen. */
  gespeichert: () => void;
}): React.ReactElement {
  const t = useT(T);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [tokenGesetzt, setTokenGesetzt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void fetchKartenserver().then((e) => {
      if (!e) return;
      setUrl(e.url);
      setTokenGesetzt(e.token_gesetzt);
    });
  }, []);

  const speichern = async (entfernen = false) => {
    setLaeuft(true);
    setMeldung(null);
    try {
      const e = await saveKartenserver(entfernen ? '' : url.trim(), entfernen ? '' : token.trim());
      setUrl(e.url);
      setToken('');
      setTokenGesetzt(e.token_gesetzt);
      setMeldung({
        ok: true,
        text: entfernen
          ? t('ksEntfernt')
          : t(e.pakete === 1 ? 'ksVerbundenEins' : 'ksVerbunden', { n: e.pakete ?? 0 }),
      });
      gespeichert();
    } catch (err) {
      setMeldung({
        ok: false,
        text: err instanceof RegionApiError ? err.message : t('ksSpeichernFehler'),
      });
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <section
      className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 p-2"
      data-testid="kartenserver"
    >
      <div className="font-semibold">{t('ksTitel')}</div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('ksText')}</p>
      <label className="block mt-2 text-xs">
        {t('ksAdresse')}
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://karten.example.org"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-0.5 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-flaeche dark:bg-slate-900 px-2 py-1 text-sm"
          data-testid="kartenserver-url"
        />
      </label>
      <label className="block mt-2 text-xs">
        Token
        <input
          type="password"
          autoComplete="off"
          placeholder={tokenGesetzt ? t('ksTokenGesetzt') : t('ksTokenLeer')}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="mt-0.5 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-flaeche dark:bg-slate-900 px-2 py-1 text-sm"
          data-testid="kartenserver-token"
        />
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => void speichern()}
          disabled={laeuft || !url.trim()}
          className="px-2 py-1 rounded-md border border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50"
          data-testid="kartenserver-speichern"
        >
          {laeuft ? t('pruefe') : t('verbinden')}
        </button>
        {stand?.eingerichtet && (
          <button
            onClick={() => void speichern(true)}
            disabled={laeuft}
            className="text-[11px] underline text-slate-500 dark:text-slate-400 disabled:opacity-50"
            data-testid="kartenserver-entfernen"
          >
            {t('entfernen')}
          </button>
        )}
      </div>
      {meldung && (
        <p
          className={`mt-1 text-xs ${meldung.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
          data-testid="kartenserver-meldung"
        >
          {meldung.text}
        </p>
      )}
      {!meldung && stand?.fehler && (
        <p
          className="mt-1 text-xs text-red-600 dark:text-red-400"
          data-testid="kartenserver-fehler"
        >
          {stand.fehler}
        </p>
      )}
    </section>
  );
}
