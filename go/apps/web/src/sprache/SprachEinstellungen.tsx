/**
 * ⚙ → Sprache & Home Assistant: Assist-Anbindung einrichten, KI wählen.
 *
 * Gewünscht: Sprachsteuerung „per HA-Sprachsatelliten und per
 * Mikrofon-Knopf", „nach Möglichkeit mit den KI-Funktionen von Home
 * Assistant, aber gerne bei Bedarf autark".
 */

import React, { useCallback, useEffect, useState } from 'react';
import { browserPlayer } from '../drive/ansageZiel.js';
import { gebiet, tx, useT } from '../i18n/index.js';
import { T } from './texte.js';

interface Stand {
  verfuegbar: boolean;
  /** Ist die Integration „Yapaia" mit Yapaia Go verbunden? */
  integration: boolean;
  automation: boolean;
  agent: string | null;
  agenten: Array<{ id: string; name: string }>;
  /** Ansagen ins laufende Radio (Yapaia Beat) einmischen. */
  ansagenBeat?: boolean;
  /** Gibt es Yapaia Beat in Home Assistant? */
  radio?: boolean;
  /** Die Player von Music Assistant. */
  lautsprecher?: Array<{ id: string; name: string; art?: 'ma' | 'ha'; ansage?: boolean }>;
  /** Gewählter Lautsprecher für Ansagen, '' = automatisch. */
  lautsprecherWahl?: string;
  /** Gong vor Ansagen über Music Assistant. */
  ansageGong?: boolean;
  /** Läuft das Radio über Music Assistant: wo die Verzögerung hin soll. */
  ansageMaWeg?: 'browser' | 'mischen' | 'sofort';
  /** Music Assistant als Integration eingerichtet? null = unbekannt. */
  musicAssistant?: boolean | null;
  /** Welchen Weg eine Ansage gerade nähme. */
  ansageWeg?: {
    art: 'lautsprecher' | 'beat-ma' | 'beat-ma-browser' | 'beat' | 'selbst';
    ziel?: string;
    radioLaeuft?: boolean;
  };
}

/** In Klartext: wie eine Ansage gerade ankommt. */
export function wegText(w: NonNullable<Stand['ansageWeg']>): string {
  switch (w.art) {
    case 'lautsprecher':
      return tx(T, 'weg_lautsprecher', { ziel: w.ziel ?? '?' });
    case 'beat-ma-browser':
      return tx(T, 'weg_beat_ma_browser', { ziel: w.ziel ?? '?' });
    case 'beat-ma':
      return tx(T, 'weg_beat_ma', { ziel: w.ziel ?? '?' });
    case 'beat':
      return tx(T, w.radioLaeuft ? 'weg_beat_radio' : 'weg_beat');
    default:
      return tx(T, 'weg_selbst');
  }
}

/** Wie ein Lautsprecher in der Auswahl heißt -- mit dem, was eine Ansage dort bewirkt. */
export function lautsprecherName(l: NonNullable<Stand['lautsprecher']>[number]): string {
  if ((l.art ?? 'ma') === 'ma') return tx(T, 'lautsprecher_ma', { name: l.name });
  return l.ansage === false ? tx(T, 'lautsprecher_unterbricht', { name: l.name }) : l.name;
}

/** Warum es (k)einen Player von Music Assistant gibt. */
export function maText(s: Stand): string {
  // Ohne `art` (Kern vor 0.47.0) waren es immer Player von Music Assistant.
  const n = (s.lautsprecher ?? []).filter((l) => (l.art ?? 'ma') === 'ma').length;
  if (n > 0) return n === 1 ? tx(T, 'ma_ein_player') : tx(T, 'ma_n_player', { n });
  if (s.musicAssistant) {
    return tx(T, 'ma_ohne_player');
  }
  return tx(T, 'ma_keine_integration');
}

interface Ergebnis {
  integration: boolean;
  automation: boolean;
  hinweis?: string;
}

const url = (pfad: string): string => `${import.meta.env.BASE_URL}${pfad}`;

