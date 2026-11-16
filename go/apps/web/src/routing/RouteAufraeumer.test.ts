import { describe, expect, it } from 'vitest';
import { fahrtEndet } from './RouteAufraeumer.js';

describe('fahrtEndet', () => {
  it('räumt nach dem Beenden und bei der Ankunft', () => {
    expect(fahrtEndet('navigating', 'idle')).toBe(true);
    expect(fahrtEndet('navigating', 'arrived')).toBe(true);
    expect(fahrtEndet('off_route', 'arrived')).toBe(true);
    expect(fahrtEndet('paused', 'idle')).toBe(true);
  });

  it('lässt eine geplante, nicht gestartete Route stehen', () => {
    expect(fahrtEndet('idle', 'idle')).toBe(false);
    expect(fahrtEndet(undefined, 'idle')).toBe(false);
    expect(fahrtEndet('routing', 'idle')).toBe(false);
    expect(fahrtEndet('arrived', 'idle')).toBe(false);
  });

  it('räumt nicht während der Fahrt', () => {
    expect(fahrtEndet('navigating', 'off_route')).toBe(false);
    expect(fahrtEndet('navigating', 'paused')).toBe(false);
  });
});
