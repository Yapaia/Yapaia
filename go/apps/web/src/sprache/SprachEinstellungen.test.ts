/**
 * Die Texte der Lautsprecher-Auswahl für Ansagen.
 */
import { describe, it, expect } from 'vitest';
import { lautsprecherName, maText, wegText } from './SprachEinstellungen';

describe('lautsprecherName', () => {
  it('nennt bei Music Assistant die Herkunft', () => {
    expect(lautsprecherName({ id: 'media_player.ma_bus', name: 'Bus', art: 'ma', ansage: true })).toBe('Bus (Music Assistant)');
  });

  it('ein Lautsprecher aus Home Assistant, der Ansagen einblendet, heißt einfach so', () => {
    expect(lautsprecherName({ id: 'media_player.yapaia_satellite', name: 'Yapaia Satellite', art: 'ha', ansage: true })).toBe(
      'Yapaia Satellite',
    );
  });

  it('sagt dazu, wenn eine Ansage die Wiedergabe unterbricht', () => {
    expect(lautsprecherName({ id: 'media_player.tv', name: 'TV', art: 'ha', ansage: false })).toBe('TV (unterbricht die Wiedergabe)');
  });

  it('ohne Angabe (Kern vor 0.47.0) ist es ein Player von Music Assistant', () => {
    expect(lautsprecherName({ id: 'media_player.ma_bus', name: 'Bus' })).toBe('Bus (Music Assistant)');
  });
});

describe('maText', () => {
  it('zählt nur die Player von Music Assistant', () => {
    const satellit = { id: 'media_player.yapaia_satellite', name: 'Yapaia Satellite', art: 'ha' as const, ansage: true };
    expect(maText({ verfuegbar: true, lautsprecher: [satellit], musicAssistant: false } as never)).toMatch(/nicht als Integration eingerichtet/);
    expect(
      maText({ verfuegbar: true, lautsprecher: [satellit, { id: 'media_player.ma_bus', name: 'Bus', art: 'ma' as const, ansage: true }] } as never),
    ).toBe('Music Assistant: ein Player gefunden.');
  });
});

describe('wegText', () => {
  it('nennt den gewählten Lautsprecher, ohne Music Assistant zu behaupten', () => {
    expect(wegText({ art: 'lautsprecher', ziel: 'Yapaia Satellite' })).toBe('An den Lautsprecher „Yapaia Satellite“ – ohne Verzögerung.');
  });
});
