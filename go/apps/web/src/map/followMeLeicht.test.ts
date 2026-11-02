/**
 * Modus „Leicht": die Kamera springt pro GPS-Meldung, statt zu animieren.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../state/mapStore', () => ({
  mapController: {
    getMap: vi.fn(() => ({
      getZoom: () => 14,
      getContainer: () => ({ clientHeight: 725 }),
      getCenter: () => ({ lat: 49.5, lng: 8.4 }),
    })),
    setCamera: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  useMapStore: vi.fn(),
}));

vi.mock('../position/positionStore', () => ({
  usePositionStore: {
    getState: vi.fn(() => ({ position: { lat: 48.1, lon: 2.3, heading: 45 } })),
  },
}));

import { mapController } from '../state/mapStore';
import { useFollowMeStore, updateFollowMePosition, resetFollowCadence } from './followMe';
import { useDegradationStore } from '../perf/degrade';

const setCamera = mapController.setCamera as unknown as ReturnType<typeof vi.fn>;

describe('Follow-Me im Modus Leicht', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setCamera.mockClear();
    resetFollowCadence();
    useFollowMeStore.setState({ isFollowing: true, isPaused: false });
  });
  afterEach(() => {
    useDegradationStore.setState({ override: 'auto' });
    vi.useRealTimers();
  });

  it('animiert im Normalfall ab der zweiten Meldung', () => {
    updateFollowMePosition();
    vi.advanceTimersByTime(1000);
    updateFollowMePosition();
    expect(setCamera.mock.calls[1][1]).toMatchObject({ animate: true, stetig: true });
  });

  it('springt in jeder Meldung (keine Animationsoptionen)', () => {
    useDegradationStore.setState({ override: 'leicht' });
    updateFollowMePosition();
    vi.advanceTimersByTime(1000);
    updateFollowMePosition();
    expect(setCamera).toHaveBeenCalledTimes(2);
    expect(setCamera.mock.calls[1][1]).toBeUndefined();
  });
});
