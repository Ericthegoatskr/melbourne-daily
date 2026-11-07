// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AirApp from "./AirApp";
import { epaConfigured, fetchEpa, type EpaObservations, type EpaStation } from "./lib/epa";
import { fetchAir, type AirData } from "./lib/air";

vi.mock("./lib/epa", async (original) => ({
  ...(await original<typeof import("./lib/epa")>()),
  epaConfigured: vi.fn(),
  fetchEpa: vi.fn(),
}));
vi.mock("./lib/air", async (original) => ({
  ...(await original<typeof import("./lib/air")>()),
  fetchAir: vi.fn(),
}));

const CLOCK = Date.parse("2026-11-07T00:15:00Z");
const iso = (minutesAgo = 0) => new Date(CLOCK - minutesAgo * 60_000).toISOString();
function station(overrides: Partial<EpaStation> = {}): EpaStation {
  return {
    id: "near-site",
    name: "Nearby test site",
    latitude: -37.8136,
    longitude: 144.9631,
    category: { value: "Good", observedAt: iso(30) },
    pm25: { value: 0, unit: "µg/m³", averagingPeriod: "1h", observedAt: iso(30) },
    pm10: null,
    ...overrides,
  };
}
const further = () => station({
  id: "far-site",
  name: "Further reporting site",
  longitude: 144.98,
  category: { value: "Fair", observedAt: iso(20) },
  pm25: { value: 12, unit: "µg/m³", averagingPeriod: "1h", observedAt: iso(20) },
});
const snapshot = (stations = [station(), further()], fetchedAt = iso()): EpaObservations => ({
  source: "EPA Victoria", fetchedAt, stations,
});
const model = (): AirData => ({ fetchedAt: iso(), modelTime: iso(), pm25: 12.3, pm10: 24.6 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(CLOCK);
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/air.html");
  vi.mocked(epaConfigured).mockReturnValue(true);
  vi.mocked(fetchEpa).mockResolvedValue(snapshot());
  vi.mocked(fetchAir).mockResolvedValue(model());
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected unrelated request")));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openAir() {
  await act(async () => { render(<AirApp />); });
}
const status = () => within(screen.getByRole("region", { name: "EPA station status" }));
const pm25 = () => within(screen.getByRole("region", { name: "PM2.5 station measurement" }));
const pm10 = () => within(screen.getByRole("region", { name: "PM10 station measurement" }));
const regional = () => within(screen.getByRole("region", { name: "Regional model estimate" }));
async function refresh() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh air quality" })); });
}

