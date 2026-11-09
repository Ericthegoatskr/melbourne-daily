import type {
  TransitBoard,
  TransitDeparture,
  TransitDirection,
  TransitDisruption,
  TransitMode,
  TransitSearch,
  TransitStop,
} from "../shared/transit";

/** Secrets exist only in the API runtime, never in the public response. */
export interface TransitEnv {
  PTV_DEV_ID?: string;
  PTV_API_KEY?: string;
}
export interface DeparturesQuery {
  stopId: number;
  idScheme?: "ptv" | "gtfs";
  mode: TransitMode;
  routeId?: number;
  directionId?: number;
}
export class TransitServiceError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "invalid_query"
      | "upstream"
      | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "TransitServiceError";
  }
}

const badData = () =>
  new TransitServiceError(
    "invalid_response",
    "The transport provider returned incomplete data.",
  );
const badQuery = () =>
  new TransitServiceError("invalid_query", "The transport request is invalid.");
function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badData();
  return raw as Record<string, unknown>;
}
function integer(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0)
    throw badData();
  return raw;
}
function text(raw: unknown, optional = false): string {
  if (optional && (raw === null || raw === undefined)) return "";
  if (
    typeof raw !== "string" ||
    raw.length > 12_000 ||
    (!optional && !raw.trim())
  )
    throw badData();
  return raw.trim();
}
function time(raw: unknown, optional = false): string | null {
  if (optional && (raw === null || raw === undefined || raw === ""))
    return null;
  if (
    typeof raw !== "string" ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(raw) ||
    !Number.isFinite(Date.parse(raw))
  )
    throw badData();
  return new Date(raw).toISOString();
}
function array(raw: unknown, max = 1000): unknown[] {
  if (!Array.isArray(raw) || raw.length > max) throw badData();
  return raw;
}
function providerHealth(raw: Record<string, unknown>) {
  if (object(raw.status).health !== 1)
    throw new TransitServiceError(
      "upstream",
      "The transport provider is temporarily unavailable.",
    );
}
const routeType = (mode: TransitMode): 0 | 1 => {
  if (mode !== "train" && mode !== "tram") throw badQuery();
  return mode === "train" ? 0 : 1;
};
function queryId(value: number | undefined, required = false) {
  if (value === undefined && !required) return;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2_147_483_647
  )
    throw badQuery();
}
function checkedTime(value: string) {
  const timestamp = time(value)!;
  return timestamp;
}

export function transitReady(env: TransitEnv): boolean {
  return (
    typeof env.PTV_DEV_ID === "string" &&
    /^\d{1,12}$/.test(env.PTV_DEV_ID) &&
    typeof env.PTV_API_KEY === "string" &&
    /^[A-Za-z0-9-]{16,128}$/.test(env.PTV_API_KEY)
  );
}

/** HMAC the exact encoded request URI including devid; do not reserialize afterward. */
export async function signPTVRequest(
  pathAndQuery: string,
  env: TransitEnv,
): Promise<string> {
  if (!transitReady(env))
    throw new TransitServiceError(
      "not_configured",
      "Live transport has not been connected.",
    );
  if (!pathAndQuery.startsWith("/v3/") || /[\r\n#]/.test(pathAndQuery))
    throw badQuery();
  const uri = `${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}devid=${env.PTV_DEV_ID}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.PTV_API_KEY!),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(uri));
  const hex = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
  return `https://timetableapi.ptv.vic.gov.au${uri}&signature=${hex}`;
}

async function fetchPTV(
  path: string,
  parameters: URLSearchParams,
  env: TransitEnv,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = await signPTVRequest(`${path}?${parameters}`, env);
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      // The signed URL is a credential: never send it to a redirect target.
      redirect: "manual",
    });
    if (!response.ok)
      throw new TransitServiceError(
        "upstream",
        "The transport provider is temporarily unavailable.",
      );
    if (Number(response.headers.get("content-length")) > 2_000_000)
      throw badData();
    const body = await response.text();
    if (body.length > 2_000_000) throw badData();
    try {
      return JSON.parse(body);
    } catch {
      throw badData();
    }
  } catch (error) {
    if (error instanceof TransitServiceError) throw error;
    // Do not expose URLs, signatures, credentials, or upstream error bodies.
    throw new TransitServiceError(
      "upstream",
      "Could not retrieve transport information. Please try again.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function parsePTVSearch(
  raw: unknown,
  selectedMode: TransitMode,
  checkedAt: string,
): TransitSearch {
  const payload = object(raw);
  providerHealth(payload);
  const expectedRouteType = routeType(selectedMode);
  const ids = new Set<number>();
  const stops: TransitStop[] = [];
  for (const value of array(payload.stops, 5000)) {
    const stop = object(value);
    if (stop.route_type !== expectedRouteType) continue;
    const stopId = integer(stop.stop_id);
    if (ids.has(stopId)) continue;
    const latitude = stop.stop_latitude,
      longitude = stop.stop_longitude;
    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      latitude < -40 ||
      latitude > -33 ||
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      longitude < 140 ||
      longitude > 151
    )
      throw badData();
    ids.add(stopId);
    stops.push({
      id: stopId,
      idScheme: "ptv",
      name: text(stop.stop_name),
      suburb: text(stop.stop_suburb, true),
      mode: selectedMode,
      latitude,
      longitude,
    });
  }
  return { checkedAt: checkedTime(checkedAt), stops: stops.slice(0, 50) };
}

