/**
 * Region-manager routes (E01-T5, docs/03-api-spec.md §2 "Karten & Tiles"):
 *
 * - GET    /api/v1/map/regions/catalog   downloadable regions + `installed` flag
 * - POST   /api/v1/map/regions           starts a resumable download job (202)
 * - POST   /api/v1/map/regions/:id/build starts a tile BUILD job (202, B-04)
 * - POST   /api/v1/map/regions/:id/extrakt  lädt NUR den OSM-Extrakt (202, 0.59.0)
 * - DELETE /api/v1/map/regions/:id/extrakt  verwirft einen ungebauten Extrakt
 * - POST   /api/v1/map/gesamtbau         baut heruntergeladene Karten, dann
 *                                        Routing + Suche für ALLE Karten
 *                                        in EINEM Job (202, 0.16.0/0.59.0)
 * - DELETE /api/v1/map/regions/:id       removes an installed region (409 if last)
 * - GET    /api/v1/map/regions/laufender-bau  der gerade laufende schwere Bau
 * - GET    /api/v1/jobs/:id              job status (progress/bytes/error)
 * - DELETE /api/v1/jobs/:id              cancels a queued/running job
 *
 * `GET /api/v1/map/regions` (listing installed regions) already lives in
 * `../routes.ts` (E01-T1) and is untouched -- this plugin is registered
 * alongside it by `mapPlugin`, purely additive.
 */

import { existsSync } from 'fs';
import { rm, unlink } from 'fs/promises';
import type { FastifyPluginAsync } from 'fastify';
import type { ApiError } from '@yapaia/shared';
import {
  REGION_NAME_PATTERN,
  resolveGraphDir,
  resolveRegionFilePath,
  resolveTilesDir,
} from '../paths.js';
import {
  abdeckungNachBau,
  abdeckungSatz,
  extraktPfad,
  graphRegionenJetzt,
  type GraphAbdeckung,
  pbfLagerPfad,
  regionenMitExtrakt,
} from './graphAbdeckung.js';
import { GRAPH_PLAN_ENV, graphBauPlan, planAlsEnv } from './graphPlan.js';
import { listRegions } from '../regions.js';
import { loadCatalog, type CatalogEntry } from './catalog.js';
import { checkDiskSpace, type StatfsFn } from './disk.js';
import { computeRemainingBytes, existingPartBytes, finalFilePath, partFilePath, runDownloadJob } from './download.js';
import {
  BUILD_JOB_KIND,
  GRAPH_BUILD,
  LITE_INDEX_BUILD,
  buildRequiredBytes,
  buildRequiredFreeMemory,
  defaultFreeMem,
  runBuildJob,
  type BuildJobDeps,
} from './build.js';
import { JobRegistry, type JobSnapshot } from './jobs.js';
import { bestandAus, mitNeuenKarten, noetigerPlan, starteGesamtbau } from './gesamtbau.js';
import { EXTRAKT_JOB_KIND, extraktPartPfad, hatExtrakt, runExtraktJob } from './extrakt.js';
import { collectBuildStatus } from '../buildStatus.js';
import { readLiteIndexMeta } from '../../search/lite/reader.js';
import { liteSearchDbPathForRegion, resolveLiteSearchDir } from '../../search/lite/paths.js';
import { LITE_INDEX_FORMAT } from '../../search/lite/buildIndex.js';
import { bauzeitenPfad } from './bauzeitSpeicher.js';
import type { SettingsService } from '../../settings/service.js';
import {
  EINSTELLUNG as KARTENSERVER,
  holeKatalog,
  istKartenserverEintrag,
  runPaketJob,
  valhallaNeuStarten,
  verbindungAus,
  type KartenserverEintrag,
  type KartenserverVerbindung,
} from './kartenserver.js';
import { teilgraphEntfernen } from './teilgraph.js';
import { tx } from '../../i18n.js';
import { T } from './texte.js';

export interface RegionsPluginOptions {
  /** Injectable for tests (simulates a near-full disk); defaults to the
   *  real `fs.statfs`. */
  statfsImpl?: StatfsFn;
  /** Injectable for tests: Prozess-Start und freier RAM des Kachelbaus. */
  buildDeps?: BuildJobDeps;
  /**
   * Der Einstellungsspeicher (Einstellung `kartenserver`). Ohne ihn gibt es
   * keinen Kartenserver -- so beruehren Tests, die ihn nicht brauchen, keine
   * Datenbank.
   */
  einstellungen?: Pick<SettingsService, 'get' | 'patch'>;
  /** Fuer Tests: statt des echten `fetch`. */
  // eslint-disable-next-line no-undef -- `fetch` ist Standard-Global in Node 22.
  fetchImpl?: typeof fetch;
}

interface CatalogReplyEntry extends CatalogEntry {
  installed: boolean;
  /** Der OSM-Extrakt liegt im Lager, die Karte ist aber noch nicht gebaut
   *  (0.59.0). Sie wird mit dem nächsten Gesamtbau gebaut. */
  extrakt?: boolean;
}

interface CatalogReply {
  data: CatalogReplyEntry[];
  /** Ob ein Kartenserver eingerichtet ist, und warum er gerade fehlt. */
  kartenserver?: { eingerichtet: boolean; fehler?: string; pakete?: number };
}

interface PostRegionsBody {
  region_id?: string;
}

interface PostRegionsReply {
  job_id: string;
  /** Nur beim Routingbau: was danach im Graphen liegt (siehe
   *  `graphAbdeckung.ts`). Optional, damit die anderen Bauwege unveraendert
   *  bleiben. */
  abdeckung?: GraphAbdeckung;
}

/** Der Koerper des Routingbaus -- der einzige mit einem Feld. */
interface BuildGraphBody {
  /** „Ja, ich weiss, dass Abdeckung verloren geht." */
  abdeckung_bestaetigt?: boolean;
}

interface JobReply {
  data: JobSnapshot;
}

interface IdParams {
  id: string;
}

function createErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

