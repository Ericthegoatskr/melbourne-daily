// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayState, handleRequest, type Environment } from "./index";
import { getDepartures, searchStops, type DeparturesQuery } from "./transit";
import { fetchEpaObservations } from "./epa";
import type { TransitBoard } from "../shared/transit";

vi.mock("./transit", async (original) => ({
  ...(await original<typeof import("./transit")>()),
  getDepartures: vi.fn(),
  searchStops: vi.fn(),
}));
vi.mock("./epa", async (original) => ({
  ...(await original<typeof import("./epa")>()),
  fetchEpaObservations: vi.fn(),
}));

const origin = "https://ericthegoatskr.github.io";
const now = Date.parse("2026-11-06T22:00:00Z");
const env: Environment = {
  PTV_DEV_ID: "999999",
  PTV_API_KEY: "00000000-0000-4000-8000-000000000000",
  EPA_API_KEY: "epa-test-key-never-returned",
  ALLOWED_ORIGINS: origin,
};
const endpoint = "/api/transit/departures?stopId=1071&mode=train&idScheme=ptv";
const board = (
  query: DeparturesQuery = { stopId: 1071, mode: "train" },
): TransitBoard => ({
  stopId: query.stopId,
  idScheme: query.idScheme || "ptv",
  upstreamStopId: 1071,
  mode: query.mode,
  checkedAt: new Date(Date.now()).toISOString(),
  directions: [],
  departures: [],
  disruptions: [],
});
function request(
  path = endpoint,
  options: RequestInit = {},
  ip = "203.0.113.1",
) {
  return new Request(`https://data.example.test${path}`, {
    ...options,
    headers: { Origin: origin, "CF-Connecting-IP": ip, ...options.headers },
  });
}
async function json(path = endpoint, options: RequestInit = {}, runtime = env) {
  const response = await handleRequest(request(path, options), runtime);
  return { response, body: await response.json() };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  clearGatewayState();
  vi.mocked(getDepartures).mockImplementation(async (query) => board(query));
  vi.mocked(searchStops).mockResolvedValue({
    checkedAt: new Date(now).toISOString(),
    stops: [],
  });
  vi.mocked(fetchEpaObservations).mockResolvedValue({
    source: "EPA Victoria",
    fetchedAt: new Date(now).toISOString(),
    stations: [],
  });
});
afterEach(() => {
  clearGatewayState();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("public API boundary", () => {
  it("allows only configured browser origins and does not reflect other origins", async () => {
    const allowed = await handleRequest(request(), env);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(origin);
    expect(allowed.headers.get("vary")).toBe("Origin");
    expect(allowed.headers.get("cache-control")).toBe("no-store");
    const blocked = await handleRequest(
      request(endpoint, { headers: { Origin: "https://attacker.example" } }),
      env,
    );
    expect(blocked.status).toBe(403);
    expect(blocked.headers.has("access-control-allow-origin")).toBe(false);
    expect(getDepartures).toHaveBeenCalledTimes(1);
  });

  it("answers an allowed preflight without calling any provider and rejects writes", async () => {
    const preflight = await handleRequest(
      request(endpoint, {
        method: "OPTIONS",
        headers: { "Access-Control-Request-Method": "GET" },
      }),
      env,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe(
      "GET, OPTIONS",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "Accept",
    );
    const denied = await handleRequest(
      request(endpoint, { method: "POST" }),
      env,
    );
    expect(denied.status).toBe(405);
    expect(denied.headers.get("allow")).toBe("GET, OPTIONS");
    expect(getDepartures).not.toHaveBeenCalled();
  });

  it("distinguishes invalid input from missing provider credentials", async () => {
    for (const path of [
      "/api/transit/departures?mode=train",
      `${endpoint}&directionId=-1`,
      "/api/transit/departures?stopId=1&mode=ferry",
      `${endpoint}&routeId=9999999999`,
      "/api/transit/stops?q=12&mode=train",
      "/api/air/observations?latitude=-37.8",
    ]) {
      const result = await json(path, {}, {});
      expect(result.response.status, path).toBe(400);
      expect(result.body.error.code).toBe("invalid_query");
    }
    const unconfigured = await json(endpoint, {}, {});
    expect(unconfigured.response.status).toBe(503);
    expect(unconfigured.body.error.code).toBe("not_configured");
    const air = await json("/api/air/observations", {}, {});
    expect(air.response.status).toBe(503);
    expect(getDepartures).not.toHaveBeenCalled();
    expect(fetchEpaObservations).not.toHaveBeenCalled();
  });

  it("returns only configuration booleans from health, and never includes secrets in failures", async () => {
    const health = await json("/api/health");
    expect(health.body.providers).toEqual({
      transit: { configured: true },
      epa: { configured: true },
    });
    expect(JSON.stringify(health.body)).not.toContain(env.PTV_API_KEY);
    expect(JSON.stringify(health.body)).not.toContain(env.EPA_API_KEY);
    vi.mocked(getDepartures).mockRejectedValueOnce(
      new Error(`https://secret?signature=abc&key=${env.PTV_API_KEY}`),
    );
    const failed = await json();
    expect(failed.response.status).toBe(503);
    expect(failed.body.error.code).toBe("provider_unavailable");
    expect(JSON.stringify(failed.body)).not.toContain("signature");
    expect(JSON.stringify(failed.body)).not.toContain(env.PTV_API_KEY);
  });
});

describe("cache and upstream request budget", () => {
  it("preserves the original lookup time through a cache hit and fetches anew after expiry", async () => {
    const first = await json();
    vi.setSystemTime(now + 24_000);
    const second = await json();
    expect(second.body.checkedAt).toBe(first.body.checkedAt);
    expect(getDepartures).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now + 26_000);
    const third = await json();
    expect(third.body.checkedAt).toBe(new Date(now + 26_000).toISOString());
    expect(getDepartures).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent identical requests but separates directions and ID namespaces", async () => {
    let resolve!: (value: TransitBoard) => void;
    vi.mocked(getDepartures).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const a = json();
    const b = json();
    expect(getDepartures).toHaveBeenCalledTimes(1);
    resolve(board());
    const results = await Promise.all([a, b]);
    expect(results[0].body).toEqual(results[1].body);
    await json(`${endpoint}&directionId=1`);
    await json(`${endpoint}&directionId=2`);
    await json(endpoint.replace("idScheme=ptv", "idScheme=gtfs"));
    expect(getDepartures).toHaveBeenCalledTimes(4);
  });

  it("does not cache a provider failure or return expired data as a successful fallback", async () => {
    await json();
    vi.setSystemTime(now + 26_000);
    vi.mocked(getDepartures).mockRejectedValueOnce(
      new Error("Upstream failed"),
    );
    expect((await json()).response.status).toBe(503);
    expect((await json()).response.status).toBe(200);
    expect(getDepartures).toHaveBeenCalledTimes(3);
  });

  it("shares EPA observations across suburbs without changing fetchedAt", async () => {
    const first = await json(
      "/api/air/observations?latitude=-37.8&longitude=144.9",
    );
    vi.setSystemTime(now + 60_000);
    const second = await json(
      "/api/air/observations?latitude=-37.9&longitude=145.1",
    );
    expect(second.body.fetchedAt).toBe(first.body.fetchedAt);
    expect(fetchEpaObservations).toHaveBeenCalledTimes(1);
  });

  it("does not return cached authenticated results after credentials are removed", async () => {
    await json();
    const unconfigured = await json(endpoint, {}, {});
    expect(unconfigured.response.status).toBe(503);
    expect(unconfigured.body.error.code).toBe("not_configured");
  });

  it("bounds repeated requests per client and resets the rolling window", async () => {
    for (let i = 0; i < 60; i++)
      expect((await json()).response.status).toBe(200);
    const limited = await json();
    expect(limited.response.status).toBe(429);
    expect(limited.response.headers.get("retry-after")).toBe("60");
    expect(getDepartures).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now + 60_001);
    expect((await json()).response.status).toBe(200);
  });

  it("also caps unique upstream lookups across clients in one isolate", async () => {
    for (let i = 1; i <= 60; i++) {
      const response = await handleRequest(
        request(
          `/api/transit/departures?stopId=${i}&mode=train`,
          {},
          `203.0.113.${i}`,
        ),
        env,
      );
      expect(response.status).toBe(200);
    }
    const limited = await handleRequest(
      request(
        "/api/transit/departures?stopId=61&mode=train",
        {},
        "203.0.113.61",
      ),
      env,
    );
    expect(limited.status).toBe(429);
    expect(getDepartures).toHaveBeenCalledTimes(60);
    // Existing cached results remain usable within the aggregate provider budget.
    expect(
      (
        await handleRequest(
          request(
            "/api/transit/departures?stopId=1&mode=train",
            {},
            "203.0.113.99",
          ),
          env,
        )
      ).status,
    ).toBe(200);
  });
});
