import { describe, expect, it, vi } from 'vitest';
import { goAktionen, ortAus, uebersetze, type AktionenDeps } from './aktionen.js';

function deps(extra: Partial<AktionenDeps> = {}): AktionenDeps {
  return {
    zielSetzen: vi.fn(async () => ({ name: 'Magdeburg' })),
    faehrt: () => false,
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    profile: () => [{ id: 'p1', name: 'Wohnmobil' }],
    aktiviereProfil: vi.fn(),
    befehl: vi.fn(async (t: string) => ({ antwort: `ok: ${t}` })),
    ...extra,
  };
}

describe('Aktionen von Yapaia Go', () => {
  it('ziel_setzen: Text, Textfeld oder Koordinaten', async () => {
    const d = deps();
    const a = goAktionen(d);
    expect(await a.ziel_setzen({ ziel: ' Magdeburg ' })).toEqual({ ziel: 'Magdeburg' });
    await a.ziel_setzen({ wert: 'Halle' });
    await a.ziel_setzen({ ort: { latitude: 52.1, longitude: 11.6, radius: 0 } });
    expect(d.zielSetzen).toHaveBeenNthCalledWith(1, { query: 'Magdeburg' });
    expect(d.zielSetzen).toHaveBeenNthCalledWith(2, { query: 'Halle' });
    expect(d.zielSetzen).toHaveBeenNthCalledWith(3, { latlng: { lat: 52.1, lon: 11.6 } });
    await expect(a.ziel_setzen({})).rejects.toThrow(/Ziel angeben/);
  });

  it('ziel_setzen waehrend einer Fahrt beendet die alte zuerst', async () => {
    const d = deps({ faehrt: () => true });
    await goAktionen(d).ziel_setzen({ ziel: 'Leipzig' });
    expect(d.stop).toHaveBeenCalledOnce();
  });

  it('Fehler der Zielsuche in Nutzersprache, mit Status', async () => {
    const fehler = Object.assign(new Error('No route found to destination'), { code: 'NO_ROUTE', httpStatus: 404 });
    const a = goAktionen(deps({ zielSetzen: async () => Promise.reject(fehler) }));
    await expect(a.ziel_setzen({ ziel: 'Insel' })).rejects.toMatchObject({
      message: 'Zu diesem Ziel gibt es keine Route mit dem aktiven Fahrzeugprofil.',
      status: 404,
    });
    expect(uebersetze(new Error('irgendwas')).message).toBe('irgendwas');
  });

  it('Profil nach Name, Befehl mit Antwort', async () => {
    const d = deps();
    const a = goAktionen(d);
    await a.profil_waehlen({ wert: 'Wohnmobil' });
    expect(d.aktiviereProfil).toHaveBeenCalledWith('p1');
    await expect(a.profil_waehlen({ wert: 'Pkw' })).rejects.toMatchObject({ status: 404 });
    expect(await a.befehl({ text: 'Fahre nach Halle' })).toEqual({ antwort: 'ok: Fahre nach Halle' });
  });

  it('Koordinaten in allen Schreibweisen', () => {
    expect(ortAus({ breite: 1, laenge: 2 })).toEqual({ lat: 1, lon: 2 });
    expect(ortAus({ lat: '1.5', lon: '2' })).toEqual({ lat: 1.5, lon: 2 });
    expect(ortAus({ latitude: 'x' })).toBeUndefined();
    expect(ortAus(null)).toBeUndefined();
  });
});
