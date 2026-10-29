/**
 * Das Yapaia-Design-Schema in der Go-Oberfläche (docs/design-schemata.md).
 *
 * Kommt von der Integration über den Kern (`GET api/v1/design`, Protokoll
 * §8a). Gesetzt werden die `--y-…`-Variablen des Schemas und die daraus
 * berechnete Tailwind-Palette (palette.ts). Hell oder dunkel bestimmt dann das
 * Schema (`designDunkel()`, siehe theme/applyThemeResolution.ts); der
 * Kartenstil folgt weiter dem Thema von Go.
 */

import { palette } from './palette.js';

export interface DesignSchema {
  id: string;
  name?: string;
  hell?: boolean;
  css: Record<string, string>;
}

let aktuell: DesignSchema | null = null;
let gesetzt: string[] = [];

/** `true`/`false`, wenn ein Schema hell oder dunkel vorgibt; sonst `null`. */
export function designDunkel(): boolean | null {
  return aktuell ? aktuell.hell === false : null;
}

export function designAnwenden(schema: DesignSchema | null, schriften?: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (JSON.stringify(schema) === JSON.stringify(aktuell)) return;
  for (const k of gesetzt) root.style.removeProperty(k);
  gesetzt = [];
  aktuell = schema;
  if (!schema) {
    delete root.dataset.ySchema;
    return;
  }
  const vars = { ...schema.css, ...(palette(schema.css, schema.hell !== false) ?? {}) };
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
    gesetzt.push(k);
  }
  root.dataset.ySchema = schema.id;
  root.classList.toggle('dark', schema.hell === false);
  // Schriften liegen auf dem HA-Server: nur über Ingress (gleiche Herkunft) ladbar
  if (
    schriften &&
    location.pathname.includes('/api/hassio_ingress/') &&
    !document.querySelector(`link[href="${schriften}"]`)
  ) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = schriften;
    document.head.appendChild(l);
  }
}

export async function designHolen(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}api/v1/design`, { cache: 'no-store' });
    if (!r.ok) return;
    const d = (await r.json()) as { schema?: DesignSchema; schriften?: string };
    designAnwenden(d?.schema?.css ? d.schema : null, d?.schriften);
  } catch {
    // offline oder ohne Integration: eigenes Aussehen
  }
}
