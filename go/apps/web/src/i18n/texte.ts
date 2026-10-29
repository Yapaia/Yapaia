/**
 * Namen der POI-Kategorien (`POI_AUSWAHL` aus `@yapaia/shared` ist deutsch):
 * auf Englisch nach Schlüssel übersetzt, sonst der Name aus dem Paket.
 */
import { tx, texte } from './index.js';

export const T = texte(
  {
    'poi-wohnmobil': 'Wohnmobilstellplatz',
    'poi-camping': 'Campingplatz',
    'poi-tanken': 'Tankstelle',
    'poi-laden': 'Ladesäule',
    'poi-parken': 'Parkplatz',
    'poi-einkaufen': 'Einkaufen',
    'poi-essen': 'Essen und Trinken',
    'poi-sehenswert': 'Sehenswürdigkeit',
    'poi-versorgung': 'Wasser und Entsorgung',
    'poi-entsorgung': 'Entsorgungsstation',
    'poi-frischwasser': 'Frischwasser-Zapfstelle',
    'poi-muell': 'Müllentsorgung',
    'poi-dusche': 'Dusche',
  },
  {
    'poi-wohnmobil': 'Motorhome stop',
    'poi-camping': 'Campsite',
    'poi-tanken': 'Fuel station',
    'poi-laden': 'Charging point',
    'poi-parken': 'Parking',
    'poi-einkaufen': 'Shopping',
    'poi-essen': 'Food and drink',
    'poi-sehenswert': 'Sight',
    'poi-versorgung': 'Water and disposal',
    'poi-entsorgung': 'Dump station',
    'poi-frischwasser': 'Fresh water tap',
    'poi-muell': 'Waste disposal',
    'poi-dusche': 'Shower',
  }
);

/** Anzeigename einer POI-Kategorie in der aktuellen Sprache. */
export function poiName(e: { schluessel: string; name: string }): string {
  return e.schluessel in T.de ? tx(T, e.schluessel as keyof typeof T.de) : e.name;
}
