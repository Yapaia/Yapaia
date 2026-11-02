import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { pruefeMeldung, registriereClientPerf, type ClientPerfMeldung } from './clientPerf.js';

describe('clientPerf', () => {
  it('prüft und rundet eine Meldung', () => {
    expect(pruefeMeldung({ geraet: 'radio', fps: 23.456, stufe: 1, modus: 'leicht', bewegt: true, ua: 'x' })).toEqual({
      geraet: 'radio', fps: 23.5, stufe: 1, modus: 'leicht', bewegt: true, ua: 'x',
    });
    expect(pruefeMeldung({ stufe: 0, fps: 'viel' })?.fps).toBeNull();
    expect(pruefeMeldung({ stufe: 0, modus: 'quatsch' })?.modus).toBe('');
    expect(pruefeMeldung({ stufe: 0 })?.modus).toBe('');
    expect(pruefeMeldung({ stufe: 7 })).toBeNull();
    expect(pruefeMeldung(null)).toBeNull();
  });

  it('legt gültige Meldungen auf den Bus, lehnt ungültige ab', async () => {
    const app = Fastify();
    const gesendet: ClientPerfMeldung[] = [];
    registriereClientPerf(app, (m) => gesendet.push(m));
    const ok = await app.inject({ method: 'POST', url: '/api/v1/perf/client', payload: { fps: 30, stufe: 0 } });
    expect(ok.statusCode).toBe(204);
    const schlecht = await app.inject({ method: 'POST', url: '/api/v1/perf/client', payload: { fps: 30 } });
    expect(schlecht.statusCode).toBe(400);
    expect(gesendet).toHaveLength(1);
    expect(gesendet[0].fps).toBe(30);
    await app.close();
  });
});
