/**
 * Einen Sprachbefehl (als Text) an den Kern schicken -- `POST /api/v1/sprache`.
 * Wirft nie: ein Fehler wird zu einer Antwort, die man vorlesen kann.
 */

import type { LatLng, Route } from '@yapaia/shared';
import { tx } from '../i18n/index.js';
import { T } from './texte.js';

export interface SprachTreffer {
  name: string;
  beschreibung: string;
  lat: number;
  lon: number;
  entfernung_m?: number | null;
}

export type SprachAktion =
  | { art: 'route_vorschlag'; route: Route; ziel: SprachTreffer }
  | { art: 'navigation_gestartet' }
  | { art: 'navigation_beendet' }
  | { art: 'ansagen'; an: boolean }
  | { art: 'auswahl'; treffer: SprachTreffer[] };

export interface SprachAntwort {
  antwort: string;
  absicht: string;
  aktion?: SprachAktion;
  rueckfrage?: boolean;
  /** Yapaia Beat hat die Antwort schon ins Radio gesprochen. */
  gesprochen?: boolean;
}

export async function sendeSprachbefehl(text: string): Promise<SprachAntwort> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}api/v1/sprache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return { antwort: tx(T, 'nicht_geklappt', { status: r.status }), absicht: 'fehler' };
    const body = (await r.json()) as { data?: SprachAntwort };
    return body.data ?? { antwort: tx(T, 'keine_antwort'), absicht: 'fehler' };
  } catch {
    return { antwort: tx(T, 'nicht_erreichbar'), absicht: 'fehler' };
  }
}

export type { LatLng };
