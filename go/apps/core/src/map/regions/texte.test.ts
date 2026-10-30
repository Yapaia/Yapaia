import { afterEach, describe, expect, it } from 'vitest';
import { setzeSprachQuelle } from '../../i18n.js';
import { dauerText, restText } from './bauzeit.js';
import { fertigText } from './gesamtbau.js';
import { formatDownloadNote, GRAPH_BUILD, ABBRUCH_MELDUNG } from './build.js';

describe('Kartenbau-Texte folgen der Sprache', () => {
  afterEach(() => setzeSprachQuelle(() => null));

  it('Deutsch ist der Standard', () => {
    expect(dauerText(3 * 3600 + 900)).toBe('3 Std. 15 Min.');
    expect(GRAPH_BUILD.humanName).toBe('Der Bau des Routinggraphen');
  });

  it('Englisch für Dauer, Restzeit, Notizen und Abbruch', () => {
    setzeSprachQuelle(() => 'en');
    expect(dauerText(3 * 3600 + 900)).toBe('3 h 15 min');
    expect(restText({ sekunden: 600, grund: 'geschaetzt' })).toBe('about 10 min left');
    expect(fertigText([{ bauart: 'routing', region: 'a' }], ['a'])).toBe('Built: routing.');
    expect(GRAPH_BUILD.doneNote).toContain('Routing graph');
    expect(ABBRUCH_MELDUNG.message).toContain('cancelled');
    expect(
      formatDownloadNote({ received: '1M', total: '2M', percent: 50, timeLeft: '0:01:00' } as never)
    ).toBe('Downloading map data: 1 MB of 2 MB (50 %), about 1 min left');
  });
});
