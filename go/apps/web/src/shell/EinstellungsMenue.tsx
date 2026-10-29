/**
 * Das ⚙-Menü: alles, was man einmal einstellt, an einem Ort.
 *
 * Gewünscht: „Es gibt im Ruhemodus nicht viele Menüs oder Buttons." Bis
 * 0.22 standen rechts oben vier runde Knöpfe (🗺️ 🧩 🩺 🧪) und unten links
 * ein fünfter (⚙️), jeder mit eigenem Ausklappfenster. Jetzt öffnet der ⚙ im
 * Seitenpanel dieses Menü: oben der Name „Yapaia Go" (gewünscht: „Yapaia Go
 * kann in das Einstellungsmenü"), darunter die Bereiche, und ein Tipp zeigt
 * den Inhalt des Bereichs an derselben Stelle -- mit ← zurück.
 *
 * Die Bereiche selbst sind die bisherigen Menüs im Modus `eingebettet`: ohne
 * eigenen Knopf, ohne eigene Position, immer offen. Ihr Inhalt ist
 * unverändert.
 */

import React, { useEffect, useState } from 'react';
import StylePanel from '../map/StylePanel.js';
import ProfilesPanel from '../profiles/ProfilesPanel.js';
import SprachEinstellungen from '../sprache/SprachEinstellungen.js';
import { useAnordnungStore } from './anordnung.js';
import RegionsPanel from '../settings/regions/RegionsPanel.js';
import StorePanel from '../store/StorePanel.js';
import PreflightPanel from '../settings/preflight/PreflightPanel.js';
import SimulatorPanel from '../simulator/SimulatorPanel.js';
import { fetchSimulatorStatus, SimulatorDisabledError } from '../simulator/client.js';
import { useBedienSeite, PANEL_BREITE_PX } from './bedienSeite.js';
import { T } from './texte.js';
import { useT } from '../i18n/index.js';

type TitelSchluessel =
  'm_fahrzeuge' | 'm_sprache' | 'm_karte' | 'm_regionen' | 'm_store' | 'm_pruefung' | 'm_testfahrt';

type Bereich = 'sprache' | 'fahrzeuge' | 'karte' | 'regionen' | 'store' | 'pruefung' | 'testfahrt';

interface Eintrag {
  bereich: Bereich;
  symbol: string;
  titel: TitelSchluessel;
  /** Die Kennung des früheren Knopfs -- Tests und Gewohnheit finden ihn so wieder. */
  testId: string;
}

const EINTRAEGE: readonly Eintrag[] = [
  { bereich: 'fahrzeuge', symbol: '🚐', titel: 'm_fahrzeuge', testId: 'profile-chip' },
  { bereich: 'sprache', symbol: '🎙️', titel: 'm_sprache', testId: 'sprache-einstellungen-toggle' },
  { bereich: 'karte', symbol: '🎨', titel: 'm_karte', testId: 'style-panel-toggle' },
  { bereich: 'regionen', symbol: '🗺️', titel: 'm_regionen', testId: 'regions-panel-toggle' },
  { bereich: 'store', symbol: '🧩', titel: 'm_store', testId: 'store-panel-toggle' },
  { bereich: 'pruefung', symbol: '🩺', titel: 'm_pruefung', testId: 'preflight-panel-toggle' },
  { bereich: 'testfahrt', symbol: '🧪', titel: 'm_testfahrt', testId: 'simulator-panel-toggle' },
];

function Inhalt({ bereich }: { bereich: Bereich }): React.ReactElement | null {
  switch (bereich) {
    case 'fahrzeuge':
      return <ProfilesPanel />;
    case 'sprache':
      return <SprachEinstellungen />;
    case 'karte':
      return <StylePanel eingebettet />;
    case 'regionen':
      return <RegionsPanel eingebettet />;
    case 'store':
      return <StorePanel eingebettet />;
    case 'pruefung':
      return <PreflightPanel eingebettet />;
    case 'testfahrt':
      return <SimulatorPanel eingebettet />;
  }
}

export default function EinstellungsMenue({
  onSchliessen,
}: {
  onSchliessen: () => void;
}): React.ReactElement {
  const t = useT(T);
  const seite = useBedienSeite();
  const [bereich, setBereich] = useState<Bereich | null>(null);
  // Die Testfahrt gibt es nur, wenn der Simulator freigeschaltet ist.
  const [testfahrt, setTestfahrt] = useState(false);
  useEffect(() => {
    let aus = false;
    fetchSimulatorStatus()
      .then(() => !aus && setTestfahrt(true))
      .catch((e) => !aus && setTestfahrt(!(e instanceof SimulatorDisabledError)));
    return () => {
      aus = true;
    };
  }, []);

  const eintraege = EINTRAEGE.filter((e) => e.bereich !== 'testfahrt' || testfahrt);
  const aktiv = EINTRAEGE.find((e) => e.bereich === bereich);

  return (
    <div
      role="dialog"
      aria-label={t('einstellungen')}
      style={{ [seite]: 0, width: `min(${PANEL_BREITE_PX + 24}px, 100%)` }}
      className="pointer-events-auto fixed top-0 bottom-0 z-40 flex flex-col bg-flaeche shadow-2xl dark:bg-slate-800"
      data-testid="einstellungen-menue"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-3 dark:border-slate-700">
        {bereich ? (
          <button
            type="button"
            onClick={() => setBereich(null)}
            aria-label={t('zurueck')}
            className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            data-testid="einstellungen-zurueck"
          >
            ←
          </button>
        ) : (
          <img
            src={`${import.meta.env.BASE_URL}icons/emblem-128.png`}
            alt=""
            aria-hidden="true"
            width={28}
            height={28}
            className="h-7 w-7"
            data-testid="brand-emblem"
          />
        )}
        <h2 className="flex-1 text-lg font-bold text-slate-900 dark:text-white">
          {aktiv ? t(aktiv.titel) : 'Yapaia Go'}
        </h2>
        <button
          type="button"
          onClick={onSchliessen}
          aria-label={t('einstellungenSchliessen')}
          className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
          data-testid="einstellungen-schliessen"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        {bereich ? (
          <Inhalt bereich={bereich} />
        ) : (
          <ul className="space-y-1">
            {eintraege.map((e) => (
              <li key={e.bereich}>
                <button
                  type="button"
                  onClick={() => setBereich(e.bereich)}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 text-left text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700"
                  data-testid={e.testId}
                >
                  <span aria-hidden="true" className="text-xl">
                    {e.symbol}
                  </span>
                  <span className="flex-1">{t(e.titel)}</span>
                  <span aria-hidden="true" className="text-slate-400">
                    ›
                  </span>
                </button>
              </li>
            ))}
            <li>
              {/* Kein Bereich mit eigenem Inhalt: startet den Bearbeitungsmodus
                  auf der Karte selbst (`anordnung.ts`) und schliesst das Menue,
                  damit man sieht, was man anordnet. */}
              <button
                type="button"
                onClick={() => {
                  useAnordnungStore.getState().starte('ruhe');
                  onSchliessen();
                }}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 text-left text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700"
                data-testid="anordnung-starten"
              >
                <span aria-hidden="true" className="text-xl">
                  🧱
                </span>
                <span className="flex-1">{t('bildschirmAnpassen')}</span>
                <span aria-hidden="true" className="text-slate-400">
                  ›
                </span>
              </button>
              <p className="px-3 pb-2 text-xs text-slate-500 dark:text-slate-400">
                {t('anordnungErklaerung')}
              </p>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
