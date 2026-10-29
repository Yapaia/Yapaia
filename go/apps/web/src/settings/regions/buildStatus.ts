/**
 * „Was ist gebaut, und wann?" — Abruf und Aufbereitung.
 *
 * Gemeldet: „Nach der (erfolgreichen) Erstellung sehe ich nicht, dass bereits
 * etwas erstellt wurde und wann." Ein Bau, der für Deutschland Stunden läuft,
 * darf danach nicht spurlos sein — sonst baut man im Zweifel noch einmal.
 */

import { gebiet, tx } from '../../i18n/index.js';
import { T } from './texte.js';

/** Relativ zu `BASE_URL`, nie ein fest verdrahtetes `/api/...` -- sonst
 *  bricht es unter dem HA-Ingress-Unterpfad (W-15). Gleiche Form wie in
 *  `apps/web/src/map/regions.ts`. */
function buildStatusUrl(): string {
  return `${import.meta.env.BASE_URL}api/v1/map/build-status`;
}

export interface ArtifactStatus {
  present: boolean;
  built_at?: string;
  region?: string;
  size_bytes?: number;
  record_count?: number;
  /** Suchindex von vor 0.39.0: ohne Firmen und Hausnummern. */
  veraltet?: boolean;
}

export interface TileStatus extends ArtifactStatus {
  region: string;
}

export interface BuildStatus {
  tiles: TileStatus[];
  /** EINER fuer alle Regionen -- `regions` nennt alle, die darin stecken. */
  routing: ArtifactStatus & { regions?: string[] };
  /** Seit 0.5.0 einer JE REGION. */
  search: ArtifactStatus[];
}

export async function fetchBuildStatus(signal?: AbortSignal): Promise<BuildStatus> {
  const response = await fetch(buildStatusUrl(), { signal });
  if (!response.ok) {
    throw new Error(`build-status: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data: BuildStatus };
  return body.data;
}

/**
 * Regionen, die im Routinggraphen stecken, deren Karte aber nicht (mehr)
 * installiert ist.
 *
 * Gemeldet: nach „Löschen" stand die Karte als entfernt da, geroutet wurde
 * dort aber weiter. Das Löschen kann daran nichts ändern -- es gibt EINEN
 * Graphen für alle Regionen --, also muss die Übersicht es wenigstens sagen.
 */
export function routingOhneKarte(status: BuildStatus): string[] {
  const installiert = new Set(status.tiles.map((t) => t.region));
  return (status.routing.regions ?? []).filter((r) => !installiert.has(r));
}

/**
 * „vor 3 Stunden", „gestern", „am 12.08.2026".
 *
 * Nah dran ist die verstrichene Zeit die nützlichere Auskunft („habe ich das
 * eben gebaut oder letzte Woche?"), weiter weg das Datum. Die Grenze liegt
 * bei einer Woche.
 *
 * `now` ist ein Parameter, damit die Funktion prüfbar ist, ohne die Uhr zu
 * stellen.
 */
export function formatBuiltAt(iso: string | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;

  const diffMs = now.getTime() - then.getTime();
  // Eine Uhr, die in der Zukunft liegt (Zeitzone, NTP-Sprung), darf nicht
  // „vor -3 Stunden" ergeben.
  if (diffMs < 0) return then.toLocaleDateString(gebiet());

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return tx(T, 'gerade');
  if (minutes < 60) return minutes === 1 ? tx(T, 'vorMinute') : tx(T, 'vorMinuten', { n: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? tx(T, 'vorStunde') : tx(T, 'vorStunden', { n: hours });

  const days = Math.floor(hours / 24);
  if (days === 1) return tx(T, 'gestern');
  if (days < 7) return tx(T, 'vorTagen', { n: days });

  return tx(T, 'amDatum', { datum: then.toLocaleDateString(gebiet()) });
}
