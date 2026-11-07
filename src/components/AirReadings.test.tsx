import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EPA_CATEGORIES } from "../../shared/epa";
import type { NearbyEpaStation } from "../lib/epa";
import { LOCATIONS } from "../lib/weather";
import { CategoryCard, PollutantCard, RegionalAirCard } from "./AirReadings";

const now = Date.parse("2026-11-07T02:00:00Z");
const iso = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const location = LOCATIONS[0];
const station: NearbyEpaStation = {
  id: "test-site",
  name: "Test monitoring site",
  latitude: location.latitude,
  longitude: location.longitude,
  distanceKm: 1.3,
  category: null,
  pm25: { value: 0, observedAt: iso(30), unit: "µg/m³", averagingPeriod: "1h" },
  pm10: null,
};

afterEach(cleanup);

describe("air dashboard readings", () => {
  it("does not infer an EPA category from a valid zero pollutant reading", () => {
    render(<CategoryCard station={station} location={location} now={now} loading={false} refreshing={false} onRetry={vi.fn()} isNearest />);
    expect(screen.getByText("Category unavailable")).toBeTruthy();
    expect(screen.queryByText("Good")).toBeNull();
    const official = new URL(screen.getByRole("link", { name: /View this station at EPA/ }).getAttribute("href")!);
    expect(official.searchParams.get("site")).toBe("air|test-site");
  });

  it.each(EPA_CATEGORIES)("keeps the provider category wording: %s", (value) => {
    render(<CategoryCard station={{ ...station, category: { value, observedAt: iso(30) } }} location={location} now={now} loading={false} refreshing={false} onRetry={vi.fn()} isNearest={false} />);
    expect(screen.getByText(value)).toBeTruthy();
    expect(screen.getByText("SELECTED REPORTING STATION")).toBeTruthy();
  });

  it("renders measured zero with its own hourly timestamp and keeps missing PM10 unavailable", () => {
    render(<>
      <PollutantCard label="PM2.5" reading={station.pm25} stationName={station.name} now={now} refreshing={false} />
      <PollutantCard label="PM10" reading={station.pm10} stationName={station.name} now={now} refreshing={false} />
    </>);
    const fine = within(screen.getByRole("region", { name: "PM2.5 station measurement" }));
    expect(fine.getByText("0.0")).toBeTruthy();
    expect(fine.getByText("1-hour mean")).toBeTruthy();
    expect(fine.getByText(/Hour ending 12:30/)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "PM10 station measurement" })).getByText("Unavailable")).toBeTruthy();
  });

  it("hides expired model values without presenting them as EPA readings", () => {
    render(<RegionalAirCard resource={{ key: "air", loading: false, data: { modelTime: iso(181), fetchedAt: iso(0), pm25: 12.3, pm10: 20.5 } }} location={location} now={now} onRetry={vi.fn()} />);
    expect(screen.getByText("Air quality estimate has expired")).toBeTruthy();
    expect(screen.queryByText("12.3")).toBeNull();
    expect(screen.queryByText("20.5")).toBeNull();
    expect(screen.getByText(/not an EPA measurement/)).toBeTruthy();
  });
});
