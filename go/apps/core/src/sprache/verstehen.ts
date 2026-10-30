/**
 * Was ein gesprochener Satz bedeutet -- ohne KI, ohne Netz.
 *
 * Gewünscht: „Bitte fahre mich zur Ziolkowskistraße nach Magdeburg", „Wo ist
 * die nächste Tankstelle?", „Stoppe Navigation", „Lies mir die nächste
 * Verkehrsinfo auf der Route vor". Und: „sollte nach Möglichkeit die
 * KI-Funktionen von Home Assistant nutzen, aber auch gerne bei Bedarf autark
 * funktionieren."
 *
 * Diese Datei ist der autarke Teil: feste Satzmuster für die häufigen
 * Befehle. Eine KI (über Home Assistant) kommt erst dazu, wenn hier nichts
 * passt -- siehe `dialog.ts`. So bleibt das Wichtige verlässlich, auch im
 * Funkloch.
 *
 * Spracherkennung schreibt, was sie hört: Groß/klein, Satzzeichen und
 * Füllwörter („bitte", „mal") sind beliebig. Deshalb wird zuerst geglättet.
 *
 * Deutsch und Englisch werden immer beide verstanden -- unabhängig von der
 * eingestellten Sprache (docs/sprachen.md). Nur die Antworten folgen ihr.
 */

import { UNTERWEGS_KATEGORIEN } from '@yapaia/shared';
import { tx } from '../i18n.js';
import { T } from './texte.js';

export type Absicht =
  | { art: 'ziel'; ort: string }
  | { art: 'naechste'; kategorie: string }
  | { art: 'naechste_name'; name: string }
  | { art: 'stopp' }
  | { art: 'pause' }
  | { art: 'weiter' }
  | { art: 'verkehr'; anzahl: number }
  | { art: 'ankunft' }
  | { art: 'ansagen'; an: boolean }
  | { art: 'ja' }
  | { art: 'nein' }
  | { art: 'wahl'; nummer: number }
  | { art: 'hilfe' }
  | { art: 'unbekannt'; text: string };

/** Wie Spracherkennung „Yapaia" schreibt -- und das Wort davor weg. */
const ANREDE = /^(?:(?:hey|hallo|hello|hi|ok(?:ay)?)\s+)?(?:yapa[ijy]a|japa[ijy]a|ja\s*pa[ij]a|navi)\b[\s,:]*/;

