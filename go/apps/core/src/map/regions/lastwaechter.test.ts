import { describe, it, expect } from 'vitest';
import { lastRegeln, procLastQuelle, CPU_HOCH_MESSUNGEN, RAM_KNAPP_MAX_MS, type LastMessung } from './lastwaechter.js';

const GB = 1024 ** 3;
const ruhig: LastMessung = { cpuProzent: 20, ramFreiBytes: 8 * GB, ramGesamtBytes: 16 * GB };

function regeln(jetzt = () => 0) {
  const ereignisse: string[] = [];
  const pruefe = lastRegeln({
    onPause: () => ereignisse.push('pause'),
    onWeiter: () => ereignisse.push('weiter'),
    onAbbruch: (g) => ereignisse.push(`abbruch: ${g}`),
    jetzt,
  });
  return { pruefe, ereignisse };
}

describe('lastRegeln', () => {
  it('lässt einen Bau bei normaler Last in Ruhe', () => {
    const { pruefe, ereignisse } = regeln();
    for (let i = 0; i < 20; i++) pruefe(ruhig);
    expect(ereignisse).toEqual([]);
  });

  it('pausiert erst, wenn die CPU 30 s am Stück voll ist, und setzt bei Ruhe fort', () => {
    const { pruefe, ereignisse } = regeln();
    for (let i = 0; i < CPU_HOCH_MESSUNGEN - 1; i++) pruefe({ ...ruhig, cpuProzent: 95 });
    pruefe({ ...ruhig, cpuProzent: 50 }); // kurze Spitze zählt nicht
    expect(ereignisse).toEqual([]);
    for (let i = 0; i < CPU_HOCH_MESSUNGEN; i++) pruefe({ ...ruhig, cpuProzent: 95 });
    expect(ereignisse).toEqual(['pause']);
    pruefe({ ...ruhig, cpuProzent: 75 });
    expect(ereignisse).toEqual(['pause']);
    pruefe({ ...ruhig, cpuProzent: 30 });
    expect(ereignisse).toEqual(['pause', 'weiter']);
  });

  it('bricht nie wegen der CPU allein ab', () => {
    const { pruefe, ereignisse } = regeln();
    for (let i = 0; i < 1000; i++) pruefe({ ...ruhig, cpuProzent: 100 });
    expect(ereignisse).toEqual(['pause']);
  });

  it('bricht ab, wenn der Speicher trotz Pause 10 Minuten knapp bleibt', () => {
    let t = 0;
    const { pruefe, ereignisse } = regeln(() => t);
    pruefe({ ...ruhig, ramFreiBytes: 1 * GB });
    expect(ereignisse).toEqual(['pause']);
    t = RAM_KNAPP_MAX_MS - 1;
    pruefe({ ...ruhig, ramFreiBytes: 1 * GB });
    expect(ereignisse).toEqual(['pause']);
    t = RAM_KNAPP_MAX_MS;
    pruefe({ ...ruhig, ramFreiBytes: 1 * GB });
    expect(ereignisse[1]).toMatch(/^abbruch: Arbeitsspeicher über 10 Minuten knapp/);
    pruefe(ruhig);
    expect(ereignisse).toHaveLength(2);
  });

  it('bricht bei kritischem Speicher sofort ab', () => {
    const { pruefe, ereignisse } = regeln();
    pruefe({ ...ruhig, ramFreiBytes: 0.5 * GB });
    expect(ereignisse).toEqual(['abbruch: nur noch 0,5 GB Arbeitsspeicher frei']);
  });
});

describe('procLastQuelle', () => {
  it('rechnet CPU aus der Differenz zweier /proc/stat-Stände, RAM aus MemAvailable', () => {
    const stat = ['cpu  100 0 100 700 100 0 0 0 0 0', 'cpu  250 0 250 800 100 0 0 0 0 0'];
    let n = 0;
    const meminfo = 'MemTotal:       16000000 kB\nMemFree:  1 kB\nMemAvailable:    4000000 kB\n';
    const quelle = procLastQuelle((p) => (p === '/proc/stat' ? stat[n++]! : meminfo));
    expect(quelle()?.cpuProzent).toBeNull();
    const m = quelle()!;
    expect(m.cpuProzent).toBeCloseTo(75); // 300 von 400 Ticks belegt
    expect(m.ramFreiBytes).toBe(4000000 * 1024);
    expect(m.ramGesamtBytes).toBe(16000000 * 1024);
  });

  it('liefert null, wenn /proc nicht lesbar ist', () => {
    const quelle = procLastQuelle(() => {
      throw new Error('ENOENT');
    });
    expect(quelle()).toBeNull();
  });
});
