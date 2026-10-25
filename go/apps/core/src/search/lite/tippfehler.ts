/**
 * Tippfehler in der Suche: „Interlakn" findet Interlaken.
 *
 * ─── WIE ────────────────────────────────────────────────────────────────────
 * Beim Bau legt der Index eine Wortliste an: jedes Wort aus den Namen und
 * Suchbegriffen, gefaltet (`faltung.ts`), mit der Zahl der Einträge, in denen
 * es vorkommt. Findet die normale Suche NICHTS, wird jedes Wort der Eingabe,
 * das selbst keinen Treffer hat, gegen diese Liste gehalten: erlaubt ist ein
 * Fehler ab 4 Buchstaben, zwei ab 8. Ein vertauschtes Buchstabenpaar
 * („Zürihc") zählt als EIN Fehler. Unter gleich guten Wörtern gewinnt das
 * häufigere -- „lausanne" vor „euzanne".
 *
 * Das Vorbild ist die Probe in Carnine (DerKleinePunk/carnine2,
 * `examples/fst_probe.rs`), dort mit einem fst-Index. Hier reicht eine
 * Tabelle: gefragt wird nur nach Wörtern ähnlicher Länge, deren ERSTER oder
 * ZWEITER Buchstabe stimmt -- ein Fehler an beiden Stellen zugleich ist
 * selten, und so bleibt es bei einem Bruchteil der Liste.
 *
 * Gemessen an der Schweiz (2026-10-25): 160 000 Wörter; Lauzanne, Interlakn,
 * Matterhron, Grindewald, Bahnhofstrase und Schaffausen fanden vorher nichts
 * und landen jetzt beim richtigen Ort.
 */
import type Database from 'better-sqlite3';
import { faltung } from './faltung.js';

/** Kürzere Wörter werden nicht korrigiert: bei „Ulm" ist fast jedes
 *  Dreibuchstabenwort einen Fehler entfernt. */
export const MIN_WORTLAENGE = 4;

/** Ab dieser Länge sind zwei Fehler erlaubt. */
const ZWEI_FEHLER_AB = 8;

export function erlaubteFehler(laenge: number): number {
  if (laenge < MIN_WORTLAENGE) return 0;
  return laenge >= ZWEI_FEHLER_AB ? 2 : 1;
}

/** Die Wörter eines Textes: gefaltet zum Vergleichen, dazu die Schreibweise,
 *  wie sie im Namen steht (für die Anzeige „Ergebnisse für Interlaken").
 *  Nur Buchstabenfolgen ab `MIN_WORTLAENGE`. */
export function woerter(text: string): Array<{ wort: string; form: string }> {
  return (text.match(/\p{L}+/gu) ?? [])
    .map((form) => ({ wort: faltung(form), form }))
    .filter((w) => w.wort.length >= MIN_WORTLAENGE);
}

/**
 * Editierabstand mit Vertauschung (optimal string alignment). Bricht ab,
 * sobald `max` sicher überschritten ist, und gibt dann `max + 1` zurück.
 */
export function abstand(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let vorvorher: number[] = [];
  let vorher = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const jetzt = [i];
    let kleinster = i;
    for (let j = 1; j <= b.length; j += 1) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(vorher[j]! + 1, jetzt[j - 1]! + 1, vorher[j - 1]! + kosten);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, vorvorher[j - 2]! + 1);
      }
      jetzt.push(v);
      if (v < kleinster) kleinster = v;
    }
    if (kleinster > max) return max + 1;
    vorvorher = vorher;
    vorher = jetzt;
  }
  return vorher[b.length]!;
}

/** Legt die Wortliste an. Läuft beim Bau, nachdem `places` gefüllt ist. */
export function baueWortliste(db: Database.Database): void {
  db.exec(`
    CREATE TABLE woerter (
      wort TEXT PRIMARY KEY,
      form TEXT NOT NULL,
      anzahl INTEGER NOT NULL,
      laenge INTEGER NOT NULL,
      erster TEXT NOT NULL,
      zweiter TEXT NOT NULL
    ) WITHOUT ROWID;
  `);
  // Gefaltetes Wort -> erste gesehene Schreibweise und Zahl der Einträge.
  const liste = new Map<string, { form: string; anzahl: number }>();
  const zeilen = db.prepare('SELECT search_text FROM places').iterate() as Iterable<{ search_text: string }>;
  for (const { search_text } of zeilen) {
    // Je Eintrag nur einmal zählen: „Bahnhofstrasse Bahnhofstrasse" ist
    // nicht häufiger als eine.
    const gesehen = new Set<string>();
    for (const { wort, form } of woerter(search_text)) {
      if (gesehen.has(wort)) continue;
      gesehen.add(wort);
      const e = liste.get(wort);
      if (e) e.anzahl += 1;
      else liste.set(wort, { form, anzahl: 1 });
    }
  }
  const insert = db.prepare(
    'INSERT INTO woerter (wort, form, anzahl, laenge, erster, zweiter) VALUES (?, ?, ?, ?, ?, ?)',
  );
  db.transaction(() => {
    for (const [w, e] of liste) insert.run(w, e.form, e.anzahl, w.length, w[0], w[1]);
  })();
  db.exec('CREATE INDEX woerter_erster ON woerter(erster, laenge);');
  db.exec('CREATE INDEX woerter_zweiter ON woerter(zweiter, laenge);');
}

export interface Korrektur {
  /** Gefaltet, zum Vergleichen. */
  wort: string;
  /** Wie es im Namen steht: „Interlaken". */
  form: string;
  anzahl: number;
  fehler: number;
}

/** Das beste Wort der Liste für `eingabe`, oder null. */
export function korrigiere(db: Database.Database, eingabe: string): Korrektur | null {
  const w = faltung(eingabe);
  if (!/^\p{L}+$/u.test(w)) return null;
  const max = erlaubteFehler(w.length);
  if (max === 0) return null;
  const zeilen = db
    .prepare(
      `SELECT wort, form, anzahl FROM woerter WHERE erster = ? AND laenge BETWEEN ? AND ?
       UNION
       SELECT wort, form, anzahl FROM woerter WHERE zweiter = ? AND laenge BETWEEN ? AND ?`,
    )
    .all(w[0], w.length - max, w.length + max, w[1], w.length - max, w.length + max) as Array<{
    wort: string;
    form: string;
    anzahl: number;
  }>;
  let best: Korrektur | null = null;
  for (const z of zeilen) {
    if (z.wort === w) return null; // das Wort gibt es -- nichts zu korrigieren
    const f = abstand(w, z.wort, max);
    if (f > max) continue;
    if (!best || f < best.fehler || (f === best.fehler && z.anzahl > best.anzahl)) {
      best = { wort: z.wort, form: z.form, anzahl: z.anzahl, fehler: f };
    }
  }
  return best;
}
