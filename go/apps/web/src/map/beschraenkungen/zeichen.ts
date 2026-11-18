/**
 * Fahrzeug-Beschränkungen auf der Karte: Texte, Vergleich mit dem eigenen
 * Fahrzeug und das schildartige Hintergrundbild (seit Go 0.71.0).
 *
 * ─── FARBEN AUS DEM DESIGN ──────────────────────────────────────────────────
 * Rahmen und Fläche kommen aus den Design-Tokens (`--y-fehler`, `--y-flaeche`,
 * `--y-text-gedaempft`, docs/design-schemata.md). Die Ersatzwerte gelten nur
 * ohne Schema, genau wie `var(--y-…, #…)` im CSS.
 */

import type { VehicleProfile } from '@yapaia/shared';
import { hexZuRgb } from '../../design/palette.js';

export type BeschraenkungArt = 'hoehe' | 'gewicht' | 'breite' | 'laenge' | 'achslast';

export interface BeschraenkungProps {
  art: BeschraenkungArt;
  wert: number;
  osm?: string;
  linie?: Array<[number, number]>;
}

/** Der Fahrzeugwert zur Art (m bzw. t), oder `null`, wenn das Profil ihn nicht kennt. */
export function fahrzeugWert(art: BeschraenkungArt, profil: VehicleProfile | null | undefined): number | null {
  if (!profil) return null;
  switch (art) {
    case 'hoehe':
      return profil.height_m ?? null;
    case 'gewicht':
      return profil.weight_t ?? null;
    case 'breite':
      return profil.width_m ?? null;
    case 'laenge':
      return profil.length_m ?? null;
    default:
      // Die Achslast steht (noch) nicht im Fahrzeugprofil.
      return null;
  }
}

/** Überschreitet das Fahrzeug diese Grenze? Gleichstand gilt als passt. */
export function ueberschreitet(art: BeschraenkungArt, wert: number, profil: VehicleProfile | null | undefined): boolean {
  const f = fahrzeugWert(art, profil);
  return f !== null && f > wert;
}

/** Zahl mit Einheit in der Sprache der Oberfläche: „3,2 m", „7,5 t". */
export function wertText(art: BeschraenkungArt, wert: number, gebiet: string): string {
  const zahl = wert.toLocaleString(gebiet, { maximumFractionDigits: 2 });
  return `${zahl} ${art === 'gewicht' || art === 'achslast' ? 't' : 'm'}`;
}

/** Ein Token als RGB, sonst der Ersatzwert. */
export function tokenRgb(name: string, ersatz: string): [number, number, number] {
  let wert = '';
  try {
    if (typeof document !== 'undefined') {
      wert = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
  } catch {
    wert = '';
  }
  return hexZuRgb(wert) ?? hexZuRgb(ersatz) ?? [0, 0, 0];
}

/** Ein Token als CSS-Farbe (für `text-color`), sonst der Ersatzwert. */
export function tokenFarbe(name: string, ersatz: string): string {
  const [r, g, b] = tokenRgb(name, ersatz);
  return `rgb(${r}, ${g}, ${b})`;
}

export const ZEICHEN_GROESSE = 32;
const RADIUS = 9;

/**
 * Ein Schild als Pixelbild (RGBA), dehnbar über `icon-text-fit`: gerundetes
 * Rechteck mit Rahmen. Ohne Canvas gerechnet -- läuft so auch im Test.
 */
export function schildBild(
  rahmen: [number, number, number],
  flaeche: [number, number, number],
  rahmenBreite: number,
): { width: number; height: number; data: Uint8Array } {
  const n = ZEICHEN_GROESSE;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      // Abstand zum gerundeten Rechteck (negativ = innen), Pixelmitte.
      const px = x + 0.5;
      const py = y + 0.5;
      const qx = Math.abs(px - n / 2) - (n / 2 - RADIUS);
      const qy = Math.abs(py - n / 2) - (n / 2 - RADIUS);
      const aussen = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RADIUS;
      const i = (y * n + x) * 4;
      const deckung = Math.max(0, Math.min(1, 0.5 - aussen));
      if (deckung <= 0) continue;
      const farbe = aussen > -rahmenBreite ? rahmen : flaeche;
      data[i] = farbe[0];
      data[i + 1] = farbe[1];
      data[i + 2] = farbe[2];
      data[i + 3] = Math.round(255 * deckung);
    }
  }
  return { width: n, height: n, data };
}
