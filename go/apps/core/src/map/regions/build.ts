/**
 * Kachelbau als Hintergrund-Job (Backlog B-04).
 *
 * ─── WARUM ES DIESEN WEG BRAUCHT ────────────────────────────────────────────
 * Es gibt keine fertigen PMTiles zum Herunterladen (siehe `catalog.ts`); die
 * Kacheln werden aus einem OSM-Extrakt gebaut. Bis hierher ging das nur auf
 * einer Kommandozeile IM Add-on-Container -- und genau dorthin kommt ein
 * Betreiber nicht: das Terminal-Add-on laeuft standardmaessig im
 * „Protection Mode", der den Docker-Socket ausblendet, also scheitert schon
 * `docker exec`. Damit war der eine Schritt, ohne den es ueberhaupt keine
 * Karte gibt, fuer den vorgesehenen Bedienweg unerreichbar.
 *
 * Dieser Job schliesst die Luecke: der Core startet das Bau-Skript SELBST --
 * er laeuft ja bereits in dem Container, in dem Java und das Skript liegen.
 *
 * ─── WAS HIER BEWUSST NICHT GEBAUT IST ──────────────────────────────────────
 * Kein Ueberleben eines Add-on-Neustarts. Die `JobRegistry` haelt Jobs im
 * Speicher; wird der Container neu gestartet, ist der Job weg. Das ist
 * vertretbar und KEIN Datenverlust, weil das Skript erst nach vollstaendiger
 * Pruefung atomar einwechselt (W-17): ein abgebrochener Lauf hinterlaesst
 * die bisherige Kartendatei unangetastet, und ein erneuter Start beginnt
 * sauber von vorn. Ein halb eingewechselter Kachelstand kann nicht
 * entstehen. Das ehrlich zu benennen ist besser, als Dauerhaftigkeit
 * vorzutaeuschen, die es nicht gibt.
 *
 * ─── FORTSCHRITT ────────────────────────────────────────────────────────────
 * Ein Prozentwert waere hier erfunden: planetilers Ausgabe laesst sich nicht
 * versionsstabil in eine Zahl uebersetzen, und die Phasen (PBF laden, Knoten
 * lesen, Kacheln schreiben) sind unterschiedlich lang. Der Job meldet
 * deshalb `progress: 0` und stattdessen die letzte Ausgabezeile als `note`.
 * Die Oberflaeche zeigt einen unbestimmten Balken plus diese Zeile -- das
 * sagt „es laeuft und woran", ohne eine Genauigkeit zu behaupten, die nicht
 * da ist.
 */

import { spawn as nodeSpawn, type ChildProcess } from 'child_process';
import { Buffer } from 'node:buffer';
import { freemem as osFreemem } from 'os';
import process from 'node:process';
import type { CatalogEntry } from './catalog.js';
import type { JobRegistry } from './jobs.js';
import { procLastQuelle, starteLastwaechter, type LastQuelle } from './lastwaechter.js';
import { tx } from '../../i18n.js';
import { T } from './texte.js';

/** Der Wrapper aus `yapaia_go/rootfs/usr/bin/` -- er setzt TILES_DIR, holt
 *  beim ersten Lauf planetiler.jar und ruft dann das eigentliche Skript. */
export const BUILD_COMMAND = '/usr/bin/yapaia-build-pmtiles';

/** Der Wrapper fuer den ROUTINGGRAPHEN. Er benutzt die
 *  `valhalla_build_*`-Werkzeuge, die im Add-on-Image ohnehin schon liegen
 *  (das Image setzt auf `gis-ops/docker-valhalla` auf). */
export const GRAPH_BUILD_COMMAND = '/usr/bin/yapaia-build-graph';

/**
 * Job-Art aller schweren Bauten. BEWUSST EINE einzige Art fuer Kacheln UND
 * Routinggraph, nicht zwei:
 *
 *  * Der Kachelbau und der Graphbau teilen sich Platte und Arbeitsspeicher
 *    derselben 8-GB-VM. Nebeneinander laufen sie ihr gegenseitig -- und den
 *    Rest von Home Assistant -- in den OOM-Killer.
 *  * Zwei Kachelbauten zerstoeren einander zusaetzlich ueber das gemeinsame
 *    planetiler-Quellenverzeichnis (siehe `JobRegistry.findUnfinished`).
 *
 * Eine gemeinsame Art heisst: es laeuft immer hoechstens EIN schwerer Bau.
 */
