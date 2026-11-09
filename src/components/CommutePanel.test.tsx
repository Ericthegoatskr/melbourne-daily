// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommutePanel from "./CommutePanel";
import { fetchStopDirectory, type StopDirectory } from "../lib/stopDirectory";
import {
  fetchTransitBoard,
  transitApiConfigured,
  type TransitBoard,
  type TransitSelection,
  type TransitStop,
} from "../lib/transit";

vi.mock("../lib/stopDirectory", async (original) => ({
  ...(await original<typeof import("../lib/stopDirectory")>()),
  fetchStopDirectory: vi.fn(),
}));
vi.mock("../lib/transit", async (original) => ({
  ...(await original<typeof import("../lib/transit")>()),
  fetchTransitBoard: vi.fn(),
  transitApiConfigured: vi.fn(),
}));

const NOW = Date.parse("2026-11-07T00:00:00Z");
const iso = (offset = 0) => new Date(NOW + offset).toISOString();
const STORE = "melbourne-daily:commutes";
const station: TransitStop = {
  id: 11212,
  idScheme: "gtfs",
  name: "Flinders Street Station · Platform 1",
  suburb: "",
  mode: "train",
  latitude: -37.8181,
  longitude: 144.9663,
};
const richmond: TransitStop = {
  id: 12101,
  idScheme: "gtfs",
  name: "Richmond Station · Platform 1",
  suburb: "",
  mode: "train",
  latitude: -37.824,
  longitude: 144.99,
};
const tram: TransitStop = {
  id: 19497,
  idScheme: "gtfs",
  name: "Bourke Street Mall/Swanston St #10",
  suburb: "",
  mode: "tram",
  latitude: -37.8133,
  longitude: 144.9656,
};
const directory: StopDirectory = {
  generatedAt: iso(),
  sourceUpdatedAt: iso(-86_400_000),
  sourceUrl: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule",
  stops: [station, richmond, tram, { ...tram, id: 19687, latitude: -37.8127 }],
};

function boardFor(
  selection: TransitSelection = { stop: station },
): TransitBoard {
  return {
    stopId: selection.stop.id,
    idScheme: selection.stop.idScheme,
    upstreamStopId: 1071,
    mode: selection.stop.mode,
    checkedAt: iso(),
    directions: [
      {
        id: 20,
        name: "Towards the city",
        routeId: 7,
        routeName: "Frankston line",
      },
      {
        id: 21,
        name: "Towards Frankston",
        routeId: 7,
        routeName: "Frankston line",
      },
    ],
    departures: [
      {
        id: "estimated-run",
        runRef: "run-1",
        routeId: 7,
        routeName: "Frankston line",
        routeNumber: "",
        directionId: 21,
        destination: "Frankston",
        scheduledAt: iso(2 * 60_000),
        estimatedAt: iso(5 * 60_000),
        platform: "1",
        status: "estimated",
        atPlatform: false,
        disruptionIds: [9],
        notes: null,
      },
      {
        id: "scheduled-run",
        runRef: "run-2",
        routeId: 7,
        routeName: "Frankston line",
        routeNumber: "",
        directionId: 20,
        destination: "City Loop",
        scheduledAt: iso(8 * 60_000),
        estimatedAt: null,
        platform: "2",
        status: "scheduled",
        atPlatform: false,
        disruptionIds: [],
        notes: null,
      },
      {
        id: "cancelled-run",
        runRef: "run-3",
        routeId: 7,
        routeName: "Frankston line",
        routeNumber: "",
        directionId: 21,
        destination: "Werribee",
        scheduledAt: iso(10 * 60_000),
        estimatedAt: null,
        platform: null,
        status: "cancelled",
        atPlatform: false,
        disruptionIds: [9],
        notes: "Check replacement services.",
      },
    ],
    disruptions: [
      {
        id: 9,
        title: "Weekend track works",
        description: "Replacement buses run between the affected stations.",
        url: "https://transport.vic.gov.au/disruptions/disruptions-information",
        status: "current",
        updatedAt: iso(-60_000),
        startsAt: iso(-3_600_000),
        endsAt: iso(86_400_000),
        routeIds: [7],
        stopIds: [1071],
      },
    ],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(transitApiConfigured).mockReturnValue(false);
  vi.mocked(fetchStopDirectory).mockResolvedValue(directory);
  vi.mocked(fetchTransitBoard).mockImplementation(async (selection) =>
    boardFor(selection),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openPanel() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<CommutePanel now={NOW} revision={0} />);
  });
  return view;
}

