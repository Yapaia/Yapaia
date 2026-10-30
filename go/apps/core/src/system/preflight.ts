/* eslint-disable no-undef -- `AbortController`, `setTimeout`/`clearTimeout`
 * und `fetch` sind Standard-Globals unter Node 22 (typisiert über
 * @types/node); die gemeinsame eslint-`globals`-Liste ist älter als diese
 * Backend-Module und kennt nur console/process/DOM. Gleiche Begründung wie
 * in `addons/proxy.ts` und `routing/valhallaClient.ts`. */

/**
 * Installationsprüfung („Preflight") — `feat/gui-install-path`.
 *
 * WOZU
 * ----
 * Yapaia Go besteht nicht nur aus dem Core-Prozess. Damit navigiert werden
 * kann, müssen daneben Dinge existieren, die NICHT im Add-on-Image stecken,
 * weil sie gerätespezifisch und gigabytegroß sind: die Kartenkacheln
 * (`*.pmtiles`), der Valhalla-Routinggraph, ein Suchindex (Photon ODER der
 * Lite-Index aus W-12) und eine Positionsquelle.
 *
 * Fehlt eines davon, verhält sich die App bisher zwar korrekt (kein Absturz,
 * saubere Fehlermeldungen an der jeweiligen Stelle) — aber der Betreiber
 * erfährt es erst, wenn er die betroffene Funktion benutzt, und dann pro
 * Funktion einzeln. Wer das Add-on über die Home-Assistant-GUI installiert
 * hat und ausdrücklich NICHT über SSH arbeiten will, hat sonst keinen Weg,
 * den Zustand seiner Installation überhaupt zu sehen.
 *
 * Diese Prüfung beantwortet in EINEM Aufruf: was fehlt, wie schlimm es ist,
 * und was konkret dagegen zu tun ist.
 *
 * WAS SIE AUSDRÜCKLICH NICHT IST
 * ------------------------------
 * Kein Ersatz für `GET /api/v1/health`. Health ist eine Liveness-Sonde:
 * billig, ohne Netzzugriff, geeignet für einen Supervisor-Watchdog.
 * Preflight darf teuer sein — sie öffnet TCP-Verbindungen zu Valhalla,
 * Photon und gpsd und liest das Dateisystem. Sie wird von der GUI auf
 * Anforderung aufgerufen, nicht im Sekundentakt.
 *
 * AUFBAU
 * ------
 * Jede Prüfung liefert dieselbe Struktur, damit die GUI sie generisch
 * darstellen kann und eine neue Prüfung kein Frontend-Update braucht.
 * `severity` trennt „geht gar nicht" von „geht, aber eingeschränkt":
 *
 *   - `required`  fehlt → die Kernfunktion (Karte + Route) ist unbenutzbar
 *   - `recommended` fehlt → Yapaia läuft, eine Teilfunktion fehlt
 *   - `optional`  fehlt → reine Zusatzfunktion, kein Mangel
 *
 * `remedy` ist der eigentliche Zweck der Datei: eine Anweisung in ganzen
 * Sätzen, die auf einen Weg in der GUI zeigt, wo es einen gibt. Ein
 * Prüfergebnis ohne Handlungsanweisung ist für den Adressaten wertlos —
 * genau deshalb ist `remedy` bei allem außer `ok` verpflichtend (und
 * `preflight.test.ts` erzwingt das).
 *
 * TESTBARKEIT
 * -----------
 * Sämtliche Außenkontakte (Verzeichnis lesen, Datei statten, TCP öffnen,
 * HTTP holen, RAM abfragen) kommen über `PreflightDeps` herein. Kein Test
 * greift auf einen echten Host oder ein echtes Verzeichnis zu, und
 * umgekehrt kann kein Test „grün" sein, weil ein Ergebnis fest verdrahtet
 * wurde — die Tests belegen, dass die Werte wirklich aus den (gefälschten)
 * Sonden stammen.
 */

import { readdir, readFile, stat } from 'fs/promises';
import { istCompanionAppQuelle, istRut50Quelle } from '../position/gpsSourceOption.js';
import { parseHostPort } from '../position/modbus/index.js';
import { totalmem } from 'os';
import { createConnection } from 'net';
import { resolveTilesDir } from '../map/paths.js';
import { listLiteSearchDbFiles, resolveLiteSearchDir } from '../search/lite/paths.js';
import { resolveHaConnection } from '../ha/config.js';
import { fetchHaStates } from '../ha/client.js';
import { listGpsTrackers } from '../position/haTracker/index.js';
import { istEigeneEntitaet } from '../ha/eigeneEntitaeten.js';
import { tx } from '../i18n.js';
import { T } from './texte.js';

/** Kennung einer Prüfung. Stabil — die GUI und die Doku verweisen darauf. */
export type PreflightCheckId =
  | 'tiles'
  | 'routing'
  | 'search'
  | 'position'
  | 'memory'
  | 'disk'
  | 'mqtt';

export type PreflightStatus = 'ok' | 'warn' | 'fail';

export type PreflightSeverity = 'required' | 'recommended' | 'optional';

