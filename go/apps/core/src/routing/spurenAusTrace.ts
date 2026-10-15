/**
 * Spurdaten zu einer bereits berechneten Route.
 *
 * ─── WARUM DAS EINEN ZWEITEN AUFRUF BRAUCHT ─────────────────────────────────
 * Gebaut war die Spurleiste laengst, angezeigt hat sie nie etwas. Die
 * Anfrage an `/route` trug `turn_lanes: true`, und die Annahme war, dann
 * kaemen `lanes` an jedem Manoever mit. Nachgeprueft am laufenden Valhalla
 * 3.5.1 (2026-10-15): 53 Manoever auf Mannheim–Frankfurt und
 * Stuttgart–München, Schilder an 20 davon, Spuren an KEINEM -- mit und ohne
 * `turn_lanes`, oben oder in `directions_options`. Das native Format kennt
 * in dieser Fassung schlicht kein Spurfeld.
 *
 * Die Daten sind trotzdem in den Kacheln: im OSRM-Format liefert dieselbe
 * Route 121 Kreuzungen mit Spuren. Also wie bei den Tempolimits: die fertige
 * Geometrie noch einmal hineinreichen, diesmal in `/trace_route` mit
 * `format: "osrm"`, und die Spuren den Manoevern ueber den ORT zuordnen.
 * Kostet 20–70 ms und keinen Neubau der Karten.
 *
 * ─── WARUM UEBER DEN ORT UND NICHT UEBER DIE REIHENFOLGE ────────────────────
 * Die Schritte im OSRM-Format und die Manoever im nativen sind nicht Stueck
 * fuer Stueck dieselben (Valhalla fasst beim Umformen zusammen und teilt
 * auf). Der Ort dagegen ist derselbe: beide stammen aus derselben Geometrie,
 * und der Anfang eines Manoevers liegt genau auf einer Kreuzung. Gemessen
 * lagen alle Treffer unter einem Meter auseinander.
 *
 * ─── WAS EINE KREUZUNG IM OSRM-FORMAT MEINT ─────────────────────────────────
 * `intersections[].lanes` sind die Spuren, auf denen man AN diese Kreuzung
 * heranfaehrt -- also genau die, zwischen denen man vor dem Abbiegen waehlt.
 * `valid` heisst „fuehrt auf die Route", `active` „die beste Spur" (Valhalla
 * setzt beides aus seinem Spurzustand: `kValid` bzw. `kActive`).
 */

import { SPUR, type LaneInfo, type LatLng, type Maneuver } from '@yapaia/shared';
import { haversineMeters } from './mapResponse.js';
import { decodePolyline6 } from './polyline.js';

/**
 * Wie weit eine Kreuzung vom Anfang eines Manoevers weg sein darf.
 *
 * Gemessen waren es unter einem Meter. 15 m lassen Rundung Spielraum, sind
 * aber kleiner als der Abstand zweier Kreuzungen, zwischen denen man sich
 * irren koennte -- eine falsche Spurangabe ist schlimmer als keine.
 */
export const SPUR_FANG_M = 15;

/** Der Koerper fuer `/trace_route`, analog zu `buildTraceAttributesBody`. */
export function buildTraceRouteBody(
  encodedPolyline: string,
  costing: string,
): Record<string, unknown> {
  return {
    encoded_polyline: encodedPolyline,
    costing,
    // Die Geometrie liegt exakt auf den Kanten -- siehe speedLimits.ts.
    shape_match: 'edge_walk',
    format: 'osrm',
  };
}

/** OSRM-Richtungswoerter auf Valhallas Bits (`SPUR`). */
const RICHTUNG: Readonly<Record<string, number>> = {
  none: SPUR.UNBESTIMMT,
  straight: SPUR.GERADEAUS,
  'sharp left': SPUR.SCHARF_LINKS,
  left: SPUR.LINKS,
  'slight left': SPUR.LEICHT_LINKS,
  'slight right': SPUR.LEICHT_RECHTS,
  right: SPUR.RECHTS,
  'sharp right': SPUR.SCHARF_RECHTS,
  uturn: SPUR.WENDEN,
};

