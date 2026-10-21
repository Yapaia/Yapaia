/**
 * Erst herunterladen, dann gemeinsam bauen (0.59.0).
 *
 * Gewünscht: „Wenn man mehrere Karten zusammen bauen will sollte man sie erst
 * alle runterladen und dann gemeinsam bauen." Geprüft wird beides: dass der
 * Download NUR lädt, und dass der Gesamtbau die geladenen Karten mitbaut —
 * zuerst ihre Kacheln, dann das Routing einmal über alle.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import * as http from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { setTimeout } from 'node:timers';
import { regionsPlugin } from './routes.js';
import type { SpawnedBuild } from './build.js';
import { istOsmPbf } from './extrakt.js';
import { buildPMTilesFixtureBuffer } from '../__fixtures__/pmtiles-fixture.js';

/** Ein Kindprozess, der nie endet — der Job bleibt damit „running". */
function endlos(): SpawnedBuild {
  return {
    stdout: { on: () => undefined },
    stderr: { on: () => undefined },
    on: () => undefined,
    kill: () => true,
  };
}

/** Der Anfang einer echten OSM-PBF: 4 Byte Länge, dann der BlobHeader mit
 *  „OSMHeader" ab Byte 6. Mehr prüft niemand. */
const PBF = Buffer.concat([Buffer.from([0, 0, 0, 13, 0x0a, 0x09]), Buffer.from('OSMHeader'), Buffer.alloc(200, 7)]);

