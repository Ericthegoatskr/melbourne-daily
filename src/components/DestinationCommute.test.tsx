// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommutePanel from "./CommutePanel";
import type { TransitStopMapProps } from "./TransitStopMap";
import { requestCurrentLocation, type CurrentLocation } from "../lib/currentLocation";
import { fetchStopDirectory, type StopDirectory } from "../lib/stopDirectory";
import { LANDMARKS, searchTransitDestinations, type TransitDestinationSearchResult } from "../lib/transitDestinations";
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
// Exercise map/list/board wiring without loading Leaflet or a tile provider.
// Deferred loading and actual map lifecycle have their own component tests.
vi.mock("./DeferredTransitStopMap", () => ({
  default: ({ center, nearby, selectedStop, onSelect, onViewDepartures }: TransitStopMapProps) => <section aria-label="Test stop map">
    <span>{center.label}</span>
    {nearby.map(({ stop }) => <button key={`${stop.mode}:${stop.id}`} aria-pressed={selectedStop?.id === stop.id && selectedStop.mode === stop.mode && selectedStop.idScheme === stop.idScheme}
      onClick={() => onSelect(stop)}>Select map stop {stop.id}</button>)}
    {selectedStop && <button onClick={() => onViewDepartures(selectedStop)}>View map departures</button>}
  </section>,
}));

const NOW = Date.parse("2026-11-09T00:00:00Z");
const STORE = "melbourne-daily:commutes";
const position: CurrentLocation = { latitude: -37.813611, longitude: 144.963056, accuracyMetres: 30, capturedAt: NOW };
const station: TransitStop = {
  id: 11212, idScheme: "gtfs", name: "Flinders Street Station · Platform 1", suburb: "", mode: "train", latitude: -37.8181, longitude: 144.9663,
};
const tram: TransitStop = {
  id: 19497, idScheme: "gtfs", name: "Bourke Street Mall/Swanston St #10", suburb: "", mode: "tram", latitude: -37.8133, longitude: 144.9656,
};
const directory: StopDirectory = {
  generatedAt: new Date(NOW).toISOString(), sourceUpdatedAt: new Date(NOW).toISOString(),
  sourceUrl: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule", stops: [station, tram],
};
const savedSelection: TransitSelection = { stop: station, routeId: 7, directionId: 21, directionName: "Frankston line · Towards Frankston" };
const landmark = LANDMARKS.find((place) => place.id === "landmark:federation-square")!;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
const scrollIntoView = vi.fn();

function boardFor(selection: TransitSelection): TransitBoard {
  const train = selection.stop.mode === "train";
  return {
    stopId: selection.stop.id, idScheme: selection.stop.idScheme, upstreamStopId: train ? 1071 : 2206, mode: selection.stop.mode,
    checkedAt: new Date(NOW).toISOString(),
    directions: [{ id: train ? 21 : 0, name: train ? "Towards Frankston" : "East Coburg", routeId: train ? 7 : 1, routeName: train ? "Frankston line" : "Route 1" }],
    departures: [{
      id: "next-service", runRef: "run-1", routeId: train ? 7 : 1, routeName: train ? "Frankston line" : "Route 1", routeNumber: train ? "" : "1",
      directionId: train ? 21 : 0, destination: train ? "Frankston" : "East Coburg", scheduledAt: new Date(NOW + 4 * 60_000).toISOString(),
      estimatedAt: new Date(NOW + 5 * 60_000).toISOString(), platform: train ? "1" : null, status: "estimated", atPlatform: false, disruptionIds: [9], notes: null,
    }],
    disruptions: [{
      id: 9, title: train ? "Train service update" : "Tram service update", description: "Check the boarding point before travelling.",
      url: "https://transport.vic.gov.au/disruptions/disruptions-information", status: "current", updatedAt: new Date(NOW).toISOString(),
      startsAt: null, endsAt: null, routeIds: [train ? 7 : 1], stopIds: [train ? 1071 : 2206],
    }],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(transitApiConfigured).mockReturnValue(true);
  vi.mocked(fetchStopDirectory).mockResolvedValue(directory);
  vi.mocked(requestCurrentLocation).mockResolvedValue(position);
  vi.mocked(searchTransitDestinations).mockResolvedValue({ destinations: [], partial: false });
  vi.mocked(fetchTransitBoard).mockImplementation(async (selection) => boardFor(selection));
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: scrollIntoView });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

