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

function busFixture() {
  const payload = fixture();
  payload.stops["1071"] = {
    stop_id: 1071,
    stop_name: "Example Rd / Example St",
    route_type: 2,
  };
  payload.routes["12"] = {
    route_id: 12,
    route_type: 2,
    route_name: "Example interchange - Example shops",
    route_number: "900",
  };
  payload.directions["5"].route_type = 2;
  // PTV documents run.status and platform data as train-specific. Bus live
  // estimates are identified by estimated_departure_utc, not run.status.
  for (const run of Object.values(payload.runs)) run.status = "scheduled";
  for (const departure of payload.departures) departure.platform_number = null;
  return payload;
}

const busSelection: DeparturesQuery = {
  stopId: 22001,
  idScheme: "gtfs",
  mode: "bus",
};

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

  it("filters PTV routes after GTFS lookup without mixing route identifier namespaces", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(checkedAt);
    const payload = fixture();
    Object.assign(payload.routes, {
      "13": { route_id: 13, route_type: 0, route_name: "Other line", route_number: "" },
    });
    payload.departures[0].route_id = 13;
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetch);

    const board = await getDepartures(
      { stopId: 11212, mode: "train", idScheme: "gtfs", routeId: 12, directionId: 5 },
      env,
    );
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/v3/departures/route_type/0/stop/11212");
    expect(url.searchParams.get("gtfs")).toBe("true");
    expect(url.searchParams.get("direction_id")).toBe("5");
    expect(board).toMatchObject({ stopId: 11212, idScheme: "gtfs", upstreamStopId: 1071 });
    expect(board.departures).toHaveLength(2);
    expect(board.departures.every((item) => item.routeId === 12 && item.directionId === 5)).toBe(true);
    expect(board.disruptions.map((item) => item.id)).toEqual([9]);
  });

  it("keeps route-specific requests for native PTV stop identifiers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(checkedAt);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture())));
    vi.stubGlobal("fetch", fetch);
    const board = await getDepartures({ ...selection, routeId: 12, directionId: 5 }, env);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/v3/departures/route_type/0/stop/1071/route/12");
    expect(url.searchParams.has("gtfs")).toBe(false);
    expect(board.departures).toHaveLength(3);
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

  it.each([301, 302, 303, 307, 308])(
    "does not forward signed requests through a %s redirect",
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response("Redirect response with private provider details", {
          status,
          headers: { Location: "https://example.com/collect?signature=private" },
        }),
      );
      vi.stubGlobal("fetch", fetch);

      const error = await getDepartures(selection, env).catch((value) => value);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
      expect(error).toMatchObject({ code: "upstream" });
      expect(error.message).not.toMatch(/signature|private|example\.com/);
      expect(error.message).not.toContain(env.PTV_API_KEY);
    },
  );

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

  it("associates empty GTFS boards with the returned PTV stop, never the requested GTFS ID", () => {
    const payload = fixture();
    payload.departures = [];
    payload.disruptions["9"].routes = [];
    Object.assign(payload.disruptions["9"], { stops: [{ stop_id: 1071 }] });
    const gtfsSelection = {
      ...selection,
      stopId: 19854,
      idScheme: "gtfs" as const,
    };

    const board = parsePTVDepartures(payload, gtfsSelection, checkedAt);
    expect(board.upstreamStopId).toBe(1071);
    expect(board.departures).toEqual([]);
    expect(board.disruptions.map((item) => item.id)).toEqual([9]);

    Object.assign(payload.disruptions["9"], { stops: [{ stop_id: 19854 }] });
    expect(
      parsePTVDepartures(payload, gtfsSelection, checkedAt).disruptions,
    ).toEqual([]);
  });

  it("rejects an empty board whose expanded stop belongs to another mode", () => {
    const payload = fixture();
    payload.departures = [];
    payload.stops["1071"].route_type = 1;
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

  it.each([
    ["opposite direction", { direction_id: 7, route_direction_id: 5 }, 0],
    ["matching direction", { direction_id: 5, route_direction_id: 99 }, 1],
    ["missing direction", undefined, 1],
    ["null direction", null, 1],
    ["missing direction identifier", { route_direction_id: 7 }, 1],
    ["null direction identifier", { direction_id: null }, 1],
  ] as const)("respects %s for route-only alerts", (_label, direction, expected) => {
    const payload = fixture();
    payload.departures[0].disruption_ids = [];
    Object.assign(payload.disruptions["9"].routes[0], { direction });

    const board = parsePTVDepartures(
      payload,
      { ...selection, routeId: 12, directionId: 5 },
      checkedAt,
    );

    expect(board.disruptions).toHaveLength(expected);
    if (expected) {
      expect(board.disruptions[0].routeIds).toEqual([12]);
      expect(board.disruptions[0]).not.toHaveProperty("affectedRoutes");
    }
  });

  it.each(["departure", "stop"])(
    "preserves an explicit %s alert despite an opposite-direction route association",
    (association) => {
      const payload = fixture();
      Object.assign(payload.disruptions["9"].routes[0], {
        direction: { direction_id: 7 },
      });
      if (association === "stop") {
        payload.departures[0].disruption_ids = [];
        Object.assign(payload.disruptions["9"], { stops: [{ stop_id: 1071 }] });
      }

      const board = parsePTVDepartures(
        payload,
        { ...selection, routeId: 12, directionId: 5 },
        checkedAt,
      );

      expect(board.disruptions.map((item) => item.id)).toEqual([9]);
    },
  );

  it("matches alert route and direction together and keeps all directions when none is selected", () => {
    const payload = fixture();
    payload.departures[0].disruption_ids = [];
    Object.assign(payload.disruptions["9"], {
      routes: [
        { route_id: 12, direction: { direction_id: 7 } },
        { route_id: 13, direction: { direction_id: 5 } },
      ],
    });

    expect(
      parsePTVDepartures(payload, selection, checkedAt).disruptions,
    ).toHaveLength(1);
    expect(
      parsePTVDepartures(
        payload,
        { ...selection, routeId: 12, directionId: 5 },
        checkedAt,
      ).disruptions,
    ).toEqual([]);

    Object.assign(payload.disruptions["9"].routes[1], { route_id: 12 });
    expect(
      parsePTVDepartures(
        payload,
        { ...selection, routeId: 12, directionId: 5 },
        checkedAt,
      ).disruptions,
    ).toHaveLength(1);
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

describe("bus departures and service updates", () => {
  it("uses bus route type with GTFS identity and filters the expanded route and direction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(checkedAt);
    const payload = busFixture();
    Object.assign(payload.routes, {
      "13": { route_id: 13, route_type: 2, route_name: "Other bus route", route_number: "901" },
    });
    Object.assign(payload.directions, {
      "other-bus": { route_id: 13, direction_id: 5, route_type: 2, direction_name: "Other shops" },
      "other-mode": { route_id: 14, direction_id: 8, route_type: 1, direction_name: "Tram destination" },
    });
    payload.departures[0].route_id = 13;
    payload.departures[1].direction_id = 7;
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetch);

    const board = await getDepartures({ ...busSelection, routeId: 12, directionId: 5 }, env);

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/v3/departures/route_type/2/stop/22001");
    expect(url.searchParams.get("gtfs")).toBe("true");
    expect(url.searchParams.get("direction_id")).toBe("5");
    expect(url.searchParams.get("expand")).toBe("0");
    expect(board).toMatchObject({ ...busSelection, upstreamStopId: 1071 });
    expect(board.departures).toHaveLength(1);
    expect(board.departures[0]).toMatchObject({
      id: "22001:run-C:2026-11-06T22:12:00.000Z",
      routeId: 12, directionId: 5, routeNumber: "900", status: "scheduled", estimatedAt: null,
    });
    expect(board.directions.map(({ routeId }) => routeId)).toEqual([12, 13]);
    expect(JSON.stringify(board)).not.toMatch(/signature|devid|00000000-0000/);
  });

  it("keeps real bus estimates distinct from timetable-only departures", () => {
    const board = parsePTVDepartures(busFixture(), busSelection, checkedAt);

    expect(board.departures.map(({ status }) => status)).toEqual(["scheduled", "estimated", "scheduled"]);
    expect(board.departures[1]).toMatchObject({
      scheduledAt: "2026-11-06T22:03:00.000Z",
      estimatedAt: "2026-11-06T22:08:00.000Z",
      platform: null,
    });
    expect(board.departures[0].estimatedAt).toBeNull();
    expect(board.departures[2].estimatedAt).toBeNull();
  });

  it.each([0, 1])("rejects a returned stop or route of another mode (%s), including empty boards", (wrongMode) => {
    const payload = busFixture();
    payload.stops["1071"].route_type = wrongMode;
    expect(() => parsePTVDepartures(payload, busSelection, checkedAt)).toThrow(/incomplete/);
    payload.departures = [];
    expect(() => parsePTVDepartures(payload, busSelection, checkedAt)).toThrow(/incomplete/);

    const wrongRoute = busFixture();
    wrongRoute.routes["12"].route_type = wrongMode;
    expect(() => parsePTVDepartures(wrongRoute, busSelection, checkedAt)).toThrow(/incomplete/);
  });

  it("matches bus service updates by selected route/direction and the returned PTV stop", () => {
    const payload = busFixture();
    payload.departures[0].disruption_ids = [];
    Object.assign(payload.disruptions["9"].routes[0], { direction: { direction_id: 7 } });
    Object.assign(payload.disruptions, {
      "10": { ...payload.disruptions["9"], disruption_id: 10, routes: [{ route_id: 12, direction: { direction_id: 5 } }] },
      "11": { ...payload.disruptions["9"], disruption_id: 11, routes: [], stops: [{ stop_id: 1071 }] },
      "12": { ...payload.disruptions["9"], disruption_id: 12, routes: [], stops: [{ stop_id: busSelection.stopId }] },
    });

    const board = parsePTVDepartures(payload, { ...busSelection, routeId: 12, directionId: 5 }, checkedAt);
    expect(board.disruptions.map(({ id }) => id)).toEqual([10, 11]);

    payload.departures = [];
    const emptyBoard = parsePTVDepartures(payload, busSelection, checkedAt);
    expect(emptyBoard.upstreamStopId).toBe(1071);
    expect(emptyBoard.disruptions.map(({ id }) => id)).toEqual([11]);
  });

  it("searches only bus routes and preserves the native PTV namespace", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(checkedAt);
    const stop = {
      stop_id: 1071, stop_name: "Example Rd / Example St", stop_suburb: "Example suburb",
      stop_latitude: -37.91, stop_longitude: 145.13,
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: { health: 1 },
      stops: [{ ...stop, route_type: 0 }, { ...stop, route_type: 1 }, { ...stop, route_type: 2 }],
    })));
    vi.stubGlobal("fetch", fetch);

    const result = await searchStops("Example", "bus", env);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("route_types")).toBe("2");
    expect(result.stops).toEqual([{
      id: 1071, idScheme: "ptv", mode: "bus", name: stop.stop_name,
      suburb: stop.stop_suburb, latitude: stop.stop_latitude, longitude: stop.stop_longitude,
    }]);
  });
});
