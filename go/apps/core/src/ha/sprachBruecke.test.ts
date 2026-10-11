import { describe, expect, it } from 'vitest';
import { AUTOMATION_ID, SAETZE, automationKonfig, sprachsteuerungEinrichten, type SprachBrueckeDeps } from './sprachBruecke.js';

const V = { apiBase: 'http://supervisor/core/api', token: 't' };

function deps(extra: Partial<SprachBrueckeDeps> = {}): SprachBrueckeDeps {
  return {
    verbindung: () => V,
    integrationVerbunden: () => true,
    logger: { info: () => {}, warn: () => {} },
    ...extra,
  };
}

describe('Sprachsteuerung über Home Assistant Assist', () => {
  it('die Automation hört auf „Yapaia …", ruft yapaia.go_befehl und spricht die Antwort', () => {
    const a = automationKonfig() as { triggers: Array<{ trigger: string; command: string[] }>; actions: Array<Record<string, unknown>> };
    expect(a.triggers[0]!.trigger).toBe('conversation');
    expect(a.triggers[0]!.command).toEqual(SAETZE);
    expect(SAETZE).toContain('Yapaia {befehl}');
    expect(new Set(SAETZE).size).toBe(SAETZE.length);
    expect(a.actions[0]).toMatchObject({ action: 'yapaia.go_befehl', data: { text: '{{ trigger.sentence }}' }, response_variable: 'yapaia' });
    expect(String(a.actions[1]!.set_conversation_response)).toContain('.antwort');
  });

  it('einrichten legt die Automation über die Konfigurations-Schnittstelle an', async () => {
    const aufrufe: string[] = [];
    const r = await sprachsteuerungEinrichten(
      deps({
        fetch: (async (url: string) => {
          aufrufe.push(url);
          return { ok: true, status: 200 };
        }) as never,
      }),
    );
    expect(r).toEqual({ integration: true, automation: true });
    expect(aufrufe).toEqual([`http://supervisor/core/api/config/automation/config/${AUTOMATION_ID}`]);
  });

  it('sagt, wenn die Integration fehlt oder Home Assistant ablehnt', async () => {
    const ohne = await sprachsteuerungEinrichten(
      deps({ integrationVerbunden: () => false, fetch: (async () => ({ ok: true, status: 200 })) as never }),
    );
    expect(ohne).toMatchObject({ integration: false, automation: true });
    expect(ohne.hinweis).toMatch(/go_befehl/);

    const abgelehnt = await sprachsteuerungEinrichten(deps({ fetch: (async () => ({ ok: false, status: 403 })) as never }));
    expect(abgelehnt.automation).toBe(false);
    expect(abgelehnt.hinweis).toMatch(/nicht, Automationen anzulegen/);

    const offline = await sprachsteuerungEinrichten(deps({ verbindung: () => null }));
    expect(offline).toMatchObject({ automation: false, hinweis: expect.stringMatching(/nur im Add-on/) });
  });
});
