/**
 * Performance Watchdog (E01-T6): Integrates FpsMeter + DegradationStore.
 *
 * Once the map is registered, starts measuring FPS via rAF and updates
 * the degradation level based on performance thresholds.
 *
 * Call `startPerfWatchdog(map)` from a useEffect when the map is available,
 * and cleanup with the returned function.
 */

import type { Map as MapLibreMap } from 'maplibre-gl';
import { FpsMeter } from './fpsMeter';
import { useDegradationStore } from './degrade';

const FPS_SAMPLE_INTERVAL_MS = 500; // Update degradation level every 500ms
/** Alle 5 s meldet die Karte Bildrate und Stufe an den Kern (perf/client). */
export const MELDE_INTERVALL_MS = 5_000;

function meldeAnKern(fps: number, bewegt: boolean): void {
  if (typeof fetch !== 'function' || typeof window === 'undefined') return;
  const geraet = new URLSearchParams(window.location.search).get('geraet') ?? '';
  void fetch(`${import.meta.env.BASE_URL}api/v1/perf/client`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      geraet,
      // ohne Kamerabewegung misst der FpsMeter nichts -- dann keine Zahl
      fps: bewegt ? fps : null,
      stufe: useDegradationStore.getState().level,
      modus: useDegradationStore.getState().override,
      bewegt,
      ua: navigator.userAgent,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

export function startPerfWatchdog(map: MapLibreMap): () => void {
  const fpsMeter = new FpsMeter(5000); // 5-second rolling window

  // Restore degradation settings from localStorage
  useDegradationStore.getState().restoreSettings();

  // Track camera movement
  let bewegt = false;
  let bewegtSeitMeldung = false;
  const handleMoveStart = () => {
    fpsMeter.setMoving(true);
    bewegt = true;
    bewegtSeitMeldung = true;
  };

  const handleMoveEnd = () => {
    fpsMeter.setMoving(false);
    bewegt = false;
  };

  map.on('movestart', handleMoveStart);
  map.on('moveend', handleMoveEnd);

  // Start the frame recording loop
  let lastFpsSampleTime = Date.now();
  let letzteMeldung = Date.now();
  let rafId: number | null = null;

  const raf = (timestamp: DOMHighResTimeStamp) => {
    fpsMeter.recordFrame(timestamp);

    // Update degradation level periodically (not every frame)
    const now = Date.now();
    if (now - lastFpsSampleTime >= FPS_SAMPLE_INTERVAL_MS) {
      const fps = fpsMeter.getRollingFps();
      useDegradationStore.getState().updateFps(fps, now);

      // Emit stats for the debug overlay
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('perf-stats-update', {
            detail: { fps },
          }),
        );
      }

      lastFpsSampleTime = now;

      if (now - letzteMeldung >= MELDE_INTERVALL_MS) {
        meldeAnKern(fps, bewegt || bewegtSeitMeldung);
        bewegtSeitMeldung = bewegt;
        letzteMeldung = now;
      }
    }

    rafId = requestAnimationFrame(raf);
  };

  rafId = requestAnimationFrame(raf);

  // Cleanup
  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    map.off('movestart', handleMoveStart);
    map.off('moveend', handleMoveEnd);
    fpsMeter.reset();
  };
}
