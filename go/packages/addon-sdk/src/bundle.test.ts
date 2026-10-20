/**
 * Lizenzgrenze (DRITTLIZENZEN.md): Das SDK steht unter Apache-2.0 und wird
 * in jedes Add-on gebündelt. Aus `@yapaia/shared` (GPL) darf es zur Laufzeit
 * nur den Apache-Ordner `src/marketplace` einbinden -- sonst wäre jedes
 * Closed-Source-Add-on GPL-pflichtig. Dieser Test bündelt das SDK wie die
 * Beispiel-Add-ons und prüft, welche Quelldateien wirklich darin landen.
 */

import { describe, it, expect } from 'vitest';
import { buildSync } from 'esbuild';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const GO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('SDK-Bündel', () => {
  it('enthält aus @yapaia/shared nur den Apache-Ordner marketplace', () => {
    const result = buildSync({
      stdin: { contents: "export * from '@yapaia/addon-sdk';", resolveDir: GO },
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: 'browser',
      alias: {
        '@yapaia/addon-sdk': join(GO, 'packages', 'addon-sdk', 'src', 'index.ts'),
        '@yapaia/shared': join(GO, 'packages', 'shared', 'src'),
      },
      logLevel: 'silent',
    });
    const inputs = Object.keys(result.metafile.inputs).map((p) => relative(GO, join(GO, p)));
    const fremd = inputs.filter(
      (p) => !p.startsWith('packages/addon-sdk/src/') && !p.startsWith('packages/shared/src/marketplace/') && p !== '<stdin>',
    );
    expect(fremd).toEqual([]);
  });
});
