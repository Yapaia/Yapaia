// Prüft die Übersetzungen der Karten (docs/sprachen.md):
// jede Karte hat einen Block `const TEXTE = { de: {…}, en: {…} };` (reines
// Objekt-Literal, schließendes `};` am Zeilenanfang) mit denselben Schlüsseln
// und Platzhaltern {name} in beiden Sprachen.
//   node dashboards/sprachen-pruefen.mjs            (alle Karten)
//   node dashboards/sprachen-pruefen.mjs <datei>…
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const KARTEN = [
  'dashboards/cockpit-sport/cockpit-sport-card.js',
  'dashboards/stellplatz-stil/stellplatz-card.js',
  'dashboards/stellplatz/wlan-card.js',
  'dashboards/rangieren/nivellierung-card.js',
  'dashboards/rangieren/reifen-card.js',
  'dashboards/rangieren/kamera-card.js',
  'integration/custom_components/yapaia/beat/www/yapaia-beat-card.js',
  'go/yapaia_go/lovelace/yapaia-map-card.js',
];

const platzhalter = (t) => [...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const dateien = process.argv.slice(2).length ? process.argv.slice(2) : KARTEN.map((k) => join(REPO, k));
let fehler = 0;
for (const datei of dateien) {
  const quelle = readFileSync(datei, 'utf8');
  const m = quelle.match(/^const TEXTE = (\{[\s\S]*?^\});/m);
  if (!m) {
    console.error(`${datei}: kein Block „const TEXTE = {…};“`);
    fehler++;
    continue;
  }
  const texte = new Function(`return ${m[1]}`)();
  const de = texte.de ?? {};
  const en = texte.en ?? {};
  const alle = new Set([...Object.keys(de), ...Object.keys(en)]);
  for (const k of alle) {
    if (!(k in de) || !(k in en)) {
      console.error(`${datei}: „${k}“ fehlt in ${k in de ? 'en' : 'de'}`);
      fehler++;
    } else if (typeof de[k] !== typeof en[k]) {
      console.error(`${datei}: „${k}“ hat in de und en verschiedene Typen`);
      fehler++;
    } else if (typeof de[k] === 'string' && platzhalter(de[k]) !== platzhalter(en[k])) {
      console.error(`${datei}: „${k}“ hat verschiedene Platzhalter`);
      fehler++;
    }
  }
  if (!fehler) console.log(`ok: ${datei.replace(REPO + '/', '')} (${alle.size} Texte)`);
}
process.exit(fehler ? 1 : 0);
