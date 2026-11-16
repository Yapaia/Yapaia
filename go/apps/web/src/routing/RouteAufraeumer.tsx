/**
 * Räumt die Route von der Karte, sobald die Fahrt endet.
 *
 * Gemeldet: Nach „Navigation beenden“ oder bei der Ankunft blieb die blaue
 * Linie stehen – erst ein Wechsel des Dashboards (also ein Neuladen) nahm sie
 * weg. Der Grund: Der Routing-Store behielt die Route, nur ein Neuladen
 * leerte ihn. Das Gegenstück zu `RouteRestorer`, der sie nach einem Neuladen
 * während der Fahrt zurückholt.
 *
 * Geräumt wird nur beim ÜBERGANG von einer laufenden Fahrt zu „idle“ oder
 * „arrived“ – eine geplante, noch nicht gestartete Route (Status „idle“ von
 * Anfang an) bleibt unberührt.
 */

import { useEffect, useRef } from 'react';
import type { NavState } from '@yapaia/shared';
import { useNavStore } from '../drive/navStore.js';
import { isDriveActive } from '../drive/driveActive.js';
import { useRoutingStore } from './store.js';

type Status = NavState['status'] | null | undefined;

/** Endet mit diesem Statuswechsel eine Fahrt? */
export function fahrtEndet(vorher: Status, jetzt: Status): boolean {
  return isDriveActive(vorher) && (jetzt === 'idle' || jetzt === 'arrived');
}

export default function RouteAufraeumer(): null {
  const status = useNavStore((state) => state.navState?.status);
  const vorher = useRef<Status>(status);

  useEffect(() => {
    if (fahrtEndet(vorher.current, status)) useRoutingStore.getState().clear();
    vorher.current = status;
  }, [status]);

  return null;
}