export const BUILD_JOB_KIND = 'heavy-build';

/** Was einen Bau-Lauf von einem anderen unterscheidet: das Werkzeug und die
 *  Woerter, mit denen ueber ihn geredet wird. Der Ablauf drumherum
 *  (Vorpruefungen, Ausgabe spiegeln, Abbruch, atomarer Swap) ist derselbe. */
export interface BuildVariant {
  command: string;
  /** Praefix der gespiegelten Ausgabezeilen im Add-on-Protokoll. */
  logPrefix: string;
  /** Wie der Lauf in einer Fehlermeldung heisst. */
  humanName: string;
  doneNote: string;
}

export const TILE_BUILD: BuildVariant = {
  command: BUILD_COMMAND,
  logPrefix: 'Kachelbau',
  get humanName() {
    return tx(T, 'nameKacheln');
  },
  get doneNote() {
    return tx(T, 'doneKacheln');
  },
};

/** Der Wrapper fuer den OFFLINE-SUCHINDEX. Er benutzt `osmium` (seit 0.3.4
 *  im Image) und das gebaute Index-Werkzeug `dist/lite-index.js`. Bis dahin
 *  hiess es, das ginge auf dem Geraet nicht -- das beschrieb aber nur, was
 *  wir ins Image gelegt hatten, keine technische Grenze. */
export const LITE_INDEX_BUILD_COMMAND = '/usr/bin/yapaia-build-lite-index';

export const GRAPH_BUILD: BuildVariant = {
  command: GRAPH_BUILD_COMMAND,
  logPrefix: 'Routingbau',
  get humanName() {
    return tx(T, 'nameGraph');
  },
  get doneNote() {
    return tx(T, 'doneGraph');
  },
};

export const LITE_INDEX_BUILD: BuildVariant = {
  command: LITE_INDEX_BUILD_COMMAND,
  logPrefix: 'Suchindex',
  get humanName() {
    return tx(T, 'nameSuche');
  },
  get doneNote() {
    return tx(T, 'doneSuche');
  },
};

/** JVM-Heap fuer planetiler. 2 GB ist der Wert, mit dem eine kleine bis
 *  mittlere Region (Liechtenstein bis Bundesland) durchlaeuft, ohne eine
 *  8-GB-VM neben Home Assistant zu sprengen. */
export const BUILD_HEAP_BYTES = 2 * 1024 ** 3;

/** Zusaetzlich zum Heap braucht der Prozess Platz fuer JVM-Overhead und
 *  Dateipuffer. Konservativ, weil ein OOM auf einer HAOS-VM nicht unbedingt
 *  planetiler trifft, sondern Home Assistant. */
export const BUILD_RAM_OVERHEAD_BYTES = 512 * 1024 ** 2;

/**
 * Plattenbedarf: die fertige Datei PLUS Arbeitsraum fuer das Zwischen-
 * ergebnis, das planetiler waehrend des Laufs anlegt. Der Faktor ist eine
 * dokumentierte Faustregel, keine Messung -- deshalb steht er hier benannt
 * und nicht als magische Zahl im Code.
 */
export const BUILD_DISK_FACTOR = 3;

export function buildRequiredBytes(entry: CatalogEntry): number {
  return entry.sizeBytes * BUILD_DISK_FACTOR;
}

export function buildRequiredFreeMemory(): number {
  return BUILD_HEAP_BYTES + BUILD_RAM_OVERHEAD_BYTES;
}

/** Minimaler Ausschnitt aus `child_process.spawn`, den dieses Modul braucht.
 *  Als eigener Typ, damit Tests ein Stub-Programm einsetzen koennen, ohne
 *  Node-Interna nachbauen zu muessen. */
