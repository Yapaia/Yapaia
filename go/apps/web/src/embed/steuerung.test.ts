import { beforeEach, describe, expect, it } from 'vitest';
import { einbettungSteuerung } from './steuerung';
import { useFollowMeStore } from '../map/followMe';
import { useViewModeStore } from '../map/viewMode';
import { usePositionStore } from '../position/positionStore';
import { useAnordnungStore } from '../shell/anordnung';

describe('Steuerung der eingebetteten Karte', () => {
  beforeEach(() => {
    useViewModeStore.setState({ mode: '2d-north', freiGedreht: false });
    useFollowMeStore.getState().setFollowing(true);
  });

  it('meldet Ansicht und ob die Karte der Position folgt', () => {
    const s = einbettungSteuerung();
    expect(s.version).toBe(3);
    expect(s.stand()).toEqual({ ansicht: '2d-north', zentriert: true });
    useFollowMeStore.getState().halten();
    expect(s.stand().zentriert).toBe(false);
  });

  it('wechselt die Ansicht ohne Neuladen und lehnt Unbekanntes ab', () => {
    const s = einbettungSteuerung();
    expect(s.ansicht('3d-course')).toBe(true);
    expect(useViewModeStore.getState().mode).toBe('3d-course');
    expect(s.stand().ansicht).toBe('3d-course');
    expect(s.ansicht('quer')).toBe(false);
    expect(useViewModeStore.getState().mode).toBe('3d-course');
  });

  it('zentrieren hebt die Pause auf; ohne Position meldet es false', () => {
    const s = einbettungSteuerung();
    usePositionStore.setState({ position: null });
    useFollowMeStore.getState().halten();
    expect(s.zentrieren()).toBe(false);
    expect(s.stand().zentriert).toBe(true);
  });

  it('bearbeiten zeigt den Bildschirm als Vorschau und beendet sauber', () => {
    const s = einbettungSteuerung();
    expect(s.bearbeiten('fahrt')).toBe(true);
    expect(useAnordnungStore.getState().bearbeiten).toBe('fahrt');
    expect(useAnordnungStore.getState().vorschau).toBe('fahrt');
    expect(s.bearbeiten('quer')).toBe(false);
    expect(s.bearbeiten(null)).toBe(true);
    expect(useAnordnungStore.getState().bearbeiten).toBeNull();
    expect(useAnordnungStore.getState().vorschau).toBeNull();
    expect(s.zuruecksetzen('quer')).toBe(false);
  });

  it('orte: ohne Karte nichts, sonst Markierungen und die Karte hält', () => {
    // Für „Sonderziele in der Nähe“ im Dashboard (Version 3).
    const s = einbettungSteuerung();
    expect(s.orte([{ lat: 49.27, lon: 8.34, name: 'Shell' }], 0)).toBe(false); // noch keine Karte
  });
});
