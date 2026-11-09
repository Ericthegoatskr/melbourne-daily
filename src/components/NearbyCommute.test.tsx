// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommutePanel from "./CommutePanel";
import { LocationError, requestCurrentLocation } from "../lib/currentLocation";
import { fetchStopDirectory, type StopDirectory } from "../lib/stopDirectory";
import {
  fetchTransitBoard,
  transitApiConfigured,
  type TransitBoard,
  type TransitSelection,
  type TransitStop,
} from "../lib/transit";

vi.mock("../lib/currentLocation", async (original) => ({
  ...(await original<typeof import("../lib/currentLocation")>()),
  requestCurrentLocation: vi.fn(),
}));
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
const STORE = "melbourne-daily:commutes";
const position = {
  latitude: -37.813611,
  longitude: 144.963056,
  accuracyMetres: 30,
  capturedAt: NOW,
};
const station: TransitStop = {
  id: 11212,
  idScheme: "gtfs",
  name: "Flinders Street Station · Platform 1",
  suburb: "",
  mode: "train",
  latitude: -37.8181,
  longitude: 144.9663,
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
  generatedAt: new Date(NOW).toISOString(),
  sourceUpdatedAt: new Date(NOW - 86_400_000).toISOString(),
  sourceUrl: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule",
  stops: [station, tram],
};
const savedSelection: TransitSelection = {
  stop: station,
  routeId: 7,
  directionId: 21,
  directionName: "Frankston line · Towards Frankston",
};

function boardFor(selection: TransitSelection): TransitBoard {
  const isTrain = selection.stop.mode === "train";
  return {
    stopId: selection.stop.id,
    idScheme: selection.stop.idScheme,
    upstreamStopId: isTrain ? 1071 : 2206,
    mode: selection.stop.mode,
    checkedAt: new Date(NOW).toISOString(),
    directions: [{ id: isTrain ? 21 : 0, name: isTrain ? "Towards Frankston" : "East Coburg", routeId: isTrain ? 7 : 1, routeName: isTrain ? "Frankston line" : "Route 1" }],
    departures: [{
      id: "next-service",
      runRef: "run-1",
      routeId: isTrain ? 7 : 1,
      routeName: isTrain ? "Frankston line" : "Route 1",
      routeNumber: isTrain ? "" : "1",
      directionId: isTrain ? 21 : 0,
      destination: isTrain ? "Frankston" : "East Coburg",
      scheduledAt: new Date(NOW + 4 * 60_000).toISOString(),
      estimatedAt: new Date(NOW + 5 * 60_000).toISOString(),
      platform: isTrain ? "1" : null,
      status: "estimated",
      atPlatform: false,
      disruptionIds: [9],
      notes: null,
    }],
    disruptions: [{
      id: 9,
      title: isTrain ? "Train service update" : "Tram service update",
      description: "Check the boarding point before travelling.",
      url: "https://transport.vic.gov.au/disruptions/disruptions-information",
      status: "current",
      updatedAt: new Date(NOW).toISOString(),
      startsAt: null,
      endsAt: null,
      routeIds: [isTrain ? 7 : 1],
      stopIds: [isTrain ? 1071 : 2206],
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
  vi.mocked(fetchTransitBoard).mockImplementation(async (selection) => boardFor(selection));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function locate() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  });
}

describe("nearby stops in the shared commute flow", () => {
  it.each(["compact", "dashboard"] as const)(
    "keeps the saved journey in %s until a nearby stop is explicitly chosen, then uses its existing live board and alerts",
    async (variant) => {
      localStorage.setItem(STORE, JSON.stringify([savedSelection]));
      await act(async () => {
        render(<CommutePanel now={NOW} revision={0} variant={variant} />);
      });
      if (variant === "compact") expect(screen.queryByRole("searchbox")).toBeNull();
      expect(screen.getByText("Frankston", { selector: "strong" })).toBeTruthy();
      expect(screen.getByText("Train service update")).toBeTruthy();
      expect(requestCurrentLocation).not.toHaveBeenCalled();
      expect(fetchTransitBoard).toHaveBeenCalledTimes(1);

      await locate();
      const nearby = within(screen.getByRole("region", { name: "Nearby stops" }));
      expect(nearby.getByRole("button", { name: /Bourke Street Mall/ })).toBeTruthy();
      expect(fetchTransitBoard).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Frankston", { selector: "strong" })).toBeTruthy();
      expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([savedSelection]);

      await act(async () => {
        fireEvent.click(nearby.getByRole("button", { name: /Bourke Street Mall/ }));
      });
      expect(vi.mocked(fetchTransitBoard).mock.calls.at(-1)?.[0]).toEqual({ stop: tram });
      expect(screen.getByText("East Coburg", { selector: "strong" })).toBeTruthy();
      expect(screen.getByText("Tram service update")).toBeTruthy();
      expect(screen.queryByText("Train service update")).toBeNull();
      expect(screen.getByRole("combobox", { name: "Route & direction" })).toHaveProperty("value", "");
      expect(requestCurrentLocation).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Save this stop and direction" }));
      expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([savedSelection, { stop: tram }]);
      expect(localStorage.getItem(STORE)).not.toContain(String(position.latitude));
      expect(localStorage.getItem(STORE)).not.toContain(String(position.longitude));
      expect(localStorage.getItem(STORE)).not.toContain("accuracyMetres");

      fireEvent.click(screen.getByRole("button", { name: "Clear location" }));
      expect(screen.getByText("East Coburg", { selector: "strong" })).toBeTruthy();
      expect(screen.getByText("Tram service update")).toBeTruthy();
      expect(fetchTransitBoard).toHaveBeenCalledTimes(2);
    },
  );

  it("preserves the selected board, direction, saved stop and manual search when permission is denied", async () => {
    localStorage.setItem(STORE, JSON.stringify([savedSelection]));
    vi.mocked(requestCurrentLocation).mockRejectedValue(new LocationError("denied"));
    await act(async () => {
      render(<CommutePanel now={NOW} revision={0} />);
    });
    await locate();
    expect(screen.getByText("Frankston", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("Train service update")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Route & direction" })).toHaveProperty("value", "7:21");
    expect(fetchTransitBoard).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([savedSelection]);
    fireEvent.click(screen.getByRole("button", { name: "Find a stop" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a station, tram or bus stop" }), { target: { value: "Flinders" } });
    expect(within(screen.getByRole("region", { name: "Matching stops" })).getByRole("button", { name: /Flinders Street/ })).toBeTruthy();
  });

  it("allows nearby discovery and saving when the live departure API is not configured", async () => {
    vi.mocked(transitApiConfigured).mockReturnValue(false);
    await act(async () => {
      render(<CommutePanel now={NOW} revision={0} />);
    });
    await locate();
    await act(async () => {
      fireEvent.click(within(screen.getByRole("region", { name: "Nearby stops" })).getByRole("button", { name: /Bourke Street Mall/ }));
    });
    expect(screen.getByText("Live departures are currently unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save this stop and direction" }));
    expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([{ stop: tram }]);
    expect(fetchTransitBoard).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /^Check official departures/ }).getAttribute("href")).toBe("https://transport.vic.gov.au/departures");
  });
});
