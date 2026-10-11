/**
 * Das Yapaia-Protokoll -- am ECHTEN Server (`buildServer()`), mit echtem
 * WebSocket. Die Integration in Home Assistant spricht genau diese Wege.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { buildServer } from '../index.js';
import { closeDb } from '../db/index.js';
import { EventBus } from '../bus/index.js';
import { ladeIdentitaet, tokenPasst, YapaiaProtokoll } from './protokoll.js';

describe('Identitaet', () => {
  it('wird einmal erzeugt und danach wiedergelesen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yapaia-'));
    try {
      const a = ladeIdentitaet(join(dir, 'x', 'yapaia.json'));
      const b = ladeIdentitaet(join(dir, 'x', 'yapaia.json'));
      expect(b).toEqual(a);
      expect(a.instanz).toMatch(/^[0-9a-f]{12}$/);
      expect(a.token.length).toBeGreaterThanOrEqual(40);
      expect(JSON.parse(readFileSync(join(dir, 'x', 'yapaia.json'), 'utf-8'))).toEqual(a);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prueft das Token genau', () => {
    expect(tokenPasst('abc', 'Bearer abc')).toBe(true);
    expect(tokenPasst('abc', 'Bearer abd')).toBe(false);
    expect(tokenPasst('abc', 'Bearer ab')).toBe(false);
    expect(tokenPasst('abc', 'abc')).toBe(false);
    expect(tokenPasst('abc', undefined)).toBe(false);
  });
});

describe('Live-Zustand und Ereignisse', () => {
  function aufbauen() {
    const bus = new EventBus();
    const gesendet: unknown[] = [];
    let takt: () => void = () => {};
    const p = new YapaiaProtokoll({
      ident: { instanz: 'a1', token: 't' },
      version: '1',
      bus,
      zusatz: () => ({ profile: ['Wohnmobil'], profil: 'Wohnmobil' }),
      aktionen: {},
      logger: { info: () => {}, warn: () => {} },
      setIntervalImpl: (fn) => {
        takt = fn;
        return 1;
      },
      clearIntervalImpl: () => {},
    });
    return { bus, p, gesendet, takt: () => takt() };
  }

  it('erst alles, dann nur Aenderungen; ohne Verbindung nichts', () => {
    const { bus, p, gesendet, takt } = aufbauen();
    expect(p.verbunden()).toBe(false);
    const trennen = p.verbinde((n) => gesendet.push(n));
    expect(p.verbunden()).toBe(true);
    expect(gesendet[0]).toMatchObject({ typ: 'zustand', werte: { profil: 'Wohnmobil', zustand: 'idle', restweg: null } });

    takt();
    expect(gesendet).toHaveLength(1);

    bus.publish('pos/update', { lat: 52, lon: 11, alt: null, speed: 10, heading: null, accuracy: null, source: 'gpsd', fix: '3d', ts: '2026-10-11T10:00:00Z' });
    takt();
    expect(gesendet[1]).toEqual({
      typ: 'zustand',
      werte: { tempo: 36, standort: { breite: 52, laenge: 11, genauigkeit: 0 } },
    });

    trennen();
    expect(p.verbunden()).toBe(false);
    p.dispose();
  });

  it('meldet Ziel erreicht, GPS verloren und zu schnell (nur beim Wechsel)', () => {
    const { bus, p, gesendet } = aufbauen();
    p.verbinde((n) => gesendet.push(n));
    bus.publish('event/arrived', { route_id: 'r', destination: { latlng: { lat: 1, lon: 2 }, name: 'Magdeburg' }, ts: 'x' });
    bus.publish('event/gps_lost', { lastSource: 'gpsd' });
    expect(gesendet.slice(1)).toEqual([
      { typ: 'ereignis', name: 'ziel_erreicht', daten: { ziel: 'Magdeburg' } },
      { typ: 'ereignis', name: 'gps_verloren', daten: {} },
    ]);
    p.dispose();
  });
});

describe('Wege unter /yapaia/v1 am echten Server', () => {
  let server: FastifyInstance;
  let dir: string;
  let token: string;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    dir = mkdtempSync(join(tmpdir(), 'yapaia-'));
    process.env.YAPAIA_IDENTITAET = join(dir, 'yapaia.json');
    server = await buildServer();
    token = (JSON.parse(readFileSync(process.env.YAPAIA_IDENTITAET, 'utf-8')) as { token: string }).token;
  });

  afterEach(async () => {
    await server?.close();
    closeDb();
    delete process.env.YAPAIA_IDENTITAET;
    rmSync(dir, { recursive: true, force: true });
  });

  const mit = () => ({ authorization: `Bearer ${token}` });

  it('ohne Token: 401, auch im Ingress-Betrieb', async () => {
    for (const url of ['/yapaia/v1/beschreibung', '/yapaia/v1/live']) {
      const r = await server.inject({ method: 'GET', url });
      expect(r.statusCode, url).toBe(401);
    }
    const r = await server.inject({ method: 'POST', url: '/yapaia/v1/aktion/navigation_beenden', payload: {} });
    expect(r.statusCode).toBe(401);
  });

  it('liefert die Beschreibung', async () => {
    const r = await server.inject({ method: 'GET', url: '/yapaia/v1/beschreibung', headers: mit() });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b).toMatchObject({ protokoll: 1, modul: 'go', name: 'Yapaia Go', faehigkeiten: ['navigation'] });
    expect(b.entitaeten.map((e: { schluessel: string }) => e.schluessel)).toContain('ankunft');
  });

  it('fuehrt Aktionen aus und nennt Fehler in Nutzersprache', async () => {
    const unbekannt = await server.inject({ method: 'POST', url: '/yapaia/v1/aktion/gibtsnicht', headers: mit(), payload: {} });
    expect(unbekannt.statusCode).toBe(404);
    expect(unbekannt.json()).toEqual({ ok: false, fehler: 'Unbekannte Aktion gibtsnicht' });

    const pause = await server.inject({ method: 'POST', url: '/yapaia/v1/aktion/navigation_pausieren', headers: mit(), payload: {} });
    expect(pause.statusCode).toBe(409);
    expect(pause.json().fehler).toBe('Das geht im aktuellen Navigationszustand nicht.');

    const leer = await server.inject({ method: 'POST', url: '/yapaia/v1/aktion/ziel_setzen', headers: mit(), payload: {} });
    expect(leer.statusCode).toBe(400);
    expect(leer.json().fehler).toMatch(/Ziel angeben/);

    const profil = await server.inject({ method: 'POST', url: '/yapaia/v1/aktion/profil_waehlen', headers: mit(), payload: { wert: 'Gibt es nicht' } });
    expect(profil.statusCode).toBe(404);
  });

  it('nimmt die Partnerliste an', async () => {
    const r = await server.inject({
      method: 'POST',
      url: '/yapaia/v1/partner',
      headers: mit(),
      payload: { partner: [{ modul: 'beat', instanz: 'b1', faehigkeiten: ['ansage.einmischen'] }] },
    });
    expect(r.json()).toEqual({ ok: true });
    const kaputt = await server.inject({ method: 'POST', url: '/yapaia/v1/partner', headers: mit(), payload: {} });
    expect(kaputt.statusCode).toBe(400);
  });

  it('Live: vollstaendiger Zustand direkt nach dem Verbinden', async () => {
    await server.listen({ port: 0, host: '127.0.0.1' });
    const port = (server.server.address() as { port: number }).port;
    const nachricht = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/yapaia/v1/live`, { headers: mit() });
      ws.once('message', (d) => {
        resolve(JSON.parse(String(d)));
        ws.close();
      });
      ws.once('error', reject);
    });
    expect(nachricht.typ).toBe('zustand');
    expect(nachricht.werte).toMatchObject({ zustand: 'idle', ankunft: null });

    const abgelehnt = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/yapaia/v1/live`);
      ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.once('open', () => resolve(101));
    });
    expect(abgelehnt).toBe(401);
  });
});

vi.setConfig({ testTimeout: 20_000 });
