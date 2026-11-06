// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDepartures,
  parsePTVDepartures,
  parsePTVSearch,
  searchStops,
  signPTVRequest,
  transitReady,
  type DeparturesQuery,
} from "./transit";

const checkedAt = "2026-11-06T22:00:00.000Z";
const env = {
  PTV_DEV_ID: "999999",
  PTV_API_KEY: "00000000-0000-4000-8000-000000000000",
};
const selection: DeparturesQuery = {
  stopId: 1071,
  mode: "train",
  idScheme: "ptv",
};
function fixture() {
  return {
    status: { health: 1 },
    stops: {
      "1071": { stop_id: 1071, stop_name: "Flinders Street", route_type: 0 },
    },
    routes: {
      "12": {
        route_id: 12,
        route_type: 0,
        route_name: "Test line",
        route_number: "",
      },
    },
    directions: {
      "5": {
        direction_id: 5,
        route_id: 12,
        route_type: 0,
        direction_name: "Test destination",
      },
    },
    runs: {
      "run-A": {
        run_ref: "run-A",
        destination_name: "Test destination",
        status: "scheduled",
      },
      "run-B": {
        run_ref: "run-B",
        destination_name: "Test destination",
        status: "cancelled",
      },
      "run-C": {
        run_ref: "run-C",
        destination_name: "Test destination",
        status: "scheduled",
      },
    },
    departures: [
      {
        stop_id: 1071,
        route_id: 12,
        run_ref: "run-A",
        direction_id: 5,
        scheduled_departure_utc: "2026-11-06T22:03:00Z",
        estimated_departure_utc: "2026-11-06T22:08:00Z",
        at_platform: false,
        platform_number: "4",
        disruption_ids: [9],
        departure_note: "",
      },
      {
        stop_id: 1071,
        route_id: 12,
        run_ref: "run-B",
        direction_id: 5,
        scheduled_departure_utc: "2026-11-06T22:05:00Z",
        estimated_departure_utc: null,
        at_platform: false,
        platform_number: null,
        disruption_ids: [],
        departure_note: "",
      },
      {
        stop_id: 1071,
        route_id: 12,
        run_ref: "run-C",
        direction_id: 5,
        scheduled_departure_utc: "2026-11-06T22:12:00Z",
        estimated_departure_utc: null,
        at_platform: false,
        platform_number: null,
        disruption_ids: [],
        departure_note: "",
      },
    ],
    disruptions: {
      "9": {
        disruption_id: 9,
        title: "Test disruption",
        description: "<p>Allow extra time &amp; check updates.</p>",
        url: "http://www.ptv.vic.gov.au/disruption/9",
        disruption_status: "Current",
        last_updated: "2026-11-06T21:45:00Z",
        from_date: "2026-11-06T21:00:00Z",
        to_date: null,
        routes: [{ route_id: 12 }],
        stops: [],
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PTV protocol and credential isolation", () => {
  it("signs the exact encoded URI with a fixed HMAC-SHA1 vector", async () => {
    expect(
      await signPTVRequest("/v3/search/Flinders%20Street?route_types=0", env),
    ).toBe(
      "https://timetableapi.ptv.vic.gov.au/v3/search/Flinders%20Street?route_types=0&devid=999999&signature=282240721EB7F04EE98A2263272FBF6941E7271E",
    );
    expect(transitReady({})).toBe(false);
    await expect(
      signPTVRequest("/v3/search/Flinders", {}),
    ).rejects.toMatchObject({ code: "not_configured" });
  });

  it("requests cancellation data and uses GTFS ID mode only when explicitly selected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(checkedAt);
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(fixture())));
    vi.stubGlobal("fetch", fetch);
    const board = await getDepartures(
      { ...selection, stopId: 19854, idScheme: "gtfs" },
      env,
    );
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/v3/departures/route_type/0/stop/19854");
    expect(url.searchParams.get("gtfs")).toBe("true");
    expect(url.searchParams.get("include_cancelled")).toBe("true");
    expect(url.searchParams.get("expand")).toBe("0");
    expect(url.href).not.toContain(env.PTV_API_KEY);
    expect(board).toMatchObject({
      stopId: 19854,
      idScheme: "gtfs",
      upstreamStopId: 1071,
    });
    expect(JSON.stringify(board)).not.toContain("signature");
  });

  it("never leaks an upstream error body or signed request URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(`secret: ${env.PTV_API_KEY}`, { status: 403 }),
        ),
    );
    const error = await getDepartures(selection, env).catch((value) => value);
    expect(error.code).toBe("upstream");
    expect(error.message).not.toContain(env.PTV_API_KEY);
    expect(error.message).not.toContain("signature");
  });

  it("bounds untrusted search and stop identifiers before network requests", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(searchStops("12", "train", env)).rejects.toMatchObject({
      code: "invalid_query",
    });
    await expect(
      getDepartures({ ...selection, stopId: -1 }, env),
    ).rejects.toMatchObject({ code: "invalid_query" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts a stalled provider request at the bounded timeout", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener(
            "abort",
            () => reject(new DOMException("Timed out", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = getDepartures(selection, env);
    const rejected = expect(result).rejects.toMatchObject({ code: "upstream" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(12_001);
    await rejected;
    expect(fetch.mock.calls[0][1].signal!.aborted).toBe(true);
  });
});

describe("PTV payload normalization", () => {
  it("separates estimates, cancellations and timetable-only rows and sorts by relevant time", () => {
    const board = parsePTVDepartures(fixture(), selection, checkedAt);
    expect(board.departures.map((item) => item.status)).toEqual([
      "cancelled",
      "estimated",
      "scheduled",
    ]);
    expect(board.departures[1]).toMatchObject({
      estimatedAt: "2026-11-06T22:08:00.000Z",
      scheduledAt: "2026-11-06T22:03:00.000Z",
      platform: "4",
    });
    expect(board.departures[2].estimatedAt).toBeNull();
    expect(board.disruptions[0]).toMatchObject({
      description: "Allow extra time & check updates.",
      url: "https://www.ptv.vic.gov.au/disruption/9",
    });
  });

  it("rejects offline health and wrong PTV stop data without showing an empty healthy board", () => {
    const payload = fixture();
    payload.status.health = 0;
    expect(() => parsePTVDepartures(payload, selection, checkedAt)).toThrow(
      /unavailable/,
    );
    expect(() =>
      parsePTVDepartures(fixture(), { ...selection, stopId: 99 }, checkedAt),
    ).toThrow(/incomplete/);
  });

  it("rejects mixed returned stops in GTFS mode rather than conflating identifiers", () => {
    const payload = fixture();
    payload.departures[0].stop_id = 99;
    Object.assign(payload.stops, { "99": { stop_id: 99, route_type: 0 } });
    expect(() =>
      parsePTVDepartures(
        payload,
        { ...selection, stopId: 19854, idScheme: "gtfs" },
        checkedAt,
      ),
    ).toThrow(/incomplete/);
  });

  it("filters to the saved direction and treats absent predictions as scheduled, never on time", () => {
    const payload = fixture();
    payload.departures[0].direction_id = 7;
    const board = parsePTVDepartures(
      payload,
      { ...selection, directionId: 5 },
      checkedAt,
    );
    expect(board.departures.every((item) => item.directionId === 5)).toBe(true);
    expect(board.departures.map((item) => item.status)).toEqual([
      "cancelled",
      "scheduled",
    ]);
  });

  it("expires past rows and closed alerts and rejects duplicate departure identities", () => {
    const payload = fixture();
    payload.departures[0].estimated_departure_utc = "2026-11-06T21:55:00Z";
    payload.disruptions["9"].to_date = "2026-11-06T21:59:00Z" as never;
    const board = parsePTVDepartures(payload, selection, checkedAt);
    expect(board.departures).toHaveLength(2);
    expect(board.disruptions).toHaveLength(0);
    payload.departures.push(payload.departures[1]);
    expect(() => parsePTVDepartures(payload, selection, checkedAt)).toThrow(
      /incomplete/,
    );
  });

  it("does not turn provider HTML or a javascript link into executable content", () => {
    const payload = fixture();
    payload.disruptions["9"].url = "javascript:alert(1)";
    const board = parsePTVDepartures(payload, selection, checkedAt);
    expect(board.disruptions[0].url).toBeNull();
    expect(board.disruptions[0].description).not.toContain("<p>");
  });

  it("keeps stop identifiers in the PTV namespace and removes other modes", () => {
    const payload = {
      status: { health: 1 },
      stops: [
        {
          stop_id: 1071,
          stop_name: "Flinders Street",
          stop_suburb: "Melbourne",
          route_type: 0,
          stop_latitude: -37.818,
          stop_longitude: 144.967,
        },
        {
          stop_id: 1071,
          stop_name: "A tram stop",
          stop_suburb: "Melbourne",
          route_type: 1,
          stop_latitude: -37.818,
          stop_longitude: 144.967,
        },
      ],
    };
    expect(parsePTVSearch(payload, "train", checkedAt).stops).toEqual([
      {
        id: 1071,
        idScheme: "ptv",
        name: "Flinders Street",
        suburb: "Melbourne",
        mode: "train",
        latitude: -37.818,
        longitude: 144.967,
      },
    ]);
  });
});
