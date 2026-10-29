const STUFEN = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
function stufen(name) {
  return Object.fromEntries(STUFEN.map((s) => [s, `rgb(var(--tw-${name}-${s}) / <alpha-value>)`]));
}

export default {
  content: ['./index.html', './shell.html', './src/**/*.{js,ts,jsx,tsx}'],
  // E07-T3: theme is driven by the theme controller (`src/theme/`), not the
  // OS `prefers-color-scheme` media query -- it toggles a `dark` class on
  // `<html>` (`applyThemeResolution.ts`) so auto/manual mode selection,
  // sunrise/sunset, and the day/night clock fallback all take effect
  // regardless of the OS setting. Every existing `dark:` variant across the
  // app (previously following `media`, i.e. the OS setting) now follows
  // this class instead -- intentional and required by the task, not a
  // regression: the theme controller always resolves to a concrete
  // light/dark and sets/removes the class, so those components keep
  // rendering exactly as before, just theme-controller-driven instead of
  // OS-driven.
  darkMode: 'class',
  theme: {
    extend: {
      // ─── YAPAIA-DESIGN-SCHEMA ────────────────────────────────────────────
      // slate, blue und `flaeche` (statt bg-white) zeigen auf CSS-Variablen.
      // Standard = die Tailwind-Farben (src/index.css), mit Schema berechnet
      // src/design/palette.ts die Stufen aus dessen Farben.
      colors: {
        slate: stufen('slate'),
        blue: stufen('blue'),
        flaeche: 'rgb(var(--tw-flaeche) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
