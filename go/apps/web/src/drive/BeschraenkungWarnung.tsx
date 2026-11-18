/**
 * Warnung „Fahrzeug-Beschränkung voraus" (seit Go 0.72.0).
 *
 * Mit Route: auf der Route voraus (`vorausAufRoute`). Ohne Route ab
 * `FREI_AB_MS` Geschwindigkeit: in Fahrtrichtung (`vorausInFahrtrichtung`).
 * Gewarnt wird nur, wenn das aktive Fahrzeugprofil die Grenze überschreitet:
 * ein Banner mit Entfernung und einmal je Grenze eine Ansage (über denselben
 * Weg wie die Navigationsansagen, `sageAn` → Beat oder Browser).
 *
 * Die Daten holt die Komponente selbst um die Position herum (mit Linien),
 * unabhängig davon, ob die Kartenebene an ist: eine ausgeblendete Ebene soll
 * nicht die Warnung abschalten.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePosition } from '../position/positionStore.js';
import { useProfileStore } from '../profiles/store.js';
import { selectActiveRoute, useRoutingStore } from '../routing/store.js';
import { useNavStore } from './navStore.js';
import { isDriveActive } from './driveActive.js';
import { decodePolyline6 } from '../routing/polyline.js';
import { cumulativeMeters, progressFromRemaining } from '../routing/traveledSplit.js';
import { gebiet, useSprache, useT } from '../i18n/index.js';
import { useTtsStore } from './ttsStore.js';
import { announce } from './tts.js';
import { sageAn } from './ansageZiel.js';
import { T } from './texte.js';
import { holeBeschraenkungen, type Rahmen } from '../map/beschraenkungen/store.js';
import { fahrzeugWert, wertText } from '../map/beschraenkungen/zeichen.js';
import {
  entfernungRund,
  vorausAufRoute,
  vorausInFahrtrichtung,
  type BeschraenkungRoh,
  type Voraus,
} from './beschraenkungVoraus.js';

/** Ohne Route erst ab ~15 km/h warnen -- im Stand ist „voraus" Zufall. */
const FREI_AB_MS = 4.2;
/** Abgerufener Kasten um die Position (Grad) und wann neu geholt wird. */
const KASTEN_LAT = 0.03;
const KASTEN_LON = 0.045;
const RAND_GRAD = 0.012;

function kastenUm(lat: number, lon: number): Rahmen {
  return [lon - KASTEN_LON, lat - KASTEN_LAT, lon + KASTEN_LON, lat + KASTEN_LAT];
}

export default function BeschraenkungWarnung(): React.ReactElement | null {
  const position = usePosition();
  const profil = useProfileStore((s) => s.activeProfile);
  const navState = useNavStore((s) => s.navState);
  const route = useRoutingStore((s) => selectActiveRoute(s));
  const ttsAn = useTtsStore((s) => s.enabled);
  const sprache = useSprache((s) => s.sprache);
  const t = useT(T);
  const [liste, setListe] = useState<BeschraenkungRoh[]>([]);
  const kasten = useRef<Rahmen | null>(null);
  const laeuft = useRef(false);
  const [weg, setWeg] = useState<string | null>(null);
  const angesagt = useRef(new Set<string>());

  const mitRoute = isDriveActive(navState?.status) && !!route && navState?.route_id === route.id;
  const faehrt = (position?.speed ?? 0) >= FREI_AB_MS;
  const aktiv = !!profil && !!position && (mitRoute || faehrt);

  // Daten um die Position holen, wenn sie dem Rand des Kastens nahe kommt.
  useEffect(() => {
    if (!aktiv || !position || laeuft.current) return;
    const k = kasten.current;
    if (k) {
      const randNah =
        position.lon - k[0] < RAND_GRAD ||
        k[2] - position.lon < RAND_GRAD ||
        position.lat - k[1] < RAND_GRAD ||
        k[3] - position.lat < RAND_GRAD;
      if (!randNah) return; // noch weit genug vom Rand (und damit drin)
    }
    const ziel = kastenUm(position.lat, position.lon);
    laeuft.current = true;
    void holeBeschraenkungen(ziel, true).then((antwort) => {
      laeuft.current = false;
      if (!antwort) return;
      kasten.current = ziel;
      setListe(
        antwort.features.map((f) => ({
          lon: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          props: f.properties,
        })),
      );
    });
  }, [aktiv, position]);

  // Route nur bei Wechsel dekodieren.
  const routeGeo = useMemo(() => {
    if (!route?.geometry) return null;
    const coords = decodePolyline6(route.geometry);
    return { coords, kumuliert: cumulativeMeters(coords) };
  }, [route?.geometry]);

  const voraus: Voraus | null = useMemo(() => {
    if (!aktiv || !position || liste.length === 0) return null;
    if (mitRoute && routeGeo) {
      const gesamt = routeGeo.kumuliert[routeGeo.kumuliert.length - 1] ?? 0;
      const fortschritt = progressFromRemaining(gesamt, navState?.distance_remaining_m);
      if (fortschritt === null) return null;
      return vorausAufRoute(routeGeo.coords, routeGeo.kumuliert, fortschritt, liste, profil);
    }
    if (position.heading === null || position.heading === undefined) return null;
    return vorausInFahrtrichtung([position.lon, position.lat], position.heading, liste, profil);
  }, [aktiv, position, liste, mitRoute, routeGeo, navState?.distance_remaining_m, profil]);

  const text = useMemo(() => {
    if (!voraus) return null;
    const g = gebiet(sprache);
    const e = entfernungRund(voraus.entfernungM);
    const entfernung = `${e.wert.toLocaleString(g)} ${e.einheit}`;
    return t('beschrVoraus', {
      entfernung,
      art: t(`beschrArt_${voraus.art}` as Parameters<typeof t>[0]),
      wert: wertText(voraus.art, voraus.wert, g),
    });
  }, [voraus, sprache, t]);

  // Einmal je Grenze ansagen.
  useEffect(() => {
    if (!voraus || !text || !ttsAn) return;
    if (angesagt.current.has(voraus.schluessel)) return;
    angesagt.current.add(voraus.schluessel);
    void sageAn(text, 'hinweis', (s) => announce(s));
  }, [voraus, text, ttsAn]);

  if (!voraus || !text || weg === voraus.schluessel) return null;
  const eigen = fahrzeugWert(voraus.art, profil);
  return (
    <div
      className="pointer-events-none fixed left-1/2 top-[calc(8rem+var(--kopf-mehr,0px))] z-30 w-[min(calc(var(--sicht-b,100vw)*0.92),30rem)] -translate-x-1/2"
      data-testid="beschraenkung-warnung"
    >
      <div
        role="alert"
        onClick={() => setWeg(voraus.schluessel)}
        title={t('beschrTippen')}
        className="pointer-events-auto cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold shadow-lg"
        style={{
          border: '3px solid var(--y-fehler, #dc2626)',
          background: 'var(--y-flaeche, #ffffff)',
          color: 'var(--y-text, #1e293b)',
        }}
      >
        {text}
        {eigen !== null && (
          <span className="block text-xs font-normal" style={{ color: 'var(--y-text-gedaempft, #64748b)' }}>
            {t('beschrFahrzeug', { wert: wertText(voraus.art, eigen, gebiet(sprache)) })}
          </span>
        )}
      </div>
    </div>
  );
}
