/**
 * Baustellen, Sperrungen und Warnungen von der Autobahn GmbH.
 *
 * ─── WOFÜR ──────────────────────────────────────────────────────────────────
 * Gewünscht: „Neben Kartendaten denke ich auch an sowas wie Verkehrsinfos,
 * Staus, Blitzer, Baustellen, Umleitungen oder Tankstellen und ihre Preise,
 * usw."
 *
 * Die Autobahn GmbH des Bundes betreibt dafür eine offene Schnittstelle: ohne
 * Schlüssel, ohne Anmeldung, ohne Konto. Für ein Wohnmobil ist sie besonders
 * brauchbar, weil dort neben Baustellen und Sperrungen auch Rastanlagen und
 * LKW-Parkplätze stehen — und ein LKW-Parkplatz ist für 7,5 Tonnen oft die
 * einzige Fläche, auf der man nachts legal steht.
 *
 * ─── WARUM DIESER CODE NICHTS BEHAUPTET ─────────────────────────────────────
 * Ich habe diese Schnittstelle NICHT aufgerufen. Die Netzregeln der
 * Entwicklungsumgebung lassen sie nicht durch — alle sieben Kandidaten, die
 * ich geprüft habe, kamen ohne Antwort zurück.
 *
 * Genau so ist der gpsd-Fehler entstanden: drei Diagnosen, alle plausibel,
 * alle falsch, weil ich geraten statt gemessen habe. Diesmal also andersherum:
 *
 *   * Der Leser sucht sich die Liste SELBST im JSON, statt einen Feldnamen zu
 *     erwarten (`parseListe`).
 *   * Koordinaten werden aus mehreren Schreibweisen gelesen, auch aus
 *     Zeichenketten (`leseKoordinate`) -- `long` statt `lon` ist in dieser
 *     Familie von Schnittstellen üblich, und eine vertauschte Erwartung
 *     ergäbe eine Meldung mitten im Atlantik.
 *   * Was wirklich ankam, sagt `diagnose.ts` im Klartext -- Endpunkt,
 *     Statuscode, gefundener Schlüssel, Anzahl, ein Beispiel.
 *
 * Wenn die Schnittstelle anders aussieht als vermutet, steht das danach auf
 * dem Bildschirm, statt sich als leere Liste zu tarnen.
 */

/** Was Yapaia aus einer Meldung macht — unabhängig davon, wie sie ankam. */
export interface Verkehrsmeldung {
  /** Stabile Kennung der Quelle, für „schon gesehen". */
  id: string;
  art: 'baustelle' | 'sperrung' | 'stau' | 'warnung' | 'parkplatz' | 'ladesaeule' | 'unbekannt';
  /** Die Autobahn, z. B. `A61`. */
  strasse: string;
  titel: string;
  /** Mehrzeilige Beschreibung, bereits zusammengefügt. Leer, wenn keine kam. */
  beschreibung: string;
  lat: number | null;
  lon: number | null;
  /**
   * Nur bei Staus und Vollsperrungen: der betroffene Abschnitt, [lon, lat],
   * ausgedünnt. Damit färbt die Oberfläche das Stück der Route ein.
   *
   * Bei Staus liegt die Linie in Fahrtrichtung (gemessen am 2026-10-15 auf
   * A2, A3, A9: der erste Punkt ist das Stauende, an dem man ankommt). Bei
   * Baustellen ist sie das NICHT verlässlich -- dort fehlt sie deshalb.
   */
  linie?: Array<[number, number]>;
  /** Länge des Abschnitts in Metern, aus der Geometrie gerechnet. */
  laenge_m?: number;
  /** Nur bei Staus: gemeldeter Reisezeitverlust in Minuten (`delayTimeValue`). */
  verzug_min?: number;
  /** Nur bei Staus: wie dicht der Verkehr steht. */
  stau?: StauTyp;
}

export type StauTyp = 'stillstand' | 'stau' | 'zaehfliessend' | 'dicht' | 'unbekannt';

/** `abnormalTrafficType` der Quelle, übersetzt. */
const STAU_TYPEN: Record<string, StauTyp> = {
  STATIONARY_TRAFFIC: 'stillstand',
  QUEUING_TRAFFIC: 'stau',
  SLOW_TRAFFIC: 'zaehfliessend',
  HEAVY_TRAFFIC: 'dicht',
};

/** Die Dienste, die diese Schnittstelle je Autobahn führt. */
export const AUTOBAHN_DIENSTE = {
  roadworks: 'baustelle',
  closure: 'sperrung',
  warning: 'warnung',
  parking_lorry: 'parkplatz',
  electric_charging_station: 'ladesaeule',
} as const;