function plainText(raw: unknown) {
  return text(raw, true)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function safeOfficialUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const url = new URL(raw);
    const allowed = [
      "ptv.vic.gov.au",
      "transport.vic.gov.au",
      "metrotrains.com.au",
      "yarratrams.com.au",
      "vline.com.au",
    ];
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !allowed.some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    )
      return null;
    url.protocol = "https:";
    return url.href;
  } catch {
    return null;
  }
}
function parseDisruption(raw: unknown): {
  disruption: TransitDisruption;
  affectedRoutes: { routeId: number; directionId: number | null }[];
} {
  const data = object(raw);
  const affectedRoutes =
    data.routes == null
      ? []
      : array(data.routes).map((value) => {
          const route = object(value);
          const direction =
            route.direction == null ? null : object(route.direction);
          return {
            routeId: integer(route.route_id),
            directionId:
              direction?.direction_id == null
                ? null
                : integer(direction.direction_id),
          };
        });
  return {
    affectedRoutes,
    disruption: {
      id: integer(data.disruption_id),
      title: text(data.title),
      description: plainText(data.description),
      url: safeOfficialUrl(data.url),
      status: text(data.disruption_status, true),
      updatedAt: time(data.last_updated, true),
      startsAt: time(data.from_date, true),
      endsAt: time(data.to_date, true),
      routeIds: affectedRoutes.map((route) => route.routeId),
      stopIds:
        data.stops == null
          ? []
          : array(data.stops).map((value) => integer(object(value).stop_id)),
    },
  };
}

export function parsePTVDepartures(
  raw: unknown,
  selection: DeparturesQuery,
  checkedAt: string,
): TransitBoard {
  const payload = object(raw);
  providerHealth(payload);
  const expectedRouteType = routeType(selection.mode);
  const idScheme = selection.idScheme ?? "ptv";
  if (idScheme !== "ptv" && idScheme !== "gtfs") throw badQuery();
  queryId(selection.stopId, true);
  queryId(selection.routeId);
  queryId(selection.directionId);
  const routes = object(payload.routes),
    runs = object(payload.runs);
  const directionValues = Object.values(object(payload.directions)).map(object);
  const directions: TransitDirection[] = [];
  const directionKeys = new Set<string>();
  for (const value of directionValues) {
    const routeId = integer(value.route_id);
    const directionId = integer(value.direction_id);
    if (value.route_type !== expectedRouteType) continue;
    const route = object(routes[String(routeId)]);
    const key = `${routeId}:${directionId}`;
    if (directionKeys.has(key)) continue;
    directionKeys.add(key);
    directions.push({
      id: directionId,
      name: text(value.direction_name),
      routeId,
      routeName: text(route.route_name),
    });
  }
  const departures: TransitDeparture[] = [];
  const departureIds = new Set<string>();
  const returnedStopIds = new Set<number>();
  const expandedStops = object(payload.stops);
  for (const value of array(payload.departures, 1000)) {
    const rawDeparture = object(value);
    const sourceStopId = integer(rawDeparture.stop_id);
    if (idScheme === "ptv" && sourceStopId !== selection.stopId)
      throw badData();
    const expandedStop = object(expandedStops[String(sourceStopId)]);
    if (
      integer(expandedStop.stop_id) !== sourceStopId ||
      expandedStop.route_type !== expectedRouteType
    )
      throw badData();
    returnedStopIds.add(sourceStopId);
    if (returnedStopIds.size > 1) throw badData();
    const routeId = integer(rawDeparture.route_id),
      directionId = integer(rawDeparture.direction_id);
    if (
      (selection.routeId !== undefined && routeId !== selection.routeId) ||
      (selection.directionId !== undefined &&
        directionId !== selection.directionId)
    )
      continue;
    const route = object(routes[String(routeId)]);
    if (route.route_type !== expectedRouteType) throw badData();
    const runRef = text(rawDeparture.run_ref);
    const run = object(
      runs[runRef] ??
        Object.values(runs).find((value) => object(value).run_ref === runRef),
    );
    const matchingDirection = directions.find(
      (item) => item.id === directionId && item.routeId === routeId,
    );
    const destination =
      text(run.destination_name, true) || matchingDirection?.name;
    if (!destination) throw badData();
    const scheduledAt = time(rawDeparture.scheduled_departure_utc)!;
    const isCancelled = /^(cancelled|canceled)$/i.test(text(run.status, true));
    const estimatedAt = isCancelled
      ? null
      : time(rawDeparture.estimated_departure_utc, true);
    const departureId = `${selection.stopId}:${runRef}:${scheduledAt}`;
    if (departureIds.has(departureId)) throw badData();
    departureIds.add(departureId);
    departures.push({
      id: departureId,
      runRef,
      routeId,
      directionId,
      destination,
      routeName: text(route.route_name),
      routeNumber: text(route.route_number, true),
      scheduledAt,
      estimatedAt,
      platform: text(rawDeparture.platform_number, true) || null,
      status: isCancelled
        ? "cancelled"
        : estimatedAt
          ? "estimated"
          : "scheduled",
      atPlatform: rawDeparture.at_platform === true,
      disruptionIds:
        rawDeparture.disruption_ids == null
          ? []
          : array(rawDeparture.disruption_ids).map(integer),
      notes:
        plainText(rawDeparture.departure_note) ||
        plainText(run.run_note) ||
        null,
    });
  }
  const now = Date.parse(checkedAt);
  if (!Number.isFinite(now)) throw badData();
  departures.sort(
    (a, b) =>
      Date.parse(a.estimatedAt ?? a.scheduledAt) -
      Date.parse(b.estimatedAt ?? b.scheduledAt),
  );
  const loneExpandedStop =
    !returnedStopIds.size && Object.values(expandedStops).length === 1
      ? object(Object.values(expandedStops)[0])
      : null;
  if (loneExpandedStop && loneExpandedStop.route_type !== expectedRouteType)
    throw badData();
  const upstreamStopId = returnedStopIds.size
    ? [...returnedStopIds][0]
    : loneExpandedStop
      ? integer(loneExpandedStop.stop_id)
      : null;
  if (
    idScheme === "ptv" &&
    upstreamStopId !== null &&
    upstreamStopId !== selection.stopId
  )
    throw badData();
  const relevantIds = new Set(departures.flatMap((item) => item.disruptionIds));
  const relevantRoutes = new Set(departures.map((item) => item.routeId));
  if (selection.routeId !== undefined) relevantRoutes.add(selection.routeId);
  const disruptions = Object.values(object(payload.disruptions))
    .map(parseDisruption)
    .filter(
      ({ disruption }) =>
        disruption.endsAt === null || Date.parse(disruption.endsAt) >= now,
    )
    .filter(
      ({ disruption, affectedRoutes }) =>
        // Direct departure/stop associations remain authoritative even when
        // an alert also lists a route restricted to another direction.
        relevantIds.has(disruption.id) ||
        (upstreamStopId !== null &&
          disruption.stopIds.includes(upstreamStopId)) ||
        affectedRoutes.some(
          (route) =>
            relevantRoutes.has(route.routeId) &&
            (selection.directionId === undefined ||
              route.directionId === null ||
              route.directionId === selection.directionId),
        ),
    )
    .map(({ disruption }) => disruption);
  return {
    stopId: selection.stopId,
    idScheme,
    upstreamStopId,
    mode: selection.mode,
    checkedAt: checkedTime(checkedAt),
    directions,
    departures: departures
      .filter(
        (item) =>
          Date.parse(item.estimatedAt ?? item.scheduledAt) >= now - 30_000,
      )
      .slice(0, 100),
    disruptions: disruptions.slice(0, 100),
  };
}

