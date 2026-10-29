/**
 * Spracherkennung im Browser (Web Speech API).
 *
 * ─── WARUM SIE OFT FEHLT ────────────────────────────────────────────────────
 * Browser geben das Mikrofon nur auf HTTPS-Seiten frei („secure context").
 * Home Assistant über `http://192.168…:8123` ist keine -- auch nicht in der
 * Home-Assistant-App, die die Seite nur einbettet. Dann bleibt der Knopf ein
 * Eingabefeld, und gesprochen wird über Home Assistant Assist.
 */

import { tx } from '../i18n/index.js';
import { T } from './texte.js';

interface ErgebnisListe {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Erkenner {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ErgebnisListe; resultIndex: number }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type ErkennerKlasse = new () => Erkenner;

function klasse(): ErkennerKlasse | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: ErkennerKlasse;
    webkitSpeechRecognition?: ErkennerKlasse;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type Verfuegbarkeit = 'ja' | 'kein-https' | 'kein-browser';

export function erkennungVerfuegbar(): Verfuegbarkeit {
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'kein-https';
  return klasse() ? 'ja' : 'kein-browser';
}

/**
 * Einmal zuhören. `onZwischen` bekommt den Text, solange gesprochen wird,
 * `onFertig` den endgültigen (oder `null`, wenn nichts verstanden wurde).
 * Gibt eine Funktion zum Abbrechen zurück.
 */
export function hoereZu(
  onZwischen: (text: string) => void,
  onFertig: (text: string | null, fehler?: string) => void
): () => void {
  const K = klasse();
  if (!K) {
    onFertig(null, tx(T, 'erkennung_fehlt'));
    return () => {};
  }
  const e = new K();
  e.lang = 'de-DE';
  e.interimResults = true;
  e.continuous = false;
  let endgueltig: string | null = null;
  let fehler: string | undefined;
  e.onresult = (ev) => {
    let text = '';
    for (let i = 0; i < ev.results.length; i++) {
      const r = ev.results[i]!;
      text += r[0].transcript;
      if (r.isFinal) endgueltig = text.trim();
    }
    onZwischen(text.trim());
  };
  e.onerror = (ev) => {
    fehler =
      ev.error === 'not-allowed'
        ? tx(T, 'mikrofon_verweigert')
        : ev.error === 'no-speech'
          ? tx(T, 'nichts_gehoert')
          : tx(T, 'erkennung_fehler', { fehler: ev.error });
  };
  e.onend = () => onFertig(endgueltig, endgueltig ? undefined : fehler);
  try {
    e.start();
  } catch {
    onFertig(null, tx(T, 'erkennung_start'));
  }
  return () => e.abort();
}
