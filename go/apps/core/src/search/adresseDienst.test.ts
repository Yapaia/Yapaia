import { describe, it, expect, vi } from 'vitest';
import { AdressDienst, MIN_ABSTAND_MS, zuAdresse, type AdressQuelle } from './adresseDienst.js';

const treffer = {
  strasse: 'Obere Heide',
  hausnummer: '4',
  plz: '67368',
  ort: 'Westheim (Pfalz)',
  entfernungM: 3,
  region: 'germany',
};

function dienst(quelle: Partial<AdressQuelle> = {}) {
  let zeit = 1_000_000;
  const q: AdressQuelle = { adresseBei: vi.fn(() => treffer), ohneGeoIndex: () => [], ...quelle };
  const d = new AdressDienst({
    quelle: q,
    indexAnlegen: vi.fn(async () => ({ ok: true })),
    logger: { info: () => {}, warn: () => {} },
    jetzt: () => zeit,
  });
  return { d, q, weiter: (ms: number) => (zeit += ms) };
}

describe('zuAdresse', () => {
  it('baut den Sensortext und das Land', () => {
    expect(zuAdresse(treffer)).toMatchObject({
      text: 'Obere Heide 4, 67368 Westheim (Pfalz)',
      ort: 'Westheim (Pfalz)',
      land: 'Deutschland',
      land_code: 'DE',
    });
    expect(zuAdresse({ ...treffer, strasse: null, hausnummer: null, plz: null, region: 'rheinland-pfalz' })).toMatchObject({
      text: 'Westheim (Pfalz)',
      land_code: 'DE',
    });
    expect(zuAdresse({ ...treffer, region: null }).land).toBeNull();
  });
});

describe('AdressDienst', () => {
  it('fragt erst nach merklicher Bewegung und nicht öfter als alle 15 s', () => {
    const { d, q, weiter } = dienst();
    d.melde({ lat: 49.2397, lon: 8.3207 });
    expect(d.aktuell()?.text).toBe('Obere Heide 4, 67368 Westheim (Pfalz)');
    expect(q.adresseBei).toHaveBeenCalledTimes(1);
    // 30 m weiter, lange danach: zu wenig Weg
    weiter(MIN_ABSTAND_MS * 2);
    d.melde({ lat: 49.23997, lon: 8.3207 });
    expect(q.adresseBei).toHaveBeenCalledTimes(1);
    // 500 m weiter, aber zu früh
    d.melde({ lat: 49.2442, lon: 8.3207 });
    weiter(1000);
    d.melde({ lat: 49.2442, lon: 8.3207 });
    expect(q.adresseBei).toHaveBeenCalledTimes(2);
    weiter(1000);
    d.melde({ lat: 49.2490, lon: 8.3207 });
    expect(q.adresseBei).toHaveBeenCalledTimes(2);
  });

  it('ohne tauglichen Index: alter Stand bleibt, nächste Position fragt wieder', () => {
    const adresseBei = vi.fn().mockReturnValueOnce(treffer).mockReturnValue(null);
    const { d, weiter } = dienst({ adresseBei });
    d.melde({ lat: 49.2397, lon: 8.3207 });
    weiter(MIN_ABSTAND_MS);
    d.melde({ lat: 49.25, lon: 8.3207 });
    expect(d.aktuell()?.ort).toBe('Westheim (Pfalz)');
    d.melde({ lat: 49.25, lon: 8.3207 });
    expect(adresseBei).toHaveBeenCalledTimes(3);
  });

  it('legt fehlende Indizes an und fragt danach gleich nach', async () => {
    const adresseBei = vi.fn().mockReturnValueOnce(null).mockReturnValue(treffer);
    const { d } = dienst({ adresseBei, ohneGeoIndex: () => ['/x/lite_search-germany.db'] });
    d.melde({ lat: 49.2397, lon: 8.3207 });
    expect(d.aktuell()).toBeNull();
    await d.indexPflegen();
    expect(d.aktuell()?.hausnummer).toBe('4');
  });

  it('ignoriert Positionen ohne Koordinaten', () => {
    const { d, q } = dienst();
    d.melde({});
    expect(q.adresseBei).not.toHaveBeenCalled();
  });
});
