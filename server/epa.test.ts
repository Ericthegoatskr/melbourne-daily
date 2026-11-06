import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEpaObservations, normalizeEpaResponse } from "./epa";

// Synthetic test values follow the official EPA Swagger model. They are not live observations.
const now = Date.parse("2026-11-06T18:30:00Z");
const end = "2026-11-06T18:00:00Z";
const start = "2026-11-06T17:00:00Z";

function reading(overrides: Record<string, unknown> = {}) {
  return {
    since: start,
    until: end,
    averageValue: 0,
    unit: "ug/m3",
    confidence: 100,
    totalSample: 12,
    healthAdvice: "GOOD",
    ...overrides,
  };
}
function site() {
  return {
    siteID: "77062cb7-3e3b-4984-b6d0-03dda76177f2",
    siteName: "Alphington",
    siteType: "Ambient",
    geometry: { type: "Point", coordinates: [-37.78, 145.023] },
    siteHealthAdvices: [
      {
        since: start,
        until: end,
        healthParameter: "PM2.5",
        averageValue: 0,
        unit: "&micro;g/m&sup3;",
        healthAdvice: "Good",
      },
    ],
    parameters: [
      {
        name: "PM2.5",
        timeSeriesReadings: [
          { timeSeriesName: "1HR_AV", readings: [reading()] },
        ],
      },
      {
        name: "PM10",
        timeSeriesReadings: [
          {
            timeSeriesName: "1HR_AV",
            readings: [
              reading({ averageValue: 12.5, unit: "&micro;g/m&sup3;" }),
            ],
          },
        ],
      },
    ],
  };
}
const payload = (records = [site()]) => ({
  totalRecords: records.length,
  records,
});

afterEach(() => vi.useRealTimers());

describe("official EPA all-site response adapter", () => {
  it("normalizes documented coordinates, encoded units, observed zero and official category", () => {
    const result = normalizeEpaResponse(payload(), now).stations[0];
    expect(result.latitude).toBe(-37.78);
    expect(result.longitude).toBe(145.023);
    expect(result.pm25?.value).toBe(0);
    expect(result.pm10).toEqual({
      value: 12.5,
      unit: "µg/m³",
      observedAt: "2026-11-06T18:00:00.000Z",
      averagingPeriod: "1h",
    });
    expect(result.category?.value).toBe("Good");
  });

  it("reads only hourly periods and chooses by timestamp, not array order", () => {
    const raw = site();
    raw.parameters[0].timeSeriesReadings = [
      { timeSeriesName: "24HR_AV", readings: [reading({ averageValue: 999 })] },
      {
        timeSeriesName: "1HR_AV",
        readings: [
          reading({
            since: "2026-11-06T16:00:00Z",
            until: start,
            averageValue: 7,
          }),
          reading({ averageValue: 2 }),
        ],
      },
    ];
    expect(
      normalizeEpaResponse(payload([raw]), now).stations[0].pm25?.value,
    ).toBe(2);
  });

  it("rejects missing values and poor confidence per pollutant without losing valid fields", () => {
    const raw = site();
    raw.parameters[0].timeSeriesReadings[0].readings = [
      reading({ averageValue: null, confidence: 10 }),
    ];
    const result = normalizeEpaResponse(payload([raw]), now).stations[0];
    expect(result.pm25).toBeNull();
    expect(result.pm10?.value).toBe(12.5);
    expect(result.category?.value).toBe("Good");
  });

  it("does not reinterpret legacy ratings, invalid intervals or stale categories as Good", () => {
    const raw = site();
    raw.siteHealthAdvices[0].healthAdvice = "Hazardous";
    raw.parameters[0].timeSeriesReadings[0].readings = [
      reading({ since: end, until: start }),
    ];
    const result = normalizeEpaResponse(payload([raw]), now).stations[0];
    expect(result.category).toBeNull();
    expect(result.pm25).toBeNull();
    expect(
      normalizeEpaResponse(payload(), now + 4 * 3_600_000).stations[0],
    ).toMatchObject({ category: null, pm25: null, pm10: null });
  });

  it("rejects duplicate metadata, unexpected roots and reversed coordinates", () => {
    expect(() => normalizeEpaResponse(payload([site(), site()]), now)).toThrow(
      /Duplicate/,
    );
    expect(() => normalizeEpaResponse({ sites: [] }, now)).toThrow();
    const raw = site();
    raw.geometry.coordinates.reverse();
    expect(() => normalizeEpaResponse(payload([raw]), now)).toThrow(/metadata/);
  });

  it("rejects conflicting current readings instead of picking an arbitrary result", () => {
    const raw = site();
    raw.parameters[0].timeSeriesReadings[0].readings.push(
      reading({ averageValue: 50 }),
    );
    expect(
      normalizeEpaResponse(payload([raw]), now).stations[0].pm25,
    ).toBeNull();
  });

  it("requires the project's key before making any network request", async () => {
    const fetcher = vi.fn();
    await expect(fetchEpaObservations({}, undefined, fetcher)).rejects.toThrow(
      "EPA_API_NOT_CONFIGURED",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("makes one cacheable all-site request, keeping the key out of the URL and blocking redirects", async () => {
    vi.setSystemTime(now);
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(payload()), { status: 200 }),
      );
    const result = await fetchEpaObservations(
      { EPA_API_KEY: "synthetic-test-key" },
      undefined,
      fetcher,
    );
    expect(result.stations[0].pm25?.value).toBe(0);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.href).toBe(
      "https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1/sites/parameters?environmentalSegment=air",
    );
    expect(fetcher.mock.calls[0][1].headers["X-API-Key"]).toBe(
      "synthetic-test-key",
    );
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  });

  it("does not send a key to an untrusted configured host or leak upstream error content", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("secret upstream content", { status: 403 }),
      );
    await expect(
      fetchEpaObservations(
        {
          EPA_API_KEY: "synthetic-test-key",
          EPA_API_BASE_URL: "https://attacker.example",
        },
        undefined,
        fetcher,
      ),
    ).rejects.toThrow(/configuration/);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      fetchEpaObservations(
        { EPA_API_KEY: "synthetic-test-key" },
        undefined,
        fetcher,
      ),
    ).rejects.toThrow("EPA upstream request failed (HTTP 403)");
  });
});