interface OsrmLane {
  indications?: unknown;
  valid?: unknown;
  active?: unknown;
  /** Valhallas Zusatz: die EINE Richtung dieser Spur, die zur Route passt. */
  valid_indication?: unknown;
}

interface OsrmIntersection {
  location?: unknown;
  lanes?: unknown;
}

/** Eine OSRM-Spur auf unsere Form, oder `null`, wenn nichts Brauchbares darin steht. */
export function osrmSpur(lane: OsrmLane): LaneInfo | null {
  if (!Array.isArray(lane.indications)) return null;
  let directions = 0;
  for (const wort of lane.indications) {
    if (typeof wort === 'string') directions |= RICHTUNG[wort] ?? 0;
  }
  if (directions === 0) return null;
  // OSRM sagt ja oder nein; bei uns sind es Masken. Welche Richtung das „ja"
  // meint, steht in `valid_indication`; fehlt es, gilt es fuer alle
  // Richtungen der Spur.
  const passend =
    typeof lane.valid_indication === 'string' ? RICHTUNG[lane.valid_indication] ?? 0 : 0;
  const maske = passend !== 0 ? passend : directions;
  return {
    directions,
    ...(lane.valid === true ? { valid: maske } : {}),
    ...(lane.active === true ? { active: maske } : {}),
  };
}

/** Alle Kreuzungen mit Spuren aus einer `/trace_route`-Antwort im OSRM-Format. */
export function kreuzungenMitSpuren(raw: unknown): Array<{ ort: LatLng; lanes: LaneInfo[] }> {
  const raus: Array<{ ort: LatLng; lanes: LaneInfo[] }> = [];
  const matchings = (raw as { matchings?: unknown } | null)?.matchings;
  if (!Array.isArray(matchings)) return raus;
  for (const m of matchings) {
    for (const leg of asArray((m as { legs?: unknown })?.legs)) {
      for (const step of asArray((leg as { steps?: unknown })?.steps)) {
        for (const k of asArray((step as { intersections?: unknown })?.intersections)) {
          const { location, lanes } = k as OsrmIntersection;
          if (!Array.isArray(location) || !Array.isArray(lanes)) continue;
          const [lon, lat] = location as unknown[];
          if (typeof lat !== 'number' || typeof lon !== 'number') continue;
          // Faellt eine Spur heraus, faellt die ganze Kreuzung heraus: mit
          // einer fehlenden Spur stimmt die Zaehlung („zweite von rechts")
          // nicht mehr.
          const spuren = lanes.map((l) => osrmSpur(l as OsrmLane));
          if (spuren.length === 0 || spuren.some((s) => s === null)) continue;
          raus.push({ ort: { lat, lon }, lanes: spuren as LaneInfo[] });
        }
      }
    }
  }
  return raus;
}

/**
 * Traegt die Spuren in die Manoever ein -- nur dort, wo noch keine stehen
 * (sollte ein kuenftiges Valhalla sie doch nativ liefern, gewinnen die).
 * Gibt die Zahl der eingetragenen Manoever zurueck.
 */
export function spurenEintragen(
  maneuvers: Maneuver[],
  geometry: string,
  raw: unknown,
): number {
  const kreuzungen = kreuzungenMitSpuren(raw);
  if (kreuzungen.length === 0) return 0;
  const punkte = decodePolyline6(geometry);
  let n = 0;
  for (const m of maneuvers) {
    if (m.lanes && m.lanes.length > 0) continue;
    const p = punkte[m.begin_shape_index];
    if (!p) continue;
    let beste: { d: number; lanes: LaneInfo[] } | null = null;
    for (const k of kreuzungen) {
      const d = haversineMeters({ lat: p.lat, lon: p.lon }, k.ort);
      if (d <= SPUR_FANG_M && (!beste || d < beste.d)) beste = { d, lanes: k.lanes };
    }
    if (beste) {
      m.lanes = beste.lanes.map((l) => ({ ...l }));
      n++;
    }
  }
  return n;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
