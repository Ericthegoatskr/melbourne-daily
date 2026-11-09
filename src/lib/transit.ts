import {
  TRANSIT_MAX_AGE_MS,
  type TransitBoard,
  type TransitDeparture,
  type TransitDirection,
  type TransitDisruption,
  type TransitMode,
  type TransitSearch,
  type TransitSelection,
  type TransitStop,
} from "../../shared/transit";
import { apiConfigured, apiUrl } from "./api";

export * from "../../shared/transit";

export class TransitApiError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_configured"
      | "unavailable"
      | "invalid_response"
      | "invalid_query" = "unavailable",
  ) {
    super(message);
    this.name = "TransitApiError";
  }
}

const invalid = () =>
  new TransitApiError(
    "Transport data is incomplete or invalid.",
    "invalid_response",
  );
function record(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    throw invalid();
  return raw as Record<string, unknown>;
}
function text(raw: unknown, allowEmpty = false): string {
  if (
    typeof raw !== "string" ||
    raw.length > 12_000 ||
    (!allowEmpty && !raw.trim())
  )
    throw invalid();
  return raw.trim();
}
function id(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0)
    throw invalid();
  return raw;
}
function mode(raw: unknown): TransitMode {
  if (raw !== "train" && raw !== "tram" && raw !== "bus") throw invalid();
  return raw;
}
function idScheme(raw: unknown): "ptv" | "gtfs" {
  if (raw !== "ptv" && raw !== "gtfs") throw invalid();
  return raw;
}
function time(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(raw) ||
    !Number.isFinite(Date.parse(raw))
  )
    throw invalid();
  return new Date(raw).toISOString();
}
const optionalTime = (raw: unknown) => (raw === null ? null : time(raw));
const optionalText = (raw: unknown) => (raw === null ? null : text(raw, true));
function list<T>(raw: unknown, parser: (item: unknown) => T, max = 100): T[] {
  if (!Array.isArray(raw) || raw.length > max) throw invalid();
  return raw.map(parser);
}
function checkedTime(raw: unknown, now: number, maxAge: number): string {
  const value = time(raw);
  const age = now - Date.parse(value);
  if (age < -30_000 || age > maxAge) {
    throw new TransitApiError(
      "Transport information has expired. Please refresh.",
      "unavailable",
    );
  }
  return value;
}

export function parseTransitStop(raw: unknown): TransitStop {
  const item = record(raw);
  const latitude = item.latitude,
    longitude = item.longitude;
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
    throw invalid();
  return {
    id: id(item.id),
    idScheme: idScheme(item.idScheme),
    name: text(item.name),
    suburb: text(item.suburb, true),
    mode: mode(item.mode),
    latitude,
    longitude,
  };
}

function direction(raw: unknown): TransitDirection {
  const item = record(raw);
  return {
    id: id(item.id),
    name: text(item.name),
    routeId: id(item.routeId),
    routeName: text(item.routeName),
  };
}
function departure(raw: unknown): TransitDeparture {
  const item = record(raw);
  const status = item.status;
  if (
    status !== "cancelled" &&
    status !== "estimated" &&
    status !== "scheduled"
  )
    throw invalid();
  const estimatedAt = optionalTime(item.estimatedAt);
  if (
    (status === "estimated" && estimatedAt === null) ||
    (status === "scheduled" && estimatedAt !== null)
  )
    throw invalid();
  if (typeof item.atPlatform !== "boolean") throw invalid();
  return {
    id: text(item.id),
    runRef: text(item.runRef),
    routeId: id(item.routeId),
    routeName: text(item.routeName),
    routeNumber: text(item.routeNumber, true),
    directionId: id(item.directionId),
    destination: text(item.destination),
    scheduledAt: time(item.scheduledAt),
    estimatedAt,
    platform: optionalText(item.platform),
    status,
    atPlatform: item.atPlatform,
    disruptionIds: list(item.disruptionIds, id),
    notes: optionalText(item.notes),
  };
}
function disruption(raw: unknown): TransitDisruption {
  const item = record(raw);
  let url: string | null = null;
  if (item.url !== null) {
    const parsed = new URL(text(item.url));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      throw invalid();
    url = parsed.href;
  }
  return {
    id: id(item.id),
    title: text(item.title),
    description: text(item.description, true),
    url,
    status: text(item.status, true),
    updatedAt: optionalTime(item.updatedAt),
    startsAt: optionalTime(item.startsAt),
    endsAt: optionalTime(item.endsAt),
    routeIds: list(item.routeIds, id, 1000),
    stopIds: list(item.stopIds, id, 1000),
  };
}

