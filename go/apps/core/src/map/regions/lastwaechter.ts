/**
 * Lastwächter für die schweren Bauten (Kacheln, Routing, Suche).
 *
 * ─── WARUM ES IHN GIBT ──────────────────────────────────────────────────────
 * Ein Gesamtbau mit großen Ländern hat auf einem Testrechner das ganze
 * System eingefroren -- Home Assistant war weg, ein Neustart blieb schwarz,
 * es musste ein Backup zurückgespielt werden. Der Bau darf nie wichtiger sein
 * als das System, auf dem er läuft.
 *
 * ─── WAS ER TUT ─────────────────────────────────────────────────────────────
 * Alle paar Sekunden misst er die Last des GANZEN Rechners (`/proc/stat`,
 * `/proc/meminfo` -- im Add-on-Container zeigen beide die Werte des Hosts):
 *
 *  * CPU dauerhaft voll oder Arbeitsspeicher knapp -> Bau PAUSIEREN
 *    (SIGSTOP an die ganze Prozessgruppe). Wird es wieder ruhig, geht er von
 *    selbst weiter (SIGCONT). So wird ein Bau langsamer, aber nicht gefährlich.
 *  * Arbeitsspeicher kritisch, oder trotz Pause lange knapp -> Bau ABBRECHEN.
 *    Eine Pause gibt keinen Speicher frei; hält der Bau selbst den Speicher,
 *    hilft nur Beenden, bevor der OOM-Killer Home Assistant trifft.
 *
 * Die CPU allein führt nie zum Abbruch: dafür laufen die Bauten ohnehin mit
 * niedrigster Priorität (`nice 19`), Home Assistant kommt immer zuerst dran.
 */

import { readFileSync } from 'fs';
import { clearInterval, setInterval } from 'node:timers';
import { tx } from '../../i18n.js';
import { T } from './texte.js';

export interface LastMessung {
  /** Belegte CPU des ganzen Rechners seit der letzten Messung, 0–100.
   *  `null` bei der ersten Messung (es gibt noch keinen Vergleichswert). */
  cpuProzent: number | null;
  ramFreiBytes: number;
  ramGesamtBytes: number;
}

export type LastQuelle = () => LastMessung | null;

/** Messintervall. */
export const LAST_INTERVALL_MS = 5_000;
/** Ab dieser CPU-Last gilt der Rechner als voll ... */
export const CPU_HOCH_PROZENT = 90;
/** ... wenn sie so viele Messungen am Stück anhält (6 × 5 s = 30 s). */
export const CPU_HOCH_MESSUNGEN = 6;
/** Unter dieser CPU-Last geht ein pausierter Bau weiter. */
export const CPU_RUHIG_PROZENT = 60;

const MB = 1024 ** 2;
/** Speicher knapp -> Pause. */
export function ramKnapp(gesamt: number): number {
  return Math.max(gesamt * 0.12, 800 * MB);
}
/** Wieder genug Speicher -> weiter (Abstand zu `ramKnapp`, damit es nicht flattert). */
export function ramGenug(gesamt: number): number {
  return Math.max(gesamt * 0.2, 1200 * MB);
}
/** Speicher kritisch -> sofort abbrechen. */
export function ramKritisch(gesamt: number): number {
  return Math.max(gesamt * 0.05, 300 * MB);
}
/** So lange darf der Speicher trotz Pause knapp bleiben, dann Abbruch. */
export const RAM_KNAPP_MAX_MS = 10 * 60_000;

/** Liest `/proc/stat` und `/proc/meminfo`. Die CPU-Last ergibt sich aus der
 *  Differenz zweier Aufrufe; die Quelle merkt sich dafür den letzten Stand. */
