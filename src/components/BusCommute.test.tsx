// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommutePanel from "./CommutePanel";
import type { TransitStopMapProps } from "./TransitStopMap";
import { requestCurrentLocation } from "../lib/currentLocation";
import { fetchStopDirectory, type StopDirectory } from "../lib/stopDirectory";
import { LANDMARKS, searchTransitDestinations } from "../lib/transitDestinations";
import { fetchTransitBoard, transitApiConfigured, type TransitBoard, type TransitSelection, type TransitStop } from "../lib/transit";

vi.mock("../lib/currentLocation", async (original) => ({
  ...(await original<typeof import("../lib/currentLocation")>()), requestCurrentLocation: vi.fn(),
}));
vi.mock("../lib/stopDirectory", async (original) => ({
  ...(await original<typeof import("../lib/stopDirectory")>()), fetchStopDirectory: vi.fn(),
}));
vi.mock("../lib/transitDestinations", async (original) => ({
  ...(await original<typeof import("../lib/transitDestinations")>()), searchTransitDestinations: vi.fn(),
}));
vi.mock("../lib/transit", async (original) => ({
  ...(await original<typeof import("../lib/transit")>()), fetchTransitBoard: vi.fn(), transitApiConfigured: vi.fn(),
}));
vi.mock("./DeferredTransitStopMap", () => ({
  default: ({ nearby, selectedStop, onSelect, onViewDepartures }: TransitStopMapProps) => <section aria-label="Test stop map">
    {nearby.map(({ stop }) => <button key={`${stop.mode}:${stop.id}`} aria-pressed={selectedStop?.id === stop.id && selectedStop.mode === stop.mode}
      onClick={() => onSelect(stop)}>Map {stop.mode} {stop.id}</button>)}
    {selectedStop && <button onClick={() => onViewDepartures(selectedStop)}>View map departures</button>}
  </section>,
}));