export interface SpawnedBuild {
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): void } | null;
  stderr: { on(event: 'data', cb: (chunk: Buffer | string) => void): void } | null;
  on(event: 'close', cb: (code: number | null) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  kill(signal?: string): boolean;
}

export type SpawnBuildFn = (
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
) => SpawnedBuild;

export interface BuildJobDeps {
  spawnFn?: SpawnBuildFn;
  freeMemFn?: () => number;
  /** Wohin die Ausgabe des Bau-Prozesses gespiegelt wird. In Produktion der
   *  Fastify-Logger, dessen stdout im Add-on-Protokoll landet. */
  logger?: (line: string) => void;
  /** Misst die Last des Rechners für den Lastwächter (`lastwaechter.ts`).
   *  Ohne Angabe: `/proc` -- aber nur mit dem echten `spawn`. Ein Test mit
   *  Stub-Prozess soll nicht pausiert werden, nur weil die CI ausgelastet ist. */
  lastQuelle?: LastQuelle;
  lastIntervallMs?: number;
}

type Signal = NonNullable<Parameters<ChildProcess['kill']>[0]>;

/**
 * Startet ein Bau-Werkzeug so, dass es das System nicht erdrückt:
 *
 *  * `nice -n 19` -- niedrigste CPU-Priorität, Home Assistant geht vor;
 *  * eigene Prozessgruppe (`detached`) -- Signale gehen an das Skript UND
 *    alle Werkzeuge, die es startet (valhalla_build_tiles, java, osmium).
 *    Sonst pausierte bzw. beendete ein SIGSTOP/SIGTERM nur die Shell,
 *    während das eigentliche Werkzeug weiterrechnet.
 */
export const defaultSpawnBuild: SpawnBuildFn = (command, args, env) => {
  const child = nodeSpawn('nice', ['-n', '19', command, ...args], {
    env: { ...process.env, ...env },
    detached: true,
  });
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    on: child.on.bind(child) as SpawnedBuild['on'],
    kill: (signal = 'SIGTERM') => {
      if (child.pid === undefined) return false;
      try {
        process.kill(-child.pid, signal as Signal);
        return true;
      } catch {
        return child.kill(signal as Signal);
      }
    },
  };
};

/** Kappt eine Ausgabezeile auf eine Laenge, die in der Oberflaeche noch
 *  lesbar ist -- planetiler schreibt sehr lange Statuszeilen. */