async function openPanel(variant: "compact" | "dashboard" = "compact") {
  localStorage.setItem(STORE, JSON.stringify([savedSelection]));
  return await act(async () => render(<CommutePanel now={NOW} revision={0} variant={variant} />));
}
function chooseLandmark(id = landmark.id) {
  fireEvent.change(screen.getByRole("combobox", { name: "Choose a landmark" }), { target: { value: id } });
}
function assertDirectionsTo(stop: TransitStop) {
  const navigation = within(screen.getByRole("navigation", { name: "Walking directions" }));
  const google = new URL(navigation.getByRole("link", { name: /^Google Maps/ }).getAttribute("href")!);
  const apple = new URL(navigation.getByRole("link", { name: /^Apple Maps/ }).getAttribute("href")!);
  expect(google.searchParams.get("destination")).toBe(`${stop.latitude},${stop.longitude}`);
  expect(google.searchParams.get("travelmode")).toBe("walking");
  expect(google.searchParams.has("origin")).toBe(false);
  expect(apple.searchParams.get("destination")).toBe(`${stop.latitude},${stop.longitude}`);
  expect(apple.searchParams.get("mode")).toBe("walking");
  expect(apple.searchParams.has("source")).toBe(false);
}

describe("destination discovery in the shared commute flow", () => {
  it.each(["compact", "dashboard"] as const)("keeps the saved board in %s through centre/filter changes, then selects the list stop's board, alerts and directions", async (variant) => {
    await openPanel(variant);
    chooseLandmark();
    expect(within(screen.getByRole("region", { name: "Test stop map" })).getByText(landmark.label)).toBeTruthy();
    expect(requestCurrentLocation).not.toHaveBeenCalled();
    expect(searchTransitDestinations).not.toHaveBeenCalled();
    expect(fetchTransitBoard).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Frankston", { selector: "strong" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Nearby transport mode" })).getByRole("button", { name: "Trams" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Nearby search radius" }), { target: { value: "1000" } });
    expect(fetchTransitBoard).toHaveBeenCalledTimes(1);
    const nearby = within(screen.getByRole("region", { name: "Nearby stops" }));
    expect(nearby.queryByRole("button", { name: /Flinders Street/ })).toBeNull();
    await act(async () => fireEvent.click(nearby.getByRole("button", { name: /Bourke Street Mall/ })));
    expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0]).toEqual({ stop: tram });
    expect(screen.getByText("East Coburg", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("Tram service update")).toBeTruthy();
    expect(screen.queryByText("Train service update")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Route & direction" })).toHaveProperty("value", "");
    expect(screen.getByRole("button", { name: `Select map stop ${tram.id}` }).getAttribute("aria-pressed")).toBe("true");
    assertDirectionsTo(tram);
    fireEvent.click(screen.getByRole("button", { name: "Clear destination" }));
    expect(screen.queryByRole("region", { name: "Nearby stops" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Test stop map" })).toBeNull();
    expect(screen.getByText("Tram service update")).toBeTruthy();
    expect(fetchTransitBoard).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([savedSelection]);
    assertDirectionsTo(tram);
  });

  it.each(["compact", "dashboard"] as const)("selects a map stop in %s without scrolling, then explicitly focuses the same board", async (variant) => {
    await openPanel(variant);
    chooseLandmark();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: `Select map stop ${tram.id}` })));
    expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0]).toEqual({ stop: tram });
    expect(screen.getByText("Tram service update")).toBeTruthy();
    assertDirectionsTo(tram);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(within(screen.getByRole("region", { name: "Nearby stops" })).getByRole("button", { name: /Bourke Street Mall/ }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "View map departures" })));
    expect(document.activeElement?.getAttribute("aria-label")).toBe(variant === "dashboard" ? "Selected stop" : "Selected stop departures");
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start", behavior: "instant" });
    expect(fetchTransitBoard).toHaveBeenCalledTimes(2);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: `Select map stop ${station.id}` })));
    expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0]).toEqual({ stop: station });
    expect(screen.getByText("Train service update")).toBeTruthy();
    assertDirectionsTo(station);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("abandons an outstanding GPS fix when a destination is chosen and ignores its late success", async () => {
    let finish!: (value: CurrentLocation) => void;
    vi.mocked(requestCurrentLocation).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    const signal = vi.mocked(requestCurrentLocation).mock.calls[0][0]!;
    chooseLandmark();
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ ...position, latitude: -37.6, longitude: 145.2 }));
    expect(within(screen.getByRole("region", { name: "Test stop map" })).getByText(landmark.label)).toBeTruthy();
    expect(screen.queryByText(/Location captured at/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear location" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Nearby stops" })).getAllByRole("button")).toHaveLength(2);
    expect(fetchTransitBoard).toHaveBeenCalledTimes(1);
  });

  it("starting GPS clears a chosen destination and aborts its pending search so the late response cannot replace location", async () => {
    let finish!: (value: TransitDestinationSearchResult) => void;
    vi.mocked(searchTransitDestinations).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await openPanel();
    chooseLandmark();
    fireEvent.change(screen.getByRole("textbox", { name: "Find a destination" }), { target: { value: "Museum" } });
    fireEvent.click(screen.getByRole("button", { name: "Search destinations" }));
    const signal = vi.mocked(searchTransitDestinations).mock.calls[0][1]!;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use my current location" })));
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole("textbox", { name: "Find a destination" })).toHaveProperty("value", "");
    expect(screen.queryByRole("button", { name: "Clear destination" })).toBeNull();
    await act(async () => finish({ destinations: [landmark], partial: false }));
    expect(screen.queryByRole("region", { name: "Matching destinations" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Test stop map" })).getByText("Your location")).toBeTruthy();
    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
    expect(fetchTransitBoard).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([savedSelection]);
  });

  it("requires a submitted result choice, and preserves the saved board when a valid destination has no matching stops", async () => {
    const distant = { id: "address:coverage-edge", label: "Docklands test address", latitude: -37.818, longitude: 144.94 };
    vi.mocked(searchTransitDestinations).mockResolvedValue({ destinations: [distant], partial: false });
    await openPanel();
    fireEvent.change(screen.getByRole("textbox", { name: "Find a destination" }), { target: { value: "Docklands" } });
    expect(searchTransitDestinations).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Search destinations" })));
    expect(screen.queryByRole("region", { name: "Nearby stops" })).toBeNull();
    fireEvent.click(within(screen.getByRole("region", { name: "Matching destinations" })).getByRole("button", { name: distant.label }));
    fireEvent.change(screen.getByRole("combobox", { name: "Nearby search radius" }), { target: { value: "1000" } });
    expect(within(screen.getByRole("region", { name: "Nearby stops" })).getByText(/No train or tram stops found within 1 km/)).toBeTruthy();
    expect(screen.getByText("Frankston", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("Train service update")).toBeTruthy();
    expect(fetchTransitBoard).toHaveBeenCalledTimes(1);
    assertDirectionsTo(station);
    expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([savedSelection]);
  });

  it("keeps destinations after ten minutes but removes an expired device centre and its map without losing the selected stop", async () => {
    const view = await openPanel();
    chooseLandmark();
    view.rerender(<CommutePanel now={NOW + 11 * 60_000} revision={0} />);
    expect(screen.getByRole("region", { name: "Nearby stops" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Test stop map" })).getByText(landmark.label)).toBeTruthy();
    view.rerender(<CommutePanel now={NOW} revision={0} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use my current location" })));
    expect(screen.getByRole("region", { name: "Test stop map" })).toBeTruthy();
    view.rerender(<CommutePanel now={NOW + 11 * 60_000} revision={0} />);
    expect(screen.queryByRole("region", { name: "Nearby stops" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Test stop map" })).toBeNull();
    expect(screen.getByText(/This location is over 10 minutes old/)).toBeTruthy();
    assertDirectionsTo(station);
    expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([savedSelection]);
    expect(fetchTransitBoard).toHaveBeenCalledTimes(1);
  });
});
