import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EpaServiceError, fetchEpaObservations, normalizeEpaResponse } from "./epa";

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

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it("accepts the production decimal-string count while preserving synthetic observations", () => {
    const result = normalizeEpaResponse({ totalRecords: "1", records: [site()] }, now);
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0].pm25?.value).toBe(0);
    expect(normalizeEpaResponse({ totalRecords: "0", records: [] }, now).stations).toEqual([]);
  });

  it.each(["", " ", " 1", "1 ", "01", "+1", "1.0", "1e0", "-1", "NaN", null, undefined, 1.5, -1, 501, "501", "2", 2])(
    "rejects ambiguous, out-of-range or mismatched record count %s",
    (totalRecords) => {
      expect(() => normalizeEpaResponse({ totalRecords, records: [site()] }, now))
        .toThrow("Invalid EPA provider response");
    },
  );

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

  it.each(["108.33", 108.33])("accepts verified production quality metadata %s without an invented maximum", (confidence) => {
    const raw = site();
    raw.parameters[0].timeSeriesReadings[0].readings = [
      reading({ averageValue: 10.45, confidence, totalSample: "13" }),
    ];
    expect(normalizeEpaResponse(payload([raw]), now).stations[0].pm25).toMatchObject({
      value: 10.45, unit: "µg/m³", averagingPeriod: "1h",
    });
  });

  it.each([74.99, "74.99", " 108.33", "108.33 ", "+108.33", "0108.33", "1e2", "", "bad", "NaN", "Infinity", NaN, Infinity, null, undefined])(
    "rejects low, malformed or non-finite confidence %s", (confidence) => {
      const raw = site();
      raw.parameters[0].timeSeriesReadings[0].readings = [reading({ confidence })];
      expect(normalizeEpaResponse(payload([raw]), now).stations[0].pm25).toBeNull();
    },
  );

  it.each([0, "0", -1, "-1", 1.5, "1.5", "13.0", " 13", "013", "+13", "1e1", "", "bad", "NaN", "Infinity", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, undefined])(
    "rejects missing, non-positive, malformed or unsafe sample count %s", (totalSample) => {
      const raw = site();
      raw.parameters[0].timeSeriesReadings[0].readings = [reading({ confidence: "108.33", totalSample })];
      expect(normalizeEpaResponse(payload([raw]), now).stations[0].pm25).toBeNull();
    },
  );

  it("continues to reject string pollutant values despite accepting string quality metadata", () => {
    const raw = site();
    raw.parameters[0].timeSeriesReadings[0].readings = [
      reading({ averageValue: "10.45", confidence: "108.33", totalSample: "13" }),
    ];
    expect(normalizeEpaResponse(payload([raw]), now).stations[0].pm25).toBeNull();
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

  it("works with Worker redirect modes while keeping the key out of the URL", async () => {
    vi.setSystemTime(now);
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      // Reproduce the documented Workers failure that a Node-only fetch mock misses.
      if (init?.redirect === "error") throw new TypeError('redirect mode "error" is not supported');
      return Promise.resolve(new Response(JSON.stringify(payload()), { status: 200 }));
    });
    expect(() => fetcher("https://gateway.api.epa.vic.gov.au", { redirect: "error" })).toThrow(TypeError);
    fetcher.mockClear();
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
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("X-API-Key")).toBe(
      "synthetic-test-key",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it.each([302, 307])("rejects HTTP %s without following redirects or forwarding the key", async (status) => {
    const secret = "synthetic-redirect-test-key";
    const target = "https://attacker.example/collect";
    const redirectedRequest = vi.fn();
    const response = new Response("untrusted redirect response", {
      status, headers: { Location: target },
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // Model fetch's follow mode forwarding headers to the redirect destination.
      if (init?.redirect !== "manual" || new URL(String(input)).hostname !== "gateway.api.epa.vic.gov.au")
        redirectedRequest(target, init?.headers);
      return response;
    });
    await expect(fetchEpaObservations({ EPA_API_KEY: secret }, undefined, fetcher))
      .rejects.toMatchObject({ stage: "http", code: "upstream_http_error", status });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(redirectedRequest).not.toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain(target);
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

describe("safe EPA failure diagnostics", () => {
  const secret = "synthetic-credential-must-not-be-logged";

  it.each([
    ["Illegal invocation", "illegal_invocation"],
    ['redirect mode "error" is not supported', "unsupported_redirect"],
    ["url.startsWith is not a function", "url_input_type"],
    ["Invalid header value", "invalid_header"],
    ["Invalid URL", "invalid_request"],
    ["Outbound network blocked", "blocked_egress"],
    ["fetch failed", "network_error"],
    ["unknown failure", "type_error"],
  ])("classifies %s without retaining raw errors", async (message, expected) => {
    const raw = new TypeError(`${message}: ${secret} https://private.example/body`);
    const fetcher = vi.fn().mockRejectedValue(raw);
    const failure = await fetchEpaObservations({ EPA_API_KEY: secret }, undefined, fetcher)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EpaServiceError);
    expect(failure).toMatchObject({ code: "request_failed", stage: "network", runtimeClass: expected });
    expect(failure).not.toHaveProperty("cause");
    expect(String(failure)).not.toContain(secret);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      marker: "epa_service_error", code: "request_failed", stage: "network", runtimeClass: expected,
    }));
  });

  it.each([
    [403, secret, "http", "upstream_http_error", "none"],
    [200, `{\"secret\":\"${secret}\"`, "json", "invalid_json", "syntax_error"],
    [200, JSON.stringify({ unexpected: secret }), "schema", "invalid_response", "none"],
  ])("separates HTTP/JSON/schema failures without logging response content (%s)", async (status, body, stage, code, runtimeClass) => {
    const response = new Response(body, { status });
    const failure = await fetchEpaObservations({ EPA_API_KEY: secret }, undefined, vi.fn().mockResolvedValue(response))
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EpaServiceError);
    expect(String(failure)).not.toContain(secret);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      marker: "epa_service_error", code, stage, runtimeClass,
      ...(status === 403 ? { status } : {}),
      ...(stage === "schema" ? { responseShape: {
        rootType: "object", recognizedKeys: [],
        records: { present: false, type: "undefined" },
        totalRecords: { present: false, type: "undefined" },
      } } : {}),
    }));
    if (status === 403) expect(response.bodyUsed).toBe(false);
  });

  it.each([
    [{ records: [], totalRecords: "12", message: secret, [secret]: secret }, {
      rootType: "object", recognizedKeys: ["records", "totalRecords", "message"],
      records: { present: true, type: "array", length: 0 },
      totalRecords: { present: true, type: "string", strictlyNumeric: true, numericValue: 12 },
    }],
    [{ records: [], totalRecords: secret }, {
      rootType: "object", recognizedKeys: ["records", "totalRecords"],
      records: { present: true, type: "array", length: 0 },
      totalRecords: { present: true, type: "string", strictlyNumeric: false },
    }],
    [{ records: [], totalRecords: "10001" }, {
      rootType: "object", recognizedKeys: ["records", "totalRecords"],
      records: { present: true, type: "array", length: 0 },
      totalRecords: { present: true, type: "string", strictlyNumeric: true },
    }],
    [[secret], { rootType: "array", length: 1 }],
    [{ Data: { Records: [], TotalRecords: 0, [secret]: secret }, [secret]: secret }, {
      rootType: "object", recognizedKeys: ["Data"],
      records: { present: false, type: "undefined" },
      totalRecords: { present: false, type: "undefined" },
      containers: { Data: {
        rootType: "object", recognizedKeys: ["Records", "TotalRecords"],
        records: { present: true, type: "array", length: 0 },
        totalRecords: { present: true, type: "number", numericValue: 0 },
      } },
    }],
  ])("logs only bounded allowlisted schema shape", async (body, expectedShape) => {
    const response = new Response(JSON.stringify(body), { status: 200 });
    await expect(fetchEpaObservations({ EPA_API_KEY: secret }, undefined, vi.fn().mockResolvedValue(response)))
      .rejects.toMatchObject({ stage: "schema", code: "invalid_response" });
    expect(console.error).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      marker: "epa_service_error", code: "invalid_response", stage: "schema", runtimeClass: "none",
      responseShape: expectedShape,
    }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  });

  it("sanitizes URL parse failures and diagnoses unavailable fetch before any request", async () => {
    await expect(fetchEpaObservations({ EPA_API_KEY: secret, EPA_API_BASE_URL: `https://[${secret}` }))
      .rejects.toMatchObject({ stage: "configuration", code: "invalid_service_configuration", runtimeClass: "invalid_request" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
    vi.mocked(console.error).mockClear();
    vi.stubGlobal("fetch", undefined);
    await expect(fetchEpaObservations({ EPA_API_KEY: secret }))
      .rejects.toMatchObject({ stage: "network", runtimeClass: "fetch_unavailable" });
    expect(console.error).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      marker: "epa_service_error", code: "request_failed", stage: "network", runtimeClass: "fetch_unavailable",
    }));
  });
});