export interface PreflightCheck {
  id: PreflightCheckId;
  /** Kurzer Titel für die GUI (deutsch). */
  label: string;
  status: PreflightStatus;
  severity: PreflightSeverity;
  /** Was tatsächlich vorgefunden wurde — mit Zahlen/Pfaden, nicht nur „ok". */
  detail: string;
  /** Was dagegen zu tun ist. Bei `status !== 'ok'` immer gesetzt. */
  remedy?: string;
}

export interface PreflightReport {
  /** `fail`, wenn eine `required`-Prüfung fehlschlägt; sonst `warn`, wenn
   *  irgendetwas nicht `ok` ist; sonst `ok`. */
  status: PreflightStatus;
  /** Ein Satz, der den Gesamtzustand beschreibt (deutsch). */
  summary: string;
  checks: PreflightCheck[];
  /** Wann gemessen wurde (ISO-8601) — die GUI zeigt sonst beliebig alte
   *  Ergebnisse ohne Hinweis darauf an. */
  checkedAt: string;
}

// ───────────────────────── Sonden (injizierbar) ─────────────────────────

/** Verzeichnisinhalt; wirft, wenn es das Verzeichnis nicht gibt. */
export type ListDirFn = (path: string) => Promise<string[]>;
/** Dateigröße in Bytes, oder `null`, wenn es die Datei nicht gibt. */
export type FileSizeFn = (path: string) => Promise<number | null>;
/** Ist an `host:port` etwas erreichbar? Nur TCP, kein Protokoll. */
export type TcpProbeFn = (host: string, port: number, timeoutMs: number) => Promise<boolean>;
/** Antwortet `url` mit einem HTTP-Status < 500? */
export type HttpProbeFn = (url: string, timeoutMs: number) => Promise<boolean>;
/**
 * Alle `device_tracker.*`-Entitaeten in Home Assistant, die Koordinaten
 * tragen. `null` heisst „konnte nicht nachsehen" (Home Assistant nicht
 * konfiguriert oder nicht erreichbar) und ist ausdruecklich etwas anderes als
 * `[]` („nachgesehen, keiner da") -- die Prueftexte unterscheiden das, weil
 * die Handlungsanweisung eine voellig andere ist.
 */
export type ListHaTrackersFn = () => Promise<string[] | null>;

