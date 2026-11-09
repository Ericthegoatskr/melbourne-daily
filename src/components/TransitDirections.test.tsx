// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommutePanel from "./CommutePanel";
import { requestCurrentLocation } from "../lib/currentLocation";
import { fetchStopDirectory, type StopDirectory } from "../lib/stopDirectory";
import { fetchTransitBoard, transitApiConfigured, type TransitStop } from "../lib/transit";

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

const NOW = Date.parse("2026-11-09T00:00:00Z");
const STORE = "melbourne-daily:commutes";
const station: TransitStop = {
  id: 11212, idScheme: "gtfs", name: "Flinders Street Station · Platform 1",
  suburb: "", mode: "train", latitude: -37.8181, longitude: 144.9663,
};
const tram: TransitStop = {
  id: 19497, idScheme: "gtfs", name: "Bourke Street Mall/Swanston St #10",
  suburb: "", mode: "tram", latitude: -37.8133, longitude: 144.9656,
};
const directory: StopDirectory = {
  generatedAt: new Date(NOW).toISOString(),
  sourceUpdatedAt: new Date(NOW).toISOString(),
  sourceUrl: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule",
  stops: [station, tram],
};
const position = {
  latitude: -37.813611, longitude: 144.963056, accuracyMetres: 30, capturedAt: NOW,
};
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(transitApiConfigured).mockReturnValue(false);
  vi.mocked(fetchStopDirectory).mockResolvedValue(directory);
  vi.mocked(fetchTransitBoard).mockRejectedValue(new Error("Service unavailable"));
  vi.mocked(requestCurrentLocation).mockResolvedValue(position);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: scrollIntoView });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

async function openPanel(variant: "compact" | "dashboard") {
  await act(async () => { render(<CommutePanel now={NOW} revision={0} variant={variant} />); });
}

function assertDirectionsTo(stop: TransitStop) {
  const navigation = within(screen.getByRole("navigation", { name: "Walking directions" }));
  const googleLink = navigation.getByRole("link", { name: /^Google Maps/ });
  const appleLink = navigation.getByRole("link", { name: /^Apple Maps/ });
  const google = new URL(googleLink.getAttribute("href")!);
  const apple = new URL(appleLink.getAttribute("href")!);
  const destination = `${stop.latitude},${stop.longitude}`;
  expect(google.searchParams.get("destination")).toBe(destination);
  expect(google.searchParams.get("travelmode")).toBe("walking");
  expect(google.searchParams.has("origin")).toBe(false);
  expect(apple.searchParams.get("destination")).toBe(destination);
  expect(apple.searchParams.get("mode")).toBe("walking");
  expect(apple.searchParams.has("source")).toBe(false);
  expect(apple.searchParams.has("saddr")).toBe(false);
  for (const link of [googleLink, appleLink]) {
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")?.split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
    expect(link.getAttribute("href")).not.toContain(String(position.latitude));
    expect(link.getAttribute("href")).not.toContain(String(position.longitude));
  }
}

describe("walking directions in the shared commute flow", () => {
  it.each(["compact", "dashboard"] as const)(
    "offers directions only after selection in %s and updates their destination when text search changes the stop",
    async (variant) => {
      await openPanel(variant);
      expect(screen.queryByRole("navigation", { name: "Walking directions" })).toBeNull();
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Flinders" } });
      await act(async () => {
        fireEvent.click(within(screen.getByRole("region", { name: "Matching stops" })).getByRole("button", { name: /Stop 11212/ }));
      });
      assertDirectionsTo(station);
      if (variant === "compact") fireEvent.click(screen.getByRole("button", { name: "Find a stop" }));
      fireEvent.click(within(screen.getByRole("group", { name: /^Transport mode$/ })).getByRole("button", { name: /^Trams$/ }));
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Bourke" } });
      await act(async () => {
        fireEvent.click(within(screen.getByRole("region", { name: "Matching stops" })).getByRole("button", { name: /Stop 19497/ }));
      });
      assertDirectionsTo(tram);
      expect(fetchTransitBoard).not.toHaveBeenCalled();
      expect(requestCurrentLocation).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["compact", false], ["dashboard", false], ["compact", true], ["dashboard", true],
  ] as const)(
    "restores a saved stop's directions in %s when API configured=%s, independently of live data",
    async (variant, configured) => {
      const saved = [{ stop: station, routeId: 7, directionId: 21, directionName: "Frankston · Frankston" }];
      localStorage.setItem(STORE, JSON.stringify(saved));
      vi.mocked(transitApiConfigured).mockReturnValue(configured);
      await openPanel(variant);
      assertDirectionsTo(station);
      expect(screen.getByRole("button", { name: "Stop saved" })).toHaveProperty("disabled", true);
      expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual(saved);
      expect(fetchTransitBoard).toHaveBeenCalledTimes(configured ? 1 : 0);
      expect(requestCurrentLocation).not.toHaveBeenCalled();
    },
  );

  it.each(["compact", "dashboard"] as const)(
    "keeps the selected nearby stop's original coordinates in %s without sending the device position or clearing the selection",
    async (variant) => {
      const openMap = vi.spyOn(window, "open").mockReturnValue(null);
      await openPanel(variant);
      expect(requestCurrentLocation).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
      });
      expect(screen.queryByRole("navigation", { name: "Walking directions" })).toBeNull();
      expect(scrollIntoView).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(within(screen.getByRole("region", { name: "Nearby stops" })).getByRole("button", { name: /Boarding point 19497/ }));
      });
      assertDirectionsTo(tram);
      expect(document.activeElement?.getAttribute("aria-label")).toBe(variant === "dashboard" ? "Selected stop" : "Selected stop departures");
      expect(document.activeElement?.contains(screen.getByRole("navigation", { name: "Walking directions" }))).toBe(true);
      expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start", behavior: "instant" });
      expect(scrollIntoView.mock.contexts[0]).toBe(document.activeElement);
      await act(async () => {
        fireEvent.click(within(screen.getByRole("region", { name: "Nearby stops" })).getByRole("button", { name: /Flinders Street/ }));
      });
      assertDirectionsTo(station);
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(scrollIntoView.mock.contexts[1]).toBe(document.activeElement);
      fireEvent.click(screen.getByRole("button", { name: "Clear location" }));
      assertDirectionsTo(station);
      fireEvent.click(screen.getByRole("button", { name: "Save this stop and direction" }));
      expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual([{ stop: station }]);
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(openMap).not.toHaveBeenCalled();
      expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
    },
  );
});
