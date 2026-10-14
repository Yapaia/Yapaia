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
import { useAnordnungStore, type Modus } from '../shell/anordnung.js';

export const ANSICHTEN: readonly ViewMode[] = ['2d-north', '2d-course', '3d-course'];

export interface EinbettungStand {
  ansicht: ViewMode;
  /** Folgt die Karte der eigenen Position? `false`, nachdem jemand sie verschoben hat. */
  zentriert: boolean;
}

const MODI: readonly Modus[] = ['ruhe', 'fahrt'];

export interface EinbettungSteuerung {
  /** 2 seit 0.49.0: `bearbeiten`, `zuruecksetzen`. */
  version: 2;
  stand: () => EinbettungStand;
  /** Setzt die Ansicht; unbekannte Werte werden abgelehnt (`false`). */
  ansicht: (modus: string) => boolean;
  /** Zurück auf die eigene Position. `false`, wenn es keine Position gibt. */
  zentrieren: () => boolean;
  /**
   * Fenster und Anker der Einbettung verschieben: `'ruhe'` oder `'fahrt'`
   * zeigt diesen Bildschirm (auch ohne Fahrt) mit Griffen, `null` beendet.
   * Gespeichert wird getrennt von Yapaia Go selbst.
   */
  bearbeiten: (modus: string | null) => boolean;
  /** Alles dieses Bildschirms zurück auf den Standard. */
  zuruecksetzen: (modus: string) => boolean;
}

export function einbettungSteuerung(): EinbettungSteuerung {
  return {
    version: 2,
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
    bearbeiten: (modus) => {
      const a = useAnordnungStore.getState();
      if (modus === null) {
        a.beende();
        a.vorschauen(null);
        return true;
      }
      if (!MODI.includes(modus as Modus)) return false;
      a.vorschauen(modus as Modus);
      a.starte(modus as Modus);
      return true;
    },
    zuruecksetzen: (modus) => {
      if (!MODI.includes(modus as Modus)) return false;
      useAnordnungStore.getState().zuruecksetzen(modus as Modus);
      return true;
    },
  };
}

declare global {
  interface Window {
    __yapaiaEinbettung?: EinbettungSteuerung;
  }
}
