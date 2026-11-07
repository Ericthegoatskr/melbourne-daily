// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TransportApp from "./TransportApp";
import { fetchStopDirectory, type StopDirectory } from "./lib/stopDirectory";
import { fetchTransitBoard, transitApiConfigured, type TransitBoard, type TransitSelection, type TransitStop } from "./lib/transit";

vi.mock("./lib/stopDirectory", async (original) => ({
  ...(await original<typeof import("./lib/stopDirectory")>()),
  fetchStopDirectory: vi.fn(),
}));
vi.mock("./lib/transit", async (original) => ({
  ...(await original<typeof import("./lib/transit")>()),
  fetchTransitBoard: vi.fn(),
  transitApiConfigured: vi.fn(),
}));

const NOW = Date.parse("2026-11-07T00:00:00Z");
const iso = (offset = 0) => new Date(NOW + offset).toISOString();
const STORE = "melbourne-daily:commutes";
const station: TransitStop = {
  id: 11212, idScheme: "gtfs", name: "Flinders Street Station · Platform 1", suburb: "",
  mode: "train", latitude: -37.8181, longitude: 144.9663,
};
const tram: TransitStop = {
  id: 19497, idScheme: "gtfs", name: "Bourke Street Mall/Swanston St #10", suburb: "",
  mode: "tram", latitude: -37.8133, longitude: 144.9656,
};
const directory: StopDirectory = {
  generatedAt: iso(), sourceUpdatedAt: iso(-86_400_000),
  sourceUrl: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule", stops: [station, tram],
};
function boardFor(selection: TransitSelection = { stop: station }): TransitBoard {
  return {
    stopId: selection.stop.id, idScheme: selection.stop.idScheme, upstreamStopId: 1071,
    mode: selection.stop.mode, checkedAt: iso(), directions: [],
    departures: [{
      id: "estimated-run", runRef: "run-1", routeId: 7, routeName: "Frankston line", routeNumber: "",
      directionId: 21, destination: "Frankston", scheduledAt: iso(2 * 60_000), estimatedAt: iso(5 * 60_000),
      platform: "1", status: "estimated", atPlatform: false, disruptionIds: [9], notes: null,
    }],
    disruptions: [{
      id: 9, title: "Weekend track works", description: "Replacement buses run between the affected stations.",
      url: "https://transport.vic.gov.au/disruptions/disruptions-information", status: "current", updatedAt: iso(-60_000),
      startsAt: iso(-3_600_000), endsAt: iso(86_400_000), routeIds: [7], stopIds: [1071],
    }],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/transport.html");
  vi.mocked(transitApiConfigured).mockReturnValue(false);
  vi.mocked(fetchStopDirectory).mockResolvedValue(directory);
  vi.mocked(fetchTransitBoard).mockImplementation(async (selection) => boardFor(selection));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected unrelated request")));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function openTransport() {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<TransportApp />); });
  return view;
}
const departures = () => within(screen.getByRole("region", { name: "Departures" }));
const updates = () => within(screen.getByRole("region", { name: "Service updates" }));
async function choose(query: string, name: RegExp) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Find a station or tram stop" }), { target: { value: query } });
  await act(async () => {
    fireEvent.click(within(screen.getByRole("region", { name: "Matching stops" })).getByRole("button", { name }));
  });
}