export function truncateNote(line: string, max = 160): string {
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

/* ─── CURLS FORTSCHRITTSANZEIGE LESBAR MACHEN ─────────────────────────────────
 *
 * Gemeldet als „das ist irgendwie undurchsichtig": auf der Regionskarte stand
 * waehrend des Baus
 *
 *     13 4607M   13  635M    0     0  8641k      0  0:09:06  0:01:15  0:07:51
 *
 * Das ist curls Fortschrittstabelle. Die Bau-Wrapper holen den OSM-Extrakt mit
 * `curl -fL` (ohne `-s`), curl schreibt seine Tabelle nach stderr, und die
 * letzte Zeile davon wurde unveraendert als Job-Notiz angezeigt.
 *
 * Der Inhalt ist richtig und sogar nuetzlich -- 635 von 4607 MB, noch rund
 * acht Minuten -- nur sieht man ihm das nicht an. curl still zu schalten waere
 * die schlechtere Antwort: bei einem 4,6-GB-Extrakt stuende dann zehn Minuten
 * lang dieselbe Zeile da, und „undurchsichtig" waere es erst recht. Die Zahlen
 * werden deshalb NICHT verworfen, sondern in einen Satz uebersetzt.
 */

/** Ein Zeitfeld aus curls Tabelle: `0:07:51` oder `--:--:--` (noch unbekannt). */
const CURL_TIME = /^(\d+:\d{2}:\d{2}|--:--:--)$/;

/** Die beiden Kopfzeilen der Tabelle. Sie tragen keine Aussage und sollen
 *  nicht als Notiz stehenbleiben. */
const CURL_HEADER = /^(% Total\b|Dload\s+Upload\b)/;

export interface CurlProgress {
  percent: number;
  /** Roh, wie curl es schreibt: `635M`, `10.2G`, `4096` (Bytes). */
  received: string;
  total: string;
  /** `null`, solange curl die Restzeit nicht schaetzen kann. */
  timeLeft: string | null;
}

/**
 * Erkennt eine Datenzeile aus curls Fortschrittstabelle.
 *
 * Erkannt wird sie an der FORM, nicht an einer Zeilennummer: zwoelf Felder,
 * von denen drei wie eine Zeit aussehen. Eine Ausgabezeile von planetiler oder
 * osmium trifft das nicht -- und wenn doch einmal etwas anderes durchkaeme,
 * stuende dort ein harmloser falscher Satz statt einer Fehlfunktion.
 */
export function parseCurlProgress(line: string): CurlProgress | null {
  const f = line.trim().split(/\s+/);
  if (f.length !== 12) return null;
  if (!CURL_TIME.test(f[8]) || !CURL_TIME.test(f[9]) || !CURL_TIME.test(f[10])) return null;
  const percent = Number(f[0]);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return {
    percent,
    total: f[1],
    received: f[3],
    timeLeft: f[10] === '--:--:--' ? null : f[10],
  };
}

const SIZE_UNITS: Record<string, string> = { k: 'kB', M: 'MB', G: 'GB', T: 'TB' };

/** `4607M` -> `4607 MB`. Unbekanntes bleibt, wie es ist. */
export function humanSize(raw: string): string {
  const m = /^(\d+(?:\.\d+)?)([kMGT])?$/.exec(raw);
  if (!m) return raw;
  return `${m[1]} ${m[2] ? SIZE_UNITS[m[2]] : 'B'}`;
}

/** `0:07:51` -> `7 Min.`, `1:05:00` -> `1 Std. 5 Min.` */
export function humanDuration(hms: string): string | null {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(hms);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 0) return tx(T, 'stdMin', { h: hours, m: minutes });
  if (minutes > 0) return tx(T, 'nurMin', { m: minutes });
  return tx(T, 'unterMinute');
}

/** Die Notiz zu einer Fortschrittszeile. */
export function formatDownloadNote(p: CurlProgress): string {
  const base = tx(T, 'kartendaten', {
    von: humanSize(p.received),
    gesamt: humanSize(p.total),
    prozent: Math.round(p.percent),
  });
  const left = p.timeLeft ? humanDuration(p.timeLeft) : null;
  // Ohne Schaetzung wird KEINE genannt. „noch etwa 0 Min." waere geraten.
  return left ? base + tx(T, 'nochEtwa', { zeit: left }) : base;
}

/**
 * Entfernt Terminal-Farbcodes aus einer Zeile.
 *
 * ─── WARUM ──────────────────────────────────────────────────────────────────
 * Gemeldet mit Bildschirmfoto: in der Oberfläche stand
 *
 *   ␛[32;1m[INFO]␛[0m invalid_argument thrown for condition (2025 Sep 19- Oct 15)
 *
 * Valhalla färbt seine Protokollzeilen ein. Auf einem Terminal ist das grün
 * und unauffällig; in einem Browser sind es sichtbare Steuerzeichen, die
 * genau das Wort umklammern, auf das es ankommt. Aus einer harmlosen
 * INFO-Zeile wird so etwas, das nach einem Absturz aussieht.
 *
 * Die Zeile selbst bleibt unverändert — nur die Farbe geht. Sie zu
 * unterdrücken wäre falsch: sie sagt etwas (Valhalla konnte eine zeitlich
 * begrenzte Beschränkung aus den OSM-Daten nicht lesen und überspringt sie),
 * und der Bau läuft dabei weiter.
 */
