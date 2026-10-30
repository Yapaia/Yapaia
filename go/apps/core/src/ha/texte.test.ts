import { afterEach, describe, expect, it } from 'vitest';
import { setzeSprachQuelle } from '../i18n.js';
import { sprachsteuerungEinrichten } from './sprachBruecke.js';

describe('HA-Meldungen folgen der Sprache', () => {
  afterEach(() => setzeSprachQuelle(() => null));

  const deps = {
    verbindung: () => null,
    integrationVerbunden: () => false,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  } as never;

  it('Deutsch ohne Einstellung, Englisch mit', async () => {
    expect((await sprachsteuerungEinrichten(deps)).hinweis).toContain('Keine Verbindung');
    setzeSprachQuelle(() => 'en');
    expect((await sprachsteuerungEinrichten(deps)).hinweis).toContain('No connection');
  });
});
