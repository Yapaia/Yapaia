import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('embed/main.tsx', () => {
  it('bindet den Anker der Position ein', () => {
    // 0.48.2 brachte `EinbettungsAnker` mit, aber ohne ihn hier einzuhängen:
    // die Komponente lag im Repo, die Kachel im Dashboard merkte nichts davon.
    const quelle = readFileSync(fileURLToPath(new URL('./main.tsx', import.meta.url)), 'utf-8');
    expect(quelle).toMatch(/<EinbettungsAnker\s*\/>/);
  });
});
