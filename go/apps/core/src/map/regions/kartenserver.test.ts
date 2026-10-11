/* eslint-disable no-undef -- `Buffer`/`setTimeout` sind Standard-Globale in Node 22. */
/**
 * Pakete vom Yapaia Kartenserver: Katalog, Laden mit Token und Pruefsumme,
 * Einwechseln des Routinggraphen -- mit echtem HTTP und echtem `tar`.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { JobRegistry } from './jobs.js';
import { eintragAus, erlaubterArchivpfad, graphEinwechseln, holeKatalog, runPaketJob, verbindungAus } from './kartenserver.js';
import { regionsPlugin } from './routes.js';

const TOKEN = 'go-token';
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

const ordner: string[] = [];
const server: Server[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  for (const s of server.splice(0)) await new Promise((r) => s.close(r));
  for (const d of ordner.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.TILES_DIR;
  delete process.env.MAP_REGIONS_CATALOG_FILE;
  delete process.env.LITE_SEARCH_DB_PATH;
  delete process.env.VALHALLA_TILES_DIR;
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'kartenserver-'));
  ordner.push(d);
  return d;
}

/** Ein Routing-Archiv wie vom Kartenserver: tiles/ + build-info.json. */
function routingTar(dir: string, inhalt = 'neu'): string {
  const quelle = join(dir, 'quelle');
  mkdirSync(join(quelle, 'tiles', 'valhalla_tiles', '2'), { recursive: true });
  writeFileSync(join(quelle, 'tiles', 'valhalla.json'), JSON.stringify({ inhalt }));
  writeFileSync(join(quelle, 'tiles', 'valhalla_tiles', '2', '000.gph'), inhalt);
  writeFileSync(join(quelle, 'build-info.json'), JSON.stringify({ region: inhalt }));
  const tar = join(dir, 'routing.tar');
  execFileSync('tar', ['-C', quelle, '-cf', tar, 'tiles', 'build-info.json']);
  return tar;
}

