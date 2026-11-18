/**
 * Welche Fahrzeug-Beschränkung liegt voraus? (seit Go 0.72.0)
 *
 * Zwei Fälle, beide als reine Funktionen (geprüft in
 * `beschraenkungVoraus.test.ts`):
 *
 * - **Mit Route:** die Route ab dem aktuellen Fortschritt wird gegen die
 *   Beschränkungen gelegt. Ein Knoten (Schranke, Höhenbegrenzer) zählt, wenn
 *   die Route nah daran vorbeiführt; ein Weg nur, wenn die Route auch in
 *   seiner RICHTUNG liegt -- sonst warnte jede Brücke, unter der die Route
 *   durchführt, vor dem Gewicht der Straße darüber.
 * - **Ohne Route (freie Fahrt):** ein schmaler Korridor in Fahrtrichtung
 *   (Kurs aus dem GPS). Kürzer als mit Route: ohne Route ist „voraus" nur
 *   eine Vermutung.
 *
 * Gewarnt wird nur vor Grenzen, die das aktive Fahrzeug ÜBERSCHREITET.
 */

import type { VehicleProfile } from '@yapaia/shared';
import { ueberschreitet, type BeschraenkungProps } from '../map/beschraenkungen/zeichen.js';

export type Koord = [number, number]; // [lon, lat]

export interface BeschraenkungRoh {
  lon: number;
  lat: number;
  props: BeschraenkungProps;
}

export interface Voraus {
  art: BeschraenkungProps['art'];
  wert: number;
  /** Entfernung in Metern ab der aktuellen Position. */
  entfernungM: number;
  /** Stabiler Schlüssel, damit dieselbe Grenze nur einmal angesagt wird. */
  schluessel: string;
}

/** Wie weit vorausgeschaut wird. */
export const VORAUS_ROUTE_M = 1500;
export const VORAUS_FREI_M = 600;
/** Wie nah die Route/der Korridor an einer Grenze liegen muss. */
const NAH_KNOTEN_M = 20;
const NAH_WEG_M = 15;
const KORRIDOR_M = 25;
/** Erlaubte Abweichung der Richtung bei Wegen (Grad). */
const RICHTUNG_GRAD = 35;

const R = 6371000;
const rad = (g: number): number => (g * Math.PI) / 180;

/** Lokale Ebene in Metern um einen Bezugspunkt. */
function ebene(bezug: Koord): (p: Koord) => [number, number] {
  const k = Math.cos(rad(bezug[1]));
  return (p) => [rad(p[0] - bezug[0]) * R * k, rad(p[1] - bezug[1]) * R];
}