export function ansiFrei(zeile: string): string {
  // `\x1B` und NICHT das Zeichen selbst: ein rohes Steuerzeichen im
  // Quelltext ist beim Lesen unsichtbar, und eine unsichtbare Zeichenkette in
  // einem Muster ist das Letzte, was man beim Suchen eines Fehlers gebrauchen
  // kann. (Genau daran ist hier ein Mutationstest durchgerutscht: das
  // Suchmuster traf die Zeile nicht, und das sah aus wie ein bestandener
  // Test.)
  //
  // `no-control-regex` ist hier abgeschaltet, weil genau das der Zweck ist:
  // ESC-Sequenzen SIND Steuerzeichen, und sie sollen weg.
  // eslint-disable-next-line no-control-regex
  return zeile.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * Die Notiz zu einem Ausgabe-Klumpen: die letzte Zeile, die etwas aussagt.
 *
 * Rueckwaerts gesucht, damit eine Kopfzeile am Ende des Klumpens nicht die
 * vorherige echte Meldung verdraengt.
 */
export function noteFromChunk(chunk: string): string | null {
  const lines = chunk
    .split(/\r?\n|\r/)
    // Farbcodes zuerst weg: sonst zerlegt `parseCurlProgress` eine
    // eingefaerbte Fortschrittszeile in die falsche Zahl von Feldern und
    // erkennt sie nicht mehr.
    .map((l) => ansiFrei(l).trim())
    .filter((l) => l.length > 0);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const progress = parseCurlProgress(line);
    if (progress) return formatDownloadNote(progress);
    if (CURL_HEADER.test(line)) continue;
    return line;
  }
  return null;
}

/**
 * Wie ein einzelner Bau-Lauf ausgegangen ist.
 *
 * ─── WARUM DAS EIN EIGENER TYP IST ──────────────────────────────────────────
 * Bis zum Gesamtbau (0.16.0) fiel das Ende eines Laufs mit dem Ende des JOBS
 * zusammen: ein Lauf, ein Job, fertig. Der Gesamtbau fährt mehrere Läufe
 * nacheinander in EINEM Job — dort darf der erste Schritt enden, ohne dass
 * der Job endet.
 *
 * Deshalb sagt ein Lauf jetzt, wie er ausging, statt es selbst in den Job zu
 * schreiben. Wer ihn gestartet hat, entscheidet, was das bedeutet.
 */
export type BauErgebnis =
  | { art: 'fertig' }
  | { art: 'abgebrochen' }
  | { art: 'fehler'; info: { code: string; message: string } };

/**
 * Ein einzelner Bau-Lauf. Meldet sein Ende über `onEnde`.
 *
 * ─── WARUM `onEnde` UND KEIN PROMISE ────────────────────────────────────────
 * `onEnde` wird SYNCHRON aus dem `close`-Zweig gerufen. Ein Promise würde das
 * Ende in eine Microtask verschieben — und der Abbruchweg unten verlässt sich
 * darauf, dass der Job in DEMSELBEN Zug als beendet gilt, in dem der Knopf
 * gedrückt wurde (siehe die Begründung bei `setOnCancel`).
 *
 * Wer ein Promise braucht, baut es sich darum herum; der Gesamtbau macht
 * genau das.
 */
