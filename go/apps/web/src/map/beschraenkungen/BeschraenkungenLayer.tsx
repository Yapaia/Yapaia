/**
 * Kartenebene „Fahrzeug-Beschränkungen" (seit Go 0.71.0).
 *
 * Schildartige Marken mit dem Wert („3,2 m", „7,5 t"), ab Zoom
 * `BESCHRAENKUNGEN_MINZOOM`. Grenzen, die das aktive Fahrzeugprofil
 * überschreitet, sind hervorgehoben (Rahmen und Text in `--y-fehler`) und
 * liegen oben. Die Daten kommen je Ausschnitt vom Kern
 * (`/api/v1/map/beschraenkungen`), geholt nach dem Verschieben und nur,
 * wenn der neue Ausschnitt nicht schon im zuletzt geholten liegt.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useMapStore } from '../../state/mapStore.js';
import { useProfileStore } from '../../profiles/store.js';
import { gebiet, useSprache, useT } from '../../i18n/index.js';
import { runWhenStyleReady } from '../styleReady.js';
import { T } from '../texte.js';
import {
  enthaelt,
  erweitert,
  holeBeschraenkungen,
  useBeschraenkungenStore,
  type BeschraenkungMerkmal,
  type Rahmen,
} from './store.js';
import { schildBild, tokenFarbe, tokenRgb, ueberschreitet, wertText, type BeschraenkungArt } from './zeichen.js';

export const BESCHRAENKUNGEN_SOURCE_ID = 'yapaia-beschraenkungen';
export const BESCHRAENKUNGEN_LAYER_ID = 'yapaia-beschraenkungen-schilder';
export const BESCHRAENKUNGEN_MINZOOM = 12;
const BILD_NORMAL = 'yapaia-beschr-normal';
const BILD_UEBER = 'yapaia-beschr-ueber';

const LEER = { type: 'FeatureCollection' as const, features: [] };

interface GeoJSONQuelle {
  setData(data: unknown): void;
}

function bilderSetzen(map: MapLibreMap): void {
  const flaeche = tokenRgb('--y-flaeche', '#ffffff');
  const bilder: Array<[string, [number, number, number], number]> = [
    [BILD_NORMAL, tokenRgb('--y-text-gedaempft', '#64748b'), 2],
    [BILD_UEBER, tokenRgb('--y-fehler', '#dc2626'), 4],
  ];
  for (const [name, rahmen, breite] of bilder) {
    if (map.hasImage(name)) map.removeImage(name);
    map.addImage(name, schildBild(rahmen, flaeche, breite), {
      pixelRatio: 2,
      stretchX: [[12, 20]],
      stretchY: [[12, 20]],
      content: [7, 7, 25, 25],
    });
  }
}

function rahmenVon(map: MapLibreMap): Rahmen {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

export default function BeschraenkungenLayer(): null {
  const map = useMapStore((s) => s.map);
  const sichtbar = useBeschraenkungenStore((s) => s.sichtbar);
  const profil = useProfileStore((s) => s.activeProfile);
  const sprache = useSprache((s) => s.sprache);
  const t = useT(T);
  const [merkmale, setMerkmale] = useState<BeschraenkungMerkmal[]>([]);
  const geholt = useRef<Rahmen | null>(null);

  // Holen nach dem Verschieben -- nur bei eingeschalteter Ebene und Zoom.
  useEffect(() => {
    if (!map || !sichtbar) return;
    let abbruch: AbortController | null = null;
    let zeit: ReturnType<typeof setTimeout> | null = null;
    const pruefen = (): void => {
      if (map.getZoom() < BESCHRAENKUNGEN_MINZOOM) return;
      const jetzt = rahmenVon(map);
      if (geholt.current && enthaelt(geholt.current, jetzt)) return;
      const ziel = erweitert(jetzt, 1.9);
      abbruch?.abort();
      abbruch = new AbortController();
      void holeBeschraenkungen(ziel, false, abbruch.signal).then((antwort) => {
        if (!antwort) return;
        geholt.current = ziel;
        setMerkmale(antwort.features);
      });
    };
    const spaeter = (): void => {
      if (zeit) clearTimeout(zeit);
      zeit = setTimeout(pruefen, 400);
    };
    map.on('moveend', spaeter);
    pruefen();
    return () => {
      map.off('moveend', spaeter);
      if (zeit) clearTimeout(zeit);
      abbruch?.abort();
    };
  }, [map, sichtbar]);

  // Text und Hervorhebung hängen an Sprache und Fahrzeug, nicht am Abruf.
  const daten = useMemo(() => {
    const g = gebiet(sprache);
    return {
      type: 'FeatureCollection' as const,
      features: merkmale.map((m) => {
        const art = m.properties.art as BeschraenkungArt;
        const ueber = ueberschreitet(art, m.properties.wert, profil);
        const wert = wertText(art, m.properties.wert, g);
        const text =
          art === 'hoehe'
            ? t('beschrHoehe', { wert })
            : art === 'breite'
              ? t('beschrBreite', { wert })
              : art === 'laenge'
                ? t('beschrLaenge', { wert })
                : art === 'achslast'
                  ? t('beschrAchslast', { wert })
                  : t('beschrGewicht', { wert });
        return { ...m, properties: { ...m.properties, text, ueber, rang: ueber ? 0 : 1 } };
      }),
    };
  }, [merkmale, profil, sprache, t]);
  const datenRef = useRef(daten);
  datenRef.current = daten;

  useEffect(() => {
    if (!map) return;
    const setup = (): void => {
      if (!map.hasImage(BILD_NORMAL)) bilderSetzen(map);
      if (map.getSource(BESCHRAENKUNGEN_SOURCE_ID)) return;
      map.addSource(BESCHRAENKUNGEN_SOURCE_ID, { type: 'geojson', data: datenRef.current ?? LEER });
      map.addLayer({
        id: BESCHRAENKUNGEN_LAYER_ID,
        type: 'symbol',
        source: BESCHRAENKUNGEN_SOURCE_ID,
        minzoom: BESCHRAENKUNGEN_MINZOOM,
        layout: {
          visibility: useBeschraenkungenStore.getState().sichtbar ? 'visible' : 'none',
          'icon-image': ['case', ['get', 'ueber'], BILD_UEBER, BILD_NORMAL],
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [2, 4, 2, 4],
          'text-field': ['get', 'text'],
          'text-font': ['noto-sans-bold'],
          'text-size': ['case', ['get', 'ueber'], 13, 11],
          // Überschrittene Grenzen gewinnen bei Platzmangel (zuerst gesetzt).
          'symbol-sort-key': ['get', 'rang'],
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment': 'viewport',
          'text-rotation-alignment': 'viewport',
          'text-pitch-alignment': 'viewport',
        },
        paint: {
          'text-color': [
            'case',
            ['get', 'ueber'],
            tokenFarbe('--y-fehler', '#dc2626'),
            tokenFarbe('--y-text', '#1e293b'),
          ],
        },
      });
    };
    return runWhenStyleReady(map, setup);
  }, [map]);

  useEffect(() => {
    if (!map || !map.getLayer(BESCHRAENKUNGEN_LAYER_ID)) return;
    map.setLayoutProperty(BESCHRAENKUNGEN_LAYER_ID, 'visibility', sichtbar ? 'visible' : 'none');
  }, [map, sichtbar]);

  useEffect(() => {
    if (!map) return;
    const quelle = map.getSource(BESCHRAENKUNGEN_SOURCE_ID) as unknown as GeoJSONQuelle | undefined;
    quelle?.setData(daten);
  }, [map, daten]);

  return null;
}
