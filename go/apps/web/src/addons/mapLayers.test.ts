import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Kleine Karte: kennt Quellen/Ebenen und kann „Stil laedt noch" spielen. */
class FakeMap {
  stilFertig = true;
  sources = new Set<string>();
  layers = new Set<string>();
  private handler: Array<() => void> = [];
  private pruefen(): void {
    if (!this.stilFertig) throw new Error('Style is not done loading.');
  }
  addSource(id: string): void {
    this.pruefen();
    this.sources.add(id);
  }
  addLayer(l: { id: string }): void {
    this.pruefen();
    this.layers.add(l.id);
  }
  removeLayer(id: string): void {
    this.pruefen();
    this.layers.delete(id);
  }
  removeSource(id: string): void {
    this.pruefen();
    this.sources.delete(id);
  }
  getLayer(id: string): boolean {
    return this.layers.has(id);
  }
  getSource(id: string): boolean {
    return this.sources.has(id);
  }
  once(ev: string, fn: () => void): void {
    if (ev === 'style.load') this.handler.push(fn);
  }
  stilGeladen(): void {
    this.stilFertig = true;
    const h = this.handler;
    this.handler = [];
    h.forEach((f) => f());
  }
}

let karte: FakeMap;
vi.mock('../state/mapStore.js', () => ({ mapController: { getMap: () => karte } }));

const { AddonMapLayers } = await import('./mapLayers.js');
const ID = 'addon:rec:spur';
const daten = { type: 'FeatureCollection', features: [] };

describe('Add-on-Ebenen, waehrend der Stil laedt', () => {
  beforeEach(() => {
    karte = new FakeMap();
  });

  it('wirft nicht ins Add-on zurueck, sondern setzt die Ebene nach style.load', () => {
    const ebenen = new AddonMapLayers();
    karte.stilFertig = false;
    expect(() => ebenen.addLayer('rec', { id: 'spur', data: daten } as never)).not.toThrow();
    expect(karte.layers.has(ID)).toBe(false);
    karte.stilGeladen();
    expect(karte.layers.has(ID)).toBe(true);
  });

  it('eine inzwischen entfernte Ebene kommt nach style.load nicht zurueck', () => {
    const ebenen = new AddonMapLayers();
    karte.stilFertig = false;
    ebenen.addLayer('rec', { id: 'spur', data: daten } as never);
    expect(() => ebenen.removeLayer('rec', 'spur')).not.toThrow();
    karte.stilGeladen();
    expect(karte.layers.has(ID)).toBe(false);
  });

  it('andere Fehler bleiben Fehler', () => {
    const ebenen = new AddonMapLayers();
    karte.addSource = () => {
      throw new Error('There is already a source with this ID');
    };
    expect(() => ebenen.addLayer('rec', { id: 'spur', data: daten } as never)).toThrow('already a source');
  });

  it('bei fertigem Stil sofort, wie bisher', () => {
    const ebenen = new AddonMapLayers();
    ebenen.addMarkers('rec', { id: 'pins', markers: [{ lat: 49, lng: 8 }] } as never);
    expect(karte.layers.has('addon:rec:pins')).toBe(true);
  });
});
