import { describe, it, expect } from 'vitest';
import { hexZuRgb, palette } from './palette.js';

const retro = { '--y-grund': '#F4ECDC', '--y-flaeche': '#FBF6EC', '--y-text': '#3B2A20', '--y-akzent': '#C8551F' };
const sport = { '--y-grund': '#0a0d14', '--y-flaeche': '#14161b', '--y-text': '#f2f3f5', '--y-akzent': '#c9895b' };
const summe = (s: string) => s.split(' ').map(Number).reduce((a, b) => a + b, 0);

describe('palette', () => {
  it('liest Hex-Farben', () => {
    expect(hexZuRgb('#C8551F')).toEqual([200, 85, 31]);
    expect(hexZuRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexZuRgb('kaputt')).toBeNull();
  });

  it('helles Schema: slate von der Fläche (hell) zum Text (dunkel), blue-600 = Akzent', () => {
    const p = palette(retro, true)!;
    expect(p['--tw-flaeche']).toBe('251 246 236');
    expect(p['--tw-blue-600']).toBe('200 85 31');
    expect(summe(p['--tw-slate-50'])).toBeGreaterThan(summe(p['--tw-slate-900']));
  });

  it('dunkles Schema: slate-50 ist der helle Text, slate-900 der dunkle Grund', () => {
    const p = palette(sport, false)!;
    expect(summe(p['--tw-slate-50'])).toBeGreaterThan(summe(p['--tw-slate-900']));
    expect(summe(p['--tw-slate-900'])).toBeLessThan(120);
  });

  it('ohne nötige Farben: nichts', () => {
    expect(palette({ '--y-grund': '#000000' }, true)).toBeNull();
  });
});
