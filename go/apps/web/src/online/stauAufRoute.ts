/**
 * Staus und Sperrungen auf der Route: farbige Abschnitte und Zeitverlust.
 *
 * ─── DIE MELDUNG ────────────────────────────────────────────────────────────
 * „Färbe die Streckenabschnitte auf der Route entsprechend ein. Bei Staus,
 * wenn möglich, bitte auch die Länge und den geschätzten Zeitverlust angeben.
 * Wenn die ETA einen Verzug berücksichtigen muss, bitte die Zeit auch in gelb
 * oder rot einfärben. Je nach Schwere."
 *
 * Länge und Zeitverlust kommen von der Autobahn GmbH (Geometrie bzw.
 * `delayTimeValue`), nicht aus einer eigenen Schätzung. Fehlt der Verlust,
 * zählt der Stau für die Ankunftszeit nicht -- eine erfundene Minute ist
 * schlechter als keine.
 *
 * Baustellen färben die Route NICHT: ihre Geometrie liegt nicht verlässlich
 * in Fahrtrichtung (auf der A7 am 2026-10-15 gemessen), und mit hunderten je
 * Autobahn wäre die Route sonst durchgehend bernsteinfarben.
 */

import type { KartenMeldung } from './verkehrGeoJson.js';
import type { MeldungAufRoute, RoutenLinie } from './entlangDerRoute.js';

export type Schwere = 'gelb' | 'orange' | 'rot' | 'sperrung';

/** Ab so viel Verlust ist ein Stau rot (und die Ankunftszeit auch). */
export const ROT_AB_MIN = 15;
/** Ab so viel Verlust ist ein Stau orange. */
export const ORANGE_AB_MIN = 5;

export const SCHWERE_FARBE: Record<Schwere, string> = {
  gelb: '#f5c518',
  orange: '#f57c00',
  rot: '#d32f2f',
  sperrung: '#6d0f0f',
};

export function schwere(m: Pick<KartenMeldung, 'art' | 'stau' | 'verzug_min'>): Schwere | null {
  if (m.art === 'sperrung') return 'sperrung';
  if (m.art !== 'stau') return null;
  const verzug = m.verzug_min ?? 0;
  if (m.stau === 'stillstand' || verzug >= ROT_AB_MIN) return 'rot';
  if (m.stau === 'stau' || verzug >= ORANGE_AB_MIN) return 'orange';
  return 'gelb';
}

/** Das Stück der Route zwischen zwei Strecken (in Metern ab Routenanfang). */
export function teilstueck(linie: RoutenLinie, von: number, bis: number): Array<[number, number]> {
  const { punkte, bisHier } = linie;
  const raus: Array<[number, number]> = [];
  const anStelle = (m: number): [number, number] => {
    let i = 1;
    while (i < bisHier.length - 1 && bisHier[i]! < m) i++;
    const a = bisHier[i - 1]!;
    const b = bisHier[i]!;
    const t = b > a ? Math.max(0, Math.min(1, (m - a) / (b - a))) : 0;
    const [lon1, lat1] = punkte[i - 1]!;
    const [lon2, lat2] = punkte[i]!;
    return [lon1 + t * (lon2 - lon1), lat1 + t * (lat2 - lat1)];
  };
  if (punkte.length < 2 || bis <= von) return raus;
  raus.push(anStelle(von));
  for (let i = 0; i < punkte.length; i++) {
    if (bisHier[i]! > von && bisHier[i]! < bis) raus.push([punkte[i]![0], punkte[i]![1]]);
  }
  raus.push(anStelle(bis));
  return raus;
}

export interface AbschnittFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> };
  properties: { id: string; schwere: Schwere; farbe: string; rang: number };
}

const RANG: Record<Schwere, number> = { gelb: 0, orange: 1, rot: 2, sperrung: 3 };

/** Die farbigen Abschnitte als GeoJSON -- das Schwerere liegt oben. */
export function abschnitteGeoJson(
  linie: RoutenLinie | null,
  entlang: readonly MeldungAufRoute[],
): { type: 'FeatureCollection'; features: AbschnittFeature[] } {
  const features: AbschnittFeature[] = [];
  if (linie) {
    for (const e of entlang) {
      const s = schwere(e.meldung);
      if (!s || e.bis_m === undefined) continue;
      const coords = teilstueck(linie, e.entlang_m, e.bis_m);
      if (coords.length < 2) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { id: e.meldung.id, schwere: s, farbe: SCHWERE_FARBE[s], rang: RANG[s] },
      });
    }
  }
  features.sort((a, b) => a.properties.rang - b.properties.rang);
  return { type: 'FeatureCollection', features };
}

/**
 * Der Zeitverlust aller Staus, die noch VOR einem liegen, in Minuten.
 *
 * Ein Stau zählt, bis sein Ende passiert ist. Steht man mittendrin, zählt er
 * anteilig -- sonst fiele die Ankunftszeit beim Einfahren schlagartig.
 */
export function verzugVoraus(entlang: readonly MeldungAufRoute[], position_m: number): number {
  let summe = 0;
  for (const e of entlang) {
    const verzug = e.meldung.art === 'stau' ? e.meldung.verzug_min : undefined;
    if (!verzug) continue;
    const ende = e.bis_m ?? e.entlang_m;
    if (ende <= position_m) continue;
    const laenge = ende - e.entlang_m;
    const anteil = position_m > e.entlang_m && laenge > 0 ? (ende - position_m) / laenge : 1;
    summe += verzug * anteil;
  }
  return Math.round(summe);
}

/** Wie die Ankunftszeit eingefärbt wird: gar nicht, gelb oder rot. */
export function etaStufe(verzug_min: number): 'gelb' | 'rot' | null {
  if (verzug_min >= ROT_AB_MIN) return 'rot';
  if (verzug_min >= 1) return 'gelb';
  return null;
}

/** „Stau 2,4 km · +16 min" -- was die Liste unter einen Stau schreibt. */
export function stauText(m: Pick<KartenMeldung, 'art' | 'stau' | 'laenge_m' | 'verzug_min'>): string | null {
  if (m.art !== 'stau') return null;
  const wort =
    m.stau === 'stillstand' ? 'Stillstand' : m.stau === 'zaehfliessend' ? 'Zähfließend' : m.stau === 'dicht' ? 'Dichter Verkehr' : 'Stau';
  const teile = [wort];
  if (m.laenge_m && m.laenge_m >= 100) {
    teile.push(m.laenge_m < 1000 ? `${Math.round(m.laenge_m / 100) * 100} m` : `${(m.laenge_m / 1000).toFixed(1).replace('.', ',')} km`);
  }
  if (m.verzug_min) teile.push(`+${m.verzug_min} min`);
  return teile.join(' · ');
}