export interface PreflightDeps {
  listDir?: ListDirFn;
  fileSize?: FileSizeFn;
  /** Die vorhandenen Suchindizes (seit 0.5.0 einer je Region).
   *
   *  Eigene Naht, damit die Pruefung testbar bleibt: sie las die Platte
   *  vorher ausschliesslich ueber `fileSize`. Ein direkter Verzeichnis-
   *  zugriff daneben haette jeden Test still an der echten Platte messen
   *  lassen -- und genau das ist beim Einbau passiert. */
  listSearchIndexes?: (dir: string) => string[];
  tcpProbe?: TcpProbeFn;
  httpProbe?: HttpProbeFn;
  listHaTrackers?: ListHaTrackersFn;
  /**
   * Welche Tracker-Entitaet tatsaechlich gilt.
   *
   * MUSS dieselbe Aufloesung benutzen wie `HaTrackerSource` (Einstellung
   * `ha.device_tracker` zuerst, dann die Add-on-Option) -- sonst prueft diese
   * Datei etwas anderes, als das laufende System tut. Genau das war der
   * Fehler: seit 0.7.1 waehlt man den Tracker in Yapaia, und die Pruefung las
   * weiterhin nur die Umgebung.
   *
   * Vorgabe ohne Angabe: nur die Umgebung -- fuer Tests und fuer jeden
   * Aufrufer, der keine Einstellungen hat.
   */
  resolveTrackerId?: () => string;
  /**
   * Was der gpsd-Dienst zuletzt ueber die Geraetewahl hinterlegt hat.
   *
   * `null`, wenn es nichts gibt -- im Standalone-Betrieb ohne Add-on, oder
   * bevor der Dienst das erste Mal durchgelaufen ist. Die Pruefung faellt
   * dann auf die allgemeinen Hinweise zurueck.
   */
  readGpsStatus?: () => Promise<string | null>;
  /**
   * Loest sich der Pfad wirklich auf? FOLGT Symlinks -- das ist der Punkt.
   *
   * `/dev/serial/by-id/` besteht aus Symlinks auf `../../ttyACM0`. Wird der
   * Link durchgereicht, der Knoten dahinter aber nicht, LISTET `readdir` den
   * Namen weiterhin: die Pruefung meldete „Gefunden wurden: …" fuer ein
   * Geraet, das gpsd nicht oeffnen kann. `gpsd/run` prueft mit `[ -e ]`, das
   * dem Link folgt, und sagt „dort liegt nichts". Beide hatten recht, und der
   * Betreiber stand zwischen zwei Aussagen, die sich widersprachen.
   */
  pathResolves?: (pfad: string) => Promise<boolean>;
  totalMem?: () => number;
  /** Freier Plattenplatz im Datenverzeichnis, in Bytes. */
  diskFree?: (path: string) => Promise<number>;
  /** Ersetzt `process.env` — so kann ein Test eine ganze Konfiguration
   *  durchspielen, ohne globale Variablen zu verändern (parallele Tests). */
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

/** Zeitbudget je Netzsonde. Bewusst knapp: die Prüfung läuft auf Anforderung
 *  in der GUI, und ein nicht laufender Dienst soll als „fehlt" erscheinen,
 *  nicht als Hänger. Fünf Sonden × 1,5 s ist auch im schlimmsten Fall eine
 *  Antwortzeit, die ein Bedienelement noch aushält. */
export const PROBE_TIMEOUT_MS = 1500;

/** Ab wann die Vollausstattung (Photon + Valhalla + Core) auf einem Gerät
 *  eng wird. 8 GB ist der real vermessene Fall (HAOS-VM unter Proxmox):
 *  Photon will allein ~2 GB Heap, Valhalla je nach Region ähnlich viel, und
 *  Home Assistant selbst läuft daneben weiter. Das ist keine harte Grenze,
 *  sondern der Punkt, ab dem der Lite-Index (W-12) die verlässlichere Wahl
 *  ist — deshalb `warn` und nicht `fail`. */
export const PHOTON_COMFORTABLE_RAM_BYTES = 10 * 1024 * 1024 * 1024;

async function defaultListDir(path: string): Promise<string[]> {
  return readdir(path);
}

/** Wo die stabilen Gerätenamen liegen. Im Container dasselbe `/dev` wie für
 *  gpsd — der Kern läuft daneben, nicht woanders. */
export const SERIAL_BY_ID_DIR = '/dev/serial/by-id';

/** Wo der gpsd-Dienst hinterlegt, warum er läuft oder nicht.
 *  Denselben Pfad exportiert `init-yapaia-config.sh` als `GPS_STATUS_DATEI`. */
export const GPS_STATUS_DATEI = '/run/yapaia/gps-status';

/**
 * Die Begründung des gpsd-Dienstes, oder `null`.
 *
 * Die Datei hat zwei Teile: erste Zeile der Zustand (`suchend`/`bereit`),
 * danach der Klartext. Zurückgegeben wird nur der Klartext — der Zustand ist
 * für den Aufrufer bereits dadurch beantwortet, dass gpsd nicht antwortet.
 *
 * Fehlt die Datei, ist das KEIN Fehler: im Standalone-Betrieb gibt es keinen
 * Add-on-Dienst, der etwas hinterlegen könnte, und beim allerersten Start
 * kommt die Prüfung dem Dienst womöglich zuvor.
 */
export function parseGpsStatus(inhalt: string): string | null {
  const zeilen = inhalt.split('\n');
  const text = zeilen.slice(1).join('\n').trim();
  return text.length > 0 ? text : null;
}

function defaultReadGpsStatus(env: Record<string, string | undefined>) {
  return async (): Promise<string | null> => {
    try {
      return parseGpsStatus(await readFile(env.GPS_STATUS_DATEI || GPS_STATUS_DATEI, 'utf-8'));
    } catch {
      return null;
    }
  };
}

/**
 * Welche seriellen Geräte im Container sichtbar sind.
 *
 * ─── WARUM DAS IN DIE INSTALLATIONSPRUEFUNG GEHOERT ─────────────────────────
 * Der Hilfetext weiter unten sagt seit 0.3.1 „tragen Sie das Gerät unter
 * `gps_device` ein". Wo man den Pfad HERBEKOMMT, stand nirgends — und ohne
 * SSH kommt man im Add-on gar nicht an ein `ls`. Der Betreiber hat
 * ausdrücklich gesagt, dass er alles aus der Oberfläche erledigen möchte.
 *
 * `by-id` zuerst, weil genau diese Pfade in die Konfiguration gehören: die
 * Nummer in `ttyACM0` verschiebt sich, sobald ein anderer USB-Stick dazukommt
 * oder wegfällt. Die rohen Knoten kommen nur, wenn es kein `by-id` gibt --
 * dann sind sie das Einzige, was man eintragen KANN.
 */
export async function listSerialDevices(listDir: ListDirFn): Promise<string[]> {
  try {
    const eintraege = await listDir(SERIAL_BY_ID_DIR);
    if (eintraege.length > 0) {
      return eintraege.sort().map((name) => `${SERIAL_BY_ID_DIR}/${name}`);
    }
  } catch {
    // Kein `by-id`-Verzeichnis (udev nicht durchgereicht, älteres System).
    // Kein Fehler, nur ein Grund, die rohen Knoten zu nehmen.
  }
  try {
    const eintraege = await listDir('/dev');
    return eintraege
      .filter((name) => /^tty(ACM|USB)\d+$/.test(name))
      .sort()
      .map((name) => `/dev/${name}`);
  } catch {
    return [];
  }
}

/** Folgt Symlinks; `false` fuer einen Link, dessen Ziel fehlt. */
async function defaultPathResolves(pfad: string): Promise<boolean> {
  try {
    await stat(pfad);
    return true;
  } catch {
    return false;
  }
}

/**
 * Die Geraeteliste fuer die Meldung — mit dem Vermerk, welcher Eintrag ins
 * Leere zeigt. Ohne den Vermerk ist die Liste im schlimmsten Fall irrefuehrend:
 * sie nennt genau das Geraet, das der Betreiber eintragen soll, und das
 * Eintragen hilft dann nicht.
 */
export async function beschrifteGeraete(
  geraete: string[],
  pathResolves: (pfad: string) => Promise<boolean>,
): Promise<string[]> {
  return Promise.all(
    geraete.map(async (pfad) =>
      (await pathResolves(pfad)) ? pfad : tx(T, 'linkDead', { pfad }),
    ),
  );
}

async function defaultFileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

function defaultTcpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = (result: boolean): void => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolvePromise(result);
      }
    };
    const socket = createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

