/**
 * POST /api/v1/perf/client -- eine Karte meldet ihre Bildrate.
 *
 * Die Karte misst ihre Bildrate ohnehin (Leistungswächter, `web/src/perf`).
 * Damit man auch auf einem Gerät ohne Entwicklerwerkzeuge (Autoradio) sieht,
 * wie flüssig sie läuft, schickt sie alle paar Sekunden eine kurze Meldung.
 * Der Kern legt sie unverändert auf das Bus-Thema `perf/client`, wo jeder
 * WS-Abonnent sie mitschreiben kann. Gespeichert wird nichts.
 */
import type { FastifyInstance } from 'fastify';

export interface ClientPerfMeldung {
  geraet: string;
  fps: number | null;
  stufe: number;
  bewegt: boolean;
  ua: string;
}

const zahl = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;

/** Prüft und kürzt eine Meldung; `null` bei unbrauchbarem Inhalt. */
export function pruefeMeldung(body: unknown): ClientPerfMeldung | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const stufe = zahl(b.stufe);
  if (stufe === null || stufe < 0 || stufe > 3) return null;
  const fps = zahl(b.fps);
  return {
    geraet: typeof b.geraet === 'string' ? b.geraet.slice(0, 40) : '',
    fps: fps !== null && fps >= 0 && fps < 1000 ? fps : null,
    stufe,
    bewegt: b.bewegt === true,
    ua: typeof b.ua === 'string' ? b.ua.slice(0, 200) : '',
  };
}

export function registriereClientPerf(
  fastify: FastifyInstance,
  sende: (meldung: ClientPerfMeldung) => void,
): void {
  fastify.post<{ Body: unknown }>('/api/v1/perf/client', async (request, reply) => {
    const meldung = pruefeMeldung(request.body);
    if (!meldung) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: '"stufe" (0–3) fehlt' } });
    }
    sende(meldung);
    return reply.code(204).send();
  });
}
