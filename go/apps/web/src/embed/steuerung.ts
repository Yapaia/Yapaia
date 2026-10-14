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

import * as maplibregl from 'maplibre-gl';
import { recenterOnPosition, useFollowMeStore } from '../map/followMe.js';
import { mapController } from '../state/mapStore.js';
import { useViewModeStore, type ViewMode } from '../map/viewMode.js';
import { useAnordnungStore, type Modus } from '../shell/anordnung.js';

export const ANSICHTEN: readonly ViewMode[] = ['2d-north', '2d-course', '3d-course'];

export interface EinbettungStand {
  ansicht: ViewMode;
  /** Folgt die Karte der eigenen Position? `false`, nachdem jemand sie verschoben hat. */
  zentriert: boolean;
}

const MODI: readonly Modus[] = ['ruhe', 'fahrt'];

/** Ein Ort für {@link EinbettungSteuerung.orte}. */
export interface EinbettungOrt {
  lat: number;
  lon: number;
  name?: string;
}

export interface EinbettungSteuerung {
  /** 2 seit 0.49.0: `bearbeiten`, `zuruecksetzen`. 3 seit 0.50.0: `orte`. */
  version: 3;
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
  /**
   * Orte auf der Karte zeigen, etwa die Treffer von „Unterwegs finden“ im
   * Dashboard: alle markiert, der gewählte (`aktiv`) hervorgehoben, die
   * Karte fliegt hin und bleibt dort (wie die Vorschau in Go). Ohne `aktiv`
   * zeigt sie alle. Ein Klick auf eine Markierung ruft `beiKlick(index)`.
   * Eine leere Liste nimmt die Markierungen weg und zentriert wieder.
   */
  orte: (liste: EinbettungOrt[], aktiv?: number | null, beiKlick?: (index: number) => void) => boolean;
}

let marken: maplibregl.Marker[] = [];

function orteZeigen(liste: EinbettungOrt[], aktiv?: number | null, beiKlick?: (index: number) => void): boolean {
  for (const m of marken) m.remove();
  marken = [];
  const map = mapController.getMap();
  if (!map) return false;
  const orte = (Array.isArray(liste) ? liste : []).filter(
    (o) => o && Number.isFinite(o.lat) && Number.isFinite(o.lon),
  );
  if (orte.length === 0) {
    recenterOnPosition();
    return true;
  }
  const gewaehlt = typeof aktiv === 'number' ? orte[aktiv] : undefined;
  // der gewählte zuletzt, damit er über den anderen liegt
  const reihe = orte.map((o, i) => ({ o, i })).sort((a, b) => Number(a.i === aktiv) - Number(b.i === aktiv));
  for (const { o, i } of reihe) {
    const an = i === aktiv;
    const m = new maplibregl.Marker({ color: an ? '#7C3AED' : '#6B7280', scale: an ? 1 : 0.75 })
      .setLngLat([o.lon, o.lat])
      .addTo(map);
    const el = m.getElement();
    if (o.name) el.title = o.name;
    if (beiKlick) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        beiKlick(i);
      });
    }
    marken.push(m);
  }
  useFollowMeStore.getState().halten();
  if (gewaehlt) {
    map.flyTo({ center: [gewaehlt.lon, gewaehlt.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
  } else {
    const grenzen = new maplibregl.LngLatBounds();
    for (const o of orte) grenzen.extend([o.lon, o.lat]);
    map.fitBounds(grenzen, { padding: 80, maxZoom: 15, duration: 600 });
  }
  return true;
}

export function einbettungSteuerung(): EinbettungSteuerung {
  return {
    version: 3,
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
    orte: orteZeigen,
  };
}

declare global {
  interface Window {
    __yapaiaEinbettung?: EinbettungSteuerung;
  }
}
