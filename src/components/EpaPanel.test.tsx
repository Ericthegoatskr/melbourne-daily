import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EpaPanel from "./EpaPanel";
import { apiConfigured } from "../lib/api";
import { fetchEpa, type EpaObservations, type EpaStation } from "../lib/epa";

vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  apiConfigured: vi.fn(),
}));
vi.mock("../lib/epa", async (original) => ({
  ...(await original<typeof import("../lib/epa")>()),
  fetchEpa: vi.fn(),
}));

const now = Date.parse("2026-11-06T18:30:00Z");
const iso = (minutesAgo: number) =>
  new Date(now - minutesAgo * 60_000).toISOString();
const location = {
  name: "Melbourne CBD",
  latitude: -37.8136,
  longitude: 144.9631,
};
function station(overrides: Partial<EpaStation> = {}): EpaStation {
  return {
    id: "near-site",
    name: "Nearby test site",
    latitude: -37.8136,
    longitude: 144.9631,
    category: { value: "Good", observedAt: iso(30) },
    pm25: {
      value: 0,
      unit: "µg/m³",
      observedAt: iso(30),
      averagingPeriod: "1h",
    },
    pm10: {
      value: 8.5,
      unit: "µg/m³",
      observedAt: iso(30),
      averagingPeriod: "1h",
    },
    ...overrides,
  };
}
const data = (stations = [station()]): EpaObservations => ({
  source: "EPA Victoria",
  fetchedAt: iso(0),
  stations,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  vi.mocked(apiConfigured).mockReturnValue(true);
  vi.mocked(fetchEpa).mockResolvedValue(data());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function open() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<EpaPanel location={location} now={now} revision={0} />);
  });
  return view;
}

describe("EPA station observation panel", () => {
  it("makes no request without a connected service and keeps the official source available", async () => {
    vi.mocked(apiConfigured).mockReturnValue(false);
    await open();
    expect(fetchEpa).not.toHaveBeenCalled();
    expect(
      screen.getByText("EPA station readings are currently unavailable."),
    ).toBeTruthy();
    expect(screen.queryByText("Good")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: /Check EPA AirWatch/ })
        .getAttribute("href"),
    ).toBe("https://www.epa.vic.gov.au/check-air-and-water-quality");
    expect(document.body.textContent).not.toMatch(
      /API key|not configured|VITE_/,
    );
  });

  it("shows observed zero, site distance, category and per-field times", async () => {
    await open();
    expect(screen.getByText("Nearby test site")).toBeTruthy();
    expect(screen.getByText("About 0.0 km from Melbourne CBD")).toBeTruthy();
    expect(screen.getByText("Good")).toBeTruthy();
    const pm25 = within(
      screen.getByRole("group", { name: "PM2.5 station measurement" }),
    );
    expect(pm25.getByText("0.0")).toBeTruthy();
    expect(pm25.getByText("1-hour mean")).toBeTruthy();
    expect(pm25.getByText(/Hour ending 05:00/)).toBeTruthy();
    const official = new URL(
      screen
        .getByRole("link", { name: /View this station at EPA/ })
        .getAttribute("href")!,
    );
    expect(official.searchParams.get("site")).toBe("air|near-site");
  });

  it("expires one pollutant independently and selects the next reporting site as time passes", async () => {
    const near = station({
      pm10: {
        value: 8.5,
        unit: "µg/m³",
        observedAt: iso(181),
        averagingPeriod: "1h",
      },
    });
    const further = station({
      id: "further",
      name: "Further reporting site",
      longitude: 144.98,
      category: null,
      pm25: null,
      pm10: {
        value: 5,
        unit: "µg/m³",
        observedAt: iso(0),
        averagingPeriod: "1h",
      },
    });
    vi.mocked(fetchEpa).mockResolvedValue(data([near, further]));
    const view = await open();
    expect(
      within(
        screen.getByRole("group", { name: "PM10 station measurement" }),
      ).getByText("Unavailable"),
    ).toBeTruthy();
    expect(screen.getByText("Nearby test site")).toBeTruthy();
    view.rerender(
      <EpaPanel location={location} now={now + 151 * 60_000} revision={0} />,
    );
    expect(screen.getByText("Further reporting site")).toBeTruthy();
    expect(screen.getByText("About 1.5 km from Melbourne CBD")).toBeTruthy();
    expect(screen.queryByText("Good")).toBeNull();
    expect(fetchEpa).toHaveBeenCalledTimes(1);
  });

  it("replaces cached Good when a newer source snapshot withdraws its observations", async () => {
    const view = await open();
    expect(screen.getByText("Good")).toBeTruthy();
    vi.mocked(fetchEpa).mockResolvedValue({
      ...data([station({ category: null, pm25: null, pm10: null })]),
      fetchedAt: iso(-5),
    });
    await act(async () => {
      view.rerender(
        <EpaPanel location={location} now={now + 5 * 60_000} revision={1} />,
      );
    });
    expect(screen.queryByText("Good")).toBeNull();
    expect(screen.queryByText("0.0")).toBeNull();
    expect(
      screen.getByText("EPA station readings are currently unavailable."),
    ).toBeTruthy();
  });

  it("does not reuse the previous suburb's station while a new request is pending", async () => {
    const view = await open();
    vi.mocked(fetchEpa).mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => {
      view.rerender(
        <EpaPanel
          location={{ name: "Box Hill", latitude: -37.817, longitude: 145.125 }}
          now={now}
          revision={0}
        />,
      );
    });
    expect(screen.queryByText("Nearby test site")).toBeNull();
    expect(
      screen.getByText("Checking nearby EPA monitoring stations…"),
    ).toBeTruthy();
  });
});
