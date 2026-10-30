/**
 * Der Sprachdialog: Satz rein, kurze Antwort raus -- und, wo nötig, eine
 * Rückfrage, bevor sich an der Fahrt etwas ändert.
 *
 * ─── REGELN (docs/ideen-ki.md, Idee 1) ──────────────────────────────────────
 *  - Jede Routenänderung braucht eine Bestätigung („ja", „los").
 *  - Höchstens zwei Sätze. Details stehen auf dem Bildschirm.
 *  - Nicht verstanden → sagen, dass nicht verstanden wurde. Nicht raten.
 *
 * Der Dialog kennt die Dienste nur über `SprachDeps` -- so ist er ohne Kern,
 * Valhalla und Home Assistant prüfbar, und dieselbe Logik bedient später den
 * Mikrofon-Knopf in der App UND Home Assistant Assist.
 */

import type { NavState, Route } from '@yapaia/shared';
import { kategorieName, verstehe, type Absicht } from './verstehen.js';
import { gebiet, tx } from '../i18n.js';
import { T } from './texte.js';

export interface Treffer {
  name: string;
  /** „Ziolkowskistraße, Magdeburg" -- was vorgelesen wird. */
  beschreibung: string;
  lat: number;
  lon: number;
  /** Strecke dorthin (entlang der Route) oder Luftlinie, falls bekannt. */
  entfernung_m?: number | null;
}

export interface VerkehrsMeldung {
  titel: string;
  beschreibung: string;
  voraus_m: number | null;
}

export interface SprachDeps {
  /** Ortssuche (Suchindex), beste zuerst. */
  suche(text: string): Promise<Treffer[]>;
  /** Route von der aktuellen Position zum Ziel, mit dem aktiven Fahrzeug. */
  route(ziel: Treffer): Promise<Route>;
  /** Navigation mit dieser Route starten. */
  starte(route: Route, ziel: Treffer): void;
  navigation(): NavState;
  pause(): void;
  weiter(): void;
  stopp(): void;
  /** Nächste Treffer einer Kategorie: voraus auf der Route, sonst im Umkreis. */
  naechste(kategorie: string): Treffer[];
  /** „Der nächste Aldi": Sonderziele mit diesem Namen, die nächsten zuerst
   *  (entlang der Route, wenn eine läuft). */
  naechsteNamens?(name: string): Promise<Treffer[]>;
  /** Verkehrsmeldungen voraus auf der Route; `null`, wenn nichts abrufbar. */
  verkehr(): Promise<{ meldungen: VerkehrsMeldung[] } | { fehler: string }>;
  /** Uhrzeit für die Ankunft in Ortszeit formatieren („15:29"). */
  uhrzeit(iso: string): string;
  jetzt(): number;
  /**
   * Optional: die KI von Home Assistant für Sätze, die die Regeln nicht
   * verstehen (`ha/kiAgent.ts`). Liefert eine Absicht oder `null`.
   */
  ki?: (text: string) => Promise<Absicht | null>;
}

/** Was die Oberfläche nach der Antwort tun soll. */
export type Aktion =
  | { art: 'route_vorschlag'; route: Route; ziel: Treffer }
  | { art: 'navigation_gestartet' }
  | { art: 'navigation_beendet' }
  | { art: 'ansagen'; an: boolean }
  | { art: 'auswahl'; treffer: Treffer[] };

export interface Antwort {
  antwort: string;
  /** Was erkannt wurde -- für die Anzeige und die Fehlersuche. */
  absicht: Absicht['art'];
  aktion?: Aktion;
  /** Die Antwort ist eine Frage: die App hört danach gleich wieder zu. */
  rueckfrage?: boolean;
}

/** Wie lange eine offene Rückfrage gilt. */
const RUECKFRAGE_MS = 2 * 60_000;

type Offen =
  | { art: 'route'; route: Route; ziel: Treffer; bis: number }
  | { art: 'auswahl'; treffer: Treffer[]; bis: number };

