/**
 * Die Aktionen von Yapaia Go (`yapaia.go_<name>` in Home Assistant).
 *
 * Fehlermeldungen sind fuer den Nutzer: Home Assistant zeigt sie so, wie sie
 * hier stehen, im Aktionen-Editor oder in der Automationsspur.
 */

import type { LatLng } from '@yapaia/shared';
import { AktionsFehler, type Aktion } from './protokoll.js';

export interface AktionenDeps {
  /** Ziel suchen, Route rechnen, Navigation starten. */
  zielSetzen: (ziel: { query?: string; latlng?: LatLng; name?: string }) => Promise<{ name: string | null }>;
  /** Laeuft gerade eine Fahrt (dann wird sie fuer ein neues Ziel beendet)? */
  faehrt: () => boolean;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  profile: () => Array<{ id: string; name: string }>;
  aktiviereProfil: (id: string) => void;
  befehl: (text: string) => Promise<{ antwort: string }>;
}

const MELDUNG: Record<string, string> = {
  NO_GEOCODE_RESULT: 'Zu diesem Ziel wurde nichts gefunden.',
  GEOCODE_FAILED: 'Die Suche ist gerade nicht erreichbar.',
  NO_ACTIVE_PROFILE: 'Es ist kein Fahrzeugprofil aktiv.',
  ROUTING_NOT_CONFIGURED: 'Das Routing ist nicht eingerichtet (Kartenregion noch nicht gebaut?).',
  NO_ROUTE: 'Zu diesem Ziel gibt es keine Route mit dem aktiven Fahrzeugprofil.',
  INVALID_TRANSITION: 'Das geht im aktuellen Navigationszustand nicht.',
};

/** Fehler aus Navigation und Zielsuche in Nutzersprache. */
export function uebersetze(err: unknown): AktionsFehler {
  const e = err as { code?: unknown; httpStatus?: unknown; message?: unknown };
  const status = typeof e?.httpStatus === 'number' ? e.httpStatus : 500;
  const text = typeof e?.code === 'string' && MELDUNG[e.code] ? MELDUNG[e.code] : null;
  return new AktionsFehler(text ?? (err instanceof Error ? err.message : String(err)), status);
}

function ausfuehren(fn: () => void): Aktion {
  return async () => {
    try {
      fn();
    } catch (err) {
      throw uebersetze(err);
    }
  };
}

/** Koordinaten aus dem Orts-Waehler von HA (`latitude`/`longitude`) oder als `breite`/`laenge`. */
export function ortAus(wert: unknown): LatLng | undefined {
  if (!wert || typeof wert !== 'object') return undefined;
  const o = wert as Record<string, unknown>;
  const lat = Number(o.latitude ?? o.breite ?? o.lat);
  const lon = Number(o.longitude ?? o.laenge ?? o.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : undefined;
}

export function goAktionen(d: AktionenDeps): Record<string, Aktion> {
  return {
    ziel_setzen: async (daten) => {
      const latlng = ortAus(daten.ort);
      // `wert` kommt vom Textfeld „Ziel eingeben"
      const roh = daten.ziel ?? daten.wert;
      const query = typeof roh === 'string' ? roh.trim() : '';
      // Name zu den Koordinaten, z. B. der in einem Dashboard gewaehlte Suchtreffer
      const name = typeof daten.name === 'string' ? daten.name.trim() : '';
      if (!latlng && !query) throw new AktionsFehler('Bitte ein Ziel angeben (Adresse, Ort oder Koordinaten).');
      try {
        if (d.faehrt()) d.stop();
        const ergebnis = await d.zielSetzen(latlng ? { latlng, ...(name ? { name } : {}) } : { query });
        return { ziel: ergebnis.name ?? query };
      } catch (err) {
        throw uebersetze(err);
      }
    },
    navigation_pausieren: ausfuehren(d.pause),
    navigation_fortsetzen: ausfuehren(d.resume),
    navigation_beenden: ausfuehren(d.stop),
    profil_waehlen: async (daten) => {
      const name = typeof daten.wert === 'string' ? daten.wert.trim() : '';
      const profil = d.profile().find((p) => p.name === name);
      if (!profil) throw new AktionsFehler(`Kein Fahrzeugprofil „${name}"`, 404);
      d.aktiviereProfil(profil.id);
    },
    befehl: async (daten) => {
      const text = typeof daten.text === 'string' ? daten.text.trim() : '';
      if (!text) throw new AktionsFehler('Kein Satz angegeben.');
      return { antwort: (await d.befehl(text)).antwort };
    },
  };
}
