import { afterEach, describe, expect, it } from 'vitest';
import { setzeSprachQuelle } from '../i18n.js';
import { runPreflight } from './preflight.js';

describe('Installationsprüfung auf Englisch', () => {
  afterEach(() => setzeSprachQuelle(() => null));

  it('liefert englische Urteile und Handlungsanweisungen mit Beschriftungen der Oberfläche', async () => {
    setzeSprachQuelle(() => 'en');
    const report = await runPreflight({
      env: {},
      listDir: async () => [],
      fileSize: async () => null,
      tcpProbe: async () => false,
      httpProbe: async () => false,
      totalMem: () => 8 * 1024 ** 3,
      diskFree: async () => 1024 ** 3,
    });
    expect(report.summary).toContain('requirement(s) missing');
    const tiles = report.checks.find((c) => c.id === 'tiles');
    expect(tiles?.label).toBe('Map tiles');
    expect(tiles?.remedy).toContain('"Manage maps"');
    expect(tiles?.remedy).toContain('"Build missing"');
    expect(tiles?.remedy).not.toContain('„');
  });
});