export function laufeBau(
  jobId: string,
  jobs: JobRegistry,
  entry: CatalogEntry,
  tilesDir: string,
  deps: BuildJobDeps,
  variant: BuildVariant,
  zusatzEnv: Record<string, string>,
  onEnde: (ergebnis: BauErgebnis) => void,
): void {
  // Ein Lauf endet GENAU EINMAL. Ohne diese Sperre meldete ein Abbruch, auf
  // den der Kindprozess dann doch noch mit `close` reagiert, zweimal ein
  // Ende — und der Gesamtbau spränge zwei Schritte weiter.
  let beendet = false;
  let stoppeLast = (): void => {};
  const ende = (ergebnis: BauErgebnis): void => {
    if (beendet) return;
    beendet = true;
    stoppeLast();
    onEnde(ergebnis);
  };
  const logger = deps.logger;
  const spawnFn: SpawnBuildFn = deps.spawnFn ?? defaultSpawnBuild;
  const lastQuelle = deps.lastQuelle ?? (deps.spawnFn ? undefined : procLastQuelle());

  const source = entry.pbfUrl;
  if (!source) {
    ende({
      art: 'fehler',
      info: {
        code: 'NO_BUILD_SOURCE',
        message:
          tx(T, 'keinExtraktPbf', { id: entry.id }),
      },
    });
    return;
  }

  jobs.markRunning(jobId, null);
  jobs.setNote(jobId, tx(T, 'bauStart'));

  let child: SpawnedBuild;
  try {
    child = spawnFn(variant.command, [source, entry.id], {
      TILES_DIR: tilesDir,
      PLANETILER_XMX: `${Math.round(BUILD_HEAP_BYTES / 1024 ** 3)}g`,
      ...zusatzEnv,
    });
  } catch (err) {
    ende({
      art: 'fehler',
      info: {
        code: 'BUILD_START_FAILED',
        message: tx(T, 'bauStartFehler', { grund: err instanceof Error ? err.message : String(err) }),
      },
    });
    return;
  }

  // Ein Abbruch aus der Oberfläche muss den Prozess wirklich beenden --
  // sonst läuft planetiler stundenlang weiter, während die Anzeige
  // „abgebrochen" behauptet.
  //
  // Der Job wird SOFORT beendet, nicht erst wenn das Kind wirklich stirbt.
  // Andernfalls entsteht eine Falle: seit ein laufender Bau jeden weiteren
  // sperrt (BUILD_JOB_KIND), wuerde ein Kindprozess, der auf SIGTERM nicht
  // reagiert, den Knopf „Kacheln bauen" bis zum Neustart des Add-ons
  // blockieren -- und ein Add-on-Neustart ist genau die Art Ausweg, die auf
  // dem vorgesehenen Bedienweg niemand finden soll.
  //
  // `markError` auf einem bereits beendeten Job ist ein No-op, der
  // `close`-Zweig unten darf also gefahrlos noch einmal dasselbe tun.
  // Ein pausierter Prozess bekommt SIGTERM erst nach SIGCONT zugestellt.
  const beenden = (): void => {
    child.kill('SIGTERM');
    child.kill('SIGCONT');
  };
  jobs.setOnCancel(jobId, () => {
    beenden();
    ende({ art: 'abgebrochen' });
  });

  stoppeLast = lastQuelle
    ? starteLastwaechter({
        quelle: lastQuelle,
        intervallMs: deps.lastIntervallMs,
        onPause: (grund) => {
          child.kill('SIGSTOP');
          logger?.(`[${variant.logPrefix} ${entry.id}] Pausiert: System ausgelastet (${grund})`);
          jobs.setNote(jobId, tx(T, 'pausiert', { grund }));
        },
        onWeiter: () => {
          child.kill('SIGCONT');
          logger?.(`[${variant.logPrefix} ${entry.id}] Last wieder normal, Bau geht weiter`);
          jobs.setNote(jobId, tx(T, 'lastNormal'));
        },
        onAbbruch: (grund) => {
          beenden();
          logger?.(`[${variant.logPrefix} ${entry.id}] Abgebrochen zum Schutz des Systems: ${grund}`);
          ende({
            art: 'fehler',
            info: {
              code: 'SYSTEM_UEBERLASTET',
              message:
                tx(T, 'ueberlastet', { name: variant.humanName, grund }),
            },
          });
        },
      })
    : () => {};

  // Die Ausgabe geht an ZWEI Stellen, und beide werden gebraucht:
  //
  //   * die letzte Zeile als `note` -> Fortschritt in der Oberflaeche;
  //   * der volle Text ins Add-on-Protokoll.
  //
  // Der zweite Teil fehlte. Die Fehlermeldung sagte „ausfuehrliche Ausgabe im
  // Add-on-Protokoll" -- dorthin kam aber nie etwas, weil wir die Pipes des
  // Kindprozesses lesen und nirgendwo hinschreiben. Beim ersten echten
  // Fehlschlag stand deshalb nur „Code 1" da und sonst nichts: der einzige
  // Text, der die Ursache genannt haette, wurde verworfen. Ein Verweis auf
  // ein Protokoll, in dem nichts steht, ist dasselbe wie eine Anweisung auf
  // einen Knopf, den es nicht gibt.
  const forward = (chunk: Buffer | string): void => {
    const text = chunk.toString();
    for (const raw of text.split(/\r?\n|\r/)) {
      const line = raw.trim();
      if (line.length > 0) {
        logger?.(`[${variant.logPrefix} ${entry.id}] ${line}`);
      }
    }
    const last = noteFromChunk(text);
    if (last) {
      jobs.setNote(jobId, truncateNote(last));
    }
  };
  child.stdout?.on('data', forward);
  child.stderr?.on('data', forward);

  child.on('error', (err) => {
    ende({
      art: 'fehler',
      info: {
        code: 'BUILD_START_FAILED',
        message:
          tx(T, 'bauStartWerkzeug', { grund: err.message, werkzeug: variant.command }),
      },
    });
  });

  child.on('close', (code) => {
    if (jobs.isCancelled(jobId)) {
      ende({ art: 'abgebrochen' });
      return;
    }
    if (code === 0) {
      jobs.setNote(jobId, variant.doneNote);
      ende({ art: 'fertig' });
      return;
    }
    // Die letzte Ausgabezeile gehoert IN die Fehlermeldung. Sie steht zwar
    // auch als `note` im Job, aber die Oberflaeche zeigt im Fehlerfall die
    // Meldung -- wer nur dorthin schaut, saehe sonst „Code 1" und sonst
    // nichts.
    const lastLine = jobs.get(jobId)?.note;
    ende({
      art: 'fehler',
      info: {
        code: 'BUILD_FAILED',
        message:
          tx(T, 'bauFehlgeschlagen', {
            name: variant.humanName,
            code: code ?? tx(T, 'codeUnbekannt'),
            zuletzt: lastLine ? tx(T, 'zuletzt', { zeile: lastLine }) : '',
            prefix: variant.logPrefix,
            id: entry.id,
          }) +
          (lastLine ? `Zuletzt: „${lastLine}". ` : '') +
          'Die vollständige Ausgabe steht im Add-on-Protokoll (Zeilen mit ' +
          `„[${variant.logPrefix} ${entry.id}]"). Der bisherige Stand ist unverändert.`,
      },
    });
  });
}

