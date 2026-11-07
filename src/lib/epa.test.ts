import { afterEach, describe, expect, it, vi } from "vitest";
import {
  distanceKm,
  epaConfigured,
  epaStationUrl,
  fetchEpa,
  latestEpaObservation,
  nearestEpaStation,
  nearbyEpaStations,
  parseEpaObservations,
  type EpaObservations,
  type EpaStation,
} from "./epa";
import { transitApiConfigured } from "./transit";

const now = Date.parse("2026-11-06T18:30:00Z");
const iso = (minutesAgo: number) =>
  new Date(now - minutesAgo * 60_000).toISOString();
const cbd = { latitude: -37.8136, longitude: 144.9631 };

function station(overrides: Partial<EpaStation> = {}): EpaStation {
  return {
    id: "near-station",
    name: "Test monitoring site",
    ...cbd,
    category: { value: "Good", observedAt: iso(30) },
    pm25: {
      value: 0,
      unit: "µg/m³",
      observedAt: iso(30),
      averagingPeriod: "1h",
    },
    pm10: {
      value: 8.2,
      unit: "µg/m³",
      observedAt: iso(30),
      averagingPeriod: "1h",
    },
    ...overrides,
  };
}

function response(stations = [station()]): EpaObservations {
  return { source: "EPA Victoria", fetchedAt: iso(0), stations };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("EPA observation client and nearest reporting site", () => {
  it("preserves a measured zero, official category and each field's own time", () => {
    const parsed = parseEpaObservations(response(), now);
    expect(parsed.stations[0].pm25?.value).toBe(0);
    expect(parsed.stations[0].category?.value).toBe("Good");
    expect(latestEpaObservation(parsed)).toBe(iso(30));
    expect(nearestEpaStation(parsed, cbd, now)?.distanceKm).toBe(0);
  });

  it("expires individual fields without discarding another fresh field", () => {
    const near = station({
      category: { value: "Good", observedAt: iso(181) },
      pm10: {
        value: 8.2,
        unit: "µg/m³",
        averagingPeriod: "1h",
        observedAt: iso(181),
      },
    });
    const selected = nearestEpaStation(response([near]), cbd, now)!;
    expect(selected.pm25?.value).toBe(0);
    expect(selected.pm10).toBeNull();
    expect(selected.category).toBeNull();
    // Advance the clock, without downloading the feed again.
    expect(
      nearestEpaStation(response([near]), cbd, now + 151 * 60_000),
    ).toBeNull();
  });

  it("chooses the nearest site with usable observations, never the closest offline site", () => {
    const offline = station({ category: null, pm25: null, pm10: null });
    const reporting = station({ id: "reporting", longitude: 144.98 });
    const selected = nearestEpaStation(
      response([offline, reporting]),
      cbd,
      now,
    )!;
    expect(selected.id).toBe("reporting");
    expect(selected.distanceKm).toBeGreaterThan(1);
    expect(selected.distanceKm).toBeLessThan(2);
    expect(nearestEpaStation(response([reporting]), cbd, now, 0.5)).toBeNull();
  });

  it("lists reporting sites in distance order, excluding withdrawn, expired and distant sites", () => {
    const far = station({ id: "far", longitude: 145.4 });
    const near = station({ id: "near", longitude: 144.98 });
    const withdrawn = station({ id: "withdrawn", category: null, pm25: null, pm10: null });
    const expired = station({
      id: "expired",
      category: { value: "Good", observedAt: iso(181) },
      pm25: null,
      pm10: null,
    });
    const outside = station({ id: "outside", latitude: -36.5 });
    const snapshot = response([far, withdrawn, outside, near, expired]);
    expect(nearbyEpaStations(snapshot, cbd, now).map(({ id }) => id)).toEqual(["near", "far"]);
    expect(nearbyEpaStations(snapshot, cbd, now, 2).map(({ id }) => id)).toEqual(["near"]);
    expect(nearestEpaStation(snapshot, cbd, now)?.id).toBe("near");
  });

  it("keeps individual zero readings without reviving stale categories or mutating the snapshot", () => {
    const partial = station({
      category: { value: "Good", observedAt: iso(181) },
      pm10: { value: 8.2, unit: "µg/m³", averagingPeriod: "1h", observedAt: iso(181) },
    });
    const snapshot = response([partial]);
    const original = JSON.stringify(snapshot);
    const selected = nearbyEpaStations(snapshot, cbd, now)[0];
    expect(selected.category).toBeNull();
    expect(selected.pm10).toBeNull();
    expect(selected.pm25?.value).toBe(0);
    expect(selected.pm25?.observedAt).toBe(iso(30));
    expect(selected).not.toBe(partial);
    expect(JSON.stringify(snapshot)).toBe(original);
    expect(nearbyEpaStations(snapshot, cbd, now + 151 * 60_000)).toEqual([]);
    expect(JSON.stringify(snapshot)).toBe(original);
  });

  it("breaks equal-distance ties by station ID without reordering the source snapshot", () => {
    const snapshot = response([station({ id: "z-site" }), station({ id: "a-site" })]);
    expect(nearbyEpaStations(snapshot, cbd, now).map(({ id }) => id)).toEqual(["a-site", "z-site"]);
    expect(nearestEpaStation(snapshot, cbd, now)?.id).toBe("a-site");
    expect(snapshot.stations.map(({ id }) => id)).toEqual(["z-site", "a-site"]);
  });

  it("keeps the empty-result and invalid-input contract for station lists", () => {
    expect(nearbyEpaStations(undefined, cbd, now)).toEqual([]);
    expect(nearbyEpaStations(response([]), cbd, now)).toEqual([]);
    expect(() => nearbyEpaStations(undefined, { latitude: NaN, longitude: 0 }, now)).toThrow(/Invalid EPA/);
    expect(() => nearbyEpaStations(undefined, cbd, NaN)).toThrow(/Invalid EPA/);
    expect(() => nearbyEpaStations(undefined, cbd, now, 0)).toThrow(/Invalid EPA/);
    expect(() => nearbyEpaStations(undefined, cbd, now, Infinity)).toThrow(/Invalid EPA/);
  });

  it("does not promote missing, wrong-unit, daily-average or future data into valid readings", () => {
    const raw = response() as unknown as {
      source: string;
      fetchedAt: string;
      stations: Record<string, unknown>[];
    };
    raw.stations[0].pm25 = {
      value: 4,
      unit: "ppb",
      observedAt: iso(0),
      averagingPeriod: "1h",
    };
    raw.stations[0].pm10 = {
      value: 3,
      unit: "µg/m³",
      observedAt: iso(0),
      averagingPeriod: "24h",
    };
    raw.stations[0].category = { value: "Good", observedAt: iso(-3) };
    const parsed = parseEpaObservations(raw, now);
    expect(nearestEpaStation(parsed, cbd, now)).toBeNull();
    expect(latestEpaObservation(parsed)).toBe("1970-01-01T00:00:00.000Z");
  });

  it("rejects modeled sources and duplicate site IDs; ignores reversed coordinates", () => {
    expect(() =>
      parseEpaObservations({ ...response(), source: "CAMS" }, now),
    ).toThrow();
    expect(() =>
      parseEpaObservations(response([station(), station()]), now),
    ).toThrow(/Duplicate/);
    const reversed = station({ latitude: 144.9631, longitude: -37.8136 });
    expect(parseEpaObservations(response([reversed]), now).stations).toEqual(
      [],
    );
    expect(() => distanceKm(cbd, { latitude: NaN, longitude: 0 })).toThrow();
  });

  it("links to the specific official station without trusting an arbitrary returned URL", () => {
    const url = new URL(epaStationUrl("station-id"));
    expect(url.origin).toBe("https://www.epa.vic.gov.au");
    expect(url.searchParams.get("site")).toBe("air|station-id");
  });

  it.each([
    { epa: "https://pages.example.test/dashboard/data/epa-observations.json", shared: "" },
    { epa: "https://pages.example.test/dashboard/data/epa-observations.json", shared: "https://shared.example.test" },
    { epa: "", shared: "https://shared.example.test" },
  ])("requests a public EPA snapshot or shared proxy while keeping transport independent ($epa, $shared)", async ({ epa, shared }) => {
    vi.setSystemTime(now);
    vi.stubEnv("VITE_EPA_DATA_URL", epa);
    vi.stubEnv("VITE_DATA_API_URL", shared);
    expect(epaConfigured()).toBe(true);
    expect(transitApiConfigured()).toBe(Boolean(shared));
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(response()), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchEpa(cbd);
    expect(result.stations[0].name).toBe("Test monitoring site");
    const url = new URL(String(fetcher.mock.calls[0][0]));
    if (epa) {
      expect(url.href).toBe(epa);
      expect(url.search).toBe("");
      expect(fetcher.mock.calls[0][1].cache).toBe("no-cache");
      expect(fetcher.mock.calls[0][1].credentials).toBe("omit");
    } else {
      expect(url.origin).toBe(shared);
      expect(url.pathname).toBe("/api/air/observations");
      expect(url.searchParams.get("latitude")).toBe(String(cbd.latitude));
      expect(url.searchParams.get("longitude")).toBe(String(cbd.longitude));
    }
    expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
  });

  it("refuses a credential-bearing EPA snapshot URL before making a browser request", async () => {
    vi.stubEnv("VITE_EPA_DATA_URL", "https://pages.example.test/data.json?key=synthetic-secret");
    vi.stubEnv("VITE_DATA_API_URL", "https://shared.example.test");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(epaConfigured()).toBe(false);
    await expect(fetchEpa(cbd)).rejects.toThrow(/not connected/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("selects the nearest station locally from one public snapshot", async () => {
    vi.setSystemTime(now);
    vi.stubEnv("VITE_EPA_DATA_URL", "https://pages.example.test/data/epa-observations.json");
    vi.stubEnv("VITE_DATA_API_URL", "");
    const eastern = station({ id: "eastern", latitude: -37.817, longitude: 145.125 });
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response([station(), eastern])), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);
    const snapshot = await fetchEpa(cbd);
    expect(nearestEpaStation(snapshot, cbd, now)?.id).toBe("near-station");
    expect(nearestEpaStation(snapshot, eastern, now)?.id).toBe("eastern");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetcher.mock.calls[0][0])).search).toBe("");
    expect(transitApiConfigured()).toBe(false);
  });

  it("fails clearly for an unavailable proxy rather than treating a failure as an empty Good report", async () => {
    vi.stubEnv("VITE_EPA_DATA_URL", "");
    vi.stubEnv("VITE_DATA_API_URL", "https://data.example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })),
    );
    await expect(fetchEpa(cbd)).rejects.toThrow(/HTTP 503/);
  });
});