export function entfernungText(m: number): string {
  if (m < 950) return tx(T, 'meter', { n: Math.max(50, Math.round(m / 50) * 50) });
  if (m < 10_000) {
    const km = (m / 1000).toLocaleString(gebiet(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return tx(T, 'kilometer', { n: km });
  }
  return tx(T, 'kilometer', { n: Math.round(m / 1000) });
}

export function dauerText(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return min === 1 ? tx(T, 'eine_minute') : tx(T, 'minuten', { n: min });
  const h = Math.floor(min / 60);
  const rest = min % 60;
  const stunden = h === 1 ? tx(T, 'eine_stunde') : tx(T, 'stunden', { n: h });
  return rest === 0 ? stunden : `${stunden} ${rest === 1 ? tx(T, 'eine_minute') : tx(T, 'minuten', { n: rest })}`;
}

const AKTIV = new Set<NavState['status']>(['navigating', 'paused', 'off_route', 'routing']);

/** Die Hilfe in der eingestellten Sprache. */
export function hilfeText(): string {
  return tx(T, 'hilfe');
}

export class Sprachdialog {
  private offen: Offen | null = null;

  constructor(private readonly deps: SprachDeps) {}

  async verarbeite(text: string): Promise<Antwort> {
    let absicht = verstehe(text);
    if (absicht.art === 'unbekannt' && this.deps.ki) {
      // Erst die Regeln, dann die KI: was die Regeln können, geht auch ohne
      // Netz und ohne Wartezeit.
      absicht = (await this.deps.ki(text).catch(() => null)) ?? absicht;
    }
    const jetzt = this.deps.jetzt();
    if (this.offen && this.offen.bis < jetzt) this.offen = null;

    switch (absicht.art) {
      case 'ja':
        return this.bestaetigt();
      case 'nein':
        this.offen = null;
        return { antwort: tx(T, 'abgebrochen'), absicht: 'nein' };
      case 'wahl':
        return this.waehle(absicht.nummer);
      case 'ziel':
        return this.ziel(absicht.ort);
      case 'naechste':
        return this.naechste(absicht.kategorie);
      case 'naechste_name':
        return this.naechsteNamens(absicht.name);
      case 'stopp': {
        if (!AKTIV.has(this.deps.navigation().status)) {
          return { antwort: tx(T, 'keine_navigation'), absicht: 'stopp' };
        }
        this.deps.stopp();
        this.offen = null;
        return { antwort: tx(T, 'beendet'), absicht: 'stopp', aktion: { art: 'navigation_beendet' } };
      }
      case 'pause': {
        if (this.deps.navigation().status !== 'navigating' && this.deps.navigation().status !== 'off_route') {
          return { antwort: tx(T, 'nichts_zu_pausieren'), absicht: 'pause' };
        }
        this.deps.pause();
        return { antwort: tx(T, 'pausiert'), absicht: 'pause' };
      }
      case 'weiter': {
        if (this.deps.navigation().status !== 'paused') {
          return { antwort: tx(T, 'nicht_pausiert'), absicht: 'weiter' };
        }
        this.deps.weiter();
        return { antwort: tx(T, 'weiter'), absicht: 'weiter' };
      }
      case 'ankunft':
        return this.ankunft();
      case 'verkehr':
        return this.verkehr(absicht.anzahl);
      case 'ansagen':
        return {
          antwort: absicht.an ? tx(T, 'ansagen_an') : tx(T, 'ansagen_aus'),
          absicht: 'ansagen',
          aktion: { art: 'ansagen', an: absicht.an },
        };
      case 'hilfe':
        return { antwort: hilfeText(), absicht: 'hilfe' };
      case 'unbekannt':
        return {
          antwort: tx(T, 'nicht_verstanden'),
          absicht: 'unbekannt',
        };
    }
  }

  private async ziel(ort: string): Promise<Antwort> {
    let treffer: Treffer[];
    try {
      treffer = await this.deps.suche(ort);
    } catch {
      return { antwort: 'Die Suche ist gerade nicht erreichbar.', absicht: 'ziel' };
    }
    if (treffer.length === 0) {
      return { antwort: tx(T, 'nichts_gefunden', { ort }), absicht: 'ziel' };
    }
    return this.routeZu(treffer[0]!, 'ziel');
  }

  private async routeZu(ziel: Treffer, absicht: Absicht['art']): Promise<Antwort> {
    let route: Route;
    try {
      route = await this.deps.route(ziel);
    } catch (err) {
      const grund = err instanceof Error && err.message ? ` (${err.message})` : '';
      return { antwort: tx(T, 'keine_route', { ziel: ziel.beschreibung, grund }), absicht };
    }
    this.offen = { art: 'route', route, ziel, bis: this.deps.jetzt() + RUECKFRAGE_MS };
    const laeuft = AKTIV.has(this.deps.navigation().status);
    return {
      antwort:
        tx(T, 'vorschlag', {
          ziel: ziel.beschreibung,
          strecke: entfernungText(route.distance_m),
          dauer: dauerText(route.duration_s),
        }) + (laeuft ? tx(T, 'aendern') : tx(T, 'losfahren')),
      absicht,
      aktion: { art: 'route_vorschlag', route, ziel },
      rueckfrage: true,
    };
  }

  private naechste(kategorie: string): Antwort {
    const name = kategorieName(kategorie);
    const treffer = this.deps.naechste(kategorie);
    if (treffer.length === 0) {
      return { antwort: tx(T, 'nichts_in_naehe', { name }), absicht: 'naechste' };
    }
    this.offen = { art: 'auswahl', treffer, bis: this.deps.jetzt() + RUECKFRAGE_MS };
    const erste = treffer[0]!;
    const wo =
      typeof erste.entfernung_m === 'number' ? tx(T, 'in_entfernung', { strecke: entfernungText(erste.entfernung_m) }) : '';
    const weitere = treffer.length > 1 ? tx(T, 'weitere', { n: treffer.length }) : '';
    return {
      antwort: tx(T, 'naechste', { name, ziel: erste.beschreibung, wo, weitere }),
      absicht: 'naechste',
      aktion: { art: 'auswahl', treffer },
      rueckfrage: true,
    };
  }

  private async naechsteNamens(name: string): Promise<Antwort> {
    let treffer: Treffer[] = [];
    try {
      treffer = (await this.deps.naechsteNamens?.(name)) ?? [];
    } catch {
      return { antwort: 'Die Suche ist gerade nicht erreichbar.', absicht: 'naechste_name' };
    }
    if (treffer.length === 0) {
      return { antwort: tx(T, 'name_fehlt', { name }), absicht: 'naechste_name' };
    }
    this.offen = { art: 'auswahl', treffer, bis: this.deps.jetzt() + RUECKFRAGE_MS };
    const erste = treffer[0]!;
    const wo =
      typeof erste.entfernung_m === 'number' ? tx(T, 'in_entfernung', { strecke: entfernungText(erste.entfernung_m) }) : '';
    const weitere = treffer.length > 1 ? tx(T, 'weitere', { n: treffer.length }) : '';
    return {
      antwort: tx(T, 'am_naechsten', { ziel: erste.beschreibung, wo, weitere }),
      absicht: 'naechste_name',
      aktion: { art: 'auswahl', treffer },
      rueckfrage: true,
    };
  }

  private async waehle(nummer: number): Promise<Antwort> {
    if (!this.offen || this.offen.art !== 'auswahl') {
      return { antwort: tx(T, 'keine_auswahl'), absicht: 'wahl' };
    }
    const t = this.offen.treffer[nummer - 1];
    if (!t) return { antwort: tx(T, 'nur_n', { n: this.offen.treffer.length }), absicht: 'wahl' };
    return this.routeZu(t, 'wahl');
  }

  private async bestaetigt(): Promise<Antwort> {
    const o = this.offen;
    if (!o) return { antwort: tx(T, 'nichts_zu_bestaetigen'), absicht: 'ja' };
    if (o.art === 'auswahl') return this.routeZu(o.treffer[0]!, 'ja');
    this.offen = null;
    try {
      this.deps.starte(o.route, o.ziel);
    } catch (err) {
      const grund = err instanceof Error && err.message ? `: ${err.message}` : '.';
      return { antwort: tx(T, 'start_fehler', { grund }), absicht: 'ja' };
    }
    return { antwort: tx(T, 'los', { ziel: o.ziel.name }), absicht: 'ja', aktion: { art: 'navigation_gestartet' } };
  }

  private ankunft(): Antwort {
    const s = this.deps.navigation();
    if (!AKTIV.has(s.status) || s.eta === null) {
      return { antwort: tx(T, 'keine_navigation'), absicht: 'ankunft' };
    }
    const rest =
      s.distance_remaining_m !== null ? tx(T, 'ankunft_rest', { strecke: entfernungText(s.distance_remaining_m) }) : '';
    const dauer =
      s.duration_remaining_s !== null ? tx(T, 'ankunft_dauer', { dauer: dauerText(s.duration_remaining_s) }) : '';
    return { antwort: tx(T, 'ankunft', { uhr: this.deps.uhrzeit(s.eta), dauer, rest }), absicht: 'ankunft' };
  }

  private async verkehr(anzahl: number): Promise<Antwort> {
    if (!AKTIV.has(this.deps.navigation().status)) {
      return { antwort: tx(T, 'verkehr_nur_navi'), absicht: 'verkehr' };
    }
    const r = await this.deps.verkehr();
    if ('fehler' in r) return { antwort: r.fehler, absicht: 'verkehr' };
    const voraus = r.meldungen
      .filter((m) => m.voraus_m === null || m.voraus_m >= -200)
      .sort((a, b) => (a.voraus_m ?? 0) - (b.voraus_m ?? 0))
      .slice(0, anzahl);
    if (voraus.length === 0) return { antwort: tx(T, 'keine_meldungen'), absicht: 'verkehr' };
    const saetze = voraus.map((m) => {
      const wo = m.voraus_m !== null ? tx(T, 'meldung_in', { strecke: entfernungText(Math.max(0, m.voraus_m)) }) : '';
      const text = m.beschreibung.split(/\n/)[0]?.trim();
      return `${wo}${m.titel}${text ? `. ${text}` : ''}.`;
    });
    return { antwort: saetze.join(' '), absicht: 'verkehr' };
  }
}