/** Der Wortlaut des Abbruchs. An einer Stelle, weil ihn jetzt zwei Aufrufer
 *  brauchen — der Einzelbau und der Gesamtbau. */
export const ABBRUCH_MELDUNG = {
  code: 'CANCELLED',
  get message() {
    return tx(T, 'abbruch');
  },
} as const;


/**
 * Startet den Bau im Hintergrund. Der Aufrufer (Route) hat den Job bereits
 * angelegt und mit 202 geantwortet; hier wird nichts mehr erwartet.
 *
 * Ein Lauf, ein Job: das Ende des Laufs ist hier das Ende des Jobs. Für
 * mehrere Läufe in einem Job gibt es `gesamtbau.ts`.
 */
export function runBuildJob(
  jobId: string,
  jobs: JobRegistry,
  entry: CatalogEntry,
  tilesDir: string,
  deps: BuildJobDeps = {},
  variant: BuildVariant = TILE_BUILD,
  /**
   * Zusätzliche Umgebung für genau diesen Lauf.
   *
   * Gebraucht vom Routingbau: er bekommt in `YAPAIA_GRAPH_EXTRAKTE` die
   * Regionen mit, deren OSM-Extrakt noch fehlt (siehe `graphPlan.ts`). Das
   * Skript sieht nur das Zwischenlager; welche Karten installiert sind und
   * wo ihr Extrakt herkäme, weiß allein der Kern.
   *
   * Als Parameter und nicht in `BuildJobDeps`: `deps` ist das, was für einen
   * TEST ausgetauscht wird, nicht das, was ein Lauf inhaltlich mitbringt.
   */
  zusatzEnv: Record<string, string> = {},
): void {
  laufeBau(jobId, jobs, entry, tilesDir, deps, variant, zusatzEnv, (ergebnis) => {
    if (ergebnis.art === 'fertig') {
      jobs.markDone(jobId);
      return;
    }
    jobs.markError(jobId, ergebnis.art === 'abgebrochen' ? ABBRUCH_MELDUNG : ergebnis.info);
  });
}

export { osFreemem as defaultFreeMem };