function abstandPunktStrecke(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

/** Winkel einer Strecke (Grad, 0 = Ost, gegen den Uhrzeigersinn). */
function winkel(a: [number, number], b: [number, number]): number {
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}

/** Liegen zwei Richtungen (in beide Richtungen befahrbar) parallel? */
function parallel(w1: number, w2: number, toleranz = RICHTUNG_GRAD): boolean {
  let d = Math.abs(w1 - w2) % 180;
  if (d > 90) d = 180 - d;
  return d <= toleranz;
}

function schluesselVon(b: BeschraenkungRoh): string {
  return `${b.props.osm ?? `${b.lon.toFixed(5)},${b.lat.toFixed(5)}`}|${b.props.art}`;
}

/**
 * Nächste überschrittene Grenze auf der Route ab `fortschrittM`.
 * `kumuliert[i]` ist die Länge der Route bis Punkt i (`cumulativeMeters`).
 */
export function vorausAufRoute(
  route: readonly Koord[],
  kumuliert: readonly number[],
  fortschrittM: number,
  liste: readonly BeschraenkungRoh[],
  profil: VehicleProfile | null | undefined,
  weiteM = VORAUS_ROUTE_M,
): Voraus | null {
  if (route.length < 2 || kumuliert.length !== route.length || !profil) return null;
  const relevant = liste.filter((b) => ueberschreitet(b.props.art, b.props.wert, profil));
  if (relevant.length === 0) return null;
  // Erstes Teilstück, das (teilweise) nach dem Fortschritt liegt.
  let start = 0;
  while (start < route.length - 2 && kumuliert[start + 1] <= fortschrittM) start += 1;
  const xy = ebene(route[start]);
  let best: Voraus | null = null;
  for (let i = start; i < route.length - 1; i += 1) {
    const von = kumuliert[i];
    if (von - fortschrittM > weiteM) break;
    const a = xy(route[i]);
    const b = xy(route[i + 1]);
    const lang = kumuliert[i + 1] - kumuliert[i];
    const w = winkel(a, b);
    for (const r of relevant) {
      const linie = r.props.linie;
      let trifft = false;
      let entlang = von;
      if (!linie || linie.length < 2) {
        const p = xy([r.lon, r.lat]);
        if (abstandPunktStrecke(p, a, b) <= NAH_KNOTEN_M) {
          trifft = true;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const l = dx * dx + dy * dy;
          const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
          entlang = von + t * lang;
        }
      } else {
        const lxy = linie.map(xy);
        for (let j = 0; j < lxy.length - 1 && !trifft; j += 1) {
          if (!parallel(w, winkel(lxy[j], lxy[j + 1]))) continue;
          // Nah, wenn ein Ende der Routenstrecke am Wegstück liegt oder umgekehrt.
          const dA = abstandPunktStrecke(a, lxy[j], lxy[j + 1]);
          const dB = abstandPunktStrecke(b, lxy[j], lxy[j + 1]);
          const dL = Math.min(abstandPunktStrecke(lxy[j], a, b), abstandPunktStrecke(lxy[j + 1], a, b));
          if (Math.min(dA, dB, dL) <= NAH_WEG_M) {
            trifft = true;
            entlang = dA <= NAH_WEG_M ? von : von + lang / 2;
          }
        }
      }
      if (!trifft) continue;
      const entfernungM = Math.max(0, entlang - fortschrittM);
      if (entlang < fortschrittM - 5 || entfernungM > weiteM) continue;
      if (!best || entfernungM < best.entfernungM) {
        best = { art: r.props.art, wert: r.props.wert, entfernungM, schluessel: schluesselVon(r) };
      }
    }
  }
  return best;
}

/** Nächste überschrittene Grenze in Fahrtrichtung (Kurs in Grad, 0 = Nord). */
export function vorausInFahrtrichtung(
  position: Koord,
  kursGrad: number,
  liste: readonly BeschraenkungRoh[],
  profil: VehicleProfile | null | undefined,
  weiteM = VORAUS_FREI_M,
): Voraus | null {
  if (!profil || !Number.isFinite(kursGrad)) return null;
  const xy = ebene(position);
  // Fahrtrichtung als Einheitsvektor (Ost, Nord).
  const ex = Math.sin(rad(kursGrad));
  const ey = Math.cos(rad(kursGrad));
  const fahrWinkel = (Math.atan2(ey, ex) * 180) / Math.PI;
  let best: Voraus | null = null;
  for (const r of liste) {
    if (!ueberschreitet(r.props.art, r.props.wert, profil)) continue;
    const linie = r.props.linie && r.props.linie.length >= 2 ? r.props.linie : null;
    const punkte = linie ?? [[r.lon, r.lat] as Koord];
    let naechste: number | null = null;
    for (let j = 0; j < punkte.length; j += 1) {
      const [x, y] = xy(punkte[j]);
      const vor = x * ex + y * ey; // Entfernung in Fahrtrichtung
      const quer = Math.abs(-x * ey + y * ex);
      if (vor < 0 || vor > weiteM || quer > KORRIDOR_M) continue;
      if (linie) {
        const k = j < punkte.length - 1 ? j : j - 1;
        if (!parallel(fahrWinkel, winkel(xy(punkte[k]), xy(punkte[k + 1])))) continue;
      }
      if (naechste === null || vor < naechste) naechste = vor;
    }
    if (naechste === null) continue;
    if (!best || naechste < best.entfernungM) {
      best = { art: r.props.art, wert: r.props.wert, entfernungM: naechste, schluessel: schluesselVon(r) };
    }
  }
  return best;
}

/** Entfernung für Anzeige und Ansage: 50-m-Schritte, ab 1 km in km. */
export function entfernungRund(m: number): { wert: number; einheit: 'm' | 'km' } {
  if (m >= 1000) return { wert: Math.round(m / 100) / 10, einheit: 'km' };
  return { wert: Math.max(50, Math.round(m / 50) * 50), einheit: 'm' };
}