export type AutobahnDienst = keyof typeof AUTOBAHN_DIENSTE;

/** Die Wurzel der Schnittstelle. Als Konstante, damit sie an EINER Stelle
 *  steht und in der Diagnose genannt werden kann. */
export const AUTOBAHN_BASIS = 'https://verkehr.autobahn.de/o/autobahn';

export function autobahnStrassenUrl(): string {
  return `${AUTOBAHN_BASIS}/`;
}

export function autobahnDienstUrl(strasse: string, dienst: AutobahnDienst): string {
  return `${AUTOBAHN_BASIS}/${encodeURIComponent(strasse)}/services/${dienst}`;
}

/**
 * Sucht die eigentliche Liste in einer Antwort.
 *
 * ─── WARUM NICHT EINFACH `json.roadworks` ───────────────────────────────────
 * Weil ich nicht nachsehen konnte, ob das Feld so heißt. Ein fest erwarteter
 * Name, den es nicht gibt, ergibt `undefined` — und daraus wird eine leere
 * Liste, also „keine Baustellen". Das ist die schlimmste Sorte Fehler in
 * diesem Projekt: er sieht aus wie eine gute Nachricht.
 *
 * Genommen wird deshalb die EINZIGE Eigenschaft der obersten Ebene, die ein
 * Feld ist. Gibt es mehrere, wird keine geraten — dann sagt die Diagnose, dass
 * es mehrdeutig war, und nennt die Namen.
 */
export function parseListe(json: unknown): {
  schluessel: string | null;
  eintraege: unknown[];
  mehrdeutig: string[];
} {
  if (Array.isArray(json)) {
    return { schluessel: '(Wurzel)', eintraege: json, mehrdeutig: [] };
  }
  if (json === null || typeof json !== 'object') {
    return { schluessel: null, eintraege: [], mehrdeutig: [] };
  }
  const felder = Object.entries(json as Record<string, unknown>).filter(([, v]) =>
    Array.isArray(v),
  );
  if (felder.length === 1) {
    return { schluessel: felder[0][0], eintraege: felder[0][1] as unknown[], mehrdeutig: [] };
  }
  return { schluessel: null, eintraege: [], mehrdeutig: felder.map(([k]) => k) };
}

