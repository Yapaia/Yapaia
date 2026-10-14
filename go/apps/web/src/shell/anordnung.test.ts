import { beforeEach, describe, expect, it } from 'vitest';
import { ANORDNUNG_SCHLUESSEL, anordnungNeuLesen, useAnordnungStore } from './anordnung.js';

const speicher = new Map<string, string>();

beforeEach(() => {
  speicher.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => void speicher.set(k, v),
  };
});

describe('anordnungNeuLesen', () => {
  it('übernimmt, was ein anderes Fenster gespeichert hat', () => {
    // Die eingebettete Karte im Dashboard und Yapaia Go teilen sich den
    // Speicher; verschiebt man die Position in Go, liest die Einbettung neu.
    speicher.set(
      ANORDNUNG_SCHLUESSEL,
      JSON.stringify({ ruhe: {}, fahrt: { kartenposition: { dx: 0.7, dy: 0.6, s: 1 } } })
    );
    anordnungNeuLesen();
    expect(useAnordnungStore.getState().werte.fahrt.kartenposition).toEqual({
      dx: 0.7,
      dy: 0.6,
      s: 1,
    });
  });

  it('ein kaputter Eintrag fällt auf den Standard zurück', () => {
    speicher.set(ANORDNUNG_SCHLUESSEL, '{kaputt');
    anordnungNeuLesen();
    expect(useAnordnungStore.getState().werte).toEqual({ ruhe: {}, fahrt: {} });
  });
});
