// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NearbyStops from "./NearbyStops";
import { LocationError, requestCurrentLocation, type CurrentLocation } from "../lib/currentLocation";
import type { StopDirectory } from "../lib/stopDirectory";
import type { TransitStop } from "../lib/transit";

vi.mock("../lib/currentLocation", async (original) => ({
  ...(await original<typeof import("../lib/currentLocation")>()),
  requestCurrentLocation: vi.fn(),
}));

const NOW = Date.parse("2026-11-07T00:00:00Z");
const position: CurrentLocation = {
  latitude: -37.813611,
  longitude: 144.963056,
  accuracyMetres: 30,
  capturedAt: NOW,
};
const nearTram: TransitStop = {
  id: 19497,
  idScheme: "gtfs",
  name: "Bourke Street Mall/Swanston St #10",
  suburb: "",
  mode: "tram",
  latitude: -37.8136,
  longitude: 144.9632,
};
const train: TransitStop = {
  id: 11212,
  idScheme: "gtfs",
  name: "Flinders Street Station · Platform 1",
  suburb: "",
  mode: "train",
  latitude: -37.8181,
  longitude: 144.9663,
};
const furtherTram: TransitStop = {
  ...nearTram,
  id: 19888,
  name: "Southbank tram stop #21",
  latitude: -37.827,
  longitude: 144.963056,
};
const furtherTrain: TransitStop = {
  ...train,
  id: 12101,
  name: "Further Station · Platform 1",
  latitude: -37.8415,
  longitude: 144.963056,
};
const directory: StopDirectory = {
  generatedAt: new Date(NOW).toISOString(),
  sourceUpdatedAt: new Date(NOW - 86_400_000).toISOString(),
  sourceUrl: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule",
  stops: [furtherTrain, train, furtherTram, nearTram, { ...train, id: 11213, name: "Flinders Street Station · Platform 2", latitude: -37.8182 }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function props() {
  return {
    directory,
    directoryLoading: false,
    directoryError: "",
    onRetryDirectory: vi.fn(),
    onSelect: vi.fn(),
    now: NOW,
  };
}

async function locate() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  });
}

