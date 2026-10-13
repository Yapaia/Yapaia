/**
 * Die eingebettete Karte von außen bedienen: Ansicht wechseln, zentrieren.
 *
 * ─── WOFÜR ──────────────────────────────────────────────────────────────────
 * Gewünscht für ein Dashboard im Stil eines Auto-Displays: ein Kompass-Knopf
 * NEBEN der Kachel soll die Karte zentrieren und zwischen „Norden oben“, „in
 * Fahrtrichtung“ und „3D“ wechseln. Die Kachel selbst hat bewusst keine
 * Knöpfe (`embed/main.tsx`), also braucht es einen Weg von außen.
 *
 * Der Umweg bis hierher: das Dashboard schrieb den Modus in den Speicher des
 * Browsers und lud die Kachel neu. Gemeldet: „zoomt erst kurz auf die ganze
 * Deutschlandkarte raus und dann sofort wieder rein“ -- jedes Neuladen fängt
 * beim Kartengebiet an.
 *
 * ─── WARUM EIN OBJEKT AM FENSTER ────────────────────────────────────────────
 * Dashboard und Kachel haben dieselbe Herkunft (der Ingress läuft unter der
 * Adresse von Home Assistant); das Dashboard erreicht das Fenster des Rahmens
 * direkt. Ein Nachrichtenkanal wäre dafür nur Umstand. Anders als die
 * `__yapaia…Store`-Zugriffe daneben ist das hier keine Prüfhilfe, sondern
 * eine zugesagte Schnittstelle -- deshalb mit Versionsnummer.
 */

import { recenterOnPosition, useFollowMeStore } from '../map/followMe.js';
import { useViewModeStore, type ViewMode } from '../map/viewMode.js';

export const ANSICHTEN: readonly ViewMode[] = ['2d-north', '2d-course', '3d-course'];

export interface EinbettungStand {
  ansicht: ViewMode;
  /** Folgt die Karte der eigenen Position? `false`, nachdem jemand sie verschoben hat. */
  zentriert: boolean;
}

export interface EinbettungSteuerung {
  version: 1;
  stand: () => EinbettungStand;
  /** Setzt die Ansicht; unbekannte Werte werden abgelehnt (`false`). */
  ansicht: (modus: string) => boolean;
  /** Zurück auf die eigene Position. `false`, wenn es keine Position gibt. */
  zentrieren: () => boolean;
}

export function einbettungSteuerung(): EinbettungSteuerung {
  return {
    version: 1,
    stand: () => {
      const folge = useFollowMeStore.getState();
      return { ansicht: useViewModeStore.getState().mode, zentriert: folge.isFollowing && !folge.isPaused };
    },
    ansicht: (modus) => {
      if (!ANSICHTEN.includes(modus as ViewMode)) return false;
      useViewModeStore.getState().setMode(modus as ViewMode);
      return true;
    },
    zentrieren: () => recenterOnPosition(),
  };
}

declare global {
  interface Window {
    __yapaiaEinbettung?: EinbettungSteuerung;
  }
}