describe("dedicated EPA air dashboard data and interactions", () => {
  it("keeps measured zero, missing pollutants and the regional model separate", async () => {
    await openAir();
    expect(within(screen.getByRole("navigation", { name: "Dashboard series" })).getByRole("link", { name: "Air quality", current: "page" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Air quality, closer to home." })).toBeTruthy();
    expect(status().getByText("Good", { exact: true })).toBeTruthy();
    expect(pm25().getByText("0.0", { exact: true })).toBeTruthy();
    expect(pm25().getByText("1-hour mean", { exact: true })).toBeTruthy();
    expect(pm10().getByText(/Unavailable/i)).toBeTruthy();
    expect(regional().getByText("12.3", { exact: true })).toBeTruthy();
    expect(regional().getByText("24.6", { exact: true })).toBeTruthy();
    expect(fetchEpa).toHaveBeenCalledTimes(1);
    expect(fetchAir).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetchEpa).mockResolvedValue(snapshot([station({ category: null })], iso(-1)));
    await refresh();
    expect(status().queryByText("Good", { exact: true })).toBeNull();
    expect(pm25().getByText("0.0", { exact: true })).toBeTruthy();
    expect(regional().getByText("12.3", { exact: true })).toBeTruthy();
  });

  it("filters stations, lets the reader select one and returns to the nearest reporting site", async () => {
    await openAir();
    const search = screen.getByRole("searchbox", { name: "Find an EPA station" });
    fireEvent.change(search, { target: { value: "Further" } });
    expect(screen.queryByRole("button", { name: "View Nearby test site" })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "View Further reporting site" })); });
    expect(status().getByText("Fair", { exact: true })).toBeTruthy();
    expect(pm25().getByText("12.0", { exact: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View Further reporting site" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use nearest station" })); });
    expect(status().getByText("Good", { exact: true })).toBeTruthy();
    expect(pm25().getByText("0.0", { exact: true })).toBeTruthy();
    expect(fetchEpa).toHaveBeenCalledTimes(1);
  });

  it("clears the previous suburb and station while a new location request is pending", async () => {
    await openAir();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "View Further reporting site" })); });
    let resolveEpa!: (value: EpaObservations) => void;
    vi.mocked(fetchEpa).mockImplementationOnce(() => new Promise((resolve) => { resolveEpa = resolve; }));
    vi.mocked(fetchAir).mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "Choose your suburb" }), { target: { value: "box-hill" } });
    });
    expect(status().queryByText("Fair", { exact: true })).toBeNull();
    expect(pm25().queryByText("12.0", { exact: true })).toBeNull();
    expect(regional().queryByText("12.3", { exact: true })).toBeNull();
    expect(localStorage.getItem("melbourne-daily:location")).toBe("box-hill");
    expect(vi.mocked(fetchEpa).mock.calls.at(-1)?.[0].longitude).toBe(145.125);
    await act(async () => {
      resolveEpa(snapshot([station({ id: "eastern", name: "Eastern test site", latitude: -37.817, longitude: 145.125 })]));
    });
    expect(status().getByText("Good", { exact: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View Eastern test site" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("expires each observation separately despite repeated downloads of the same snapshot", async () => {
    vi.mocked(fetchEpa).mockResolvedValue(snapshot([station({
      category: { value: "Good", observedAt: iso(170) },
      pm10: { value: 8.5, unit: "µg/m³", averagingPeriod: "1h", observedAt: iso(175) },
    })]));
    await openAir();
    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60_000); });
    expect(pm10().queryByText("8.5", { exact: true })).toBeNull();
    expect(pm25().getByText("0.0", { exact: true })).toBeTruthy();
    expect(status().getByText("Good", { exact: true })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(status().queryByText("Good", { exact: true })).toBeNull();
    expect(pm25().getByText("0.0", { exact: true })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(140 * 60_000); });
    expect(pm25().queryByText("0.0", { exact: true })).toBeNull();
    expect(regional().getByText("12.3", { exact: true })).toBeTruthy();
  });

  it("clears a withdrawn selected site's readings from a newer complete snapshot", async () => {
    await openAir();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "View Further reporting site" })); });
    vi.mocked(fetchEpa).mockResolvedValue(snapshot([station(), further()].map((site) => ({ ...site, category: null, pm25: null, pm10: null })), iso(-1)));
    await refresh();
    expect(status().queryByText("Fair", { exact: true })).toBeNull();
    expect(status().queryByText("Good", { exact: true })).toBeNull();
    expect(pm25().queryByText("12.0", { exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "View Further reporting site" })).toBeNull();
    expect(regional().getByText("12.3", { exact: true })).toBeTruthy();
  });

  it("keeps the regional model usable when EPA fails and can recover through refresh", async () => {
    vi.mocked(fetchEpa).mockRejectedValueOnce(new Error("EPA unavailable"));
    await openAir();
    expect(status().queryByText("Good", { exact: true })).toBeNull();
    expect(pm25().queryByText("0.0", { exact: true })).toBeNull();
    expect(regional().getByText("12.3", { exact: true })).toBeTruthy();
    await refresh();
    expect(status().getByText("Good", { exact: true })).toBeTruthy();
    expect(pm25().getByText("0.0", { exact: true })).toBeTruthy();
  });

  it("keeps official EPA measurements usable when the regional model fails", async () => {
    vi.mocked(fetchAir).mockRejectedValueOnce(new Error("Model unavailable"));
    await openAir();
    expect(status().getByText("Good", { exact: true })).toBeTruthy();
    expect(pm25().getByText("0.0", { exact: true })).toBeTruthy();
    expect(regional().queryByText("12.3", { exact: true })).toBeNull();
  });
});