async function defaultHttpProbe(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    // Ein 404 heißt „Dienst da, Pfad anders" — für die Frage „läuft der
    // Dienst überhaupt" ist das ein JA. Nur 5xx und Verbindungsfehler
    // zählen als nicht erreichbar.
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fragt Home Assistant selbst, welche Tracker es gibt.
 *
 * Bis 2026-09-03 stand in `yapaia_go/config.yaml`, diese Pruefung liste die
 * in Frage kommenden Entitaeten auf. Sie tat es nicht -- der Satz war eine
 * Zusage an den Betreiber, die niemand eingeloest hat, und er stand
 * ausgerechnet an der Stelle, an der man die Entity-ID sonst raten muss.
 * Hier wird sie eingeloest.
 *
 * Fehler werden geschluckt (`null`): eine Diagnoseseite, die selbst
 * abstuerzt, weil Home Assistant langsam ist, ist genau dann kaputt, wenn man
 * sie braucht.
 */
function defaultListHaTrackers(env: Record<string, string | undefined>): ListHaTrackersFn {
  return async (): Promise<string[] | null> => {
    const connection = resolveHaConnection({ env });
    if (!connection) {
      return null;
    }
    const noop = (): void => {};
    const states = await fetchHaStates(connection, {
      logger: { info: noop, warn: noop, error: noop },
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    // `fetchHaStates` schluckt Fehler und liefert dann `[]`. Fuer die
    // Unterscheidung „nicht erreichbar" vs. „erreichbar, aber kein Tracker"
    // ist ein leeres Gesamtergebnis das verlaesslichere Signal: eine laufende
    // HA-Instanz hat IMMER Zustaende (`sun.sun`, `person.*`, ...).
    if (states.length === 0) {
      return null;
    }
    return listGpsTrackers(states);
  };
}

async function defaultDiskFree(path: string): Promise<number> {
  const { getSystemResources } = await import('./resources.js');
  const res = await getSystemResources(path);
  return res.disk_free_bytes;
}

// ───────────────────────────── Hilfsmittel ──────────────────────────────

function formatGiB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatMiB(bytes: number): string {
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ───────────────────────────── Die Prüfungen ────────────────────────────

async function checkTiles(tilesDir: string, listDir: ListDirFn): Promise<PreflightCheck> {
  const base = {
    id: 'tiles' as const,
    label: tx(T, 'lblTiles'),
    severity: 'required' as const,
  };
  // Diese Anweisung nennt ABSICHTLICH keinen Knopf in der Oberfläche: es gibt
  // keinen. Bis 2026-09-02 stand hier „(Knopf „Kacheln bauen")" — den hat nie
  // jemand gebaut (Backlog B-04). Eine Anweisung, die auf ein Bedienelement
  // zeigt, das der Adressat nicht finden kann, ist genauso wertlos wie die
  // 404-URL, die dieses ganze Thema ausgelöst hat.
  const remedy = tx(T, 'tilesRemedy');

  let entries: string[];
  try {
    entries = await listDir(tilesDir);
  } catch {
    return {
      ...base,
      status: 'fail',
      detail: tx(T, 'tilesDirMissing', { dir: tilesDir }),
      remedy,
    };
  }

  const tiles = entries.filter((name) => name.endsWith('.pmtiles'));
  const partials = entries.filter((name) => name.endsWith('.pmtiles.part'));

  if (tiles.length === 0) {
    return {
      ...base,
      status: 'fail',
      detail:
        partials.length > 0
          ? tx(T, 'tilesPartial', { dir: tilesDir, n: partials.length })
          : tx(T, 'tilesNone', { dir: tilesDir }),
      remedy:
        partials.length > 0 ? tx(T, 'tilesPartialRemedy') + remedy : remedy,
    };
  }

  return {
    ...base,
    status: 'ok',
    detail: tx(T, 'tilesOk', {
      n: tiles.length,
      liste: tiles.map((name) => name.replace(/\.pmtiles$/, '')).join(', '),
    }),
  };
}

async function checkRouting(
  env: Record<string, string | undefined>,
  httpProbe: HttpProbeFn,
): Promise<PreflightCheck> {
  const base = {
    id: 'routing' as const,
    label: tx(T, 'lblRouting'),
    severity: 'required' as const,
  };
  const url = env.VALHALLA_URL || 'http://localhost:8002';
  // ZWEI FRUEHERE FASSUNGEN DIESES TEXTES WAREN FALSCH.
  //
  // Zuerst stand hier „er wird beim Bau einer Region miterzeugt" -- das tut
  // `build-pmtiles.sh` nicht, es baut ausschliesslich Kacheln.
  //
  // Danach stand hier, der Graph koenne auf dem Geraet „NICHT gebaut werden:
  // das Bauwerkzeug braucht einen Docker-Socket". Das galt fuer unser SKRIPT
  // (`services/valhalla/build-tiles.sh` faehrt ein Image von aussen an), aber
  // nicht fuer die WERKZEUGE: das Add-on-Image setzt mit `FROM` auf
  // `gis-ops/docker-valhalla` auf, dessen Dockerfile `valhalla_build_tiles`,
  // `valhalla_build_config` und Geschwister ausdruecklich aufbewahrt -- samt
  // dem Bau-Rezept unter /valhalla/scripts/. Der Text schickte den Betreiber
  // also an einen zweiten Rechner, obwohl alles Noetige im Container lag.
  //
  // Dieselbe Fehlerklasse wie der JAR-Modus bei planetiler, und derselbe
  // Preis: eine Anweisung, die aus dem vorgesehenen Bedienweg hinausfuehrt.
  const remedy = tx(T, 'routingRemedy');

  const reachable = await httpProbe(`${url}/status`, PROBE_TIMEOUT_MS);
  return reachable
    ? { ...base, status: 'ok', detail: tx(T, 'routingOk', { url }) }
    : { ...base, status: 'fail', detail: tx(T, 'routingDown', { url }), remedy };
}

async function checkSearch(
  env: Record<string, string | undefined>,
  httpProbe: HttpProbeFn,
  fileSize: FileSizeFn,
  listSearchIndexes: (dir: string) => string[],
): Promise<PreflightCheck> {
  const base = {
    id: 'search' as const,
    label: tx(T, 'lblSearch'),
    severity: 'recommended' as const,
  };

  const photonEnabled = env.PHOTON_ENABLED !== 'false';
  const photonUrl = env.PHOTON_URL || 'http://localhost:2322';
  // ─── SEIT 0.5.0 GIBT ES MEHRERE INDIZES ──────────────────────────────────
  // Einen je Region. Wer hier nur die eine alte Datei prueft, meldet „kein
  // Lite-Index" auf einem Geraet, das drei hat -- und die Installations-
  // pruefung ist genau der Ort, an dem so eine Falschaussage am meisten
  // schadet: sie ist die Stelle, an der man nachsieht, wenn etwas klemmt.
  const liteDbDir = resolveLiteSearchDir();
  const liteFiles = listSearchIndexes(liteDbDir);

  const [photonUp, liteSizes] = await Promise.all([
    photonEnabled ? httpProbe(`${photonUrl}/status`, PROBE_TIMEOUT_MS) : Promise.resolve(false),
    Promise.all(liteFiles.map((file) => fileSize(file))),
  ]);
  const liteBytes = liteSizes.reduce((sum: number, size) => sum + (size ?? 0), 0);
  const liteCount = liteSizes.filter((size) => size !== null && size > 0).length;
  const liteReady = liteCount > 0;
  const liteDbPath = liteCount === 1 ? liteFiles[0] : tx(T, 'liteCount', { n: liteCount, dir: liteDbDir });

  // Die Suche ist ODER-verknüpft, und das ist der Kern von W-12: ein Gerät
  // ohne genug RAM für Photon ist nicht suchunfähig, es sucht über den
  // Lite-Index. Eine Prüfung, die nur Photon kennt, würde genau die
  // vorgesehene Sparkonfiguration als Defekt melden.
  if (photonUp && liteReady) {
    return {
      ...base,
      status: 'ok',
      detail: tx(T, 'searchBoth', { url: photonUrl, groesse: formatMiB(liteBytes) }),
    };
  }
  if (photonUp) {
    return { ...base, status: 'ok', detail: tx(T, 'searchPhoton', { url: photonUrl }) };
  }
  if (liteReady) {
    return {
      ...base,
      status: 'ok',
      detail: tx(T, photonEnabled ? 'searchLiteOnly' : 'searchLiteNoPhoton', {
        pfad: liteDbPath,
        groesse: formatMiB(liteBytes),
      }),
    };
  }

  return {
    ...base,
    status: 'warn',
    detail: photonEnabled
      ? tx(T, 'searchNone', { url: photonUrl, pfad: liteDbPath })
      : tx(T, 'searchNoneNoPhoton', { pfad: liteDbPath }),
    // ─── DIESER TEXT WAR ZWEIMAL FALSCH ────────────────────────────────
    // Zuerst nannte er einen Knopf „Suchindex bauen", den es nicht gab.
    // Danach — als Korrektur gedacht — behauptete er, der Index lasse sich
    // auf dem Gerät NICHT bauen, das Werkzeug setze osmium und einen
    // Repository-Checkout voraus, und schickte den Betreiber an einen
    // zweiten Rechner. Das beschrieb aber nur, was wir ins Image gelegt
    // hatten: `osmium-tool` ist ein gewöhnliches Ubuntu-Paket, und das
    // Werkzeug fehlte allein deshalb, weil der Core-Build es nicht mitnahm.
    //
    // Seit 0.3.4 stimmt beides nicht mehr, und der Knopf, den die erste
    // Fassung fälschlich versprach, existiert jetzt wirklich.
    remedy: tx(T, 'searchRemedy'),
  };
}

/** Hilfstext: die gefundenen Tracker als Satz, oder `null`, wenn es nichts zu
 *  sagen gibt. Steht in mehreren Zweigen und soll ueberall gleich klingen. */
function trackerListSentence(trackers: string[] | null): string | null {
  if (trackers === null || trackers.length === 0) {
    return null;
  }
  return tx(T, 'trackersFound', { liste: trackers.map((id) => tx(T, 'anf', { t: id })).join(', ') });
}

function trackerSetupHint(): string {
  return tx(T, 'trackerSetup');
}

async function checkPosition(
  env: Record<string, string | undefined>,
  tcpProbe: TcpProbeFn,
  listHaTrackers: ListHaTrackersFn,
  listDir: ListDirFn,
  resolveTrackerId: () => string,
  readGpsStatus: () => Promise<string | null>,
  pathResolves: (pfad: string) => Promise<boolean>,
): Promise<PreflightCheck> {
  const base = {
    id: 'position' as const,
    label: tx(T, 'lblPosition'),
    severity: 'recommended' as const,
  };

  const gpsdEnabled = env.GPSD_ENABLED === 'true' || env.GPSD_ENABLED === '1';
  const simulator = env.ENABLE_SIMULATOR === 'true' || env.ENABLE_SIMULATOR === '1';

  if (gpsdEnabled) {
    const host = env.GPSD_HOST || 'localhost';
    const port = env.GPSD_PORT ? parseInt(env.GPSD_PORT, 10) : 2947;
    const up = await tcpProbe(host, Number.isNaN(port) ? 2947 : port, PROBE_TIMEOUT_MS);
    if (up) {
      return { ...base, status: 'ok', detail: tx(T, 'gpsdUp', { host, port }) };
    }
    // ─── WELCHE GERAETE ES UEBERHAUPT GIBT ────────────────────────────────
    // Ohne diese Liste muesste man fuer den Pfad auf die Kommandozeile --
    // und der Betreiber hat ausdruecklich gesagt, dass er alles aus der
    // Oberflaeche heraus erledigen moechte. Der Kern laeuft im selben
    // Container wie gpsd, sieht also dasselbe `/dev`.
    const roh = await listSerialDevices(listDir);
    const geraete = await beschrifteGeraete(roh, pathResolves);
    const insLeere = geraete.some((g, i) => g !== roh[i]);
    const geraeteHinweis =
      geraete.length > 0
        ? tx(T, 'devicesFound', { liste: geraete.join(', ') }) +
          (insLeere ? tx(T, 'devicesDeadLink') : '')
        : tx(T, 'devicesNone');

    // ─── DIE BEGRUENDUNG DES DIENSTES, WENN ES EINE GIBT ──────────────────
    // Der gpsd-Dienst weiss genau, warum er nichts in Betrieb genommen hat
    // (`find-gps-device.sh`). Bis 0.8.6 stand das nur im Add-on-Protokoll,
    // und hier eine Liste zum Durchprobieren. Gemeldet wurde genau daran:
    // „Der VK-162 scheint aber korrekt erkannt zu werden. Gpsd aber nicht?"
    //
    // Gibt es die Begruendung, steht sie VORN. Die allgemeinen Hinweise
    // bleiben darunter -- fuer den Fall, dass der Dienst noch gar nicht dazu
    // gekommen ist, etwas zu hinterlegen.
    const gpsGrund = (await readGpsStatus())?.trim() ?? '';
    const grundVorn = gpsGrund.length > 0 ? tx(T, 'gpsdReason', { grund: gpsGrund }) : '';

    return {
      ...base,
      status: 'warn',
      detail: tx(T, 'gpsdDownDetail', { host, port }),
      remedy: grundVorn + tx(T, 'gpsdDownRemedy') + geraeteHinweis + tx(T, 'gpsdDownRemedy2'),
    };
  }

  // Der GPS-Empfaenger des Teltonika-Routers. Geprueft wird, ob der
  // Modbus-TCP-Server antwortet -- ob der Router gerade einen Fix hat, steht
  // im Live-Status der Positionsquellen, nicht hier.
  if (istRut50Quelle(env.GPS_SOURCE)) {
    const { host, port } = parseHostPort(env.RUT50_HOST);
    const up = await tcpProbe(host, port, PROBE_TIMEOUT_MS);
    if (up) {
      return {
        ...base,
        status: 'ok',
        detail: tx(T, 'rutOk', { host, port }),
    };
    }
    return {
      ...base,
      status: 'warn',
      detail: tx(T, 'rutDown', { host, port }),
      remedy: tx(T, 'rutRemedy'),
    };
  }

  // B-05: die Companion-App-Entitaet ist der Weg, der OHNE HTTPS funktioniert
  // -- und damit fuer viele Aufbauten der einzige, der ueberhaupt eine
  // Position liefert.
  const haTracker = resolveTrackerId().trim();
  const haTrackerSelected = istCompanionAppQuelle(env.GPS_SOURCE);

  // Nachsehen, WAS es gibt, statt den Betreiber raten zu lassen. Genau das
  // verspricht die Add-on-Konfiguration an dieser Stelle.
  const trackers = haTracker.length > 0 || haTrackerSelected ? await listHaTrackers() : null;
  const found = trackerListSentence(trackers);

  if (haTracker.length > 0) {
    // ─── YAPAIA ALS SEINE EIGENE QUELLE ───────────────────────────────────
    // Dieser Fall MUSS vor dem naechsten stehen. Sonst faellt er dort mit
    // hinein und bekommt die Begruendung „liefert keine Koordinaten" -- die
    // hier schlicht falsch waere: der eigene Fahrzeug-Tracker traegt
    // Koordinaten, er ist nur die AUSGABE dieser Navigation. Wer danach
    // sucht, sucht am falschen Ende.
    if (istEigeneEntitaet(haTracker)) {
      return {
        ...base,
        status: 'warn',
        detail: tx(T, 'ownDetail', { id: haTracker }),
        remedy: (found ?? tx(T, 'ownNoOther') + trackerSetupHint()) + tx(T, 'ownRemedy'),
      };
    }

    // Eine eingetragene Entitaet, die es nicht gibt, ist der teuerste Fall:
    // alles sieht eingerichtet aus, und es kommt trotzdem nie eine Position.
    if (trackers !== null && !trackers.includes(haTracker)) {
      return {
        ...base,
        status: 'warn',
        detail: tx(T, 'missingDetail', { id: haTracker }),
        remedy: (found ?? tx(T, 'missingNone') + trackerSetupHint()) + tx(T, 'missingRemedy'),
      };
    }
    return {
      ...base,
      status: 'ok',
      detail: tx(T, 'trackerOk', { id: haTracker }),
    };
  }

  if (haTrackerSelected) {
    // Die Companion-App-Quelle ohne Entity-ID heisst: Yapaia sucht selbst.
    // Was dabei herauskommt, haengt allein an dem, was Home Assistant hat --
    // also steht es hier, mit Namen.
    if (trackers === null) {
      return {
        ...base,
        status: 'warn',
        detail: tx(T, 'haDownDetail'),
        remedy: tx(T, 'haDownRemedy'),
      };
    }
    if (trackers.length === 1) {
      return {
        ...base,
        status: 'ok',
        detail: tx(T, 'autoOk', { id: trackers[0] }),
      };
    }
    if (trackers.length === 0) {
      return {
        ...base,
        status: 'warn',
        detail: tx(T, 'noTrackerDetail'),
        remedy: trackerSetupHint() + tx(T, 'noTrackerRemedy'),
      };
    }
    return {
      ...base,
      status: 'warn',
      detail: tx(T, 'manyDetail', { n: trackers.length }),
      remedy: (found ?? '') + tx(T, 'manyRemedy'),
    };
  }

  // Kein gpsd konfiguriert ist KEIN Fehler: der Browser ist ein vollwertiger,
  // ausdrücklich vorgesehener Weg (ADR-007), und für viele Aufbauten der
  // einzige. Es ist aber ein Hinweis wert, weil er eine Bedingung hat (HTTPS)
  // die man sonst erst im Fahrzeug bemerkt.
  return {
    ...base,
    status: 'warn',
    detail: tx(T, simulator ? 'noGpsdSim' : 'noGpsd'),
    remedy: tx(T, 'noGpsdRemedy'),
  };
}

function checkMemory(
  env: Record<string, string | undefined>,
  totalMem: () => number,
): PreflightCheck {
  const base = {
    id: 'memory' as const,
    label: tx(T, 'lblMemory'),
    severity: 'recommended' as const,
  };
  const total = totalMem();
  const photonEnabled = env.PHOTON_ENABLED !== 'false';

  if (!photonEnabled || total >= PHOTON_COMFORTABLE_RAM_BYTES) {
    return {
      ...base,
      status: 'ok',
      detail: tx(T, photonEnabled ? 'memOk' : 'memOkNoPhoton', { gb: formatGiB(total) }),
    };
  }

  return {
    ...base,
    status: 'warn',
    detail: tx(T, 'memWarn', { gb: formatGiB(total) }),
    remedy: tx(T, 'memRemedy'),
  };
}

async function checkDisk(
  tilesDir: string,
  diskFree: (path: string) => Promise<number>,
): Promise<PreflightCheck> {
  const base = {
    id: 'disk' as const,
    label: tx(T, 'lblDisk'),
    severity: 'recommended' as const,
  };
  // 5 GB: eine Deutschland-Kacheldatei liegt laut Katalog bei ~4,5 GB, und
  // der Bau braucht zusätzlich Platz für das Zwischenergebnis. Wer knapper
  // liegt, kann kleine Regionen weiter nutzen — deshalb `warn`.
  const COMFORTABLE_FREE_BYTES = 5 * 1024 ** 3;

  let free: number;
  try {
    free = await diskFree(tilesDir);
  } catch (err) {
    return {
      ...base,
      status: 'warn',
      detail: tx(T, 'diskUnknown', {
        dir: tilesDir,
        grund: err instanceof Error ? err.message : String(err),
      }),
      remedy: tx(T, 'diskUnknownRemedy'),
    };
  }

  if (free >= COMFORTABLE_FREE_BYTES) {
    return { ...base, status: 'ok', detail: tx(T, 'diskOk', { gb: formatGiB(free), dir: tilesDir }) };
  }
  return {
    ...base,
    status: 'warn',
    detail: tx(T, 'diskLow', { gb: formatGiB(free), dir: tilesDir }),
    // „Einstellungen → Kartenregionen" gab es nie als Menüpfad. Das Panel
    // öffnet die Schaltfläche „Karten verwalten" (🗺️) rechts oben.
    remedy: tx(T, 'diskRemedy'),
  };
}

function checkMqtt(env: Record<string, string | undefined>): PreflightCheck {
  const base = {
    id: 'mqtt' as const,
    label: tx(T, 'lblMqtt'),
    severity: 'optional' as const,
  };
  // Der Weg zu Home Assistant ist die Integration „Yapaia" (Gerät „Yapaia
  // Go"). MQTT gibt es zusätzlich für alle, die ihre Daten auch dort haben
  // wollen -- fehlt es, fehlt nichts.
  const url = env.MQTT_BROKER_URL;
  if (url) {
    return {
      ...base,
      status: 'ok',
      detail: tx(T, 'mqttOk', { url }),
    };
  }
  return {
    ...base,
    status: 'ok',
    detail: tx(T, 'mqttNone'),
  };
}

// ──────────────────────────── Gesamtergebnis ────────────────────────────

function summarize(checks: PreflightCheck[]): { status: PreflightStatus; summary: string } {
  const failed = checks.filter((c) => c.status === 'fail');
  const warned = checks.filter((c) => c.status === 'warn');

  if (failed.length > 0) {
    return {
      status: 'fail',
      summary: tx(T, 'sumFail', { n: failed.length, liste: failed.map((c) => c.label).join(', ') }),
    };
  }
  if (warned.length > 0) {
    return {
      status: 'warn',
      summary: tx(T, 'sumWarn', { n: warned.length, liste: warned.map((c) => c.label).join(', ') }),
    };
  }
  return { status: 'ok', summary: tx(T, 'sumOk') };
}

/**
 * Führt alle Prüfungen aus. Wirft nicht: eine Prüfung, die selbst
 * fehlschlägt, erscheint als Ergebnis mit `status: 'warn'` — eine
 * Diagnoseseite, die mit einem 500er antwortet, ist genau dann nutzlos,
 * wenn man sie braucht.
 */
export async function runPreflight(deps: PreflightDeps = {}): Promise<PreflightReport> {
  const env = deps.env ?? process.env;
  const listDir = deps.listDir ?? defaultListDir;
  const fileSize = deps.fileSize ?? defaultFileSize;
  const tcpProbe = deps.tcpProbe ?? defaultTcpProbe;
  const httpProbe = deps.httpProbe ?? defaultHttpProbe;
  const listHaTrackers = deps.listHaTrackers ?? defaultListHaTrackers(env);
  const resolveTrackerId = deps.resolveTrackerId ?? ((): string => env.HA_DEVICE_TRACKER ?? '');
  const readGpsStatus = deps.readGpsStatus ?? defaultReadGpsStatus(env);
  const pathResolves = deps.pathResolves ?? defaultPathResolves;
  const totalMem = deps.totalMem ?? totalmem;
  const diskFree = deps.diskFree ?? defaultDiskFree;
  const now = deps.now ?? ((): Date => new Date());

  const tilesDir = env.TILES_DIR || resolveTilesDir();

  const settled = await Promise.allSettled([
    checkTiles(tilesDir, listDir),
    checkRouting(env, httpProbe),
    checkSearch(env, httpProbe, fileSize, deps.listSearchIndexes ?? listLiteSearchDbFiles),
    checkPosition(
      env,
      tcpProbe,
      listHaTrackers,
      listDir,
      resolveTrackerId,
      readGpsStatus,
      pathResolves,
    ),
    Promise.resolve(checkMemory(env, totalMem)),
    checkDisk(tilesDir, diskFree),
    Promise.resolve(checkMqtt(env)),
  ]);

  const ids: PreflightCheckId[] = [
    'tiles',
    'routing',
    'search',
    'position',
    'memory',
    'disk',
    'mqtt',
  ];

  const checks: PreflightCheck[] = settled.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return {
      id: ids[i],
      label: ids[i],
      status: 'warn',
      severity: 'recommended',
      detail: tx(T, 'crashed', { grund: reason }),
      remedy: tx(T, 'crashedRemedy'),
    };
  });

  const { status, summary } = summarize(checks);
  return { status, summary, checks, checkedAt: now().toISOString() };
}
