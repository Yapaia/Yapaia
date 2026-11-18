/**
 * Fahrzeug-Beschränkungen: Ein/Aus der Kartenebene (gespeichert) und die
 * zuletzt geholten Daten für einen Ausschnitt (seit Go 0.71.0).
 */

import { create } from 'zustand';
import type { BeschraenkungProps } from './zeichen.js';

export const BESCHRAENKUNGEN_KEY = 'yapaia.beschraenkungenEbene';

export interface BeschraenkungMerkmal {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: BeschraenkungProps;
}

export interface BeschraenkungenAntwort {
  type: 'FeatureCollection';
  features: BeschraenkungMerkmal[];
  gekappt?: boolean;
  /** 0 = kein Suchindex hat die Tabelle (vor 0.71.0 gebaut). */
  mitTabelle?: number;
}

export type Rahmen = [number, number, number, number];

/** Holt die Beschränkungen in einem Ausschnitt; `null` bei jedem Fehler. */
export async function holeBeschraenkungen(
  rahmen: Rahmen,
  mitLinien = false,
  signal?: AbortSignal,
): Promise<BeschraenkungenAntwort | null> {
  try {
    const bbox = rahmen.map((v) => v.toFixed(4)).join(',');
    const antwort = await fetch(
      `${import.meta.env.BASE_URL}api/v1/map/beschraenkungen?bbox=${bbox}${mitLinien ? '&linien=1' : ''}`,
      signal ? { signal } : undefined,
    );
    if (!antwort.ok) return null;
    const daten = (await antwort.json()) as BeschraenkungenAntwort;
    return Array.isArray(daten?.features) ? daten : null;
  } catch {
    return null;
  }
}

function leseSichtbar(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(BESCHRAENKUNGEN_KEY) !== 'aus';
  } catch {
    return true;
  }
}

interface Zustand {
  /** Ebene an? Vorgabe: an -- eine zu niedrige Brücke will man sehen. */
  sichtbar: boolean;
  setSichtbar: (an: boolean) => void;
}

export const useBeschraenkungenStore = create<Zustand>((set) => ({
  sichtbar: leseSichtbar(),
  setSichtbar: (sichtbar) => {
    set({ sichtbar });
    try {
      window.localStorage.setItem(BESCHRAENKUNGEN_KEY, sichtbar ? 'an' : 'aus');
    } catch {
      // privater Modus: gilt dann eben nur bis zum Neuladen
    }
  },
}));

/** Liegt `innen` ganz in `aussen`? */
export function enthaelt(aussen: Rahmen, innen: Rahmen): boolean {
  return innen[0] >= aussen[0] && innen[1] >= aussen[1] && innen[2] <= aussen[2] && innen[3] <= aussen[3];
}

/** Rahmen um die Hälfte vergrößern, höchstens auf `maxGrad` je Seite. */
export function erweitert(r: Rahmen, maxGrad = 2): Rahmen {
  const breite = Math.min((r[2] - r[0]) * 2, maxGrad);
  const hoehe = Math.min((r[3] - r[1]) * 2, maxGrad);
  const mx = (r[0] + r[2]) / 2;
  const my = (r[1] + r[3]) / 2;
  return [
    Math.max(-180, mx - breite / 2),
    Math.max(-90, my - hoehe / 2),
    Math.min(180, mx + breite / 2),
    Math.min(90, my + hoehe / 2),
  ];
}
