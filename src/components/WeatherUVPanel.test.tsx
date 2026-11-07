import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WeatherUVPanel, { DaylightPanel } from "./WeatherUVPanel";
import { LOCATIONS, type WeatherData } from "../lib/weather";

afterEach(cleanup);
const now = Date.parse("2026-11-07T03:00:00.000Z");
const weather: WeatherData = {
  fetchedAt: new Date(now).toISOString(),
  current: { time: new Date(now).toISOString(), temperature: 20, feelsLike: 19, windSpeed: 8, precipitation: 0, weatherCode: 2, isDay: true },
  hourly: [null, 0, 8].map((uvIndex, index) => ({ time: new Date(now + index * 3_600_000).toISOString(), temperature: 20, rainProbability: 0, uvIndex, weatherCode: 2 })),
  daily: [{ date: "2026-11-07", min: 12, max: 22, rainProbability: 20, uvMax: 8, sunrise: "2026-11-06T19:00:00.000Z", sunset: "2026-11-07T08:00:00.000Z" }],
};

describe("weather panel derived displays", () => {
  it("keeps an unavailable hourly UV forecast distinct from a measured or modeled zero", () => {
    const { container } = render(<WeatherUVPanel
      uv={{ key: "uv", loading: false, data: { value: 0, observedAt: new Date(now).toISOString(), fetchedAt: new Date(now).toISOString(), station: "Melbourne" } }}
      weather={weather} location={LOCATIONS[0]} now={now} onRetry={() => {}}
    />);
    expect(screen.getByRole("img", { name: "UV 0.0, Low" })).toBeTruthy();
    const chart = screen.getByRole("img", { name: /Hourly model UV forecast/ });
    expect(within(chart).getByText("14:00: UV unavailable")).toBeTruthy();
    expect(within(chart).getByText("15:00: UV 0.0")).toBeTruthy();
    expect(container.querySelectorAll(".wx-uv-missing")).toHaveLength(1);
    expect(container.querySelectorAll(".wx-uv-zero")).toHaveLength(1);
  });

  it("derives daylight duration and phase from the selected day's actual instants", () => {
    const { rerender } = render(<DaylightPanel weather={weather} now={now} loading={false} onRetry={() => {}} />);
    expect(screen.getByRole("img", { name: "Daylight progress: Daylight hours. Sunrise 06:00, sunset 19:00." })).toBeTruthy();
    expect(document.querySelector(".wx-daylight-duration strong")?.textContent).toBe("13h 0m");
    rerender(<DaylightPanel weather={weather} now={Date.parse("2026-11-07T09:00:00.000Z")} loading={false} onRetry={() => {}} />);
    expect(screen.getByRole("img", { name: "Daylight progress: Sun has set. Sunrise 06:00, sunset 19:00." })).toBeTruthy();
  });

  it("does not reuse yesterday's sunrise and sunset after Melbourne midnight", () => {
    render(<DaylightPanel weather={weather} now={Date.parse("2026-11-07T13:30:00.000Z")} loading={false} onRetry={() => {}} />);
    expect(screen.getByText("Daylight forecast is unavailable")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Daylight progress/ })).toBeNull();
    expect(screen.queryByText("06:00")).toBeNull();
  });
});
