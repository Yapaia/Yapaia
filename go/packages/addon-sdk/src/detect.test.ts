import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectTransport } from './detect.js';
import { AddonTransportError } from './errors.js';

/**
 * Transport auto-detection (docs/05 §3): the env-var signal (service add-on)
 * wins outright over the window signal (UI add-on) when both are somehow
 * present; neither present is a clear, actionable error rather than a guess.
 */

describe('detectTransport()', () => {
  const originalToken = process.env.YAPAIA_TOKEN;
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    delete process.env.YAPAIA_TOKEN;
    delete (globalThis as { window?: unknown }).window;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.YAPAIA_TOKEN;
    else process.env.YAPAIA_TOKEN = originalToken;
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('picks "service" when YAPAIA_TOKEN is set in the environment', () => {
    process.env.YAPAIA_TOKEN = 'a-scoped-token';
    expect(detectTransport()).toBe('service');
  });

  it('ignores a blank/whitespace-only YAPAIA_TOKEN (not a real credential)', () => {
    process.env.YAPAIA_TOKEN = '   ';
    (globalThis as { window?: unknown }).window = { parent: {} };
    expect(detectTransport()).toBe('postMessage');
  });

  it('picks "postMessage" when a window with a parent exists and no YAPAIA_TOKEN is set', () => {
    (globalThis as { window?: unknown }).window = { parent: {} };
    expect(detectTransport()).toBe('postMessage');
  });

  it('prefers "service" when BOTH signals are present (YAPAIA_TOKEN is the stronger, deliberate signal)', () => {
    process.env.YAPAIA_TOKEN = 'a-scoped-token';
    (globalThis as { window?: unknown }).window = { parent: {} };
    expect(detectTransport()).toBe('service');
  });

  it('throws a clear AddonTransportError when neither signal is present', () => {
    expect(() => detectTransport()).toThrow(AddonTransportError);
    try {
      detectTransport();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AddonTransportError);
      expect((err as AddonTransportError).code).toBe('TRANSPORT_DETECTION_FAILED');
      expect((err as AddonTransportError).message).toMatch(/transport/i);
    }
  });
});
