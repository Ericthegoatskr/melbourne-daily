import { afterEach, describe, expect, it, vi } from "vitest";
import {
  distanceKm,
  epaStationUrl,
  fetchEpa,
  latestEpaObservation,
  nearestEpaStation,
  parseEpaObservations,
  type EpaObservations,
  type EpaStation,
} from "./epa";

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

  it("requests only the public proxy with coordinates and no API key", async () => {
    vi.setSystemTime(now);
    vi.stubEnv("VITE_DATA_API_URL", "https://data.example.test");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(response()), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchEpa(cbd);
    expect(result.stations[0].name).toBe("Test monitoring site");
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.origin).toBe("https://data.example.test");
    expect(url.pathname).toBe("/api/air/observations");
    expect(url.searchParams.get("latitude")).toBe(String(cbd.latitude));
    expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
  });

  it("fails clearly for an unavailable proxy rather than treating a failure as an empty Good report", async () => {
    vi.stubEnv("VITE_DATA_API_URL", "https://data.example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })),
    );
    await expect(fetchEpa(cbd)).rejects.toThrow(/HTTP 503/);
  });
});