const NOW = Date.parse("2026-11-09T00:00:00Z");
const STORE = "melbourne-daily:commutes";
const landmark = LANDMARKS.find((place) => place.id === "landmark:federation-square")!;
const station: TransitStop = { id: 11212, idScheme: "gtfs", mode: "train", name: "Flinders Street Station · Platform 1", suburb: "", latitude: landmark.latitude + .0004, longitude: landmark.longitude };
const tram: TransitStop = { ...station, id: 19497, mode: "tram", name: "Federation Square tram stop", latitude: landmark.latitude + .0006 };
const bus: TransitStop = { ...station, id: 22471, mode: "bus", name: "Federation Square bus stop", latitude: landmark.latitude + .0002 };
// Same name on the other side of a road must remain a separate boarding point.
const otherBus: TransitStop = { ...bus, id: 22472, latitude: landmark.latitude + .0008 };
const directory: StopDirectory = {
  generatedAt: new Date(NOW).toISOString(), sourceUpdatedAt: new Date(NOW).toISOString(),
  sourceUrl: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule", stops: [otherBus, tram, station, bus],
};
function boardFor(selection: TransitSelection): TransitBoard {
  const isBus = selection.stop.mode === "bus";
  const train = selection.stop.mode === "train";
  const routes = isBus ? [
    { id: 0, name: "Doncaster", routeId: 100, routeName: "Route 905" },
    { id: 1, name: "The Pines", routeId: 101, routeName: "Route 906" },
  ] : [{ id: 0, name: train ? "Frankston" : "East Coburg", routeId: 7, routeName: train ? "Frankston line" : "Route 1" }];
  return {
    stopId: selection.stop.id, idScheme: selection.stop.idScheme, upstreamStopId: isBus ? 14035 : selection.stop.id, mode: selection.stop.mode,
    checkedAt: new Date(NOW).toISOString(), directions: routes,
    departures: routes.filter((route) => selection.routeId === undefined || route.routeId === selection.routeId).map((route, index) => ({
      id: `service-${route.routeId}`, runRef: `run-${route.routeId}`, routeId: route.routeId, routeName: route.routeName,
      routeNumber: isBus ? (route.routeId === 100 ? "905" : "906") : train ? "" : "1", directionId: route.id, destination: route.name,
      scheduledAt: new Date(NOW + (4 + index) * 60_000).toISOString(),
      estimatedAt: route.routeId === 101 ? null : new Date(NOW + 5 * 60_000).toISOString(),
      platform: train ? "1" : null, status: route.routeId === 101 ? "scheduled" : "estimated", atPlatform: false, disruptionIds: [9], notes: null,
    })),
    disruptions: [{ id: 9, title: `${selection.stop.mode} service update`, description: "Check the boarding point before travelling.",
      url: "https://transport.vic.gov.au/disruptions/disruptions-information", status: "current", updatedAt: new Date(NOW).toISOString(),
      startsAt: null, endsAt: null, routeIds: routes.map((route) => route.routeId), stopIds: [selection.stop.id] }],
  };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); vi.clearAllMocks(); localStorage.clear();
  vi.mocked(transitApiConfigured).mockReturnValue(true);
  vi.mocked(fetchStopDirectory).mockResolvedValue(directory);
  vi.mocked(fetchTransitBoard).mockImplementation(async (selection) => boardFor(selection));
  vi.mocked(requestCurrentLocation).mockResolvedValue({ latitude: landmark.latitude, longitude: landmark.longitude, accuracyMetres: 20, capturedAt: NOW });
  vi.mocked(searchTransitDestinations).mockResolvedValue({ destinations: [{ ...landmark, id: "vicmap:address", label: "Destination address" }], partial: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const nearby = () => within(screen.getByRole("region", { name: "Nearby stops" }));
const filters = () => within(screen.getByRole("group", { name: "Nearby transport mode" }));
async function open(variant: "compact" | "dashboard") {
  return await act(async () => render(<CommutePanel now={NOW} revision={0} variant={variant} />));
}
function assertWalkingTo(stop: TransitStop) {
  const nav = within(screen.getByRole("navigation", { name: "Walking directions" }));
  const google = new URL(nav.getByRole("link", { name: /^Google Maps/ }).getAttribute("href")!);
  const apple = new URL(nav.getByRole("link", { name: /^Apple Maps/ }).getAttribute("href")!);
  expect(google.searchParams.get("destination")).toBe(`${stop.latitude},${stop.longitude}`);
  expect(google.searchParams.get("travelmode")).toBe("walking");
  expect(google.searchParams.has("origin")).toBe(false);
  expect(apple.searchParams.get("destination")).toBe(`${stop.latitude},${stop.longitude}`);
  expect(apple.searchParams.get("mode")).toBe("walking");
  expect(apple.searchParams.has("source")).toBe(false);
}

describe("bus discovery and commute boards", () => {
  it.each(["compact", "dashboard"] as const)("finds buses by GPS in %s, sorted with other modes, and retains each boarding point", async (variant) => {
    await open(variant);
    expect(requestCurrentLocation).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use my current location" })));
    const results = nearby().getAllByRole("button");
    expect(results.map((button) => button.textContent)).toEqual([
      expect.stringContaining(`Boarding point ${bus.id}`), expect.stringContaining("Flinders Street Station"),
      expect.stringContaining("Federation Square tram stop"), expect.stringContaining(`Boarding point ${otherBus.id}`),
    ]);
    expect(fetchTransitBoard).not.toHaveBeenCalled();
    fireEvent.click(filters().getByRole("button", { name: "Buses" }));
    expect(nearby().getAllByRole("button")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Test stop map" })).getAllByRole("button")).toHaveLength(2);
    await act(async () => fireEvent.click(nearby().getAllByRole("button")[0]));
    expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0]).toEqual({ stop: bus });
    expect(screen.getByText("Bus · All directions")).toBeTruthy();
    expect(screen.getByText("Check your bus boarding bay.")).toBeTruthy();
    expect(screen.getByText(/PTV may include other bays or both directions/)).toBeTruthy();
    expect(screen.getByText(/Confirm your service’s boarding bay and street-side signage/)).toBeTruthy();
    expect(screen.queryByText("All station platforms.")).toBeNull();
    expect(screen.queryByText("Both directions may appear.")).toBeNull();
    expect(screen.getByText("Live estimate")).toBeTruthy();
    expect(screen.getByText("Scheduled · no live estimate")).toBeTruthy();
    expect(screen.getByText("bus service update")).toBeTruthy();
    assertWalkingTo(bus);
    await act(async () => fireEvent.change(screen.getByRole("combobox", { name: "Route & direction" }), { target: { value: "101:1" } }));
    expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0]).toMatchObject({ stop: bus, routeId: 101, directionId: 1 });
    expect(screen.getByText("The Pines", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByText("Doncaster", { selector: "strong" })).toBeNull();
    assertWalkingTo(bus);
    fireEvent.click(screen.getByRole("button", { name: "Save this stop and direction" }));
    expect(JSON.parse(localStorage.getItem(STORE)!)[0]).toMatchObject({ stop: bus, routeId: 101, directionId: 1 });
    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
  });

  it.each(["compact", "dashboard"] as const)("uses an address or landmark for buses in %s, synchronizes map selection, and preserves train/tram boards", async (variant) => {
    await open(variant);
    fireEvent.change(screen.getByRole("textbox", { name: "Find a destination" }), { target: { value: "Destination address" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Search destinations" })));
    fireEvent.click(within(screen.getByRole("region", { name: "Matching destinations" })).getByRole("button", { name: "Destination address" }));
    fireEvent.click(filters().getByRole("button", { name: "Buses" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: `Map bus ${bus.id}` })));
    assertWalkingTo(bus);
    // PTV combines these distinct mapped boarding points into one upstream stop.
    // Changing the selected point must still change its walking destination.
    expect(boardFor({ stop: bus }).upstreamStopId).toBe(boardFor({ stop: otherBus }).upstreamStopId);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: `Map bus ${otherBus.id}` })));
    expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0]).toEqual({ stop: otherBus });
    expect(nearby().getByRole("button", { name: new RegExp(`Boarding point ${otherBus.id}`) }).getAttribute("aria-pressed")).toBe("true");
    assertWalkingTo(otherBus);
    fireEvent.change(screen.getByRole("combobox", { name: "Choose a landmark" }), { target: { value: landmark.id } });
    expect(nearby().getAllByRole("button")).toHaveLength(2);
    for (const [filter, stop, copy] of [["Trains", station, "All station platforms."], ["Trams", tram, "Both directions may appear."]] as const) {
      fireEvent.click(filters().getByRole("button", { name: filter }));
      await act(async () => fireEvent.click(nearby().getAllByRole("button")[0]));
      expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0]).toEqual({ stop });
      expect(screen.getByText(copy)).toBeTruthy();
      expect(screen.queryByText("Check your bus boarding bay.")).toBeNull();
      expect(screen.getByText(`${stop.mode} service update`)).toBeTruthy();
      assertWalkingTo(stop);
    }
    expect(requestCurrentLocation).not.toHaveBeenCalled();
  });

  it("supports bus name search, walking links and saved-stop restoration before live activation", async () => {
    vi.mocked(transitApiConfigured).mockReturnValue(false);
    const view = await open("dashboard");
    fireEvent.click(within(screen.getByRole("group", { name: "Transport mode" })).getByRole("button", { name: "Buses" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a station, tram or bus stop" }), { target: { value: "Federation" } });
    const matches = within(screen.getByRole("region", { name: "Matching stops" })).getAllByRole("button");
    expect(matches).toHaveLength(2);
    await act(async () => fireEvent.click(matches[0]));
    const chosen = directory.stops.find((stop) => matches[0].textContent?.includes(`Stop ${stop.id}`))!;
    assertWalkingTo(chosen);
    fireEvent.click(screen.getByRole("button", { name: "Save this stop and direction" }));
    view.unmount();
    await open("dashboard");
    expect(screen.getByText("Bus · All directions")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Federation Square bus stop\s*All directions/ }).getAttribute("aria-pressed")).toBe("true");
    assertWalkingTo(chosen);
    expect(screen.getByText("Live departures are currently unavailable.")).toBeTruthy();
    expect(fetchTransitBoard).not.toHaveBeenCalled();
  });

  it("explains an empty bus filter and keeps the train results available", async () => {
    vi.mocked(fetchStopDirectory).mockResolvedValue({ ...directory, stops: [station] });
    await open("dashboard");
    fireEvent.change(screen.getByRole("combobox", { name: "Choose a landmark" }), { target: { value: landmark.id } });
    fireEvent.click(filters().getByRole("button", { name: "Buses" }));
    expect(nearby().getByText(/No bus stops found within 2 km/)).toBeTruthy();
    expect(nearby().queryByRole("button")).toBeNull();
    fireEvent.click(filters().getByRole("button", { name: "Trains" }));
    expect(nearby().getByRole("button", { name: /Flinders Street Station/ })).toBeTruthy();
    expect(fetchTransitBoard).not.toHaveBeenCalled();
  });
});
