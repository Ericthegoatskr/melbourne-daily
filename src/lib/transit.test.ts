import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTransitBoard,
  parseTransitBoard,
  searchTransitStops,
  transitApiConfigured,
  upcomingDepartures,
  type TransitBoard,
  type TransitStop,
} from "./transit";

const now = Date.parse("2026-11-06T22:00:00Z");
const stop: TransitStop = {
  id: 1071,
  idScheme: "ptv",
  name: "Flinders Street",
  suburb: "Melbourne",
  mode: "train",
  latitude: -37.818,
  longitude: 144.967,
};
const fixture = (): TransitBoard => ({
  stopId: 1071,
  idScheme: "ptv",
  upstreamStopId: 1071,
  mode: "train",
  checkedAt: new Date(now).toISOString(),
  directions: [
    { id: 1, name: "Test destination", routeId: 12, routeName: "Test line" },
  ],
  departures: [
    {
      id: "trip-A",
      runRef: "run-A",
      routeId: 12,
      routeName: "Test line",
      routeNumber: "",
      directionId: 1,
      destination: "Test destination",
      scheduledAt: "2026-11-06T22:01:00.000Z",
      estimatedAt: null,
      platform: null,
      status: "scheduled",
      atPlatform: false,
      disruptionIds: [],
      notes: null,
    },
  ],
  disruptions: [],
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("live transport client", () => {
  it("requires a configured API and never attempts authenticated calls from a static host", async () => {
    vi.stubEnv("VITE_TRANSIT_API_URL", "");
    vi.stubEnv("VITE_DATA_API_URL", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(fetchTransitBoard({ stop })).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(transitApiConfigured("https://secret@example.com")).toBe(false);
    expect(transitApiConfigured("https://example.com?key=secret")).toBe(false);
  });

  it.each([
    [
      "https://transit.example.test",
      "https://shared.example.test",
      "https://transit.example.test",
    ],
    ["https://transit.example.test", "", "https://transit.example.test"],
    ["", "https://shared.example.test", "https://shared.example.test"],
  ])(
    "uses the dedicated transit origin %s before the shared origin %s",
    async (transit, shared, expected) => {
      vi.stubEnv("VITE_TRANSIT_API_URL", transit);
      vi.stubEnv("VITE_DATA_API_URL", shared);
      vi.stubEnv("VITE_EPA_DATA_URL", "https://pages.example.test/data/epa.json");
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const fetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(fixture())));
      vi.stubGlobal("fetch", fetch);

      expect(transitApiConfigured()).toBe(true);
      await fetchTransitBoard({ stop });
      const [url, options] = fetch.mock.calls[0];
      expect(new URL(url).origin).toBe(expected);
      expect(new URL(url).pathname).toBe("/api/transit/departures");
      expect(options).toEqual({
        signal: expect.any(AbortSignal),
        credentials: "omit",
        cache: "no-store",
      });
    },
  );

  it.each([
    "https://user:synthetic-secret@transit.example.test",
    "https://transit.example.test?token=synthetic-secret",
    "https://transit.example.test#synthetic-secret",
    "http://transit.example.test",
    "not-a-url",
  ])(
    "refuses an invalid dedicated origin without falling back: %s",
    async (transit) => {
      vi.stubEnv("VITE_TRANSIT_API_URL", transit);
      vi.stubEnv("VITE_DATA_API_URL", "https://shared.example.test");
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);

      expect(transitApiConfigured()).toBe(false);
      await expect(fetchTransitBoard({ stop })).rejects.toMatchObject({
        code: "not_configured",
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("expires old lookup results independently of future departure timestamps", () => {
    const data = fixture();
    data.departures[0].scheduledAt = "2026-11-07T01:00:00Z";
    expect(() => parseTransitBoard(data, now + 121_000)).toThrow(/expired/);
    expect(upcomingDepartures(data, now + 121_000)).toEqual([]);
  });

  it("drops a departed train while cached data remains fresh", () => {
    expect(upcomingDepartures(fixture(), now)).toHaveLength(1);
    expect(upcomingDepartures(fixture(), now + 100_000)).toHaveLength(0);
  });

  it("refuses an estimated badge without an actual prediction", () => {
    const data = fixture();
    data.departures[0].status = "estimated";
    expect(() => parseTransitBoard(data, now)).toThrow(/invalid/);
  });

  it("keeps a departure board usable when a disruption affects more than 100 stops or routes", () => {
    const data = fixture();
    data.disruptions = [{
      id: 9,
      title: "Network service changes",
      description: "Check the operator for affected services.",
      url: null,
      status: "Current",
      updatedAt: null,
      startsAt: null,
      endsAt: null,
      routeIds: Array.from({ length: 1000 }, (_, index) => index),
      stopIds: Array.from({ length: 1000 }, (_, index) => 1000 + index),
    }];
    const board = parseTransitBoard(data, now);
    expect(board.departures).toEqual(data.departures);
    expect(board.disruptions[0].routeIds).toEqual(data.disruptions[0].routeIds);
    expect(board.disruptions[0].stopIds).toEqual(data.disruptions[0].stopIds);
    for (const field of ["routeIds", "stopIds"] as const) {
      const oversized = structuredClone(data);
      oversized.disruptions[0][field].push(2000);
      expect(() => parseTransitBoard(oversized, now)).toThrow(/invalid/);
      const invalidId = structuredClone(data);
      invalidId.disruptions[0][field][999] = -1;
      expect(() => parseTransitBoard(invalidId, now)).toThrow(/invalid/);
    }
  });

  it("sends the stop namespace and verifies the returned selection", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const response = fixture();
    response.stopId = 19854;
    response.idScheme = "gtfs";
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetch);
    const data = await fetchTransitBoard(
      {
        stop: { ...stop, id: 19854, idScheme: "gtfs" },
        routeId: 12,
        directionId: 1,
      },
      undefined,
      "https://api.example.test",
    );
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get("idScheme")).toBe("gtfs");
    expect(url.searchParams.get("directionId")).toBe("1");
    expect(data.upstreamStopId).toBe(1071);
    fetch.mockResolvedValue(new Response(JSON.stringify(fixture())));
    await expect(
      fetchTransitBoard(
        { stop: { ...stop, id: 19854, idScheme: "gtfs" } },
        undefined,
        "https://api.example.test",
      ),
    ).rejects.toThrow(/invalid/);
  });

  it("keeps upstream response bodies out of public errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("secret auth details", { status: 503 }),
        ),
    );
    const error = await fetchTransitBoard(
      { stop },
      undefined,
      "https://api.example.test",
    ).catch((error) => error);
    expect(error.code).toBe("unavailable");
    expect(error.message).not.toContain("secret");
  });

  it("rejects ambiguous numeric searches and filters response mode", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            checkedAt: new Date(now).toISOString(),
            stops: [{ ...stop, mode: "tram" }],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      searchTransitStops(
        "1071",
        "train",
        undefined,
        "https://api.example.test",
      ),
    ).rejects.toMatchObject({ code: "invalid_query" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      searchTransitStops(
        "Flinders",
        "train",
        undefined,
        "https://api.example.test",
      ),
    ).rejects.toThrow(/invalid/);
  });
});