describe("dedicated transport dashboard", () => {
  it("keeps both live panels awaiting activation without requesting a transit service", async () => {
    await openTransport();
    expect(screen.getByRole("heading", { level: 1, name: "A little less rush." })).toBeTruthy();
    expect(departures().getByText("Awaiting activation", { exact: true })).toBeTruthy();
    expect(updates().getByText("Awaiting activation", { exact: true })).toBeTruthy();
    await choose("Flinders", /Flinders Street/);
    await act(async () => { await vi.advanceTimersByTimeAsync(65_000); });
    expect(departures().getByText("Awaiting activation", { exact: true })).toBeTruthy();
    expect(updates().getByText("Awaiting activation", { exact: true })).toBeTruthy();
    expect(updates().queryByText(/No service updates|running normally/i)).toBeNull();
    expect(fetchTransitBoard).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains saved GTFS selections while keeping the directory search available on return", async () => {
    const view = await openTransport();
    await choose("Flinders", /Flinders Street/);
    fireEvent.click(screen.getByRole("button", { name: "Save this stop and direction" }));
    expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([{ stop: station }]);
    view.unmount();
    await openTransport();
    expect(screen.getByRole("button", { name: /Flinders Street Station.*All directions/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("searchbox", { name: "Find a station or tram stop" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trams" }));
    await choose("Bourke", /Bourke Street Mall/);
    fireEvent.click(screen.getByRole("button", { name: "Save this stop and direction" }));
    expect(JSON.parse(localStorage.getItem(STORE)!).map((item: TransitSelection) => item.stop.mode)).toEqual(["train", "tram"]);
    expect(fetchTransitBoard).not.toHaveBeenCalled();
  });

  it("recovers directory search from the page refresh without enabling the pending panels", async () => {
    vi.mocked(fetchStopDirectory).mockRejectedValueOnce(new Error("Directory unavailable"));
    await openTransport();
    expect(screen.getByText(/Stop search is temporarily unavailable/)).toBeTruthy();
    expect(updates().getByText("Awaiting activation", { exact: true })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh transport" })); });
    await choose("Flinders", /Flinders Street/);
    expect(fetchStopDirectory).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Stop search is temporarily unavailable/)).toBeNull();
    expect(fetchTransitBoard).not.toHaveBeenCalled();
  });

  it("shares pinned official tools across visits and ignores unknown stored links", async () => {
    const pinnedStore = "melbourne-daily:transport-favorites";
    localStorage.setItem(pinnedStore, JSON.stringify(["journey", "journey", "https://invalid.example", null]));
    const view = await openTransport();
    expect(screen.getByRole("button", { name: "Unpin Plan a journey" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("link", { name: "https://invalid.example" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pin Network status" }));
    expect(JSON.parse(localStorage.getItem(pinnedStore)!)).toEqual(["journey", "network"]);
    view.unmount();
    await openTransport();
    expect(screen.getByRole("button", { name: "Unpin Network status" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Unpin Plan a journey" }));
    expect(JSON.parse(localStorage.getItem(pinnedStore)!)).toEqual(["network"]);
  });

  it("clears both old live panels while switching stops and expires retained results after failed polls", async () => {
    vi.mocked(transitApiConfigured).mockReturnValue(true);
    await openTransport();
    await choose("Flinders", /Flinders Street/);
    expect(departures().getByText("Frankston", { exact: true })).toBeTruthy();
    expect(updates().getByText("Weekend track works", { exact: true })).toBeTruthy();
    let resolveBoard!: (board: TransitBoard) => void;
    vi.mocked(fetchTransitBoard).mockImplementationOnce(() => new Promise((resolve) => { resolveBoard = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Trams" }));
    await choose("Bourke", /Bourke Street Mall/);
    expect(departures().queryByText("Frankston", { exact: true })).toBeNull();
    expect(updates().queryByText("Weekend track works", { exact: true })).toBeNull();
    await act(async () => { resolveBoard(boardFor({ stop: tram })); });
    expect(updates().getByText("Weekend track works", { exact: true })).toBeTruthy();
    vi.mocked(fetchTransitBoard).mockRejectedValue(new Error("Upstream unavailable"));
    await act(async () => { await vi.advanceTimersByTimeAsync(135_000); });
    expect(departures().queryByText("Frankston", { exact: true })).toBeNull();
    expect(updates().queryByText("Weekend track works", { exact: true })).toBeNull();
    expect(updates().queryByText(/No service updates|running normally/i)).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Find a station or tram stop" })).toBeTruthy();
  });
});