/** Eine Zahl, auch wenn sie als Zeichenkette kommt. `null` sonst — NIE 0. */
export function alsZahl(wert: unknown): number | null {
  if (typeof wert === 'number') return Number.isFinite(wert) ? wert : null;
  if (typeof wert !== 'string') return null;
  const t = wert.trim();
  if (t.length === 0) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Liest Breite und Länge aus einem Eintrag.
 *
 * `long`, `lon` und `lng` sind alle im Umlauf; diese Familie von deutschen
 * Behördenschnittstellen benutzt überwiegend `long`. Eine vertauschte
 * Erwartung ergäbe keine Fehlermeldung, sondern eine Baustelle im Atlantik.
 *
 * Zahlen kommen dort häufig als Zeichenketten. `alsZahl` nimmt beides und
 * liefert bei Unsinn `null` und nicht 0 — 0/0 liegt im Golf von Guinea und
 * sähe wie eine echte Position aus.
 */
export function leseKoordinate(roh: unknown): { lat: number | null; lon: number | null } {
  if (roh === null || typeof roh !== 'object') return { lat: null, lon: null };
  const o = roh as Record<string, unknown>;
  const quelle = (o.coordinate ?? o.coordinates ?? o) as Record<string, unknown>;
  if (quelle === null || typeof quelle !== 'object') return { lat: null, lon: null };
  return {
    lat: alsZahl(quelle.lat ?? quelle.latitude),
    lon: alsZahl(quelle.long ?? quelle.lon ?? quelle.lng ?? quelle.longitude),
  };
}

/**
 * Die FELDNAMEN eines rohen Eintrags, mit ihren Typen — ohne die Werte.
 *
 * ─── WOZU ───────────────────────────────────────────────────────────────────
 * Aus der ersten echten Prüfung auf dem Gerät kam:
 *
 *   Autobahn A61 — parking_lorry: 60 Einträge, alle brauchbar.
 *   Beispiel: „A61 | undefined" — ohne Koordinaten
 *
 * Sechzig Einträge, und kein einziger lässt sich auf eine Karte legen. Warum,
 * weiß ich nicht: dieser Dienst hat offenbar einen anderen Aufbau als die
 * übrigen vier. Ich könnte raten — `coordinates` statt `coordinate`, ein
 * verschachteltes `position`, ein GeoJSON-Feld. Jede dieser Vermutungen wäre
 * plausibel, und genau so ist in diesem Projekt schon einmal eine Woche
 * verlorengegangen.
 *
 * Also wird stattdessen GEFRAGT. Diese Funktion nennt, was in einem Eintrag
 * wirklich steht, und die Prüfung zeigt es an. Der nächste Lauf auf dem Gerät
 * beantwortet die Frage in einer Zeile.
 *
 * ─── WARUM NUR NAMEN UND TYPEN, NIE WERTE ───────────────────────────────────
 * Weil der Betreiber diesen Text weitergibt, damit ich ihn lese. Feldnamen
 * verraten nichts über ihn; Werte könnten es. Ein Aufbau lässt sich aus den
 * Namen vollständig ablesen — die Werte braucht dafür niemand.
 */
export function feldBericht(roh: unknown): string {
  if (roh === null || typeof roh !== 'object') return typeof roh;

  const typVon = (wert: unknown): string => {
    if (wert === null) return 'null';
    if (Array.isArray(wert)) return 'array';
    return typeof wert;
  };

  const teile: string[] = [];
  for (const [name, wert] of Object.entries(roh as Record<string, unknown>).slice(0, 40)) {
    // Eine Ebene tiefer, aber auch nur eine: die Koordinaten stecken bei den
    // anderen Diensten genau dort. Tiefer zu gehen ergäbe eine Wand aus Text,
    // in der die eine wichtige Zeile untergeht.
    if (wert !== null && typeof wert === 'object' && !Array.isArray(wert)) {
      const innen = Object.entries(wert as Record<string, unknown>)
        .slice(0, 12)
        .map(([k, v]) => `${k}:${typVon(v)}`)
        .join(', ');
      teile.push(`${name}{${innen}}`);
      continue;
    }
    teile.push(`${name}:${typVon(wert)}`);
  }
  return teile.join(', ');
}

/** Text aus einem Feld, das eine Zeichenkette ODER eine Liste davon sein kann. */
export function leseText(wert: unknown): string {
  if (typeof wert === 'string') return wert.trim();
  if (Array.isArray(wert)) {
    return wert
      .filter((z): z is string => typeof z === 'string')
      .map((z) => z.trim())
      .filter((z) => z.length > 0)
      .join('\n');
  }
  return '';
}

/**
 * Macht aus einem rohen Eintrag eine Yapaia-Meldung.
 *
 * Fehlt der Titel, wird KEINE Meldung erfunden: `null` heißt „damit lässt
 * sich nichts anfangen", und die Diagnose zählt das mit. Ein Eintrag ohne
 * Titel auf der Karte wäre ein Symbol, das niemand deuten kann.
 */
export function normalisiere(
  roh: unknown,
  strasse: string,
  dienst: AutobahnDienst,
): Verkehrsmeldung | null {
  if (roh === null || typeof roh !== 'object') return null;
  const o = roh as Record<string, unknown>;

  const titel = leseText(o.title) || leseText(o.subtitle);
  if (titel.length === 0) return null;

  const { lat, lon } = leseKoordinate(o);
  const id =
    leseText(o.identifier) ||
    leseText(o.id) ||
    // Kein Zufallswert: eine Kennung, die sich bei jedem Abruf ändert, macht
    // aus „schon gesehen" eine Ansage bei jeder Aktualisierung.
    `${strasse}:${dienst}:${titel}`;

  const beschreibung = leseText(o.description);
  const anzeige = leseText(o.display_type);
  const stauRoh = leseText(o.abnormalTrafficType);

  // ─── AUS „WARNUNG" WIRD STAU ODER SPERRUNG ───────────────────────────────
  // Der Dienst `warning` liefert Staus (mit `abnormalTrafficType`), sonstige
  // Ereignisse wie Fahrbahnschäden oder Unfälle -- und gelegentlich eine
  // Vollsperrung (`display_type: CLOSURE`).
  let art: Verkehrsmeldung['art'] = AUTOBAHN_DIENSTE[dienst];
  if (dienst === 'warning' && stauRoh) art = 'stau';
  else if (dienst === 'warning' && anzeige === 'CLOSURE') art = 'sperrung';

  const meldung: Verkehrsmeldung = { id, art, strasse, titel, beschreibung, lat, lon };

  const geometrie = leseLinie(o.geometry);
  if (geometrie) meldung.laenge_m = Math.round(linienLaenge(geometrie));

  if (art === 'stau') {
    meldung.stau = /im stillstand/i.test(beschreibung) ? 'stillstand' : (STAU_TYPEN[stauRoh] ?? 'unbekannt');
    const verzug = Number(leseText(o.delayTimeValue) || o.delayTimeValue);
    if (Number.isFinite(verzug) && verzug > 0) meldung.verzug_min = Math.round(verzug);
  }
  // Nur ganze Sperrungen färben die Strecke -- gesperrte Auf- und Abfahrten
  // (`CLOSURE_ENTRY_EXIT`, auf der A7 25 von 30) betreffen die Durchfahrt nicht.
  if (geometrie && (art === 'stau' || (art === 'sperrung' && anzeige === 'CLOSURE'))) {
    meldung.linie = duenneAus(geometrie);
  }
  return meldung;
}

/** Eine GeoJSON-LineString-Geometrie als [lon, lat]-Liste, sonst `null`. */
export function leseLinie(roh: unknown): Array<[number, number]> | null {
  if (roh === null || typeof roh !== 'object') return null;
  const g = roh as { type?: unknown; coordinates?: unknown };
  if (g.type !== 'LineString' || !Array.isArray(g.coordinates)) return null;
  const punkte: Array<[number, number]> = [];
  for (const p of g.coordinates) {
    if (!Array.isArray(p)) continue;
    const lon = Number(p[0]);
    const lat = Number(p[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    punkte.push([lon, lat]);
  }
  return punkte.length >= 2 ? punkte : null;
}

function abstandM(a: readonly [number, number], b: readonly [number, number]): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k * 111_320, (b[1] - a[1]) * 111_320);
}

export function linienLaenge(punkte: ReadonlyArray<readonly [number, number]>): number {
  let summe = 0;
  for (let i = 1; i < punkte.length; i++) summe += abstandM(punkte[i - 1]!, punkte[i]!);
  return summe;
}

/** Punkte näher als das am Vorgänger fallen weg: ein Stau mit 321 Stützpunkten
 *  braucht für eine farbige Linie keine 321. */
const DUENN_M = 40;

export function duenneAus(punkte: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const runde = (p: readonly [number, number]): [number, number] => [
    Math.round(p[0] * 1e5) / 1e5,
    Math.round(p[1] * 1e5) / 1e5,
  ];
  const raus: Array<[number, number]> = [runde(punkte[0]!)];
  for (let i = 1; i < punkte.length - 1; i++) {
    if (abstandM(raus[raus.length - 1]!, punkte[i]!) >= DUENN_M) raus.push(runde(punkte[i]!));
  }
  raus.push(runde(punkte[punkte.length - 1]!));
  return raus;
}

export interface AntwortBefund {
  meldungen: Verkehrsmeldung[];
  /** Einträge ohne Titel — mit ihnen lässt sich gar nichts anfangen. */
  verworfen: number;
  /**
   * Meldungen MIT Titel, aber OHNE Koordinaten.
   *
   * Sie sind nicht wertlos (im Text steht etwas), aber sie können nicht auf
   * die Karte. Bis 0.10.2 fielen sie unter „alle brauchbar" — und genau das
   * ist die Fehlersorte, gegen die diese Datei geschrieben wurde: ein Befund,
   * der wie eine gute Nachricht aussieht. Sechzig LKW-Parkplätze, von denen
   * kein einziger zeichenbar ist, sind keine gute Nachricht.
   */
  ohneKoordinaten: number;
  schluessel: string | null;
  mehrdeutig: string[];
  /** Die Feldnamen des ERSTEN Eintrags, für den Fall, dass etwas nicht passt. */
  felder: string | null;
}

/** Alle brauchbaren Meldungen einer Antwort, plus was daran fehlte. */
export function ausAntwort(
  json: unknown,
  strasse: string,
  dienst: AutobahnDienst,
): AntwortBefund {
  const { schluessel, eintraege, mehrdeutig } = parseListe(json);
  const meldungen: Verkehrsmeldung[] = [];
  let verworfen = 0;
  let ohneKoordinaten = 0;
  for (const eintrag of eintraege) {
    const m = normalisiere(eintrag, strasse, dienst);
    if (!m) {
      verworfen += 1;
      continue;
    }
    if (m.lat === null || m.lon === null) ohneKoordinaten += 1;
    meldungen.push(m);
  }
  return {
    meldungen,
    verworfen,
    ohneKoordinaten,
    schluessel,
    mehrdeutig,
    felder: eintraege.length > 0 ? feldBericht(eintraege[0]) : null,
  };
}