async function chooseStation() {
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Find a station, tram or bus stop" }),
    { target: { value: "Flinders" } },
  );
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("region", { name: "Matching stops" })).getByRole(
        "button",
        { name: /Platform 1/ },
      ),
    );
  });
}

describe("commute search, saved selections and honest departures", () => {
  it.each(["compact", "dashboard"] as const)(
    "labels the %s train board as all platforms while preserving the directory selection",
    async (variant) => {
      vi.mocked(transitApiConfigured).mockReturnValue(true);
      await act(async () => {
        render(<CommutePanel now={NOW} revision={0} variant={variant} />);
      });
      await chooseStation();
      expect(screen.getByText("All station platforms.")).toBeTruthy();
      expect(screen.getByText(/Check the platform shown for each service/)).toBeTruthy();
      expect(screen.getByText("Metro train · All platforms · All directions")).toBeTruthy();
      expect(screen.getByText("Frankston line · Platform 1")).toBeTruthy();
      expect(screen.getByText("Frankston line · Platform 2")).toBeTruthy();
      if (variant === "dashboard") {
        const departures = within(screen.getByRole("region", { name: "Departures" }));
        expect(departures.getByText("Flinders Street Station · All platforms · All directions")).toBeTruthy();
        expect(departures.queryByText(station.name)).toBeNull();
      }
      fireEvent.click(screen.getByRole("button", { name: "Save this stop and direction" }));
      expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([{ stop: station }]);
      expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0].stop).toEqual(station);
    },
  );

  it("explains both tram directions and retains the boarding point when a direction is chosen", async () => {
    vi.mocked(transitApiConfigured).mockReturnValue(true);
    vi.mocked(fetchTransitBoard).mockImplementation(async (selection) => {
      const board = boardFor(selection);
      return {
        ...board,
        upstreamStopId: 2206,
        directions: [
          { id: 0, name: "East Coburg", routeId: 1, routeName: "Route 1" },
          { id: 1, name: "South Melbourne Beach", routeId: 1, routeName: "Route 1" },
        ],
        departures: board.departures.slice(0, 2).map((departure, index) => ({
          ...departure,
          routeId: 1,
          directionId: index,
          routeName: "Route 1",
          routeNumber: "1",
          destination: index ? "South Melbourne Beach" : "East Coburg",
          platform: null,
        })).filter((departure) => selection.directionId === undefined || departure.directionId === selection.directionId),
        disruptions: [],
      };
    });
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Trams" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Bourke" } });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("region", { name: "Matching stops" })).getByRole("button", { name: /Stop 19497/ }));
    });
    expect(screen.getByText("Both directions may appear.")).toBeTruthy();
    expect(screen.getByText(/Choose Route & direction to narrow the board/)).toBeTruthy();
    expect(screen.getByText("East Coburg", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("South Melbourne Beach", { selector: "strong" })).toBeTruthy();
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "Route & direction" }), { target: { value: "1:1" } });
    });
    expect(screen.queryByText("Both directions may appear.")).toBeNull();
    expect(screen.getByText(/Showing your selected route and direction/)).toBeTruthy();
    expect(screen.queryByText("East Coburg", { selector: "strong" })).toBeNull();
    expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0]).toMatchObject({
      stop: tram, routeId: 1, directionId: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "Save this stop and direction" }));
    expect(JSON.parse(localStorage.getItem(STORE)!)[0]).toMatchObject({ stop: tram, routeId: 1, directionId: 1 });
  });

  it("searches real station names and switches to separately identified tram boarding points without an API", async () => {
    await openPanel();
    const search = screen.getByRole("searchbox", {
      name: "Find a station, tram or bus stop",
    });
    fireEvent.change(search, { target: { value: "Richmond" } });
    expect(
      within(screen.getByRole("region", { name: "Matching stops" })).getByRole(
        "button",
        { name: /Richmond Station/ },
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trams" }));
    expect(screen.getByText(/No matching stops/)).toBeTruthy();
    fireEvent.change(search, { target: { value: "Bourke" } });
    const results = within(
      screen.getByRole("region", { name: "Matching stops" }),
    );
    expect(results.getAllByRole("button")).toHaveLength(2);
    await act(async () => {
      fireEvent.click(results.getByRole("button", { name: /Stop 19497/ }));
    });
    expect(
      screen.getByText("Live departures are currently unavailable."),
    ).toBeTruthy();
    expect(screen.queryByText(/Your stop is saved locally/)).toBeNull();
    expect(screen.getByText(/You can save this stop locally/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /^Check official departures/ })
        .getAttribute("href"),
    ).toBe("https://transport.vic.gov.au/departures");
    expect(fetchTransitBoard).not.toHaveBeenCalled();
  });

  it("saves a selected GTFS stop, restores it after a revisit, and removes it without API credentials", async () => {
    const view = await openPanel();
    await chooseStation();
    fireEvent.click(
      screen.getByRole("button", { name: "Save this stop and direction" }),
    );
    expect(JSON.parse(localStorage.getItem(STORE)!)[0].stop).toEqual(station);
    expect(
      screen
        .getByRole("button", { name: "Stop saved" })
        .hasAttribute("disabled"),
    ).toBe(true);
    view.unmount();
    await openPanel();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(
      screen
        .getByRole("button", {
          name: /Flinders Street Station.*All directions/,
        })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: /^Remove Flinders Street/ }),
    );
    expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([]);
    expect(
      screen
        .getByRole("button", { name: "Save this stop and direction" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("saves different route/direction combinations independently and restores the chosen direction", async () => {
    vi.mocked(transitApiConfigured).mockReturnValue(true);
    const view = await openPanel();
    await chooseStation();
    await act(async () => {
      fireEvent.change(
        screen.getByRole("combobox", { name: "Route & direction" }),
        { target: { value: "7:20" } },
      );
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save this stop and direction" }),
    );
    await act(async () => {
      fireEvent.change(
        screen.getByRole("combobox", { name: "Route & direction" }),
        { target: { value: "7:21" } },
      );
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save this stop and direction" }),
    );
    const saved: TransitSelection[] = JSON.parse(localStorage.getItem(STORE)!);
    expect(saved.map((item) => [item.routeId, item.directionId])).toEqual([
      [7, 20],
      [7, 21],
    ]);
    expect(saved.every((item) => item.stop.idScheme === "gtfs")).toBe(true);
    view.unmount();
    await openPanel();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /^Flinders Street Station.*Towards Frankston/,
        }),
      );
    });
    expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0]).toMatchObject({
      routeId: 7,
      directionId: 21,
      stop: { id: station.id, idScheme: "gtfs" },
    });
    expect(
      (
        screen.getByRole("combobox", {
          name: "Route & direction",
        }) as HTMLSelectElement
      ).value,
    ).toBe("7:21");
  });

  it("rejects malformed persisted selections without rendering or requesting them", async () => {
    localStorage.setItem(
      STORE,
      JSON.stringify([
        null,
        { stop: { ...station, id: "https://attacker.example/stop" } },
        { stop: { ...station, idScheme: "unknown" } },
        { stop: { ...station, longitude: 0 } },
        { stop: station, routeId: -1 },
        { stop: station, directionId: 0.5 },
      ]),
    );
    vi.mocked(transitApiConfigured).mockReturnValue(true);
    await openPanel();
    expect(
      screen.getByRole("searchbox", { name: "Find a station, tram or bus stop" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(screen.queryByText(station.name)).toBeNull();
    expect(fetchTransitBoard).not.toHaveBeenCalled();
  });

  it("keeps equal numeric GTFS and PTV stop identifiers as distinct favourites", async () => {
    vi.mocked(transitApiConfigured).mockReturnValue(true);
    const ptv: TransitSelection = {
      stop: { ...station, idScheme: "ptv", name: "PTV station record" },
    };
    localStorage.setItem(STORE, JSON.stringify([{ stop: station }, ptv]));
    await openPanel();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /^PTV station record.*All directions/,
        }),
      );
    });
    expect(
      vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0].stop.idScheme,
    ).toBe("ptv");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove PTV station record" }),
    );
    expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([
      { stop: station },
    ]);
  });

  it("distinguishes estimates, timetable-only services, cancellations and operator alerts", async () => {
    vi.mocked(transitApiConfigured).mockReturnValue(true);
    await openPanel();
    await chooseStation();
    expect(screen.getByText("5 min")).toBeTruthy();
    expect(
      screen.getByText("Live estimate · 3 min later than scheduled"),
    ).toBeTruthy();
    expect(screen.getByText("Scheduled · no live estimate")).toBeTruthy();
    const cancelled = screen.getByText("Werribee").closest(".departure-row")!;
    expect(
      within(cancelled as HTMLElement).getByText("Cancelled"),
    ).toBeTruthy();
    expect(within(cancelled as HTMLElement).queryByText("10 min")).toBeNull();
    const alert = screen.getByText("Weekend track works").closest("details")!;
    fireEvent.click(within(alert).getByText("Weekend track works"));
    expect(
      within(alert).getByText(
        "Replacement buses run between the affected stations.",
      ),
    ).toBeTruthy();
    expect(
      within(alert).getByText("7 Nov 2026, 10:00 am").getAttribute("dateTime"),
    ).toBe(iso(-3_600_000));
    expect(
      within(alert).getByText("8 Nov 2026, 11:00 am").getAttribute("dateTime"),
    ).toBe(iso(86_400_000));
    expect(
      within(alert)
        .getByRole("link", { name: /^Operator update/ })
        .getAttribute("href"),
    ).toBe("https://transport.vic.gov.au/disruptions/disruptions-information");
    expect(
      screen.getByText(
        /Lookup time is shown; PTV does not provide an observation timestamp/,
      ),
    ).toBeTruthy();
  });

  it("hides the departure board once its lookup is older than 120 seconds, even without another request", async () => {
    vi.mocked(transitApiConfigured).mockReturnValue(true);
    const view = await openPanel();
    await chooseStation();
    expect(screen.getByText("Frankston")).toBeTruthy();
    expect(fetchTransitBoard).toHaveBeenCalledTimes(1);
    await act(async () => {
      view.rerender(<CommutePanel now={NOW + 120_001} revision={0} />);
    });
    expect(screen.queryByText("Frankston")).toBeNull();
    expect(screen.queryByText("Weekend track works")).toBeNull();
    expect(screen.getByText(/Departure information has expired/)).toBeTruthy();
    expect(fetchTransitBoard).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Save this stop and direction" }),
    ).toBeTruthy();
  });

  it("retries a failed local directory download while retaining useful empty-departure and failure states", async () => {
    vi.mocked(fetchStopDirectory).mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    vi.mocked(transitApiConfigured).mockReturnValue(true);
    vi.mocked(fetchTransitBoard).mockImplementation(async (selection) => ({
      ...boardFor(selection),
      departures: [],
      disruptions: [],
    }));
    await openPanel();
    expect(
      screen.getByText(/Stop search is temporarily unavailable/),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await chooseStation();
    expect(
      screen.getByText(/No upcoming departures returned for this selection/),
    ).toBeTruthy();
    vi.mocked(fetchTransitBoard).mockRejectedValue(
      new Error("Upstream unavailable"),
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Refresh departures" }),
      );
    });
    expect(
      screen.getByText(
        "Refresh failed. These results will expire automatically.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText("Live departures are currently unavailable."),
    ).toBeNull();
  });
});