export default function SprachEinstellungen(): React.ReactElement {
  const t = useT(T);
  const [stand, setStand] = useState<Stand | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  const [richtetEin, setRichtetEin] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const r = await fetch(url('api/v1/sprache/ha'));
      const body = (await r.json()) as { data?: Stand };
      setStand(body.data ?? null);
    } catch {
      setStand(null);
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Nach einer Änderung oder einem Test: den Weg der Ansagen neu holen, ohne
  // dass die Seite kurz „lädt".
  const stillNeu = async (): Promise<void> => {
    try {
      const r = await fetch(url('api/v1/sprache/ha'));
      const body = (await r.json()) as { data?: Stand };
      if (body.data) setStand(body.data);
    } catch {
      // bleibt beim alten Stand
    }
  };

  const einrichten = async (): Promise<void> => {
    setRichtetEin(true);
    setErgebnis(null);
    try {
      const r = await fetch(url('api/v1/sprache/ha/einrichten'), { method: 'POST' });
      const body = (await r.json()) as { data?: Ergebnis; error?: { message: string } };
      setErgebnis(
        body.data ?? {
          integration: false,
          automation: false,
          hinweis: body.error?.message ?? tx(T, 'http_fehler', { status: r.status }),
        }
      );
    } catch {
      setErgebnis({ integration: false, automation: false, hinweis: tx(T, 'nicht_erreichbar') });
    } finally {
      setRichtetEin(false);
      void laden();
    }
  };

  const agentWaehlen = async (agent: string): Promise<void> => {
    setStand((s) => (s ? { ...s, agent: agent || null } : s));
    try {
      await fetch(url('api/v1/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sprache_agent: agent || null }),
      });
    } catch {
      // Beim nächsten Öffnen zeigt der Stand vom Kern, was gilt.
    }
  };

  const [test, setTest] = useState<{ ok: boolean; grund: string } | 'laeuft' | null>(null);
  const testen = async (): Promise<void> => {
    setTest('laeuft');
    // Ist dieser Browser Beats Player bei Music Assistant, wird hier
    // eingemischt -- genau wie bei einer Abbiege-Ansage.
    const player = browserPlayer();
    if (player) {
      try {
        const beginn = performance.now();
        const r = await fetch(url('api/v1/ansage'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: tx(T, 'test_text'),
            prioritaet: 'hinweis',
            browser_player: player.name,
          }),
        });
        const d = (
          (await r.json()) as { data?: { im_browser?: { pfad?: string }; ueber_radio?: boolean } }
        ).data;
        if (d?.im_browser?.pfad) {
          const ok = await player.sprich(`${window.location.origin}${d.im_browser.pfad}`);
          const s = ((performance.now() - beginn) / 1000).toLocaleString(gebiet(), {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          });
          setTest(
            ok
              ? { ok: true, grund: tx(T, 'test_browser_ok', { player: player.name, s }) }
              : { ok: false, grund: tx(T, 'test_browser_fehler') }
          );
          void stillNeu();
          return;
        }
        if (d?.ueber_radio) {
          setTest({ ok: true, grund: tx(T, 'test_beat_ok') });
          void stillNeu();
          return;
        }
      } catch {
        // dann der Weg über den Kern
      }
    }
    try {
      const r = await fetch(url('api/v1/ansage/test'), { method: 'POST' });
      const body = (await r.json()) as { data?: { ok: boolean; grund: string } };
      setTest(body.data ?? { ok: false, grund: tx(T, 'http_fehler', { status: r.status }) });
    } catch {
      setTest({ ok: false, grund: tx(T, 'nicht_erreichbar') });
    }
    void stillNeu();
  };

  const lautsprecherSetzen = async (id: string): Promise<void> => {
    setStand((s) => (s ? { ...s, lautsprecherWahl: id } : s));
    try {
      await fetch(url('api/v1/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ansage_lautsprecher: id || null }),
      });
      void stillNeu();
    } catch {
      // Beim nächsten Öffnen zeigt der Stand vom Kern, was gilt.
    }
  };

  const maWegSetzen = async (weg: 'browser' | 'mischen' | 'sofort'): Promise<void> => {
    setStand((s) => (s ? { ...s, ansageMaWeg: weg } : s));
    try {
      await fetch(url('api/v1/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ansage_ma_weg: weg }),
      });
      void stillNeu();
    } catch {
      // Beim nächsten Öffnen zeigt der Stand vom Kern, was gilt.
    }
  };

  const gongSetzen = async (an: boolean): Promise<void> => {
    setStand((s) => (s ? { ...s, ansageGong: an } : s));
    try {
      await fetch(url('api/v1/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ansage_gong: an }),
      });
    } catch {
      // Beim nächsten Öffnen zeigt der Stand vom Kern, was gilt.
    }
  };

  const ansagenBeatSetzen = async (an: boolean): Promise<void> => {
    setStand((s) => (s ? { ...s, ansagenBeat: an } : s));
    try {
      await fetch(url('api/v1/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ansagen_beat: an }),
      });
      void stillNeu();
    } catch {
      // Beim nächsten Öffnen zeigt der Stand vom Kern, was gilt.
    }
  };

  return (
    <div
      className="space-y-5 text-sm text-slate-800 dark:text-slate-100"
      data-testid="sprach-einstellungen"
    >
      <section className="space-y-2">
        <h3 className="font-semibold">{t('h_assist')}</h3>
        <p className="text-slate-600 dark:text-slate-300">{t('assist_text')}</p>
        {laedt && <p className="text-slate-500">{t('laedt')}</p>}
        {!laedt && stand && !stand.verfuegbar && (
          <p
            className="rounded-md bg-amber-50 p-2 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
            data-testid="sprach-ha-nicht-verfuegbar"
          >
            {t('nur_addon')}
          </p>
        )}
        {!laedt && stand?.verfuegbar && (
          <ul className="space-y-1" data-testid="sprach-ha-stand">
            <li>
              {stand.integration ? '✅' : '⬜'} {t('integration_verbunden')}
            </li>
            <li>
              {stand.automation ? '✅' : '⬜'} {t('automation_da')}
            </li>
          </ul>
        )}
        <button
          type="button"
          onClick={() => void einrichten()}
          disabled={richtetEin || !stand?.verfuegbar}
          className="w-full rounded-full bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid="sprach-ha-einrichten"
        >
          {richtetEin
            ? t('richte_ein')
            : stand?.automation
              ? t('neu_einrichten')
              : t('in_ha_einrichten')}
        </button>
        {ergebnis && (
          <p
            className={
              ergebnis.automation
                ? 'text-green-700 dark:text-green-400'
                : 'text-red-700 dark:text-red-400'
            }
            data-testid="sprach-ha-ergebnis"
          >
            {ergebnis.automation && ergebnis.integration
              ? t('eingerichtet')
              : (ergebnis.hinweis ?? t('nicht_geklappt_kurz'))}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">{t('h_so_sprichst')}</h3>
        <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
          <li>{t('so_satellit')}</li>
          <li>{t('so_app')}</li>
          <li>{t('so_kurz')}</li>
          <li>{t('so_ki')}</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">{t('h_ansagen')}</h3>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={stand?.ansagenBeat ?? true}
            onChange={(e) => void ansagenBeatSetzen(e.target.checked)}
            disabled={!stand}
            className="mt-1 h-4 w-4"
            data-testid="sprach-ansagen-beat"
          />
          <span>
            {t('beat_einmischen')}
            {stand?.verfuegbar && !stand.radio && (
              <span className="block text-xs text-slate-500">{t('beat_nicht_eingerichtet')}</span>
            )}
          </span>
        </label>
        <label className="block space-y-1">
          <span>{t('ansagen_ueber')}</span>
          <select
            value={stand?.lautsprecherWahl ?? ''}
            onChange={(e) => void lautsprecherSetzen(e.target.value)}
            disabled={!stand?.verfuegbar}
            className="w-full rounded-md border border-slate-300 bg-flaeche px-2 py-2 dark:border-slate-600 dark:bg-slate-700"
            data-testid="sprach-lautsprecher"
          >
            <option value="">{t('automatisch')}</option>
            {(stand?.lautsprecher ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {lautsprecherName(l)}
              </option>
            ))}
          </select>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {t('lautsprecher_hilfe')}
          </span>
        </label>
        <label className="block space-y-1">
          <span>{t('radio_ueber_ma')}</span>
          <select
            value={stand?.ansageMaWeg ?? 'browser'}
            onChange={(e) => void maWegSetzen(e.target.value as 'browser' | 'mischen' | 'sofort')}
            disabled={!stand?.verfuegbar}
            className="w-full rounded-md border border-slate-300 bg-flaeche px-2 py-2 dark:border-slate-600 dark:bg-slate-700"
            data-testid="sprach-ma-weg"
          >
            <option value="browser">{t('ma_browser')}</option>
            <option value="mischen">{t('ma_mischen')}</option>
            <option value="sofort">{t('ma_sofort')}</option>
          </select>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {t('ma_browser_hilfe')}
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={stand?.ansageGong ?? true}
            onChange={(e) => void gongSetzen(e.target.checked)}
            disabled={!stand?.verfuegbar}
            className="mt-1 h-4 w-4"
            data-testid="sprach-ansage-gong"
          />
          <span>{t('gong')}</span>
        </label>
        {stand?.verfuegbar && (
          <div
            className="space-y-1 rounded-md bg-slate-100 p-2 text-sm dark:bg-slate-700/60"
            data-testid="sprach-ansage-weg"
          >
            <p>
              <span className="font-medium">{t('ansagen_aktuell')}</span>
              {wegText(stand.ansageWeg ?? { art: 'selbst' })}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300" data-testid="sprach-ma-stand">
              {maText(stand)}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => void testen()}
          disabled={test === 'laeuft'}
          className="w-full rounded-full border border-slate-300 px-4 py-2 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700"
          data-testid="sprach-ansage-test"
        >
          {test === 'laeuft' ? t('teste') : t('ansage_testen')}
        </button>
        {test && test !== 'laeuft' && (
          <p
            className={
              test.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
            }
            data-testid="sprach-ansage-test-ergebnis"
          >
            {test.ok ? '✅ ' : '⚠️ '}
            {test.grund}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">{t('h_ki')}</h3>
        <p className="text-slate-600 dark:text-slate-300">{t('ki_text')}</p>
        <select
          value={stand?.agent ?? ''}
          onChange={(e) => void agentWaehlen(e.target.value)}
          disabled={!stand?.verfuegbar}
          className="w-full rounded-md border border-slate-300 bg-flaeche px-2 py-2 dark:border-slate-600 dark:bg-slate-700"
          data-testid="sprach-agent"
        >
          <option value="">{t('keine_ki')}</option>
          {(stand?.agenten ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {stand?.verfuegbar && stand.agenten.length === 0 && (
          <p className="text-xs text-slate-500">{t('kein_agent')}</p>
        )}
      </section>
    </div>
  );
}
