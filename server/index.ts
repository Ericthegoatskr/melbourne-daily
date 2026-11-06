import {
  getDepartures,
  searchStops,
  transitReady,
  TransitServiceError,
  type TransitEnv,
  type DeparturesQuery,
} from "./transit";
import { fetchEpaObservations, type EpaEnvironment } from "./epa";

export type Environment = TransitEnv &
  EpaEnvironment & { ALLOWED_ORIGINS?: string };
type CacheEntry = { expires: number; value: unknown };
const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<unknown>>();
const requests = new Map<string, { resets: number; count: number }>();
let upstreamBudget = { resets: 0, count: 0 };
class BurstLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super("Request budget exhausted.");
  }
}

export function clearGatewayState() {
  cache.clear();
  pending.clear();
  requests.clear();
  upstreamBudget = { resets: 0, count: 0 };
}

async function cached(
  key: string,
  ttl: number,
  loader: () => Promise<unknown>,
) {
  const item = cache.get(key);
  if (item && item.expires > Date.now()) return item.value;
  const existing = pending.get(key);
  if (existing) return existing;
  const now = Date.now();
  if (upstreamBudget.resets <= now)
    upstreamBudget = { resets: now + 60_000, count: 0 };
  if (upstreamBudget.count >= 60)
    throw new BurstLimitError(
      Math.max(1, Math.ceil((upstreamBudget.resets - now) / 1000)),
    );
  upstreamBudget.count++;
  const operation = loader()
    .then((value) => {
      if (cache.size >= 128) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + ttl, value });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}

function integer(value: string | null, required = false): number | undefined {
  if (value === null && !required) return undefined;
  if (value === null || !/^\d{1,10}$/.test(value))
    throw new TransitServiceError(
      "invalid_query",
      "Invalid request parameter.",
    );
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > 2_147_483_647)
    throw new TransitServiceError(
      "invalid_query",
      "Invalid request parameter.",
    );
  return number;
}

function mode(value: string | null): "train" | "tram" {
  if (value !== "train" && value !== "tram")
    throw new TransitServiceError("invalid_query", "Choose train or tram.");
  return value;
}

export async function handleRequest(
  request: Request,
  env: Environment,
): Promise<Response> {
  const url = new URL(request.url);
  const allowed = new Set(
    (env.ALLOWED_ORIGINS || "https://ericthegoatskr.github.io")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
  if (origin && allowed.has(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  const json = (value: unknown, status = 200, extra = {}) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { ...headers, ...extra },
    });
  const error = (message: string, code: string, status: number) =>
    json({ error: { code, message } }, status);
  if (origin && !allowed.has(origin))
    return error("This origin is not allowed.", "origin_not_allowed", 403);
  if (request.method === "OPTIONS")
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Accept",
        "Access-Control-Max-Age": "600",
      },
    });
  if (request.method !== "GET")
    return json(
      {
        error: {
          code: "method_not_allowed",
          message: "Use GET for this resource.",
        },
      },
      405,
      { Allow: "GET, OPTIONS" },
    );
  if (url.pathname === "/" || url.pathname === "/api/health")
    return json({
      service: "Melbourne Daily Data API",
      version: "1.1.0",
      providers: {
        transit: { configured: transitReady(env) },
        epa: { configured: !!env.EPA_API_KEY?.trim() },
      },
      website: "https://ericthegoatskr.github.io/melbourne-daily/",
    });
  if (
    ![
      "/api/transit/stops",
      "/api/transit/departures",
      "/api/air/observations",
    ].includes(url.pathname)
  )
    return error("Resource not found.", "not_found", 404);

  // Per-isolate burst protection complements shared caching, not a global quota guarantee.
  const identity = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const usage = requests.get(identity);
  if (usage && usage.resets > now) {
    if (usage.count >= 60)
      return json(
        {
          error: {
            code: "rate_limited",
            message: "Please wait before refreshing again.",
          },
        },
        429,
        { "Retry-After": String(Math.ceil((usage.resets - now) / 1000)) },
      );
    usage.count++;
  } else {
    if (requests.size >= 1000)
      for (const [key, value] of requests)
        if (value.resets <= now) requests.delete(key);
    if (requests.size >= 1000) requests.delete(requests.keys().next().value!);
    requests.set(identity, { resets: now + 60_000, count: 1 });
  }
  try {
    if (url.pathname === "/api/transit/stops") {
      const q = (url.searchParams.get("q") || "").trim();
      const selectedMode = mode(url.searchParams.get("mode"));
      if (
        q.length < 3 ||
        q.length > 80 ||
        /^\d+$/.test(q) ||
        /[\u0000-\u001f]/.test(q)
      )
        return error(
          "Enter between 3 and 80 characters of a stop name.",
          "invalid_query",
          400,
        );
      if (!transitReady(env))
        return error(
          "This live data source is not connected yet. Please use the official service.",
          "not_configured",
          503,
        );
      return json(
        await cached(
          `search:${selectedMode}:${q.toLowerCase()}`,
          3_600_000,
          () => searchStops(q, selectedMode, env),
        ),
      );
    }
    if (url.pathname === "/api/transit/departures") {
      const idScheme = url.searchParams.get("idScheme") || "ptv";
      if (idScheme !== "ptv" && idScheme !== "gtfs")
        return error("Invalid stop identifier scheme.", "invalid_query", 400);
      const query: DeparturesQuery = {
        stopId: integer(url.searchParams.get("stopId"), true)!,
        mode: mode(url.searchParams.get("mode")),
        idScheme,
        directionId: integer(url.searchParams.get("directionId")),
        routeId: integer(url.searchParams.get("routeId")),
      };
      if (!transitReady(env))
        return error(
          "This live data source is not connected yet. Please use the official service.",
          "not_configured",
          503,
        );
      return json(
        await cached(`departures:${JSON.stringify(query)}`, 25_000, () =>
          getDepartures(query, env),
        ),
      );
    }
    const latitude = url.searchParams.get("latitude"),
      longitude = url.searchParams.get("longitude");
    if (latitude !== null || longitude !== null) {
      const lat = Number(latitude),
        lon = Number(longitude);
      if (
        latitude === null ||
        longitude === null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -40 ||
        lat > -33 ||
        lon < 140 ||
        lon > 151
      )
        return error("Choose a location in Victoria.", "invalid_query", 400);
    }
    if (!env.EPA_API_KEY?.trim())
      return error(
        "This live data source is not connected yet. Please use the official service.",
        "not_configured",
        503,
      );
    return json(
      await cached("epa:all-stations", 5 * 60_000, () =>
        fetchEpaObservations(env),
      ),
    );
  } catch (cause) {
    if (cause instanceof BurstLimitError)
      return json(
        {
          error: {
            code: "rate_limited",
            message: "Please wait before refreshing again.",
          },
        },
        429,
        { "Retry-After": String(cause.retryAfter) },
      );
    if (cause instanceof TransitServiceError && cause.code === "invalid_query")
      return error("Invalid transport query.", "invalid_query", 400);
    if (
      (cause instanceof TransitServiceError &&
        cause.code === "not_configured") ||
      (cause instanceof Error && cause.message === "EPA_API_NOT_CONFIGURED")
    )
      return error(
        "This live data source is not connected yet. Please use the official service.",
        "not_configured",
        503,
      );
    // No raw upstream errors, request URLs, signatures or keys cross this boundary.
    return error(
      "The official data service is temporarily unavailable. Please try again.",
      "provider_unavailable",
      503,
    );
  }
}

export default { fetch: handleRequest };
