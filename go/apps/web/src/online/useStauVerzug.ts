/**
 * Der Zeitverlust durch Staus vor der eigenen Position, in Minuten.
 *
 * Für die Ankunftszeit in der Fahrtleiste (`TripInfoPanel.tsx`). Gerechnet
 * wie die Liste (`VerkehrListe.tsx`): Position auf die Route projiziert.
 */

import { usePositionStore } from '../position/positionStore.js';
import { lageAufRoute } from './entlangDerRoute.js';
import { useRoutenMeldungen } from './useRoutenMeldungen.js';
import { verzugVoraus } from './stauAufRoute.js';

export function useStauVerzug(): number {
  const { linie, entlang } = useRoutenMeldungen();
  const position = usePositionStore((s) => s.position);
  if (!linie || entlang.length === 0) return 0;
  const hier = position ? (lageAufRoute(linie, position.lat, position.lon)?.entlang_m ?? 0) : 0;
  return verzugVoraus(entlang, hier);
}
