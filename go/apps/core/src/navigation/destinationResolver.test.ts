import { describe, expect, it, vi } from 'vitest';
import type { Route } from '@yapaia/shared';
import { resolveDestinationAndRoute, type DestinationResolverDeps } from './destinationResolver.js';

const ROUTE = { id: 'r1' } as Route;

function deps() {
  const start = vi.fn((s: { destination: unknown }) => ({
    status: 'navigating',
    destination: s.destination,
  }));
  const d = {
    navigationService: { getState: () => ({ status: 'idle' }), start },
    rerouteProvider: { createRoutes: async () => [ROUTE] },
    profileProvider: { getActive: () => ({ id: 'p1' }) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as unknown as DestinationResolverDeps;
  return { d, start };
}

describe('resolveDestinationAndRoute', () => {
  it('Koordinaten mit Namen: der Name wird zum Ziel', async () => {
    const { d } = deps();
    const { navState } = await resolveDestinationAndRoute(d, {
      latlng: { lat: 49.2, lon: 8.4 },
      name: ' Lidl ',
      autostart: true,
    });
    expect(navState.destination).toEqual({ latlng: { lat: 49.2, lon: 8.4 }, name: 'Lidl' });
  });

  it('Koordinaten ohne Namen bleiben namenlos', async () => {
    const { d } = deps();
    const { navState } = await resolveDestinationAndRoute(d, {
      latlng: { lat: 49.2, lon: 8.4 },
      autostart: true,
    });
    expect(navState.destination).toEqual({ latlng: { lat: 49.2, lon: 8.4 }, name: null });
  });
});