describe('Extrakt herunterladen und gemeinsam bauen', () => {
  let app: FastifyInstance;
  let server: http.Server;
  let lager: string;
  let tilesDir: string;
  let kommandos: Array<{ command: string; args: string[] }> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await app?.close();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    delete process.env.TILES_DIR;
    delete process.env.MAP_REGIONS_CATALOG_FILE;
    delete process.env.VALHALLA_TILES_DIR;
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  async function setUp(opts: { installiert?: string[]; antwort?: Buffer } = {}): Promise<void> {
    const antwort = opts.antwort ?? PBF;
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Length': antwort.length });
      res.end(antwort);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    tilesDir = mkdtempSync(join(tmpdir(), 'yapaia-extrakt-tiles-'));
    const basis = mkdtempSync(join(tmpdir(), 'yapaia-extrakt-basis-'));
    tempDirs.push(tilesDir, basis);
    // `pbfLagerPfad` liegt zwei Ebenen über dem Graphverzeichnis -- also hier
    // in `basis`, nicht im gemeinsamen tmp.
    process.env.VALHALLA_TILES_DIR = join(basis, 'valhalla', 'tiles');
    lager = join(basis, 'planetiler-sources');

    for (const region of opts.installiert ?? []) {
      writeFileSync(join(tilesDir, `${region}.pmtiles`), buildPMTilesFixtureBuffer({}));
    }
    const catalogPath = join(basis, 'catalog.json');
    writeFileSync(
      catalogPath,
      JSON.stringify([
        { id: 'andorra', name: 'Andorra', pbfUrl: `http://127.0.0.1:${port}/ad.osm.pbf`, sizeBytes: PBF.length, bounds: [1.4, 42.4, 1.8, 42.7] },
        { id: 'liechtenstein', name: 'Liechtenstein', pbfUrl: `http://127.0.0.1:${port}/li.osm.pbf`, sizeBytes: PBF.length, bounds: [9.4, 47.0, 9.7, 47.3] },
      ]),
    );
    process.env.TILES_DIR = tilesDir;
    process.env.MAP_REGIONS_CATALOG_FILE = catalogPath;

    kommandos = [];
    app = Fastify({ logger: false });
    await app.register(regionsPlugin, {
      statfsImpl: async () => ({ bavail: 10_000_000, bsize: 4096 }),
      buildDeps: {
        spawnFn: (command, args) => {
          kommandos.push({ command, args });
          return endlos();
        },
        freeMemFn: () => 8 * 1024 ** 3,
        logger: () => undefined,
      },
    });
  }

  async function warteAufJob(jobId: string): Promise<{ status: string; error?: { code: string } | null }> {
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/jobs/${jobId}` });
      const job = (res.json() as { data: { status: string; error?: { code: string } | null } }).data;
      if (job.status === 'done' || job.status === 'error') return job;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Job wurde nicht fertig');
  }

  it('lädt nur den Extrakt ins Lager — gebaut wird nichts', async () => {
    await setUp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/map/regions/andorra/extrakt' });
    expect(res.statusCode).toBe(202);
    const job = await warteAufJob((res.json() as { job_id: string }).job_id);
    expect(job.status).toBe('done');

    expect(existsSync(join(lager, 'andorra.osm.pbf'))).toBe(true);
    expect(await istOsmPbf(join(lager, 'andorra.osm.pbf'))).toBe(true);
    expect(readdirSync(lager).some((n) => n.endsWith('.part'))).toBe(false);
    expect(kommandos).toEqual([]);
    expect(existsSync(join(tilesDir, 'andorra.pmtiles'))).toBe(false);

    const katalog = await app.inject({ method: 'GET', url: '/api/v1/map/regions/catalog' });
    const eintraege = (katalog.json() as { data: Array<{ id: string; extrakt?: boolean }> }).data;
    expect(eintraege.find((e) => e.id === 'andorra')?.extrakt).toBe(true);
    expect(eintraege.find((e) => e.id === 'liechtenstein')?.extrakt).toBe(false);
  });

  it('verwirft, was keine OSM-PBF ist, statt es ins Lager zu legen', async () => {
    // Der Routingbau sammelt JEDE *.osm.pbf ein; eine Fehlerseite unter
    // diesem Namen vergiftete alle Karten.
    await setUp({ antwort: Buffer.from('<html>Fehler</html>') });
    const res = await app.inject({ method: 'POST', url: '/api/v1/map/regions/andorra/extrakt' });
    const job = await warteAufJob((res.json() as { job_id: string }).job_id);
    expect(job.status).toBe('error');
    expect(job.error?.code).toBe('NOT_OSM_PBF');
    expect(existsSync(lager) ? readdirSync(lager) : []).toEqual([]);
  });

  it('ein zweites Herunterladen derselben Karte ist eine klare Absage', async () => {
    await setUp();
    mkdirSync(lager, { recursive: true });
    writeFileSync(join(lager, 'andorra.osm.pbf'), PBF);
    const res = await app.inject({ method: 'POST', url: '/api/v1/map/regions/andorra/extrakt' });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('ALREADY_DOWNLOADED');
  });

  it('der Gesamtbau baut die heruntergeladenen Karten mit — zuerst ihre Kacheln', async () => {
    await setUp();
    mkdirSync(lager, { recursive: true });
    writeFileSync(join(lager, 'andorra.osm.pbf'), PBF);
    writeFileSync(join(lager, 'liechtenstein.osm.pbf'), PBF);

    const res = await app.inject({ method: 'POST', url: '/api/v1/map/gesamtbau' });
    expect(res.statusCode).toBe(202);
    // Zwei Karten bauen, EINMAL Routing über beide, je Karte die Suche.
    expect((res.json() as { schritte: number }).schritte).toBe(5);
    expect(kommandos[0]).toEqual({
      command: '/usr/bin/yapaia-build-pmtiles',
      args: [expect.stringContaining('ad.osm.pbf'), 'andorra'],
    });
  });

  it('ohne installierte, aber mit heruntergeladener Karte ist der Gesamtbau kein Fehler mehr', async () => {
    await setUp();
    const ohne = await app.inject({ method: 'POST', url: '/api/v1/map/gesamtbau' });
    expect(ohne.statusCode).toBe(409);
    await app.close();

    await setUp();
    mkdirSync(lager, { recursive: true });
    writeFileSync(join(lager, 'andorra.osm.pbf'), PBF);
    const mit = await app.inject({ method: 'POST', url: '/api/v1/map/gesamtbau' });
    expect(mit.statusCode).toBe(202);
  });

  it('eine heruntergeladene Karte lässt sich vor dem Bau wieder verwerfen', async () => {
    await setUp();
    mkdirSync(lager, { recursive: true });
    writeFileSync(join(lager, 'andorra.osm.pbf'), PBF);
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/map/regions/andorra/extrakt' });
    expect(res.statusCode).toBe(204);
    expect(existsSync(join(lager, 'andorra.osm.pbf'))).toBe(false);
  });

  it('eine GEBAUTE Karte wird über „Löschen" entfernt, nicht hier', async () => {
    await setUp({ installiert: ['andorra'] });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/map/regions/andorra/extrakt' });
    expect(res.statusCode).toBe(409);
  });
});