export const regionsPlugin: FastifyPluginAsync<RegionsPluginOptions> = async (fastify, opts) => {
  const tilesDir = resolveTilesDir();
  const jobs = new JobRegistry();
  const statfsImpl = opts.statfsImpl;
  const einstellungen = opts.einstellungen ?? null;
  const kartenserver = (): KartenserverVerbindung | null =>
    einstellungen ? verbindungAus(einstellungen.get(KARTENSERVER)) : null;

  /**
   * Der eingebaute Katalog plus die Pakete des Kartenservers. Ein Paket mit
   * derselben Kennung wie ein eingebauter Eintrag ersetzt ihn -- es bringt
   * die fertige Datei mit. Ist der Server nicht erreichbar, bleibt der
   * eingebaute Katalog nutzbar; der Grund steht in `kartenserverStand`.
   */
  const gesamtKatalog = async (): Promise<{ katalog: CatalogEntry[]; stand: NonNullable<CatalogReply['kartenserver']> }> => {
    const eingebaut = await loadCatalog();
    const v = kartenserver();
    if (!v) return { katalog: eingebaut, stand: { eingerichtet: false } };
    try {
      const pakete = await holeKatalog(v, opts.fetchImpl);
      const ids = new Set(pakete.map((p) => p.id));
      return { katalog: [...pakete, ...eingebaut.filter((e) => !ids.has(e.id))], stand: { eingerichtet: true, pakete: pakete.length } };
    } catch (err) {
      fastify.log.warn({ fehler: (err as Error).message }, 'Kartenserver: Katalog nicht abrufbar');
      return { katalog: eingebaut, stand: { eingerichtet: true, fehler: (err as Error).message } };
    }
  };

  // GET /api/v1/kartenserver -- Adresse und ob ein Token hinterlegt ist (das
  // Token selbst geht nie zurueck an die Oberflaeche).
  fastify.get('/api/v1/kartenserver', async (_request, reply) => {
    const v = kartenserver();
    return reply.code(200).send({ data: { url: v?.url ?? '', token_gesetzt: Boolean(v?.token) } });
  });

  // PUT /api/v1/kartenserver -- einrichten (leere Adresse = entfernen). Ein
  // leeres Token behaelt das bisherige.
  fastify.put<{ Body: { url?: unknown; token?: unknown } }>('/api/v1/kartenserver', async (request, reply) => {
    if (!einstellungen) return reply.code(503).send(createErrorResponse('NICHT_VERFUEGBAR', tx(T, 'nichtVerfuegbar')));
    const url = typeof request.body?.url === 'string' ? request.body.url.trim() : '';
    if (!url) {
      einstellungen.patch({ [KARTENSERVER]: null });
      return reply.code(200).send({ data: { url: '', token_gesetzt: false } });
    }
    const bisher = kartenserver();
    const token = typeof request.body?.token === 'string' && request.body.token.trim() ? request.body.token.trim() : (bisher?.token ?? '');
    const v = verbindungAus({ url, token });
    if (!v) {
      return reply.code(400).send(createErrorResponse('UNGUELTIG', tx(T, 'adresseUngueltig')));
    }
    try {
      const pakete = await holeKatalog(v, opts.fetchImpl);
      einstellungen.patch({ [KARTENSERVER]: v });
      return reply.code(200).send({ data: { url: v.url, token_gesetzt: Boolean(v.token), pakete: pakete.length } });
    } catch (err) {
      return reply.code(400).send(createErrorResponse('KARTENSERVER', (err as Error).message));
    }
  });

  // GET /api/v1/map/regions/catalog -- downloadable regions + installed flag.
  fastify.get<{ Reply: CatalogReply | ApiError }>(
    '/api/v1/map/regions/catalog',
    async (_request, reply) => {
      let catalog: CatalogEntry[];
      let stand: CatalogReply['kartenserver'];
      try {
        ({ katalog: catalog, stand } = await gesamtKatalog());
      } catch (err) {
        fastify.log.error({ error: (err as Error).message }, 'Failed to load regions catalog');
        return reply
          .code(500)
          .send(createErrorResponse('CATALOG_UNAVAILABLE', 'Regions catalog could not be loaded'));
      }
      const installedRegions = await listRegions(tilesDir, fastify.log);
      const installedIds = new Set(installedRegions.map((r) => r.region));
      const lager = pbfLagerPfad(resolveGraphDir());
      const data = catalog.map((entry) => {
        const installed = installedIds.has(entry.id);
        return installed || !entry.pbfUrl
          ? { ...entry, installed }
          : { ...entry, installed, extrakt: hatExtrakt(lager, entry.id) };
      });
      return reply.code(200).send({ data, kartenserver: stand });
    },
  );

  const starteKartenserverPaket = async (
    entry: KartenserverEintrag,
  ): Promise<{ status: number; body: PostRegionsReply | ApiError }> => {
    const laufend = jobs.findUnfinished('kartenserver');
    if (laufend) {
      return { status: 409, body: createErrorResponse('JOB_RUNNING', tx(T, 'paketLaeuft'), { job_id: laufend.id }) };
    }
    const bytes = (entry.url ? entry.sizeBytes : 0) + (entry.suche?.sizeBytes ?? 0) + (entry.routing?.sizeBytes ?? 0) * 2;
    const diskCheck = await checkDiskSpace(tilesDir, bytes, statfsImpl);
    if (!diskCheck.ok) {
      return {
        status: 409,
        body: createErrorResponse('INSUFFICIENT_SPACE', 'Not enough free disk space to download this region', {
          requiredBytes: diskCheck.requiredBytes,
          freeBytes: diskCheck.freeBytes,
        }),
      };
    }
    const v = kartenserver();
    const jobId = jobs.create('kartenserver');
    void runPaketJob(jobId, jobs, entry, { tilesDir, liteDir: resolveLiteSearchDir(), graphDir: resolveGraphDir() }, v?.token ?? '');
    return { status: 202, body: { job_id: jobId } };
  };

  // POST /api/v1/map/regions -- starts a resumable download job (W-17).
  fastify.post<{ Body: PostRegionsBody; Reply: PostRegionsReply | ApiError }>(
    '/api/v1/map/regions',
    async (request, reply) => {
      const regionId = request.body?.region_id;
      if (!regionId || typeof regionId !== 'string' || !REGION_NAME_PATTERN.test(regionId)) {
        return reply
          .code(400)
          .send(createErrorResponse('INVALID_REGION', 'region_id is required and must be a valid region slug'));
      }

      let catalog: CatalogEntry[];
      try {
        catalog = (await gesamtKatalog()).katalog;
      } catch (err) {
        fastify.log.error({ error: (err as Error).message }, 'Failed to load regions catalog');
        return reply
          .code(500)
          .send(createErrorResponse('CATALOG_UNAVAILABLE', 'Regions catalog could not be loaded'));
      }

      const entry = catalog.find((candidate) => candidate.id === regionId);
      if (!entry) {
        return reply
          .code(404)
          .send(createErrorResponse('NOT_FOUND', `Unknown catalog region '${regionId}'`));
      }

      // Ein Paket vom Kartenserver: Karte, Suche und Routing in einem Auftrag.
      // Ein schon installiertes wird dabei ERNEUERT -- dafuer ist es da.
      if (istKartenserverEintrag(entry)) {
        const { status, body } = await starteKartenserverPaket(entry);
        return reply.code(status).send(body);
      }

      const finalPath = finalFilePath(tilesDir, regionId);
      if (existsSync(finalPath)) {
        return reply
          .code(409)
          .send(createErrorResponse('ALREADY_INSTALLED', `Region '${regionId}' is already installed`));
      }

      // Resume-aware: only the bytes still missing need to fit, not the
      // full catalog size, so retrying an interrupted download doesn't get
      // needlessly rejected once most of it is already on disk.
      const resumeFrom = await existingPartBytes(partFilePath(tilesDir, regionId));
      const remainingBytes = computeRemainingBytes(entry.sizeBytes, resumeFrom);

      const diskCheck = await checkDiskSpace(tilesDir, remainingBytes, statfsImpl);
      if (!diskCheck.ok) {
        return reply.code(409).send(
          createErrorResponse(
            'INSUFFICIENT_SPACE',
            'Not enough free disk space to download this region',
            { requiredBytes: diskCheck.requiredBytes, freeBytes: diskCheck.freeBytes },
          ),
        );
      }

      const jobId = jobs.create();
      runDownloadJob(jobId, jobs, entry, tilesDir);
      return reply.code(202).send({ job_id: jobId });
    },
  );

  // POST /api/v1/map/regions/:id/build -- baut die Kacheln aus dem
  // OSM-Extrakt (B-04). Der Gegenpart zum Download fuer Regionen, fuer die
  // es keine fertige Datei gibt -- also fuer alle mitgelieferten.
  //
  // Die beiden Vorpruefungen sind kein Zierrat: ein Bau, der nach zwei
  // Stunden an vollem Speicher scheitert, hat zwei Stunden gekostet, und
  // ein OOM auf einer HAOS-VM trifft nicht unbedingt planetiler, sondern
  // Home Assistant. Beide Ablehnungen nennen deshalb die konkreten Zahlen.
  fastify.post<{ Params: IdParams; Reply: PostRegionsReply | ApiError }>(
    '/api/v1/map/regions/:id/build',
    async (request, reply) => {
      const regionId = request.params.id;
      if (!REGION_NAME_PATTERN.test(regionId)) {
        return reply
          .code(400)
          .send(createErrorResponse('INVALID_REGION', 'id must be a valid region slug'));
      }

      let catalog: CatalogEntry[];
      try {
        catalog = await loadCatalog();
      } catch (err) {
        fastify.log.error({ error: (err as Error).message }, 'Failed to load regions catalog');
        return reply
          .code(500)
          .send(createErrorResponse('CATALOG_UNAVAILABLE', 'Regions catalog could not be loaded'));
      }

      const entry = catalog.find((candidate) => candidate.id === regionId);
      if (!entry) {
        return reply
          .code(404)
          .send(createErrorResponse('NOT_FOUND', `Unknown catalog region '${regionId}'`));
      }

      if (!entry.pbfUrl) {
        return reply
          .code(409)
          .send(
            createErrorResponse(
              'NO_BUILD_SOURCE',
              tx(T, 'keineQuelle', { id: regionId }),
            ),
          );
      }

      if (existsSync(finalFilePath(tilesDir, regionId))) {
        return reply
          .code(409)
          .send(createErrorResponse('ALREADY_INSTALLED', `Region '${regionId}' is already installed`));
      }

      // ZWEI KACHELBAUTEN GLEICHZEITIG ZERSTOEREN EINANDER.
      //
      // Beide planetiler-Prozesse benutzen DASSELBE Verzeichnis fuer die
      // gemeinsamen Basisdaten (Wasserflaechen, Natural Earth,
      // Seen-Mittellinien). Der zweite Lauf liest dann eine Datei, die der
      // erste noch herunterlaedt, und stirbt an:
      //
      //   java.util.zip.ZipException: zip END header not found
      //
      // Das sieht aus wie ein kaputter Download und ist in Wahrheit ein
      // Wettlauf. Genau so ist es im Betrieb passiert: der Knopf wurde ein
      // zweites Mal gedrueckt, waehrend der erste Lauf noch bei 66 % des
      // Wasserflaechen-Downloads stand. Im Protokoll standen daraufhin zwei
      // Laufzeituhren nebeneinander (0:03:17 und 0:01:52) -- der einzige
      // sichtbare Hinweis darauf, dass es zwei Prozesse waren.
      //
      // Die Sperre gilt bewusst UEBER ALLE REGIONEN, nicht je Region: geteilt
      // ist das Quellenverzeichnis, nicht die Region.
      const running = jobs.findUnfinished(BUILD_JOB_KIND);
      if (running) {
        return reply.code(409).send(
          createErrorResponse(
            'BUILD_IN_PROGRESS',
            tx(T, 'bauKachel'),
            { jobId: running.id },
          ),
        );
      }

      const requiredBytes = buildRequiredBytes(entry);
      const diskCheck = await checkDiskSpace(tilesDir, requiredBytes, statfsImpl);
      if (!diskCheck.ok) {
        return reply.code(409).send(
          createErrorResponse(
            'INSUFFICIENT_SPACE',
            tx(T, 'platzKachel'),
            { requiredBytes: diskCheck.requiredBytes, freeBytes: diskCheck.freeBytes },
          ),
        );
      }

      const freeMemFn = opts.buildDeps?.freeMemFn ?? defaultFreeMem;
      const requiredMemory = buildRequiredFreeMemory();
      const freeMemory = freeMemFn();
      if (freeMemory < requiredMemory) {
        return reply.code(409).send(
          createErrorResponse(
            'INSUFFICIENT_MEMORY',
            tx(T, 'ramKachel'),
            { requiredBytes: requiredMemory, freeBytes: freeMemory },
          ),
        );
      }

      const jobId = jobs.create(BUILD_JOB_KIND, { region: regionId, bauart: 'kacheln' });
      // Der Logger wird hier verdrahtet, nicht in `build.ts`: nur die Route
      // kennt die Fastify-Instanz, und deren stdout ist das, was im
      // Add-on-Protokoll erscheint.
      runBuildJob(jobId, jobs, entry, tilesDir, {
        ...opts.buildDeps,
        logger: opts.buildDeps?.logger ?? ((line) => fastify.log.info(line)),
      });
      return reply.code(202).send({ job_id: jobId });
    },
  );

  // POST /api/v1/map/regions/:id/build-graph -- baut den ROUTINGGRAPHEN aus
  // demselben OSM-Extrakt.
  //
  // Bis 2026-09-03 hiess es, das ginge auf dem Geraet nicht: das Werkzeug
  // brauche einen Docker-Socket. Das galt fuer unser SKRIPT
  // (`services/valhalla/build-tiles.sh` faehrt ein Image von aussen an),
  // nicht fuer die WERKZEUGE -- dieses Add-on setzt mit `FROM` auf genau
  // jenem Image auf, dessen Dockerfile `valhalla_build_tiles` und
  // Geschwister ausdruecklich aufbewahrt. Dieselbe Fehlerklasse wie beim
  // JAR-Modus von planetiler: der Weg war da, das Skript fand ihn nicht --
  // und die Oberflaeche schickte den Betreiber an einen zweiten Rechner,
  // den es nicht braucht.
  fastify.post<{ Params: IdParams; Body: BuildGraphBody; Reply: PostRegionsReply | ApiError }>(
    '/api/v1/map/regions/:id/build-graph',
    async (request, reply) => {
      const regionId = request.params.id;
      if (!REGION_NAME_PATTERN.test(regionId)) {
        return reply
          .code(400)
          .send(createErrorResponse('INVALID_REGION', 'id must be a valid region slug'));
      }

      let catalog: CatalogEntry[];
      try {
        catalog = await loadCatalog();
      } catch (err) {
        fastify.log.error({ error: (err as Error).message }, 'Failed to load regions catalog');
        return reply
          .code(500)
          .send(createErrorResponse('CATALOG_UNAVAILABLE', 'Regions catalog could not be loaded'));
      }

      const entry = catalog.find((candidate) => candidate.id === regionId);
      if (!entry) {
        return reply
          .code(404)
          .send(createErrorResponse('NOT_FOUND', `Unknown catalog region '${regionId}'`));
      }

      if (!entry.pbfUrl) {
        return reply
          .code(409)
          .send(
            createErrorResponse(
              'NO_BUILD_SOURCE',
              tx(T, 'keineQuelle', { id: regionId }),
            ),
          );
      }

      // Dieselbe Sperre wie beim Kachelbau, und aus einem zusaetzlichen
      // Grund: Kachel- und Graphbau nebeneinander sprengen den Speicher der
      // 8-GB-VM, auf der auch Home Assistant laeuft.
      const running = jobs.findUnfinished(BUILD_JOB_KIND);
      if (running) {
        return reply.code(409).send(
          createErrorResponse(
            'BUILD_IN_PROGRESS',
            tx(T, 'bauSchwer'),
            { jobId: running.id },
          ),
        );
      }

      const freeMemFn = opts.buildDeps?.freeMemFn ?? defaultFreeMem;
      const requiredMemory = buildRequiredFreeMemory();
      const freeMemory = freeMemFn();
      if (freeMemory < requiredMemory) {
        return reply.code(409).send(
          createErrorResponse(
            'INSUFFICIENT_MEMORY',
            tx(T, 'ramGraph'),
            { requiredBytes: requiredMemory, freeBytes: freeMemory },
          ),
        );
      }

      // ─── EIN GRAPH UEBER ALLE INSTALLIERTEN KARTEN ────────────────────
      // Es gibt EINEN Routinggraphen, nicht einen je Region -- die Knoepfe
      // stehen aber pro Region und legen das Gegenteil nahe. Gemeldet: „Das
      // routing funktioniert nicht mehr ... Liegt das daran dass nur das
      // routing fuer Liechtenstein angezeigt wird?" Ja.
      //
      // 0.10.1 hat das wenigstens SICHTBAR gemacht: der Bau rechnete vorher
      // aus, was er verliert, und fragte nach. Der Betreiber bekam damit eine
      // Warnung — und keinen Weg. Wer drei Laender wollte, konnte nichts tun.
      //
      // Seit 0.10.2 ist die Abdeckung keine Auskunft mehr, sondern eine
      // Ansage: jede installierte Karte kommt in den Graphen. Fehlt ihr
      // OSM-Extrakt, wird er geladen. Nur was WEDER Extrakt NOCH Quelle hat
      // (eine von Hand abgelegte `.pmtiles` etwa), bleibt draussen — und
      // genau das wird benannt, statt lautlos zu fehlen.
      const plan = graphBauPlan({
        installiert: (await listRegions(tilesDir, fastify.log)).map((r) => r.region),
        mitExtrakt: regionenMitExtrakt(pbfLagerPfad(resolveGraphDir())),
        katalog: catalog,
        bauRegion: regionId,
      });
      const abdeckung = abdeckungNachBau({
        installiert: (await listRegions(tilesDir, fastify.log)).map((r) => r.region),
        // Nach diesem Bau haben genau die Regionen des Plans einen Extrakt —
        // die vorhandenen und die nachgeladenen. Die Abdeckung aus DEMSELBEN
        // Plan zu rechnen ist das, was Anzeige und Bau zusammenhaelt; zwei
        // getrennte Rechnungen waeren wieder zwei Seiten, die je die Haelfte
        // sehen.
        mitExtrakt: plan.regionen,
        bauRegion: regionId,
        jetzt: graphRegionenJetzt(resolveGraphDir()),
      });

      // Gefragt wird nur noch bei einem Verlust, den auch dieser Bau nicht
      // abwenden kann. Alles andere ist jetzt geloest statt gemeldet.
      const verlust = abdeckung.verliert.length > 0 || abdeckung.ohneRouting.length > 0;
      if (verlust && request.body?.abdeckung_bestaetigt !== true) {
        return reply.code(409).send(
          createErrorResponse('COVERAGE_LOSS', abdeckungSatz(abdeckung), {
            abdeckung,
          }),
        );
      }

      const jobId = jobs.create(BUILD_JOB_KIND, { region: regionId, bauart: 'routing' });
      fastify.log.info(
        { abdeckung, zuLaden: plan.zuLaden.map((z) => z.region) },
        `Routingbau: ${abdeckungSatz(abdeckung)}`,
      );
      runBuildJob(
        jobId,
        jobs,
        entry,
        tilesDir,
        { ...opts.buildDeps, logger: opts.buildDeps?.logger ?? ((line) => fastify.log.info(line)) },
        GRAPH_BUILD,
        { [GRAPH_PLAN_ENV]: planAlsEnv(plan) },
      );
      return reply.code(202).send({ job_id: jobId, abdeckung });
    },
  );

  // POST /api/v1/map/regions/:id/build-search-index -- baut den OFFLINE-
  // SUCHINDEX aus demselben OSM-Extrakt.
  //
  // Bis 0.3.3 sagten Installationspruefung, Dockerfile und Doku
  // uebereinstimmend, das ginge auf dem Geraet nicht: das Werkzeug brauche
  // `osmium` und einen Repository-Checkout. Beides stimmte -- und beides war
  // eine Verpackungsentscheidung. `osmium-tool` ist ein Ubuntu-Paket, und das
  // Index-Werkzeug fehlte nur, weil der Core-Build allein `src/index.ts` als
  // Einstiegspunkt fuehrte. Der Quelltext liegt seit E05-T5 fertig da.
  //
  // Vierter Fall derselben Klasse in dieser Serie (Kachelbau, Routinggraph,
  // JAR-Modus, jetzt der Index): ein dokumentierter Weg, der nicht begehbar
  // war -- und jedes Mal hat die Doku den Betreiber an einen zweiten Rechner
  // geschickt, den es nie gebraucht haette.
  fastify.post<{ Params: IdParams; Reply: PostRegionsReply | ApiError }>(
    '/api/v1/map/regions/:id/build-search-index',
    async (request, reply) => {
      const regionId = request.params.id;
      if (!REGION_NAME_PATTERN.test(regionId)) {
        return reply
          .code(400)
          .send(createErrorResponse('INVALID_REGION', 'id must be a valid region slug'));
      }

      let catalog: CatalogEntry[];
      try {
        catalog = await loadCatalog();
      } catch (err) {
        fastify.log.error({ error: (err as Error).message }, 'Failed to load regions catalog');
        return reply
          .code(500)
          .send(createErrorResponse('CATALOG_UNAVAILABLE', 'Regions catalog could not be loaded'));
      }

      const entry = catalog.find((candidate) => candidate.id === regionId);
      if (!entry) {
        return reply
          .code(404)
          .send(createErrorResponse('NOT_FOUND', `Unknown catalog region '${regionId}'`));
      }

      if (!entry.pbfUrl) {
        return reply
          .code(409)
          .send(
            createErrorResponse(
              'NO_BUILD_SOURCE',
              tx(T, 'keineQuelle', { id: regionId }),
            ),
          );
      }

      // Dieselbe Sperre wie beim Kachelbau, und aus einem zusaetzlichen
      // Grund: Kachel- und Graphbau nebeneinander sprengen den Speicher der
      // 8-GB-VM, auf der auch Home Assistant laeuft.
      const running = jobs.findUnfinished(BUILD_JOB_KIND);
      if (running) {
        return reply.code(409).send(
          createErrorResponse(
            'BUILD_IN_PROGRESS',
            tx(T, 'bauSchwer'),
            { jobId: running.id },
          ),
        );
      }

      const freeMemFn = opts.buildDeps?.freeMemFn ?? defaultFreeMem;
      const requiredMemory = buildRequiredFreeMemory();
      const freeMemory = freeMemFn();
      if (freeMemory < requiredMemory) {
        return reply.code(409).send(
          createErrorResponse(
            'INSUFFICIENT_MEMORY',
            tx(T, 'ramSuche'),
            { requiredBytes: requiredMemory, freeBytes: freeMemory },
          ),
        );
      }

      const jobId = jobs.create(BUILD_JOB_KIND, { region: regionId, bauart: 'suche' });
      runBuildJob(
        jobId,
        jobs,
        entry,
        tilesDir,
        { ...opts.buildDeps, logger: opts.buildDeps?.logger ?? ((line) => fastify.log.info(line)) },
        LITE_INDEX_BUILD,
      );
      return reply.code(202).send({ job_id: jobId });
    },
  );

  // POST /api/v1/map/regions/:id/extrakt -- NUR herunterladen (0.59.0).
  //
  // Gewuenscht: erst alle gewuenschten Karten herunterladen, dann gemeinsam
  // bauen. Der Bau folgt ueber `POST /api/v1/map/gesamtbau`; siehe
  // `extrakt.ts`.
  fastify.post<{ Params: IdParams; Reply: PostRegionsReply | ApiError }>(
    '/api/v1/map/regions/:id/extrakt',
    async (request, reply) => {
      const regionId = request.params.id;
      if (!REGION_NAME_PATTERN.test(regionId)) {
        return reply.code(400).send(createErrorResponse('INVALID_REGION', 'id must be a valid region slug'));
      }
      let catalog: CatalogEntry[];
      try {
        catalog = await loadCatalog();
      } catch (err) {
        fastify.log.error({ error: (err as Error).message }, 'Failed to load regions catalog');
        return reply
          .code(500)
          .send(createErrorResponse('CATALOG_UNAVAILABLE', 'Regions catalog could not be loaded'));
      }
      const entry = catalog.find((candidate) => candidate.id === regionId);
      if (!entry) {
        return reply.code(404).send(createErrorResponse('NOT_FOUND', `Unknown catalog region '${regionId}'`));
      }
      if (!entry.pbfUrl) {
        return reply
          .code(409)
          .send(
            createErrorResponse(
              'NO_BUILD_SOURCE',
              tx(T, 'keineQuelle', { id: regionId }),
            ),
          );
      }
      const lager = pbfLagerPfad(resolveGraphDir());
      if (hatExtrakt(lager, regionId)) {
        return reply
          .code(409)
          .send(createErrorResponse('ALREADY_DOWNLOADED', tx(T, 'schonGeladen', { id: regionId })));
      }
      // Waehrend eines Baus nicht: der Routingbau laedt fehlende Extrakte
      // selbst nach -- unter demselben Namen. Zwei Schreiber auf einer Datei
      // ergeben eine kaputte.
      const bau = jobs.findUnfinished(BUILD_JOB_KIND);
      if (bau) {
        return reply.code(409).send(
          createErrorResponse(
            'BUILD_IN_PROGRESS',
            tx(T, 'extraktWarten'),
            { jobId: bau.id },
          ),
        );
      }
      const laufend = jobs.findUnfinished(`${EXTRAKT_JOB_KIND}:${regionId}`);
      if (laufend) {
        return reply.code(202).send({ job_id: laufend.id });
      }
      const schon = await existingPartBytes(extraktPartPfad(lager, regionId));
      const diskCheck = await checkDiskSpace(
        tilesDir,
        computeRemainingBytes(entry.sizeBytes, schon),
        statfsImpl,
      );
      if (!diskCheck.ok) {
        return reply.code(409).send(
          createErrorResponse('INSUFFICIENT_SPACE', tx(T, 'platzExtrakt'), {
            requiredBytes: diskCheck.requiredBytes,
            freeBytes: diskCheck.freeBytes,
          }),
        );
      }
      const jobId = jobs.create(`${EXTRAKT_JOB_KIND}:${regionId}`, { region: regionId, bauart: 'extrakt' });
      runExtraktJob(jobId, jobs, entry, lager);
      return reply.code(202).send({ job_id: jobId });
    },
  );

  // DELETE /api/v1/map/regions/:id/extrakt -- eine heruntergeladene, noch
  // NICHT gebaute Karte wieder verwerfen. Ohne das liesse sich ein
  // versehentlicher Download nur noch durch Bauen loswerden: der Gesamtbau
  // nimmt alles mit, was im Lager liegt.
  fastify.delete<{ Params: IdParams; Reply: ApiError | undefined }>(
    '/api/v1/map/regions/:id/extrakt',
    async (request, reply) => {
      const regionId = request.params.id;
      if (!REGION_NAME_PATTERN.test(regionId)) {
        return reply.code(400).send(createErrorResponse('INVALID_REGION', 'Region name is invalid'));
      }
      if (existsSync(finalFilePath(tilesDir, regionId))) {
        return reply
          .code(409)
          .send(
            createErrorResponse(
              'ALREADY_INSTALLED',
              tx(T, 'schonGebaut', { id: regionId }),
            ),
          );
      }
      if (jobs.findUnfinished(BUILD_JOB_KIND)) {
        return reply
          .code(409)
          .send(createErrorResponse('BUILD_IN_PROGRESS', tx(T, 'nichtsEntfernt')));
      }
      const lager = pbfLagerPfad(resolveGraphDir());
      await rm(extraktPfad(lager, regionId), { force: true });
      await rm(extraktPartPfad(lager, regionId), { force: true });
      return reply.code(204).send(undefined);
    },
  );

  // POST /api/v1/map/gesamtbau -- ein Knopf, der alles wieder zusammenbaut.
  //
  // ─── WOFUER ───────────────────────────────────────────────────────────────
  // Gewuenscht: „Dann gibt es noch einen gemeinsamen Knopf der nach einer
  // neuen Installation oder Update alles wieder neu baut fuer eine gemeinsame
  // Anzeige."
  //
  // Bis 0.15.3 standen an jeder Karte drei Bau-Knoepfe. Fuer jemanden, der
  // gerade eine Karte installiert hat, ist das die falsche Frage: er will
  // nicht wissen, WELCHE Erzeugnisse es gibt, sondern dass danach alles
  // wieder passt.
  //
  // ─── WARUM HIER KEINE ABDECKUNGS-RUECKFRAGE STEHT ─────────────────────────
  // Der Einzelbau fragt bei `COVERAGE_LOSS` nach. Hier waere das eine Frage,
  // deren einzige Antworten „ja" und „aufgeben" sind: der Gesamtbau nimmt
  // ohnehin JEDE installierte Karte mit, und was drausssen bleibt (eine von
  // Hand abgelegte `.pmtiles` ohne OSM-Quelle), bleibt es unabhaengig von der
  // Antwort. Genau diese Sorte Warnung ohne Ausweg war der Vorwurf an 0.10.1.
  //
  // Stattdessen steht die Abdeckung in der Antwort, und der Lauf benennt jede
  // uebersprungene Karte in seiner Statuszeile.
  fastify.post<{
    Body: { alles?: boolean } | undefined;
    Reply: (PostRegionsReply & { schritte?: number }) | ApiError;
  }>(
    '/api/v1/map/gesamtbau',
    async (request, reply) => {
      let catalog: CatalogEntry[];
      try {
        catalog = await loadCatalog();
      } catch (err) {
        fastify.log.error({ error: (err as Error).message }, 'Failed to load regions catalog');
        return reply
          .code(500)
          .send(createErrorResponse('CATALOG_UNAVAILABLE', 'Regions catalog could not be loaded'));
      }

      const installiert = (await listRegions(tilesDir, fastify.log)).map((r) => r.region);
      // ─── HERUNTERGELADEN, NOCH NICHT GEBAUT (0.59.0) ──────────────────────
      // Diese Karten baut derselbe Lauf mit: erst ihre Kacheln, dann das
      // Routing ueber alle. Nur Katalogkarten mit OSM-Quelle -- ein fremder
      // Extrakt im Lager hat keinen Namen, unter dem er gezeichnet wuerde.
      const lager = pbfLagerPfad(resolveGraphDir());
      const neu = catalog
        .filter((c) => Boolean(c.pbfUrl) && !installiert.includes(c.id) && hatExtrakt(lager, c.id))
        .map((c) => c.id);
      const alle = [...installiert, ...neu];
      if (alle.length === 0) {
        return reply
          .code(409)
          .send(
            createErrorResponse(
              'NO_REGIONS',
              tx(T, 'keineKarteGesamt'),
            ),
          );
      }

      // Dieselbe Sperre wie bei jedem schweren Bau.
      const running = jobs.findUnfinished(BUILD_JOB_KIND);
      if (running) {
        return reply.code(409).send(
          createErrorResponse(
            'BUILD_IN_PROGRESS',
            tx(T, 'bauSchwer'),
            { jobId: running.id },
          ),
        );
      }

      const freeMemFn = opts.buildDeps?.freeMemFn ?? defaultFreeMem;
      const requiredMemory = buildRequiredFreeMemory();
      const freeMemory = freeMemFn();
      if (freeMemory < requiredMemory) {
        return reply.code(409).send(
          createErrorResponse(
            'INSUFFICIENT_MEMORY',
            tx(T, 'ramGesamt'),
            { requiredBytes: requiredMemory, freeBytes: freeMemory },
          ),
        );
      }

      // Der Kachelbau braucht Arbeitsraum auf der Platte (BUILD_DISK_FACTOR).
      // Fuer mehrere neue Karten nacheinander genuegt der der groessten:
      // planetiler raeumt nach jedem Lauf auf.
      if (neu.length > 0) {
        const bedarf = Math.max(
          ...neu.map((id) => {
            const eintrag = catalog.find((c) => c.id === id);
            return eintrag ? buildRequiredBytes(eintrag) : 0;
          }),
        );
        const platz = await checkDiskSpace(tilesDir, bedarf, statfsImpl);
        if (!platz.ok) {
          return reply.code(409).send(
            createErrorResponse(
              'INSUFFICIENT_SPACE',
              tx(T, 'platzKarte'),
              { requiredBytes: platz.requiredBytes, freeBytes: platz.freeBytes },
            ),
          );
        }
      }

      // Der Routingschritt braucht denselben Plan wie der Einzelbau: welche
      // OSM-Extrakte fehlen und nachgeladen werden muessen.
      // ─── NUR WAS FEHLT (0.40.0) ─────────────────────────────────────────
      // Ohne `alles: true` wird gebaut, was fehlt oder älter ist als seine
      // Karte -- siehe `gesamtbau.ts#noetigerPlan`.
      const ohneQuelle = installiert.filter((r) => !catalog.some((c) => c.id === r && Boolean(c.pbfUrl)));
      const status = await collectBuildStatus(
        { tilesDir, graphDir: resolveGraphDir(), liteSearchDir: resolveLiteSearchDir() },
        readLiteIndexMeta,
      );
      const plan = mitNeuenKarten(
        neu,
        noetigerPlan(alle, bestandAus(status, LITE_INDEX_FORMAT), {
          alles: request.body?.alles === true,
          ohneQuelle,
        }),
      );
      const bauRegion = [...alle].sort()[0] ?? alle[0];
      const graphPlan = graphBauPlan({
        installiert: alle,
        mitExtrakt: regionenMitExtrakt(lager),
        katalog: catalog,
        bauRegion,
      });
      const abdeckung = abdeckungNachBau({
        installiert: alle,
        mitExtrakt: graphPlan.regionen,
        bauRegion,
        jetzt: graphRegionenJetzt(resolveGraphDir()),
      });

      const jobId = jobs.create(BUILD_JOB_KIND, { region: bauRegion, bauart: 'gesamt' });
      fastify.log.info(
        { installiert, neu, schritte: plan.length, abdeckung },
        `Gesamtbau: ${plan.length} Schritte über ${alle.length} Karten.`,
      );
      starteGesamtbau({
        jobId,
        jobs,
        regionen: alle,
        eintragFuer: (region) => catalog.find((c) => c.id === region && Boolean(c.pbfUrl)),
        tilesDir,
        bauzeitenPfad: bauzeitenPfad(tilesDir),
        routingEnv: { [GRAPH_PLAN_ENV]: planAlsEnv(graphPlan) },
        plan,
        fehltImGraph: () => {
          const drin = new Set(graphRegionenJetzt(resolveGraphDir()));
          return alle.filter((r) => !ohneQuelle.includes(r) && !drin.has(r));
        },
        deps: {
          ...opts.buildDeps,
          logger: opts.buildDeps?.logger ?? ((line) => fastify.log.info(line)),
        },
      });
      return reply.code(202).send({ job_id: jobId, schritte: plan.length, abdeckung });
    },
  );

  // DELETE /api/v1/map/regions/:id -- refuses to remove the last region.
  //
  // Gemeldet: nach „Löschen" stand die Karte als entfernt da, die Suche fand
  // dort aber weiter Orte, und geroutet wurde auch noch. Gelöscht wurde nur
  // die Kartendatei. Jetzt gehen Suchindex und OSM-Extrakt der Region mit --
  // der Extrakt, weil der nächste Routingbau sonst jede gelöschte Region
  // wieder einsammelt (er baut über alles, was im Zwischenlager liegt).
  //
  // Der Routinggraph bleibt: es gibt EINEN für alle Regionen, eine einzelne
  // lässt sich nicht herausnehmen. „Was ist gebaut?" nennt, was darin noch
  // steckt; der nächste Routingbau lässt es weg. Ausnahme seit 0.62.0:
  // Routing aus Länderpaketen -- dort geht das Land mit (teilgraph.ts).
  fastify.delete<{ Params: IdParams; Reply: ApiError | undefined }>(
    '/api/v1/map/regions/:id',
    async (request, reply) => {
      const regionId = request.params.id;
      if (!REGION_NAME_PATTERN.test(regionId)) {
        return reply.code(400).send(createErrorResponse('INVALID_REGION', 'Region name is invalid'));
      }

      const filePath = resolveRegionFilePath(tilesDir, regionId);
      if (!filePath || !existsSync(filePath)) {
        return reply.code(404).send(createErrorResponse('NOT_FOUND', `Region '${regionId}' not found`));
      }

      const installed = await listRegions(tilesDir, fastify.log);
      if (installed.length <= 1) {
        return reply
          .code(409)
          .send(createErrorResponse('LAST_REGION', 'Cannot delete the only installed region'));
      }

      // Ein laufender Bau liest die Extrakte im Zwischenlager. Einen davon
      // unter ihm wegzulöschen, ließe ihn nach Stunden scheitern.
      const running = jobs.findUnfinished(BUILD_JOB_KIND);
      if (running) {
        return reply.code(409).send(
          createErrorResponse(
            'BUILD_IN_PROGRESS',
            tx(T, 'bauVerwendet'),
            { jobId: running.id },
          ),
        );
      }

      await unlink(filePath);
      // Die Karte ist weg; scheitert das Aufräumen, bleibt das Löschen
      // trotzdem gelungen -- aber nicht stillschweigend.
      const zubehoer = [
        liteSearchDbPathForRegion(resolveLiteSearchDir(), regionId),
        extraktPfad(pbfLagerPfad(resolveGraphDir()), regionId),
      ];
      for (const pfad of zubehoer) {
        await rm(pfad, { force: true }).catch((err: unknown) => {
          fastify.log.warn({ pfad, error: (err as Error).message }, 'Region gelöscht, Zubehör blieb liegen');
        });
      }
      // Stammt das Routing aus Länderpaketen (teilgraph.ts), geht das Land
      // mit -- nur seine Kacheln, Grenzkacheln der Nachbarn bleiben.
      try {
        if (await teilgraphEntfernen(resolveGraphDir(), regionId)) await valhallaNeuStarten();
      } catch (err) {
        fastify.log.warn({ regionId, error: (err as Error).message }, 'Region gelöscht, Routing-Kacheln blieben liegen');
      }
      return reply.code(204).send(undefined);
    },
  );

  // GET /api/v1/map/regions/laufender-bau -- der gerade laufende schwere Bau,
  // oder `null`.
  //
  // ─── WARUM ES DIESE ROUTE GIBT ──────────────────────────────────────────
  // Gemeldet: „Wenn man von Yapaia woandershin wechselt und dann wieder
  // aufruft sind die aktuellen Fortschrittsinformationen vom Bau nicht mehr
  // sichtbar." Und beim nächsten Druck auf „bauen": „Es läuft bereits ein
  // Bau."
  //
  // Beides stimmte. Der Bau lief im Kern ungestört weiter — die Oberfläche
  // merkte sich nur im Speicher des Browsers, welcher Job zu welcher Region
  // gehört, und der ist beim Verlassen der Seite weg. Danach wusste der Kern
  // alles und zeigte nichts; der Betreiber sah einen Bau, der offenbar läuft,
  // ohne jede Auskunft darüber, wie weit er ist oder ob er noch lebt.
  //
  // Dieselbe Fehlerklasse, die dieses Projekt schon mehrfach getroffen hat:
  // die Antwort ist da, sie ist von dort, wo der Betreiber hinsieht, nur
  // nicht erreichbar. Diese Route ist der Weg dorthin.
  //
  // Sie steht VOR `/api/v1/map/regions/:id` in keiner Konkurrenz — es gibt
  // dort kein GET mit Parameter —, aber sie steht bewusst bei den Jobs und
  // nicht bei den Regionen: was sie liefert, ist ein Job.
  fastify.get<{ Reply: { data: JobSnapshot | null } }>(
    '/api/v1/map/regions/laufender-bau',
    async (_request, reply) => {
      return reply.code(200).send({ data: jobs.findUnfinished(BUILD_JOB_KIND) ?? null });
    },
  );

  // GET /api/v1/jobs/:id -- job status (progress, bytes, error).
  fastify.get<{ Params: IdParams; Reply: JobReply | ApiError }>(
    '/api/v1/jobs/:id',
    async (request, reply) => {
      const job = jobs.get(request.params.id);
      if (!job) {
        return reply
          .code(404)
          .send(createErrorResponse('NOT_FOUND', `Job '${request.params.id}' not found`));
      }
      return reply.code(200).send({ data: job });
    },
  );

  // DELETE /api/v1/jobs/:id -- cancels a queued/running job.
  fastify.delete<{ Params: IdParams; Reply: ApiError | undefined }>(
    '/api/v1/jobs/:id',
    async (request, reply) => {
      const job = jobs.get(request.params.id);
      if (!job) {
        return reply
          .code(404)
          .send(createErrorResponse('NOT_FOUND', `Job '${request.params.id}' not found`));
      }
      const cancelled = jobs.cancel(request.params.id);
      if (!cancelled) {
        return reply
          .code(409)
          .send(createErrorResponse('JOB_NOT_CANCELLABLE', `Job '${request.params.id}' has already finished`));
      }
      return reply.code(204).send(undefined);
    },
  );
};