export function procLastQuelle(lesen: (pfad: string) => string = (p) => readFileSync(p, 'utf8')): LastQuelle {
  let vorher: { gesamt: number; leer: number } | null = null;
  return () => {
    try {
      const cpu = lesen('/proc/stat').split('\n')[0]?.trim().split(/\s+/).slice(1).map(Number) ?? [];
      const gesamt = cpu.reduce((a, b) => a + b, 0);
      // idle + iowait: Warten auf die Platte ist keine CPU-Arbeit.
      const leer = (cpu[3] ?? 0) + (cpu[4] ?? 0);
      let cpuProzent: number | null = null;
      if (vorher && gesamt > vorher.gesamt) {
        cpuProzent = 100 * (1 - (leer - vorher.leer) / (gesamt - vorher.gesamt));
      }
      vorher = { gesamt, leer };

      const mem = lesen('/proc/meminfo');
      const kb = (name: string): number | null => {
        const m = new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(mem);
        return m ? Number(m[1]) * 1024 : null;
      };
      const ramGesamtBytes = kb('MemTotal');
      const ramFreiBytes = kb('MemAvailable');
      if (ramGesamtBytes === null || ramFreiBytes === null) return null;
      return { cpuProzent, ramFreiBytes, ramGesamtBytes };
    } catch {
      return null;
    }
  };
}

export interface LastwaechterOptionen {
  quelle: LastQuelle;
  onPause: (grund: string) => void;
  onWeiter: () => void;
  onAbbruch: (grund: string) => void;
  intervallMs?: number;
  jetzt?: () => number;
}

export function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
}

/**
 * Bewertet eine Messung. Getrennt von Timer und Signalen, damit sich die
 * Regeln ohne Uhr testen lassen. Gibt eine Funktion zurück, die pro Messung
 * gerufen wird.
 */
export function lastRegeln(o: Omit<LastwaechterOptionen, 'quelle' | 'intervallMs'>): (m: LastMessung) => void {
  const jetzt = o.jetzt ?? Date.now;
  let pausiert = false;
  let beendet = false;
  let cpuHochMessungen = 0;
  let ramKnappSeit: number | null = null;

  return (m) => {
    if (beendet) return;
    const g = m.ramGesamtBytes;
    const frei = m.ramFreiBytes;

    if (frei < ramKritisch(g)) {
      beendet = true;
      o.onAbbruch(tx(T, 'nurNochRam', { gb: gb(frei) }));
      return;
    }

    const knapp = frei < ramKnapp(g);
    if (knapp) {
      ramKnappSeit ??= jetzt();
      if (jetzt() - ramKnappSeit >= RAM_KNAPP_MAX_MS) {
        beendet = true;
        o.onAbbruch(tx(T, 'ramKnapp', { gb: gb(frei) }));
        return;
      }
    } else if (frei >= ramGenug(g)) {
      ramKnappSeit = null;
    }

    if (m.cpuProzent !== null) {
      cpuHochMessungen = m.cpuProzent >= CPU_HOCH_PROZENT ? cpuHochMessungen + 1 : 0;
    }

    if (!pausiert) {
      const cpuVoll = cpuHochMessungen >= CPU_HOCH_MESSUNGEN;
      if (knapp || cpuVoll) {
        pausiert = true;
        const cpu = m.cpuProzent !== null ? tx(T, 'cpu', { p: Math.round(m.cpuProzent) }) : '';
        o.onPause(tx(T, 'ramFrei', { cpu, gb: gb(frei) }));
      }
      return;
    }

    const cpuRuhig = m.cpuProzent === null || m.cpuProzent < CPU_RUHIG_PROZENT;
    if (cpuRuhig && frei >= ramGenug(g)) {
      pausiert = false;
      cpuHochMessungen = 0;
      o.onWeiter();
    }
  };
}

/** Startet den Wächter; die Rückgabe stoppt ihn. */
export function starteLastwaechter(o: LastwaechterOptionen): () => void {
  const pruefe = lastRegeln(o);
  o.quelle(); // erste Messung legt nur den Vergleichswert für die CPU an
  const timer = setInterval(() => {
    const m = o.quelle();
    if (m) pruefe(m);
  }, o.intervallMs ?? LAST_INTERVALL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
