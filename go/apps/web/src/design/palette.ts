/**
 * Yapaia-Design-Schema → Tailwind-Palette (docs/design-schemata.md).
 *
 * Die Oberfläche benutzt Tailwind-Farben (`bg-slate-100`, `text-blue-600` …).
 * Statt jede Klasse umzuschreiben, zeigen `slate-*`, `blue-*` und `flaeche`
 * auf CSS-Variablen (tailwind.config.js, Standardwerte = Tailwind-Farben in
 * index.css). Mit einem Schema berechnet `palette()` diese Stufen:
 *
 * - `slate` von der hellsten zur dunkelsten Schemafarbe: im hellen Schema von
 *   der Fläche zum Text, im dunklen vom Text zum Grund. So wirken die hellen
 *   (`slate-100`) wie die dunklen Klassen (`dark:bg-slate-800`) passend.
 * - `blue` = der Akzent, aufgehellt bzw. abgedunkelt.
 * - `flaeche` (statt `bg-white`) = die Fläche des Schemas.
 */

type Rgb = [number, number, number];

export function hexZuRgb(hex: string): Rgb | null {
  const h = hex.trim().replace(/^#/, '');
  const voll =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(voll)) return null;
  return [0, 2, 4].map((i) => parseInt(voll.slice(i, i + 2), 16)) as Rgb;
}

function mische(a: Rgb, b: Rgb, t: number): Rgb {
  return a.map((x, i) => Math.round(x + (b[i] - x) * t)) as Rgb;
}

function hell(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

const txt = (c: Rgb) => c.join(' ');

const SLATE: Record<number, number> = {
  50: 0.03,
  100: 0.07,
  200: 0.14,
  300: 0.24,
  400: 0.4,
  500: 0.52,
  600: 0.62,
  700: 0.75,
  800: 0.86,
  900: 0.93,
  950: 0.97,
};
// Akzent: negativ = zur hellen Seite, positiv = zur dunklen
const BLAU: Record<number, number> = {
  50: -0.92,
  100: -0.85,
  200: -0.7,
  300: -0.55,
  400: -0.3,
  500: -0.12,
  600: 0,
  700: 0.15,
  800: 0.35,
  900: 0.5,
  950: 0.65,
};

/** CSS-Variablen (`--tw-slate-100` → "r g b") aus den Farben eines Schemas. */
export function palette(
  css: Record<string, string>,
  istHell: boolean
): Record<string, string> | null {
  const f = (k: string) => hexZuRgb(css[`--y-${k}`] ?? '');
  const flaeche = f('flaeche');
  const grund = f('grund');
  const text = f('text');
  const akzent = f('akzent');
  if (!flaeche || !grund || !text || !akzent) return null;
  const [lichtSeite, dunkelSeite] = istHell ? [flaeche, text] : [text, grund];
  const [l, d] =
    hell(lichtSeite) >= hell(dunkelSeite) ? [lichtSeite, dunkelSeite] : [dunkelSeite, lichtSeite];
  const aus: Record<string, string> = { '--tw-flaeche': txt(flaeche) };
  for (const [stufe, t] of Object.entries(SLATE)) aus[`--tw-slate-${stufe}`] = txt(mische(l, d, t));
  for (const [stufe, t] of Object.entries(BLAU))
    aus[`--tw-blue-${stufe}`] = txt(t < 0 ? mische(akzent, l, -t) : mische(akzent, d, t));
  return aus;
}