/** Ein nachgebauter Kartenserver: Katalog und Dateien, nur mit Token. */
async function kartenserver(dateien: Record<string, Buffer>, katalog: (basis: string) => unknown[]): Promise<string> {
  const s = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end();
      return;
    }
    const basis = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
    if (req.url === '/v1/katalog') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(katalog(basis)));
      return;
    }
    const name = (req.url ?? '').split('/').pop() ?? '';
    const daten = dateien[name];
    if (!daten) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Length': daten.length }).end(daten);
  });
  server.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`;
}

function paket(basis: string, karte: Buffer, suche: Buffer, routing: Buffer, falsch = false) {
  return {
    id: 'alpen',
    name: 'Alpen',
    url: `${basis}/v1/pakete/alpen/alpen.pmtiles`,
    sizeBytes: karte.length,
    sha256: falsch ? 'f'.repeat(64) : sha(karte),
    bounds: [9.4, 47.0, 9.7, 47.3],
    gebaut: '2026-10-11T19:20:40.536Z',
    suche: { url: `${basis}/v1/pakete/alpen/lite_search-alpen.db`, sizeBytes: suche.length, sha256: sha(suche) },
    routing: { url: `${basis}/v1/pakete/alpen/alpen-routing.tar`, sizeBytes: routing.length, sha256: sha(routing) },
  };
}

async function fertig(jobs: JobRegistry, id: string) {
  for (let i = 0; i < 200; i++) {
    const j = jobs.get(id);
    if (j && (j.status === 'done' || j.status === 'error')) return j;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Auftrag wurde nicht fertig');
}

describe('Katalog vom Kartenserver', () => {
  it('nimmt nur brauchbare Einträge und schreibt einen Hinweis', () => {
    const e = eintragAus({ id: 'alpen', name: 'Alpen', url: 'https://k/a.pmtiles', sizeBytes: 5, bounds: [1, 2, 3, 4], gebaut: '2026-10-11T00:00:00Z', routing: { url: 'https://k/r.tar', sizeBytes: 9 } });
    expect(e?.quelle).toBe('kartenserver');
    expect(e?.note).toMatch(/Karte, Routing/);
    expect(e?.note).toMatch(/ersetzt den bisherigen Graphen/);
    expect(eintragAus({ id: '../x', name: 'X', url: 'https://k/a', bounds: [1, 2, 3, 4] })).toBeNull();
    expect(eintragAus({ id: 'x', name: 'X', bounds: [1, 2, 3, 4] })).toBeNull();
    expect(eintragAus({ id: 'x', name: 'X', url: 'https://k/a', bounds: [1, 2, 3] })).toBeNull();
  });

  it('Verbindung, Token und Fehler in Nutzersprache', async () => {
    expect(verbindungAus({ url: ' https://karten.example.org/ ', token: ' t ' })).toEqual({ url: 'https://karten.example.org', token: 't' });
    expect(verbindungAus({ url: 'karten.example.org' })).toBeNull();
    expect(verbindungAus(null)).toBeNull();
    const basis = await kartenserver({}, () => [{ id: 'a', name: 'A', url: 'http://x/a.pmtiles', sizeBytes: 1, bounds: [0, 0, 1, 1] }, { kaputt: true }]);
    expect((await holeKatalog({ url: basis, token: TOKEN })).map((e) => e.id)).toEqual(['a']);
    await expect(holeKatalog({ url: basis, token: 'falsch' })).rejects.toThrow(/Token abgelehnt/);
    await expect(holeKatalog({ url: 'http://127.0.0.1:1', token: TOKEN })).rejects.toThrow(/nicht erreichbar/);
  });

  it('entpackt nur tiles/ und build-info.json', () => {
    expect(erlaubterArchivpfad('tiles/valhalla.json')).toBe(true);
    expect(erlaubterArchivpfad('build-info.json')).toBe(true);
    expect(erlaubterArchivpfad('../etc/passwd')).toBe(false);
    expect(erlaubterArchivpfad('/etc/passwd')).toBe(false);
    expect(erlaubterArchivpfad('tiles/../../x')).toBe(false);
    expect(erlaubterArchivpfad('anderes/x')).toBe(false);
  });
});

describe('Paket laden und installieren', () => {
  function ziele() {
    const d = tmp();
    const z = { tilesDir: join(d, 'tiles'), liteDir: join(d, 'lite-search'), graphDir: join(d, 'valhalla', 'tiles') };
    mkdirSync(z.graphDir, { recursive: true });
    writeFileSync(join(z.graphDir, 'valhalla.json'), JSON.stringify({ inhalt: 'alt' }));
    return { d, z };
  }

  it('lädt Karte, Suche und Routing, prüft und wechselt den Graphen ein', async () => {
    const { d, z } = ziele();
    const karte = Buffer.from('PMTiles-Karte');
    const suche = Buffer.from('SQLite format 3 ...');
    const routing = readFileSync(routingTar(d));
    const basis = await kartenserver({ 'alpen.pmtiles': karte, 'lite_search-alpen.db': suche, 'alpen-routing.tar': routing }, () => []);
    const eintrag = eintragAus(paket(basis, karte, suche, routing))!;
    const jobs = new JobRegistry();
    const id = jobs.create('kartenserver');
    await runPaketJob(id, jobs, eintrag, z, TOKEN);
    const j = await fertig(jobs, id);
    expect(j.status, JSON.stringify(j.error)).toBe('done');
    expect(j.progress).toBe(1);
    expect(readFileSync(join(z.tilesDir, 'alpen.pmtiles'), 'utf-8')).toBe('PMTiles-Karte');
    expect(readFileSync(join(z.liteDir, 'lite_search-alpen.db'), 'utf-8')).toBe('SQLite format 3 ...');
    expect(JSON.parse(readFileSync(join(z.graphDir, 'valhalla.json'), 'utf-8'))).toEqual({ inhalt: 'neu' });
    expect(existsSync(join(z.graphDir, 'valhalla_tiles', '2', '000.gph'))).toBe(true);
    expect(JSON.parse(readFileSync(join(d, 'valhalla', 'build-info.json'), 'utf-8'))).toEqual({ region: 'neu' });
    expect(existsSync(join(d, 'valhalla', 'alpen-routing.tar.part'))).toBe(false);
  });

  it('falsche Prüfsumme: nichts wird angefasst', async () => {
    const { d, z } = ziele();
    const karte = Buffer.from('PMTiles-Karte');
    const suche = Buffer.from('db');
    const routing = readFileSync(routingTar(d));
    const basis = await kartenserver({ 'alpen.pmtiles': karte, 'lite_search-alpen.db': suche, 'alpen-routing.tar': routing }, () => []);
    const jobs = new JobRegistry();
    const id = jobs.create('kartenserver');
    await runPaketJob(id, jobs, eintragAus(paket(basis, karte, suche, routing, true))!, z, TOKEN);
    const j = await fertig(jobs, id);
    expect(j.status).toBe('error');
    expect(j.error?.code).toBe('HASH_MISMATCH');
    expect(existsSync(join(z.tilesDir, 'alpen.pmtiles'))).toBe(false);
    expect(JSON.parse(readFileSync(join(z.graphDir, 'valhalla.json'), 'utf-8'))).toEqual({ inhalt: 'alt' });
  });

  it('ein Archiv mit fremden Pfaden wird abgelehnt, der alte Graph bleibt', async () => {
    const { d, z } = ziele();
    const boese = join(d, 'boese');
    mkdirSync(join(boese, 'etc'), { recursive: true });
    writeFileSync(join(boese, 'etc', 'x'), 'x');
    const tar = join(d, 'boese.tar');
    execFileSync('tar', ['-C', boese, '-cf', tar, 'etc']);
    await expect(graphEinwechseln(tar, z.graphDir)).rejects.toThrow(/Unerwartetes/);
    expect(JSON.parse(readFileSync(join(z.graphDir, 'valhalla.json'), 'utf-8'))).toEqual({ inhalt: 'alt' });
  });
});

describe('Routen', () => {
  async function aufbau(verbindung: unknown) {
    const d = tmp();
    const katalog = join(d, 'catalog.json');
    writeFileSync(katalog, JSON.stringify([
      { id: 'alpen', name: 'Alpen (eingebaut)', pbfUrl: 'https://x/alpen.osm.pbf', sizeBytes: 1, bounds: [0, 0, 1, 1] },
      { id: 'andorra', name: 'Andorra', pbfUrl: 'https://x/andorra.osm.pbf', sizeBytes: 1, bounds: [0, 0, 1, 1] },
    ]));
    process.env.TILES_DIR = join(d, 'tiles');
    process.env.MAP_REGIONS_CATALOG_FILE = katalog;
    process.env.LITE_SEARCH_DB_PATH = join(d, 'lite-search', 'lite_search.db');
    process.env.VALHALLA_TILES_DIR = join(d, 'valhalla', 'tiles');
    mkdirSync(process.env.TILES_DIR, { recursive: true });
    const speicher: Record<string, unknown> = { kartenserver: verbindung };
    const app = Fastify({ logger: false });
    apps.push(app);
    await app.register(regionsPlugin, {
      einstellungen: { get: (k: string) => speicher[k], patch: (v: Record<string, unknown>) => Object.assign(speicher, v) },
      statfsImpl: async () => ({ bavail: 10_000_000, bsize: 4096 }),
    });
    return { app, speicher, d };
  }

  it('Pakete erscheinen im Katalog und ersetzen gleichnamige; Fehler wird gemeldet', async () => {
    const karte = Buffer.from('k');
    const basis = await kartenserver({}, (b) => [paket(b, karte, Buffer.from('s'), Buffer.from('r'))]);
    const { app } = await aufbau({ url: basis, token: TOKEN });
    const r = (await app.inject({ method: 'GET', url: '/api/v1/map/regions/catalog' })).json();
    expect(r.kartenserver).toEqual({ eingerichtet: true, pakete: 1 });
    expect(r.data.map((e: { id: string }) => e.id)).toEqual(['alpen', 'andorra']);
    expect(r.data[0]).toMatchObject({ name: 'Alpen', quelle: 'kartenserver', installed: false });

    const { app: ohne } = await aufbau({ url: basis, token: 'falsch' });
    const r2 = (await ohne.inject({ method: 'GET', url: '/api/v1/map/regions/catalog' })).json();
    expect(r2.kartenserver.fehler).toMatch(/Token/);
    expect(r2.data.map((e: { id: string }) => e.id)).toEqual(['alpen', 'andorra']);
  });

  it('einrichten prüft die Verbindung, gibt das Token nie zurück, behält es bei leerem Feld', async () => {
    const basis = await kartenserver({}, () => []);
    const { app, speicher } = await aufbau(null);
    expect((await app.inject({ method: 'GET', url: '/api/v1/kartenserver' })).json().data).toEqual({ url: '', token_gesetzt: false });
    const falsch = await app.inject({ method: 'PUT', url: '/api/v1/kartenserver', payload: { url: basis, token: 'nein' } });
    expect(falsch.statusCode).toBe(400);
    expect(falsch.json().error.message).toMatch(/Token/);
    const ok = await app.inject({ method: 'PUT', url: '/api/v1/kartenserver', payload: { url: `${basis}/`, token: TOKEN } });
    expect(ok.json().data).toEqual({ url: basis, token_gesetzt: true, pakete: 0 });
    expect(JSON.stringify((await app.inject({ method: 'GET', url: '/api/v1/kartenserver' })).json())).not.toContain(TOKEN);
    await app.inject({ method: 'PUT', url: '/api/v1/kartenserver', payload: { url: basis, token: '' } });
    expect(speicher.kartenserver).toEqual({ url: basis, token: TOKEN });
    await app.inject({ method: 'PUT', url: '/api/v1/kartenserver', payload: { url: '' } });
    expect(speicher.kartenserver).toBeNull();
  });

  it('Herunterladen startet den Paket-Auftrag -- auch für ein schon installiertes Paket', async () => {
    const karte = Buffer.from('k');
    const basis = await kartenserver({ 'alpen.pmtiles': karte }, (b) => [{ ...paket(b, karte, Buffer.from(''), Buffer.from('')), suche: undefined, routing: undefined }]);
    const { app } = await aufbau({ url: basis, token: TOKEN });
    writeFileSync(join(process.env.TILES_DIR!, 'alpen.pmtiles'), 'alt');
    const r = await app.inject({ method: 'POST', url: '/api/v1/map/regions', payload: { region_id: 'alpen' } });
    expect(r.statusCode).toBe(202);
    const jobId = r.json().job_id;
    for (let i = 0; i < 100; i++) {
      const s = (await app.inject({ method: 'GET', url: `/api/v1/jobs/${jobId}` })).json().data.status;
      if (s === 'done' || s === 'error') break;
      await new Promise((res) => setTimeout(res, 20));
    }
    expect(readFileSync(join(process.env.TILES_DIR!, 'alpen.pmtiles'), 'utf-8')).toBe('k');
  });
});