export async function searchStops(
  query: string,
  selectedMode: TransitMode,
  env: TransitEnv,
  signal?: AbortSignal,
): Promise<TransitSearch> {
  const q = query.trim();
  if (
    q.length < 3 ||
    q.length > 80 ||
    /^\d+$/.test(q) ||
    /[\u0000-\u001f]/.test(q)
  )
    throw badQuery();
  const parameters = new URLSearchParams({
    route_types: String(routeType(selectedMode)),
    include_outlets: "false",
    match_stop_by_suburb: "true",
  });
  const payload = await fetchPTV(
    `/v3/search/${encodeURIComponent(q)}`,
    parameters,
    env,
    signal,
  );
  return parsePTVSearch(payload, selectedMode, new Date().toISOString());
}

export async function getDepartures(
  selection: DeparturesQuery,
  env: TransitEnv,
  signal?: AbortSignal,
): Promise<TransitBoard> {
  queryId(selection.stopId, true);
  queryId(selection.routeId);
  queryId(selection.directionId);
  const type = routeType(selection.mode);
  const parameters = new URLSearchParams({
    max_results: "50",
    expand: "0",
    include_cancelled: "true",
  });
  if (
    selection.idScheme !== undefined &&
    selection.idScheme !== "ptv" &&
    selection.idScheme !== "gtfs"
  )
    throw badQuery();
  if (selection.idScheme === "gtfs") parameters.set("gtfs", "true");
  if (selection.directionId !== undefined)
    parameters.set("direction_id", String(selection.directionId));
  let path = `/v3/departures/route_type/${type}/stop/${selection.stopId}`;
  // GTFS stop lookup combined with PTV's route-ID path returns empty boards
  // for real train/tram stops. Keep the supported general GTFS lookup and
  // filter its expanded routes in parsePTVDepartures before the result limit.
  if (selection.routeId !== undefined && selection.idScheme !== "gtfs")
    path += `/route/${selection.routeId}`;
  const payload = await fetchPTV(path, parameters, env, signal);
  return parsePTVDepartures(payload, selection, new Date().toISOString());
}
