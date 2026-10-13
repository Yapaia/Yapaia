/**
 * Löschen räumt auf.
 *
 * Gemeldet: nach „Löschen" stand das Paket als entfernt da, die Suche fand
 * dort aber weiter Orte, und geroutet wurde auch noch — gelöscht war nur die
 * Kartendatei.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { regionsPlugin } from './routes.js';
import type { SpawnedBuild } from './build.js';
import { buildPMTilesFixtureBuffer } from '../__fixtures__/pmtiles-fixture.js';

function neverEndingChild(): SpawnedBuild {
  return {
    stdout: { on: () => undefined },
    stderr: { on: () => undefined },
    on: () => undefined,
    kill: () => true,
  };
}

describe('DELETE /api/v1/map/regions/:id -- räumt Suchindex und Extrakt mit ab', () => {
  let app: FastifyInstance;
  let wurzel: string;
  let tilesDir: string;
  let liteDir: string;
  let lager: string;
  let graphDir: string;

  afterEach(async () => {
    await app?.close();
    delete process.env.TILES_DIR;
    delete process.env.MAP_REGIONS_CATALOG_FILE;
    delete process.env.LITE_SEARCH_DB_PATH;
    delete process.env.VALHALLA_TILES_DIR;
    rmSync(wurzel, { recursive: true, force: true });
  });

  async function setUp(): Promise<void> {
    // Dieselbe Anordnung wie im Add-on: Karten, Suchindizes, Graph und
    // Zwischenlager nebeneinander unter einem Datenverzeichnis.
    wurzel = mkdtempSync(join(tmpdir(), 'yapaia-loeschen-'));
    tilesDir = join(wurzel, 'tiles');
    liteDir = join(wurzel, 'lite-search');
    lager = join(wurzel, 'planetiler-sources');
    graphDir = join(wurzel, 'valhalla', 'tiles');
    for (const dir of [tilesDir, liteDir, lager, graphDir]) mkdirSync(dir, { recursive: true });

    for (const region of ['alpen', 'liechtenstein']) {
      writeFileSync(join(tilesDir, `${region}.pmtiles`), buildPMTilesFixtureBuffer({}));
      writeFileSync(join(liteDir, `lite_search-${region}.db`), 'index');
      writeFileSync(join(lager, `${region}.osm.pbf`), 'extrakt');
    }
    writeFileSync(join(graphDir, 'valhalla.json'), '{}');
    writeFileSync(join(wurzel, 'valhalla', 'build-info.json'), JSON.stringify({ regions: ['alpen', 'liechtenstein'] }));

    const catalogPath = join(wurzel, 'catalog.json');
    writeFileSync(
      catalogPath,
      JSON.stringify([
        { id: 'rheinlandpfalz', name: 'Rheinland-Pfalz', pbfUrl: 'http://127.0.0.1:1/rp.osm.pbf', sizeBytes: 1000, bounds: [6.1, 48.9, 8.6, 51.0] },
      ]),
    );

    process.env.TILES_DIR = tilesDir;
    process.env.MAP_REGIONS_CATALOG_FILE = catalogPath;
    process.env.LITE_SEARCH_DB_PATH = join(liteDir, 'lite_search.db');
    process.env.VALHALLA_TILES_DIR = graphDir;

    app = Fastify({ logger: false });
    await app.register(regionsPlugin, {
      statfsImpl: async () => ({ bavail: 10_000_000, bsize: 4096 }),
      buildDeps: {
        spawnFn: () => neverEndingChild(),
        freeMemFn: () => 8 * 1024 ** 3,
        logger: () => undefined,
      },
    });
  }

  it('löscht Karte, Suchindex und Extrakt der Region', async () => {
    await setUp();

    const response = await app.inject({ method: 'DELETE', url: '/api/v1/map/regions/alpen' });
    expect(response.statusCode).toBe(204);

    expect(existsSync(join(tilesDir, 'alpen.pmtiles'))).toBe(false);
    expect(existsSync(join(liteDir, 'lite_search-alpen.db'))).toBe(false);
    expect(existsSync(join(lager, 'alpen.osm.pbf'))).toBe(false);
  });

  it('lässt die anderen Regionen und den Routinggraphen in Ruhe', async () => {
    await setUp();

    await app.inject({ method: 'DELETE', url: '/api/v1/map/regions/alpen' });

    expect(existsSync(join(tilesDir, 'liechtenstein.pmtiles'))).toBe(true);
    expect(existsSync(join(liteDir, 'lite_search-liechtenstein.db'))).toBe(true);
    expect(existsSync(join(lager, 'liechtenstein.osm.pbf'))).toBe(true);
    // EIN Graph für alle: eine einzelne Region lässt sich nicht herausnehmen.
    expect(existsSync(join(graphDir, 'valhalla.json'))).toBe(true);
    expect(existsSync(join(wurzel, 'valhalla', 'build-info.json'))).toBe(true);
  });

  it('gelingt auch, wenn es weder Suchindex noch Extrakt gibt', async () => {
    // Eine Karte vom Kartenserver hat keinen Extrakt; eine frisch geladene
    // noch keinen Suchindex.
    await setUp();
    rmSync(join(liteDir, 'lite_search-alpen.db'));
    rmSync(join(lager, 'alpen.osm.pbf'));

    const response = await app.inject({ method: 'DELETE', url: '/api/v1/map/regions/alpen' });
    expect(response.statusCode).toBe(204);
    expect(existsSync(join(tilesDir, 'alpen.pmtiles'))).toBe(false);
  });

  it('lehnt mit 409 BUILD_IN_PROGRESS ab, solange ein Bau läuft, und löscht nichts', async () => {
    // Der Bau liest die Extrakte im Zwischenlager -- auch den der Region,
    // die gerade gelöscht werden soll.
    await setUp();
    const bau = await app.inject({ method: 'POST', url: '/api/v1/map/regions/rheinlandpfalz/build' });
    expect(bau.statusCode).toBe(202);

    const response = await app.inject({ method: 'DELETE', url: '/api/v1/map/regions/alpen' });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('BUILD_IN_PROGRESS');

    expect(existsSync(join(tilesDir, 'alpen.pmtiles'))).toBe(true);
    expect(existsSync(join(liteDir, 'lite_search-alpen.db'))).toBe(true);
    expect(existsSync(join(lager, 'alpen.osm.pbf'))).toBe(true);
  });
});
