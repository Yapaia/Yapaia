/**
 * Der Anker der eigenen Position, auch in der eingebetteten Karte.
 *
 * Gemeldet aus einem Dashboard mit der Kachel „Karte mit Route“: „Das
 * Meldungsfenster konnte ich verschieben, der Ankerpunkt wird nicht
 * übernommen.“ Die Verkehrsliste liest ihren Platz selbst; die Position sitzt
 * aber nur dort, wo `DriveModeController` die Ränder der Karte legt -- und den
 * gibt es in der Einbettung nicht (er schaltet auch Ansicht und Mitfahren, das
 * macht hier das Dashboard).
 *
 * Deshalb nur die Ränder: der Anker für Fahrt oder Ruhe. Seit 0.49.0 hat die
 * Einbettung dafür ihre eigene Anordnung (`shell/anordnung.ts`), eingestellt
 * vom Dashboard aus (`__yapaiaEinbettung.bearbeiten`). Ist sie in einem
 * zweiten Fenster geändert worden, liest das `storage`-Ereignis sie neu.
 */

import { useEffect, useState } from 'react';
import { isDriveActive } from '../drive/driveActive.js';
import { useNavStore } from '../drive/navStore.js';
import { ankerFuer, ankerRaender } from '../map/kartenAnker.js';
import { mapController, useMapStore } from '../state/mapStore.js';
import { usePositionStore } from '../position/positionStore.js';
import { useHandednessStore } from '../shell/handednessStore.js';
import { ANORDNUNG_SCHLUESSEL, anordnungNeuLesen, useAnordnungStore } from '../shell/anordnung.js';

export default function EinbettungsAnker(): null {
  const faehrt = useNavStore((s) => isDriveActive(s.navState?.status ?? null));
  const einbau = useHandednessStore((s) => s.handedness);
  const map = useMapStore((s) => s.map);
  const werte = useAnordnungStore((s) => s.werte);
  const vorschau = useAnordnungStore((s) => s.vorschau);
  const [groesse, setGroesse] = useState(0);

  useEffect(() => {
    const neu = (): void => setGroesse((g) => g + 1);
    const gespeichert = (e: StorageEvent): void => {
      if (e.key === ANORDNUNG_SCHLUESSEL) anordnungNeuLesen();
    };
    window.addEventListener('resize', neu);
    window.addEventListener('storage', gespeichert);
    return () => {
      window.removeEventListener('resize', neu);
      window.removeEventListener('storage', gespeichert);
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    const modus = vorschau ?? (faehrt ? 'fahrt' : 'ruhe');
    const anker = ankerFuer(werte[modus], modus, einbau);
    mapController.setDrivePadding(
      ankerRaender(mapController.getWidthPx(), mapController.getHeightPx(), anker)
    );
    // Beim Einrichten soll man SEHEN, wo die Position landet (wie in Go).
    const position = usePositionStore.getState().position;
    if (vorschau && position) {
      mapController.setCamera({ center: [position.lon, position.lat] }, { animate: true, duration: 200 });
    }
  }, [map, faehrt, vorschau, einbau, werte, groesse]);

  return null;
}
