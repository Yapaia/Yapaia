// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { setzeVersatz } from './useAnordnung.js';

describe('setzeVersatz', () => {
  it('nutzt translate/scale, wo es sie gibt', () => {
    const el = document.createElement('div');
    setzeVersatz(el, { dx: 10, dy: -5, s: 0.8 }, true);
    expect(el.style.translate).toBe('10px -5px');
    expect(el.style.scale).toBe('0.8');
    expect(el.style.transform).toBe('');
  });

  it('ohne sie (Chrome 101): transform vor der eigenen Transformation', () => {
    const el = document.createElement('div');
    el.style.setProperty('--x', '1');
    setzeVersatz(el, { dx: 10, dy: -5, s: 0.8 }, false);
    expect(el.style.transform).toBe('translate(10px, -5px) scale(0.8)');
    setzeVersatz(el, null, false);
    expect(el.style.transform).toBe('');
  });
});
