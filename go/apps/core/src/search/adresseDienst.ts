/**
 * Wo steht das Wohnmobil? -- Ort und Adresse für die Sensoren „Ort" und
 * „Adresse" (0.65.0), offline aus dem Suchindex.
 *
 * Nachgeführt wird erst, wenn sich die Position merklich bewegt hat
 * (`MIN_WEG_M`), und höchstens alle `MIN_ABSTAND_MS`: beim Fahren ändert sich
 * die Hausnummer ständig, interessant ist sie aber vor allem im Stand. Die
 * Abfrage selbst dauert mit Koordinaten-Index Millisekunden (geoIndex.ts);
 * Indizes ohne ihn werden nicht gefragt, bis er angelegt ist.
 */

import { kernSprache } from '../i18n.js';
import type { AdressTreffer } from './lite/reader.js';

export interface Adresse {
  /** „Obere Heide 4, 67368 Westheim (Pfalz)" -- das, was der Sensor zeigt. */
  text: string;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  land_code: string | null;
  /** Die Region des Suchindex (germany, rheinland-pfalz, ...). */
  region: string | null;
  entfernung_m: number | null;
}

export interface AdressQuelle {
  adresseBei(lat: number, lon: number): (AdressTreffer & { region: string | null }) | null;
  ohneGeoIndex(): string[];
}

export interface AdressDienstDeps {
  quelle: AdressQuelle;
  /** Legt den Koordinaten-Index an (geoIndex.ts). */
  indexAnlegen: (pfad: string) => Promise<{ ok: boolean; fehler?: string }>;
  logger: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void };
  jetzt?: () => number;
}

export const MIN_WEG_M = 40;
export const MIN_ABSTAND_MS = 15_000;

// Geofabrik-Regionen → ISO-Ländercode. Regionen unterhalb eines Landes
// (Bundesländer) zählen zu ihrem Land.
const LAND: Record<string, string> = {
  albania: 'AL', andorra: 'AD', austria: 'AT', azores: 'PT', belarus: 'BY', belgium: 'BE', 'bosnia-herzegovina': 'BA',
  bulgaria: 'BG', croatia: 'HR', cyprus: 'CY', 'czech-republic': 'CZ', denmark: 'DK', estonia: 'EE', 'faroe-islands': 'FO',
  finland: 'FI', france: 'FR', georgia: 'GE', germany: 'DE', 'great-britain': 'GB', greece: 'GR', 'guernsey-jersey': 'GG',
  hungary: 'HU', iceland: 'IS', ireland: 'IE', 'ireland-and-northern-ireland': 'IE', 'isle-of-man': 'IM', italy: 'IT',
  kosovo: 'XK', latvia: 'LV', liechtenstein: 'LI', lithuania: 'LT', luxembourg: 'LU', macedonia: 'MK', malta: 'MT',
  moldova: 'MD', monaco: 'MC', montenegro: 'ME', netherlands: 'NL', norway: 'NO', poland: 'PL', portugal: 'PT',
  romania: 'RO', serbia: 'RS', slovakia: 'SK', slovenia: 'SI', spain: 'ES', sweden: 'SE', switzerland: 'CH',
  turkey: 'TR', ukraine: 'UA',
  'baden-wuerttemberg': 'DE', bayern: 'DE', berlin: 'DE', brandenburg: 'DE', bremen: 'DE', hamburg: 'DE', hessen: 'DE',
  'mecklenburg-vorpommern': 'DE', niedersachsen: 'DE', 'nordrhein-westfalen': 'DE', 'rheinland-pfalz': 'DE',
  saarland: 'DE', sachsen: 'DE', 'sachsen-anhalt': 'DE', 'schleswig-holstein': 'DE', thueringen: 'DE',
};

const laenderNamen = new Map<string, Intl.DisplayNames>();
function landName(code: string | null): string | null {
  if (!code) return null;
  try {
    const sprache = kernSprache();
    let namen = laenderNamen.get(sprache);
    if (!namen) {
      namen = new Intl.DisplayNames([sprache], { type: 'region' });
      laenderNamen.set(sprache, namen);
    }
    return namen.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Treffer aus dem Index → Sensorwerte. */
export function zuAdresse(t: AdressTreffer & { region: string | null }): Adresse {
  const land_code = t.region ? (LAND[t.region] ?? null) : null;
  const strasse = [t.strasse, t.hausnummer].filter(Boolean).join(' ');
  const ort = [t.plz, t.ort].filter(Boolean).join(' ');
  return {
    text: [strasse, ort].filter(Boolean).join(', ') || t.ort || 'unbekannt',
    strasse: t.strasse,
    hausnummer: t.hausnummer,
    plz: t.plz,
    ort: t.ort,
    land: landName(land_code),
    land_code,
    region: t.region,
    entfernung_m: t.entfernungM,
  };
}

function meter(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export class AdressDienst {
  private stand: Adresse | null = null;
  private letzteAbfrage: { lat: number; lon: number; zeit: number } | null = null;
  private letztePosition: { lat: number; lon: number } | null = null;
  private laeuft = false;
  private readonly jetzt: () => number;

  constructor(private readonly deps: AdressDienstDeps) {
    this.jetzt = deps.jetzt ?? Date.now;
  }

  aktuell(): Adresse | null {
    return this.stand;
  }

  /** Aus dem Positionsstrom. Wartet nie und wirft nie. */
  melde(pos: { lat?: unknown; lon?: unknown }): void {
    if (typeof pos?.lat !== 'number' || typeof pos?.lon !== 'number') return;
    const hier = { lat: pos.lat, lon: pos.lon };
    this.letztePosition = hier;
    const l = this.letzteAbfrage;
    if (l && (this.jetzt() - l.zeit < MIN_ABSTAND_MS || meter(l, hier) < MIN_WEG_M)) return;
    this.abfragen(hier);
  }

  private abfragen(hier: { lat: number; lon: number }): void {
    this.letzteAbfrage = { ...hier, zeit: this.jetzt() };
    try {
      const t = this.deps.quelle.adresseBei(hier.lat, hier.lon);
      // Nichts gefunden (kein tauglicher Index): den alten Stand behalten,
      // aber bald wieder fragen -- ein Index kann gerade entstehen.
      if (t) this.stand = zuAdresse(t);
      else this.letzteAbfrage = null;
    } catch (err) {
      this.deps.logger.warn('Adresse nicht bestimmbar', { error: (err as Error).message });
    }
  }

  /** Fehlende Koordinaten-Indizes nacheinander anlegen (im Worker). */
  async indexPflegen(): Promise<void> {
    if (this.laeuft) return;
    this.laeuft = true;
    try {
      for (const pfad of this.deps.quelle.ohneGeoIndex()) {
        const t0 = this.jetzt();
        this.deps.logger.info('Lege Koordinaten-Index fuer die Rueckwaertssuche an', { pfad });
        const r = await this.deps.indexAnlegen(pfad);
        if (r.ok) this.deps.logger.info('Koordinaten-Index angelegt', { pfad, sekunden: Math.round((this.jetzt() - t0) / 1000) });
        else this.deps.logger.warn('Koordinaten-Index nicht angelegt', { pfad, fehler: r.fehler });
      }
    } finally {
      this.laeuft = false;
    }
    // Mit dem neuen Index gleich nachsehen
    if (this.letztePosition) this.abfragen(this.letztePosition);
  }
}