export function parseTransitSearch(
  raw: unknown,
  now = Date.now(),
): TransitSearch {
  const data = record(raw);
  return {
    checkedAt: checkedTime(data.checkedAt, now, 24 * 60 * 60_000),
    stops: list(data.stops, parseTransitStop, 50),
  };
}

export function parseTransitBoard(
  raw: unknown,
  now = Date.now(),
): TransitBoard {
  const data = record(raw);
  const result: TransitBoard = {
    checkedAt: checkedTime(data.checkedAt, now, TRANSIT_MAX_AGE_MS),
    stopId: id(data.stopId),
    idScheme: idScheme(data.idScheme),
    upstreamStopId:
      data.upstreamStopId === null ? null : id(data.upstreamStopId),
    mode: mode(data.mode),
    directions: list(data.directions, direction),
    departures: list(data.departures, departure),
    disruptions: list(data.disruptions, disruption),
  };
  const ids = result.departures.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw invalid();
  return result;
}

function transitApiBase(): string | undefined {
  return import.meta.env.VITE_TRANSIT_API_URL || import.meta.env.VITE_DATA_API_URL;
}

export function transitApiConfigured(base = transitApiBase()): boolean {
  return apiConfigured(base);
}

async function request(
  path: string,
  query: URLSearchParams,
  signal?: AbortSignal,
  base = transitApiBase(),
): Promise<unknown> {
  if (!transitApiConfigured(base)) {
    throw new TransitApiError(
      "Live transport is not connected yet. Use the official services below.",
      "not_configured",
    );
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `${apiUrl(`/api/transit/${path}`, base)}?${query}`,
      { signal: controller.signal, credentials: "omit", cache: "no-store" },
    );
    if (!response.ok) {
      if (response.status === 503)
        throw new TransitApiError(
          "Live transport is temporarily unavailable. Check the official service.",
          "unavailable",
        );
      throw new TransitApiError(
        "Could not retrieve transport information. Please try again.",
      );
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function searchTransitStops(
  query: string,
  selectedMode: TransitMode,
  signal?: AbortSignal,
  base?: string,
): Promise<TransitSearch> {
  const q = query.trim();
  if (q.length < 3 || q.length > 80 || /^\d+$/.test(q))
    throw new TransitApiError(
      "Enter at least three letters of a station or stop name.",
      "invalid_query",
    );
  const parameters = new URLSearchParams({ q, mode: mode(selectedMode) });
  const result = parseTransitSearch(
    await request("stops", parameters, signal, base),
  );
  if (result.stops.some((stop) => stop.mode !== selectedMode)) throw invalid();
  return result;
}

export async function fetchTransitBoard(
  selection: TransitSelection,
  signal?: AbortSignal,
  base?: string,
): Promise<TransitBoard> {
  const parameters = new URLSearchParams({
    stopId: String(id(selection.stop.id)),
    idScheme: idScheme(selection.stop.idScheme),
    mode: mode(selection.stop.mode),
  });
  if (selection.directionId !== undefined)
    parameters.set("directionId", String(id(selection.directionId)));
  if (selection.routeId !== undefined)
    parameters.set("routeId", String(id(selection.routeId)));
  const result = parseTransitBoard(
    await request("departures", parameters, signal, base),
  );
  if (
    result.stopId !== selection.stop.id ||
    result.idScheme !== selection.stop.idScheme ||
    result.mode !== selection.stop.mode
  )
    throw invalid();
  if (
    result.departures.some(
      (item) =>
        (selection.directionId !== undefined &&
          item.directionId !== selection.directionId) ||
        (selection.routeId !== undefined && item.routeId !== selection.routeId),
    )
  )
    throw invalid();
  return result;
}

/** Drop already-departed rows as the clock advances, including while a refresh fails. */
export function upcomingDepartures(
  board: TransitBoard | undefined,
  now: number,
  limit = 5,
): TransitDeparture[] {
  if (
    !board ||
    now - Date.parse(board.checkedAt) > TRANSIT_MAX_AGE_MS ||
    Date.parse(board.checkedAt) > now + 30_000
  )
    return [];
  return board.departures
    .filter(
      (item) =>
        Date.parse(item.estimatedAt ?? item.scheduledAt) >= now - 30_000,
    )
    .sort(
      (a, b) =>
        Date.parse(a.estimatedAt ?? a.scheduledAt) -
        Date.parse(b.estimatedAt ?? b.scheduledAt),
    )
    .slice(0, Math.max(1, Math.min(10, limit)));
}
