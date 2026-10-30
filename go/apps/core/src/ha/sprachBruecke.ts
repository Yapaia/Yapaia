/* eslint-disable no-undef -- `AbortController`/`setTimeout` sind Standard-Globale in Node 22. */

/**
 * Sprachbefehle ueber Home Assistant Assist.
 *
 * ─── WARUM UEBER HOME ASSISTANT ─────────────────────────────────────────────
 * Browser geben das Mikrofon nur ueber HTTPS frei; der Betreiber ruft Home
 * Assistant ueber `http://…:8123` auf. Home Assistant selbst hoert aber zu:
 * ueber Sprach-Satelliten und ueber den Assist-Knopf der Home-Assistant-App --
 * ohne HTTPS.
 *
 * ─── DER WEG EINES SATZES ───────────────────────────────────────────────────
 *   1. Assist erkennt „Yapaia, fahre mich nach Magdeburg" (Satz-Ausloeser
 *      einer Automation, die Yapaia anlegt: `automationKonfig`).
 *   2. Die Automation ruft die Aktion `yapaia.go_befehl` der Integration
 *      „Yapaia" (yapaia/aktionen.ts) -- derselbe Sprachdialog wie der
 *      🎤-Knopf der App.
 *   3. Die Antwort kommt als Ergebnis der Aktion zurueck, und Assist spricht
 *      sie.
 *
 * Kein Hilfsfeld, kein Abfragen im Sekundentakt, kein geschriebener Zustand:
 * die Integration traegt den Satz hin und die Antwort zurueck. Angelegt wird
 * die Automation ohne YAML ueber die Konfigurations-Schnittstelle -- der
 * Betreiber bedient Home Assistant nur ueber die Oberflaeche.
 */

import type { HaConnection } from './config.js';
import { defaultHaFetch, type HaFetchLike } from './client.js';
import { tx } from '../i18n.js';
import { T } from './texte.js';

export const AUTOMATION_ID = 'yapaia_sprachbefehle';

/**
 * Die Saetze, auf die Home Assistant hoert.
 *
 * „Yapaia" in den Schreibweisen, die Spracherkennungen tatsaechlich liefern;
 * dazu die haeufigsten Befehle OHNE Anrede, damit „Okay Nabu, wo ist die
 * naechste Tankstelle?" auch ohne das Wort Yapaia funktioniert.
 */
export const SAETZE: readonly string[] = [
  'Yapaia {befehl}',
  'Japaja {befehl}',
  'Japaia {befehl}',
  'Ja Paja {befehl}',
  'Navi {befehl}',
  'fahre mich {befehl}',
  'fahr mich {befehl}',
  'bring mich {befehl}',
  'bring uns {befehl}',
  'navigiere {befehl}',
  'wo ist die nächste {befehl}',
  'wo ist der nächste {befehl}',
  'wo ist das nächste {befehl}',
  'finde den nächsten {befehl}',
  'finde die nächste {befehl}',
  'finde das nächste {befehl}',
  'such den nächsten {befehl}',
  'such die nächste {befehl}',
  'wo ist hier ein {befehl}',
  'wo ist hier eine {befehl}',
  'stoppe die navigation',
  'navigation stoppen',
  'navigation beenden',
  'pausiere die navigation',
  'navigation fortsetzen',
  'wann sind wir da',
  'wie lange noch',
  'lies die verkehrsmeldungen vor',
];

export function automationKonfig(): Record<string, unknown> {
  return {
    alias: 'Yapaia Sprachbefehle',
    description:
      'Von Yapaia Go angelegt. Leitet gesprochene Navigationsbefehle an Yapaia Go weiter und spricht die Antwort. ' +
      'Neu anlegen: in Yapaia unter ⚙ → Sprache & Home Assistant.',
    triggers: [{ trigger: 'conversation', command: [...SAETZE] }],
    conditions: [],
    actions: [
      {
        action: 'yapaia.go_befehl',
        data: { text: '{{ trigger.sentence }}' },
        response_variable: 'yapaia',
        continue_on_error: true,
      },
      {
        set_conversation_response:
          "{{ (yapaia.values() | first).antwort if yapaia is defined and yapaia else 'Yapaia Go antwortet gerade nicht.' }}",
      },
    ],
    mode: 'queued',
    max: 5,
  };
}

export interface EinrichtErgebnis {
  /** Ob die Integration „Yapaia" gerade mit Go verbunden ist (sonst gibt es `yapaia.go_befehl` nicht). */
  integration: boolean;
  automation: boolean;
  /** Was nicht geklappt hat, in Klartext. */
  hinweis?: string;
}

export interface SprachBrueckeDeps {
  verbindung: () => HaConnection | null;
  /** Ist die Integration „Yapaia" mit diesem Go verbunden? */
  integrationVerbunden: () => boolean;
  fetch?: HaFetchLike;
  logger: { info: (m: string, meta?: Record<string, unknown>) => void; warn: (m: string, meta?: Record<string, unknown>) => void };
}

/**
 * Automation anlegen (Knopf in den Einstellungen). Sie wird ueberschrieben,
 * falls es sie schon gibt -- so kommt eine neue Satzliste mit einem Klick an.
 */
export async function sprachsteuerungEinrichten(deps: SprachBrueckeDeps): Promise<EinrichtErgebnis> {
  const v = deps.verbindung();
  const integration = deps.integrationVerbunden();
  if (!v) {
    return { integration, automation: false, hinweis: tx(T, 'keineVerbindungAddon') };
  }
  const fetchImpl = deps.fetch ?? defaultHaFetch;
  const controller = new AbortController();
  const uhr = setTimeout(() => controller.abort(), 10_000);
  let automation = false;
  let hinweis: string | undefined;
  try {
    const res = await fetchImpl(`${v.apiBase}/config/automation/config/${AUTOMATION_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${v.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(automationKonfig()),
      signal: controller.signal,
    });
    automation = res.ok;
    if (!res.ok) {
      hinweis =
        res.status === 401 || res.status === 403
          ? tx(T, 'keineAutomation')
          : tx(T, 'automationAbgelehnt', { status: res.status });
    }
  } catch (err) {
    hinweis = tx(T, 'haNichtErreichbar', { grund: err instanceof Error ? err.message : String(err) });
  } finally {
    clearTimeout(uhr);
  }
  if (automation && !integration && !hinweis) {
    hinweis =
      tx(T, 'integrationFehlt');
  }
  deps.logger.info('Sprachsteuerung in Home Assistant eingerichtet', { integration, automation, hinweis });
  return { integration, automation, ...(hinweis ? { hinweis } : {}) };
}
