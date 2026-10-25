import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { routingInstallieren } from './kartenserver.js';
import { bauInfoAus, passtDazu, teilgraphEntfernen } from './teilgraph.js';

const ordner: string[] = [];
afterEach(() => {
  for (const d of ordner.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'teilgraph-'));
  ordner.push(d);
  return d;
}

/** Ein Routing-Paket wie vom Europa-Bau: tiles/valhalla.json, Kacheln, build-info.json. */
function paket(d: string, name: string, info: object, kacheln: Record<string, string>): string {
  const q = join(d, `quelle-${name}`);
  mkdirSync(join(q, 'tiles'), { recursive: true });
  writeFileSync(join(q, 'tiles', 'valhalla.json'), JSON.stringify({ von: name }));
  for (const [rel, inhalt] of Object.entries(kacheln)) {
    mkdirSync(join(q, 'tiles', 'valhalla_tiles', dirname(rel)), { recursive: true });
    writeFileSync(join(q, 'tiles', 'valhalla_tiles', rel), inhalt);
  }
  writeFileSync(join(q, 'build-info.json'), JSON.stringify(info));
  const tar = join(d, `${name}-routing.tar`);
  execFileSync('tar', ['-C', q, '-cf', tar, 'tiles', 'build-info.json']);
  return tar;
}

const de = (bau = 'europa-2026-10-24') => ({ region: 'germany', regions: ['germany'], bau, teilgraph: true, built_at: '2026-10-24T20:00:00Z' });
const ch = (bau = 'europa-2026-10-24') => ({ region: 'switzerland', regions: ['switzerland'], bau, teilgraph: true, built_at: '2026-10-24T20:00:00Z' });

function graph(d: string) {
  const graphDir = join(d, 'valhalla', 'tiles');
  const info = () => JSON.parse(readFileSync(join(d, 'valhalla', 'build-info.json'), 'utf8'));
  const kachel = (rel: string) => join(graphDir, 'valhalla_tiles', rel);
  return { graphDir, info, kachel };
}

describe('passtDazu', () => {
  it('nur Teilgraphen aus demselben Bau', () => {
    expect(passtDazu(bauInfoAus(JSON.stringify(ch())), bauInfoAus(JSON.stringify(de())))).toBe(true);
    expect(passtDazu(bauInfoAus(JSON.stringify(ch('europa-2026-11-30'))), bauInfoAus(JSON.stringify(de())))).toBe(false);
    expect(passtDazu(bauInfoAus(JSON.stringify(ch())), bauInfoAus('{"region":"germany","regions":["germany"]}'))).toBe(false);
    expect(passtDazu(bauInfoAus(JSON.stringify(ch())), null)).toBe(false);
  });
});

describe('Routing-Länderpakete installieren', () => {
  it('erstes Land ersetzt, zweites aus demselben Bau kommt dazu', async () => {
    const d = tmp();
    const g = graph(d);
    const r1 = await routingInstallieren(paket(d, 'de', de(), { '2/000/001.gph': 'DE', '2/000/002.gph': 'GRENZE' }), g.graphDir);
    expect(r1).toEqual({ art: 'ersetzt', verloren: [] });
    const r2 = await routingInstallieren(paket(d, 'ch', ch(), { '2/000/002.gph': 'GRENZE', '2/000/003.gph': 'CH' }), g.graphDir);
    expect(r2).toEqual({ art: 'ergaenzt', verloren: [] });

    for (const k of ['2/000/001.gph', '2/000/002.gph', '2/000/003.gph']) expect(existsSync(g.kachel(k))).toBe(true);
    expect(g.info()).toMatchObject({ regions: ['germany', 'switzerland'], bau: 'europa-2026-10-24', teilgraph: true });
    // Die Config des Graphen bleibt die des ersten Pakets.
    expect(JSON.parse(readFileSync(join(g.graphDir, 'valhalla.json'), 'utf8'))).toEqual({ von: 'de' });
    // Nichts Ausgepacktes bleibt liegen.
    expect(existsSync(join(d, 'valhalla', `.neu-${process.pid}`))).toBe(false);
  });

  it('ein Land aus einem anderen Bau ersetzt und sagt, was verloren geht', async () => {
    const d = tmp();
    const g = graph(d);
    await routingInstallieren(paket(d, 'de', de(), { '2/000/001.gph': 'DE' }), g.graphDir);
    await routingInstallieren(paket(d, 'ch', ch(), { '2/000/003.gph': 'CH' }), g.graphDir);
    const r = await routingInstallieren(
      paket(d, 'at', { region: 'austria', regions: ['austria'], bau: 'europa-2026-11-30', teilgraph: true }, { '2/000/009.gph': 'AT' }),
      g.graphDir,
    );
    expect(r).toEqual({ art: 'ersetzt', verloren: ['germany', 'switzerland'] });
    expect(existsSync(g.kachel('2/000/001.gph'))).toBe(false);
    expect(g.info()).toMatchObject({ regions: ['austria'], bau: 'europa-2026-11-30' });
  });

  it('ein lokal gebauter Graph wird ersetzt, nicht ergänzt', async () => {
    const d = tmp();
    const g = graph(d);
    mkdirSync(join(g.graphDir, 'valhalla_tiles'), { recursive: true });
    writeFileSync(join(d, 'valhalla', 'build-info.json'), JSON.stringify({ region: 'germany', regions: ['germany', 'liechtenstein'] }));
    const r = await routingInstallieren(paket(d, 'ch', ch(), { '2/000/003.gph': 'CH' }), g.graphDir);
    expect(r).toEqual({ art: 'ersetzt', verloren: ['germany', 'liechtenstein'] });
  });
});

describe('ein Land aus dem Teilgraphen nehmen', () => {
  it('geht mit seinen Kacheln, Grenzkacheln des Nachbarn bleiben', async () => {
    const d = tmp();
    const g = graph(d);
    await routingInstallieren(paket(d, 'de', de(), { '2/000/001.gph': 'DE', '2/000/002.gph': 'GRENZE' }), g.graphDir);
    await routingInstallieren(paket(d, 'ch', ch(), { '2/000/002.gph': 'GRENZE', '2/000/003.gph': 'CH' }), g.graphDir);

    expect(await teilgraphEntfernen(g.graphDir, 'switzerland')).toBe(true);
    expect(existsSync(g.kachel('2/000/003.gph'))).toBe(false);
    expect(existsSync(g.kachel('2/000/002.gph'))).toBe(true);
    expect(existsSync(g.kachel('2/000/001.gph'))).toBe(true);
    expect(g.info().regions).toEqual(['germany']);
  });

  it('ändert nichts an einem lokal gebauten Graphen', async () => {
    const d = tmp();
    const g = graph(d);
    mkdirSync(g.graphDir, { recursive: true });
    writeFileSync(join(d, 'valhalla', 'build-info.json'), JSON.stringify({ region: 'germany', regions: ['germany'] }));
    expect(await teilgraphEntfernen(g.graphDir, 'germany')).toBe(false);
    expect(g.info().regions).toEqual(['germany']);
  });
});
