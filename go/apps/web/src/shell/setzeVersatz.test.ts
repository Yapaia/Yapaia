import { afterEach, describe, expect, it, vi } from 'vitest';
import { setzeVersatz } from './useAnordnung.js';

// Ohne DOM-Umgebung: ein Element ist hier nur sein `style`.
function element(): HTMLElement {
  return { style: { translate: '', scale: '', transform: '' } } as unknown as HTMLElement;
}

afterEach(() => vi.unstubAllGlobals());

describe('setzeVersatz', () => {
  it('nutzt translate/scale, wo es sie gibt', () => {
    const el = element();
    setzeVersatz(el, { dx: 10, dy: -5, s: 0.8 }, true);
    expect(el.style.translate).toBe('10px -5px');
    expect(el.style.scale).toBe('0.8');
    expect(el.style.transform).toBe('');
  });

  it('ohne sie (Chrome 101): transform vor der eigenen Transformation', () => {
    vi.stubGlobal('getComputedStyle', () => ({ transform: 'matrix(1, 0, 0, 1, -50, 0)' }));
    const el = element();
    setzeVersatz(el, { dx: 10, dy: -5, s: 0.8 }, false);
    expect(el.style.transform).toBe('translate(10px, -5px) scale(0.8) matrix(1, 0, 0, 1, -50, 0)');
    setzeVersatz(el, null, false);
    expect(el.style.transform).toBe('');
  });

  it('ohne eigene Transformation nur der Versatz', () => {
    vi.stubGlobal('getComputedStyle', () => ({ transform: 'none' }));
    const el = element();
    setzeVersatz(el, { dx: 1, dy: 2, s: 1 }, false);
    expect(el.style.transform).toBe('translate(1px, 2px) scale(1)');
  });
});