function resultButtons() {
  return within(screen.getByRole("region", { name: "Nearby stops" })).queryAllByRole("button");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(requestCurrentLocation).mockResolvedValue(position);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("nearby stop discovery", () => {
  it("waits for an explicit click, keeps one fix in memory, sorts mixed results, and only selects a public GTFS stop on click", async () => {
    const input = props();
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const network = vi.spyOn(globalThis, "fetch");
    const view = render(<NearbyStops {...input} />);
    expect(requestCurrentLocation).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Nearby stops" })).toBeNull();
    await locate();

    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
    expect(resultButtons().map((button) => button.querySelector("strong")?.textContent)).toEqual([
      nearTram.name,
      "Flinders Street Station",
      furtherTram.name,
    ]);
    expect(screen.getByText("Metro train · 2 mapped platforms")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Nearby search radius" })).toHaveProperty("value", "2000");
    expect(screen.getByText(/straight-line distance/)).toBeTruthy();
    expect(screen.getByText(/does not follow you as you move/)).toBeTruthy();
    expect(input.onSelect).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(30_000);
      view.rerender(<NearbyStops {...input} now={NOW + 30_000} />);
    });
    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
    expect(storageWrite).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    fireEvent.click(resultButtons()[1]);
    expect(input.onSelect).toHaveBeenCalledExactlyOnceWith(train);
    expect(input.onSelect.mock.calls[0][0]).toBe(train);
    expect(input.onSelect.mock.calls[0][0]).not.toHaveProperty("distanceMetres");
    expect(input.onSelect.mock.calls[0][0]).not.toHaveProperty("accuracyMetres");
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it("changes mode and radius locally without requesting another fix or selecting a stop", async () => {
    const input = props();
    render(<NearbyStops {...input} />);
    await locate();
    const modes = within(screen.getByRole("group", { name: "Nearby transport mode" }));
    fireEvent.click(modes.getByRole("button", { name: "Trains" }));
    expect(resultButtons()).toHaveLength(1);
    expect(resultButtons()[0].textContent).toContain("Flinders Street Station");
    expect(modes.getByRole("button", { name: "Trains" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByRole("combobox", { name: "Nearby search radius" }), { target: { value: "5000" } });
    expect(resultButtons()).toHaveLength(2);
    expect(resultButtons()[1].textContent).toContain("Further Station");
    fireEvent.click(modes.getByRole("button", { name: "Trams" }));
    expect(resultButtons()).toHaveLength(2);
    fireEvent.change(screen.getByRole("combobox", { name: "Nearby search radius" }), { target: { value: "1000" } });
    expect(resultButtons()).toHaveLength(1);
    expect(resultButtons()[0].textContent).toContain(nearTram.name);
    fireEvent.click(modes.getByRole("button", { name: "All" }));
    expect(resultButtons()).toHaveLength(2);
    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
    expect(input.onSelect).not.toHaveBeenCalled();
  });

  it("shows a fresh fix even when the parent's fifteen-second clock is fourteen seconds behind", async () => {
    const pending = deferred<CurrentLocation>();
    vi.mocked(requestCurrentLocation).mockReturnValueOnce(pending.promise);
    const input = props();
    const view = render(<NearbyStops {...input} />);
    await locate();
    vi.setSystemTime(NOW + 14_000);
    await act(async () => {
      pending.resolve({ ...position, capturedAt: NOW + 14_000 });
    });
    expect(resultButtons()).toHaveLength(3);
    expect(screen.getByRole("status").textContent).toContain("Location captured at");
    expect(screen.queryByText(/has an invalid time/)).toBeNull();
    view.rerender(<NearbyStops {...input} now={NOW + 15_000} />);
    expect(resultButtons()).toHaveLength(3);
    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
    expect(input.onSelect).not.toHaveBeenCalled();
  });

  it("only marks a nearby stop selected when its identifier scheme also matches", async () => {
    const input = props();
    const ptvStop: TransitStop = { ...nearTram, idScheme: "ptv" };
    const view = render(<NearbyStops {...input} selectedStop={ptvStop} />);
    await locate();
    const nearbyButton = () => within(screen.getByRole("region", { name: "Nearby stops" }))
      .getByRole("button", { name: /Bourke Street Mall/ });
    expect(nearbyButton().getAttribute("aria-pressed")).toBe("false");
    view.rerender(<NearbyStops {...input} selectedStop={nearTram} />);
    expect(nearbyButton().getAttribute("aria-pressed")).toBe("true");
    view.rerender(<NearbyStops {...input} selectedStop={ptvStop} />);
    expect(nearbyButton().getAttribute("aria-pressed")).toBe("false");
    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
  });

  it.each(["denied", "timeout", "unsupported", "insecure", "inaccurate"] as const)(
    "explains a %s failure and only retries after another click",
    async (code) => {
      const error = new LocationError(code);
      vi.mocked(requestCurrentLocation).mockRejectedValueOnce(error);
      const input = props();
      render(<NearbyStops {...input} />);
      await locate();
      expect(screen.getByRole("status").textContent).toBe(error.message);
      expect(screen.queryByRole("region", { name: "Nearby stops" })).toBeNull();
      expect(input.onSelect).not.toHaveBeenCalled();
      expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
      await locate();
      expect(screen.queryByText(error.message)).toBeNull();
      expect(resultButtons()).toHaveLength(3);
      expect(requestCurrentLocation).toHaveBeenCalledTimes(2);
    },
  );

  it("cancels an acquisition, restores keyboard focus, and ignores its late success", async () => {
    const pending = deferred<CurrentLocation>();
    vi.mocked(requestCurrentLocation).mockReturnValueOnce(pending.promise);
    const input = props();
    render(<NearbyStops {...input} />);
    await locate();
    const signal = vi.mocked(requestCurrentLocation).mock.calls[0][0]!;
    const cancel = screen.getByRole("button", { name: "Cancel location request" });
    cancel.focus();
    expect(screen.getByRole("button", { name: "Finding your location…" })).toHaveProperty("disabled", true);
    fireEvent.click(cancel);
    expect(signal.aborted).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Use my current location" }));
    await act(async () => { pending.resolve(position); });
    expect(screen.queryByRole("region", { name: "Nearby stops" })).toBeNull();
    expect(input.onSelect).not.toHaveBeenCalled();
  });

  it("does not let a cancelled request's late rejection replace a newer result", async () => {
    const oldRequest = deferred<CurrentLocation>();
    vi.mocked(requestCurrentLocation).mockReturnValueOnce(oldRequest.promise);
    render(<NearbyStops {...props()} />);
    await locate();
    fireEvent.click(screen.getByRole("button", { name: "Cancel location request" }));
    await locate();
    expect(resultButtons()).toHaveLength(3);
    await act(async () => { oldRequest.reject(new LocationError("denied")); });
    expect(resultButtons()).toHaveLength(3);
    expect(screen.queryByText(new LocationError("denied").message)).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel location request" })).toBeNull();
  });

  it("abandons a pending request on unmount and starts a later mount without a remembered location", async () => {
    const pending = deferred<CurrentLocation>();
    vi.mocked(requestCurrentLocation).mockReturnValueOnce(pending.promise);
    const input = props();
    const view = render(<NearbyStops {...input} />);
    await locate();
    const signal = vi.mocked(requestCurrentLocation).mock.calls[0][0]!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    render(<NearbyStops {...input} />);
    await act(async () => { pending.resolve(position); });
    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Nearby stops" })).toBeNull();
    expect(screen.getByRole("button", { name: "Use my current location" })).toBeTruthy();
    expect(input.onSelect).not.toHaveBeenCalled();
  });

  it("keeps a fix while the stop directory loads or fails, then retries the directory without asking for location again", async () => {
    const input = props();
    const view = render(<NearbyStops {...input} directory={undefined} directoryLoading />);
    await locate();
    expect(screen.getByText("Loading the official stop directory…")).toBeTruthy();
    view.rerender(<NearbyStops {...input} directory={undefined} directoryError="Directory unavailable" />);
    fireEvent.click(screen.getByRole("button", { name: "Retry nearby stop directory" }));
    expect(input.onRetryDirectory).toHaveBeenCalledTimes(1);
    view.rerender(<NearbyStops {...input} />);
    expect(resultButtons()).toHaveLength(3);
    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
    expect(input.onSelect).not.toHaveBeenCalled();
  });

  it("expires the one-time fix after ten minutes without tracking and needs an explicit update", async () => {
    const input = props();
    const view = render(<NearbyStops {...input} />);
    await locate();
    view.rerender(<NearbyStops {...input} now={NOW + 10 * 60_000} />);
    expect(resultButtons()).toHaveLength(3);
    view.rerender(<NearbyStops {...input} now={NOW + 10 * 60_000 + 1} />);
    expect(screen.queryByRole("region", { name: "Nearby stops" })).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/over 10 minutes old/);
    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
    vi.mocked(requestCurrentLocation).mockResolvedValueOnce({ ...position, capturedAt: NOW + 10 * 60_000 + 1 });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Update my location" }));
    });
    expect(resultButtons()).toHaveLength(3);
    expect(requestCurrentLocation).toHaveBeenCalledTimes(2);
  });

  it("offers a wider radius and name search when there are no nearby directory stops", async () => {
    vi.mocked(requestCurrentLocation).mockResolvedValueOnce({ ...position, latitude: -33.8688, longitude: 151.2093 });
    render(<NearbyStops {...props()} />);
    await locate();
    expect(resultButtons()).toHaveLength(0);
    expect(screen.getByText(/No train, tram or bus stops found within 2 km in the Melbourne directory/)).toBeTruthy();
    expect(screen.getByText(/Try a wider radius, another mode or search by name/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear location" }));
    expect(screen.queryByRole("region", { name: "Nearby stops" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Nearby transport mode" })).toBeNull();
    expect(screen.getByRole("button", { name: "Use my current location" })).toBeTruthy();
    expect(requestCurrentLocation).toHaveBeenCalledTimes(1);
  });
});