/** Glätten: klein, ohne Satzzeichen, ohne Anrede und Füllwörter. */
export function glaetten(text: string): string {
  let t = text
    .toLowerCase()
    .replace(/[„“”"'’!?.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(ANREDE, '').trim();
  t = t.replace(/\b(bitte|mal|doch|jetzt|gerne?|kannst du|könntest du|würdest du|du)\b/g, ' ');
  // Englisch: „please", „can you" … -- „just" nur vorn, sonst stört es nicht.
  t = t.replace(/\b(please|can you|could you|would you|will you|now)\b/g, ' ').replace(/^\s*just\b/, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/** Stichwörter je „Unterwegs"-Kategorie. Die erste passende gewinnt. */
const KATEGORIE_WOERTER: ReadonlyArray<[string, RegExp]> = [
  ['fuel', /tank(stelle|en)?|sprit|diesel|benzin|zapfsäule|petrol|fuel|gas station|filling station|service station/],
  ['sanitary_dump_station', /entsorg|grauwasser|schwarzwasser|chemie ?klo|kassette|dump ?station|grey ?water|gray ?water|black ?water|waste ?water|chemical toilet|cassette|empty the toilet/],
  ['water_point', /frischwasser|wasser ?(auffüllen|tanken|stelle)|trinkwasser|fresh ?water|drinking water|water (point|tap|refill)|\bwater\b/],
  ['caravan_site', /stellplatz|wohnmobil ?(stell)?platz|übernacht|schlafplatz|motorhome|camper ?van|caravan|\baire\b|overnight|place to (sleep|stay)|stay the night|\brv\b/],
  ['camp_site', /camping|campsite|campground/],
  ['parking', /parkplatz|parken|rastplatz|\bpark(ing)?\b|car park|lay ?by|rest (area|stop)/],
  ['supermarket', /supermarkt|einkauf|lebensmittel|laden|supermarket|grocer(y|ies)|\bshop(ping)?\b|food store/],
  ['gas', /gas(flasche|tausch)?|propan|lpg|propane|calor|butane/],
  ['toilets', /toilette|klo|wc|toilet|\bloo\b|restroom|bathroom/],
];

export function kategorieAus(text: string): string | null {
  for (const [id, re] of KATEGORIE_WOERTER) if (re.test(text)) return id;
  return null;
}

const ZAHLWORT: Readonly<Record<string, number>> = {
  ersten: 1, erste: 1, eins: 1, erstes: 1,
  zweiten: 2, zweite: 2, zwei: 2, zweites: 2,
  dritten: 3, dritte: 3, drei: 3, drittes: 3,
  vierten: 4, vierte: 4, vier: 4,
  fünften: 5, fünfte: 5, fünf: 5,
  first: 1, one: 1, second: 2, two: 2, third: 3, three: 3, fourth: 4, four: 4, fifth: 5, five: 5,
};

/**
 * Aus „zur Ziolkowskistraße nach Magdeburg" wird „Ziolkowskistraße Magdeburg".
 * Die Verbindungswörter stehen in keinem Namen und würden die Suche leeren.
 */
export function ortAus(rest: string): string {
  return rest
    .replace(/\b(zu[mr]?|nach|in|im|in die|in den|ins|bis|an die|an den|zum|zur|der|die|das|dem|den|richtung|hin|bringen|fahren|navigieren|führen)\b/g, ' ')
    // Englisch: „to the campsite", „directions to Bath", „the way to York"
    // (Grenzen über Buchstaben statt \b: \b kennt kein ü, „süd" bliebe sonst nicht heil.)
    .replace(/(?<!\p{L})(the way to|directions to|to|towards?|into|the)(?!\p{L})/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Aus „finde den nächsten Aldi in der Nähe" wird „aldi". */
export function nameAus(t: string): string {
  return t
    .replace(/\b(in der nähe|um die ecke|von hier( aus)?|hier|near me|nearby|close by|around here|from here|here)\b/g, ' ')
    .replace(
      /(?<!\p{L})(where|is|s|there|find|look for|search for|show|take|drive|go|get|navigat\p{L}*|guide|me|us|i|we|need|want|can|to|the|a|an|any|nearest|closest|next)(?!\p{L})/gu,
      ' ',
    )
    .replace(
      /\b(wo|ist|gibt|es|finde ich|find\w*|such\w*|zeig\w*|fahre?|fahr\w*|bring\w*|navigier\w*|führ\w*|lotse?|ich|wir|brauche\w*|will|wollen|möchte\w*|mich|uns|mir|der|die|das|den|dem|des|zu[mr]?|nach|ein|eine|einen|einem|einer|nächst\w*|nächstgelegen\w*|gelegen\w*|liegt|befindet sich)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function verstehe(roh: string): Absicht {
  const t = glaetten(roh);
  if (!t) return { art: 'unbekannt', text: roh };

  // ─── KURZE ANTWORTEN AUF EINE RÜCKFRAGE ─────────────────────────────────
  if (/^(ja|jawohl|genau|okay|ok|los|fahr los|starte?|start|mach das|mach|klar|passt|gerne|gern)( los| die navigation| navigation)?$/.test(t)) {
    return { art: 'ja' };
  }
  if (/^(yes|yeah|yep|yup|sure|go|go ahead|let s go|do it|alright|all right|correct|of course|start|ok|okay)( yes| go| please| then| the navigation| navigation)?$/.test(t)) {
    return { art: 'ja' };
  }
  if (/^(nein|nee|nö|abbrechen|vergiss es|lass( es)?|doch nicht)$/.test(t)) return { art: 'nein' };
  if (/^(no|nope|nah|cancel|never ?mind|forget it|don t|no thanks|no thank you)$/.test(t)) return { art: 'nein' };
  const wahl = t.match(
    /^(?:nimm |den |die |das |nummer |option |take |the |number |no )*(\d|ersten|erste|erstes|zweiten|zweite|zweites|dritten|dritte|drittes|vierten|vierte|fünften|fünfte|eins|zwei|drei|vier|fünf|first|second|third|fourth|fifth|one|two|three|four|five)\b/,
  );
  if (wahl && t.split(' ').length <= 3) {
    const n = /^\d$/.test(wahl[1]!) ? Number(wahl[1]) : ZAHLWORT[wahl[1]!];
    if (n) return { art: 'wahl', nummer: n };
  }

  // ─── NAVIGATION STEUERN ─────────────────────────────────────────────────
  if (/\b(stopp?e?|stop|beende|beenden|abbrechen|brich)\b.*\b(navi|navigation|führung|route|fahrt)\b|\b(navi|navigation|route|führung)\b.*\b(stopp?en|beenden|abbrechen|aus)\b|^(stopp?|halt|ende|anhalten)$/.test(t)) {
    return { art: 'stopp' };
  }
  if (
    /\b(stop|end|cancel|quit|exit|turn off|switch off)\b.*\b(navigation|route|guidance|trip|directions)\b|\b(navigation|route)\b.*\b(stop|off|end)\b/.test(t) &&
    !/\b(voice|announcements?|spoken|speech)\b/.test(t)
  ) {
    return { art: 'stopp' };
  }
  if (/\b(pausier\w*|pause|unterbrech\w*)\b/.test(t)) return { art: 'pause' };
  if (/\b(resume|continue|carry on|keep going|unpause)\b/.test(t)) return { art: 'weiter' };
  if (/\b(weiter(fahren|machen)?|fortsetzen|setze? fort|navigation weiter)\b/.test(t) && !/\bwie weit\b/.test(t)) {
    return { art: 'weiter' };
  }

  // ─── ANSAGEN ────────────────────────────────────────────────────────────
  if (/\b(ansage\w*|sprach ?ausgabe|stimme)\b/.test(t)) {
    if (/\b(aus|stumm|ruhig|abschalten|ausschalten|leise)\b/.test(t)) return { art: 'ansagen', an: false };
    if (/\b(an|ein|einschalten|anschalten)\b/.test(t)) return { art: 'ansagen', an: true };
  }
  if (/^(sei )?(still|ruhe|ruhig)$/.test(t)) return { art: 'ansagen', an: false };
  if (/\b(announcements?|voice( guidance| prompts)?|spoken (directions|guidance)|speech|prompts)\b/.test(t)) {
    if (/\b(off|mute|silent|quiet|disable|stop)\b/.test(t)) return { art: 'ansagen', an: false };
    if (/\b(on|unmute|enable)\b/.test(t)) return { art: 'ansagen', an: true };
  }
  if (/^(be )?(quiet|silent)$|^(mute|silence|shut up)$/.test(t)) return { art: 'ansagen', an: false };
  if (/^unmute$/.test(t)) return { art: 'ansagen', an: true };

  // ─── VERKEHR VORLESEN ───────────────────────────────────────────────────
  if (/\b(verkehr\w*|stau\w*|baustelle\w*|sperrung\w*|meldung\w*|traffic|jams?|tailbacks?|roadworks?|road works|closures?|incidents?|reports?)\b/.test(t)) {
    const alle = /\b(alle|die nächsten|mehrere|liste|all|next few|several|list)\b/.test(t);
    const zahl = t.match(/\b(zwei|drei|vier|fünf|two|three|four|five|\d)\b/);
    const n = zahl ? (/^\d$/.test(zahl[1]!) ? Number(zahl[1]) : (ZAHLWORT[zahl[1]!] ?? 1)) : alle ? 3 : 1;
    return { art: 'verkehr', anzahl: Math.min(5, Math.max(1, n)) };
  }

  // ─── ANKUNFT ────────────────────────────────────────────────────────────
  if (/\b(wann (sind|kommen|bin)|ankunft|wie (lange|weit) (noch|ist es)|wie lange|wie weit|restzeit|eta)\b/.test(t)) {
    return { art: 'ankunft' };
  }
  if (
    /\b(when (will|do|are|shall) we (arrive|get there|be there)|arrival|how (long|far)|time (left|remaining)|are we there yet)\b/.test(t) &&
    !/\b(nearest|closest|next)\b/.test(t)
  ) {
    return { art: 'ankunft' };
  }

  // ─── HILFE ──────────────────────────────────────────────────────────────
  if (/^(hilfe|was kannst|was geht|befehle|help|what can i say|what (can )?do$|commands)/.test(t)) return { art: 'hilfe' };

  // ─── NÄCHSTE TANKSTELLE … ───────────────────────────────────────────────
  // Vor dem Ziel geprüft: „fahre mich zur nächsten Tankstelle" ist eine
  // Suche nach der nächsten, kein Ortsname „nächste Tankstelle".
  if (
    /\b(nächst\w*|nächstgelegen\w*|in der nähe|nahe|um die ecke|nearest|closest|next|nearby|near me|close by|around here)\b|^(wo|such\w*|find\w*|zeig\w*|brauche?|wir brauchen|ich brauche|where|search|look for|show|we need|i need|need)\b/.test(t)
  ) {
    const kat = kategorieAus(t);
    if (kat) return { art: 'naechste', kategorie: kat };
  }
  // „Finde den nächsten Aldi", „wo ist hier ein Lidl": ein NAME statt einer
  // Kategorie. Nur mit „nächst…"/„in der Nähe"/„wo ist ein" -- „fahr zu
  // Aldi" allein bleibt ein Ziel.
  if (
    /\b(nächst\w*|nächstgelegen\w*|in der nähe|um die ecke|nearest|closest|near me|nearby|around here)\b|^wo (ist|gibt es|finde ich) (hier )?(ein|eine|einen)\b|^where (is|s|can i find|can we find) (there )?(an?)\b|^is there (an?)\b/.test(t)
  ) {
    const name = nameAus(t);
    if (name.length >= 2) return { art: 'naechste_name', name };
  }

  // ─── ZIEL ───────────────────────────────────────────────────────────────
  const ziel = t.match(
    /^(?:fahre?|fahr|bring\w*|navigier\w*|navigate|führ\w*|route|lotse?|ich will|ich möchte|wir wollen|wir möchten|drive|take|guide|go|head|get|show|directions|i want to go|we want to go|i d like to go|we d like to go|let s go)(?:\s+(?:mich|uns|me|us))?(?:\s+(?:bitte))?\s+(.+)$/,
  );
  if (ziel) {
    const ort = ortAus(ziel[1]!);
    if (ort.length >= 3) return { art: 'ziel', ort };
  }
  const nach = t.match(/^(?:nach|zu[mr]?|to)\s+(.+)$/);
  if (nach) {
    const ort = ortAus(nach[1]!);
    if (ort.length >= 3) return { art: 'ziel', ort };
  }

  return { art: 'unbekannt', text: t };
}

/** Der Name einer Kategorie für die Antwort, in der eingestellten Sprache. */
export function kategorieName(id: string): string {
  const schluessel = `kat_${id}`;
  if (schluessel in T.de) return tx(T, schluessel as keyof typeof T.de);
  return UNTERWEGS_KATEGORIEN.find((k) => k.id === id)?.name ?? id;
}
