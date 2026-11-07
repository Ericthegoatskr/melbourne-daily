// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Forecast from "./Forecast";
import type { WeatherData } from "../lib/weather";

const NOW = Date.parse("2026-11-07T00:15:00Z");
const start = Math.floor(NOW / 3_600_000) * 3_600_000;
const data: WeatherData = {
  fetchedAt: new Date(NOW).toISOString(),
  current: { time: new Date(NOW).toISOString(), temperature: 18, feelsLike: 17, windSpeed: 12, precipitation: 0, weatherCode: 2, isDay: true },
  hourly: Array.from({ length: 24 }, (_, index) => ({
    time: new Date(start + index * 3_600_000).toISOString(),
    temperature: 18 + index / 2,
    rainProbability: index * 4,
    uvIndex: 3,
    weatherCode: 2,
  })),
  daily: [
    { date: "2026-11-07", min: 12, max: 24, rainProbability: 40, uvMax: 7.3, sunrise: "2026-11-06T19:00:00Z", sunset: "2026-11-07T09:00:00Z" },
    { date: "2026-11-08", min: 13, max: 26, rainProbability: 10, uvMax: 8.1, sunrise: "2026-11-07T19:00:00Z", sunset: "2026-11-08T09:00:00Z" },
  ],
};

afterEach(cleanup);

describe("interactive forecast", () => {
  it("lets the native keyboard/touch slider and hourly buttons select actual readings", () => {
    render(<Forecast data={data} now={NOW} />);
    const slider = screen.getByRole("slider", { name: "Forecast hour" });
    fireEvent.change(slider, { target: { value: "3" } });
    let output = within(screen.getByLabelText("Selected forecast hour"));
    expect(output.getByText("14:00")).toBeTruthy();
    expect(output.getByText("20°C")).toBeTruthy();
    expect(output.getByText("12%")).toBeTruthy();
    expect(slider.getAttribute("aria-valuetext")).toBe("14:00, 20 degrees Celsius, 12% chance of rain");
    fireEvent.click(screen.getByRole("button", { name: "16:00, 21 degrees, 20% chance of rain" }));
    output = within(screen.getByLabelText("Selected forecast hour"));
    expect(output.getByText("16:00")).toBeTruthy();
    expect(output.getByText("20%")).toBeTruthy();
    expect((slider as HTMLInputElement).value).toBe("5");
  });

  it("preserves the selected timestamp as the current hour advances, then drops expired selections", () => {
    const view = render(<Forecast data={data} now={NOW} />);
    fireEvent.change(screen.getByRole("slider", { name: "Forecast hour" }), { target: { value: "3" } });
    view.rerender(<Forecast data={data} now={NOW + 3_600_000} />);
    expect(within(screen.getByLabelText("Selected forecast hour")).getByText("14:00")).toBeTruthy();
    expect((screen.getByRole("slider", { name: "Forecast hour" }) as HTMLInputElement).value).toBe("2");
    view.rerender(<Forecast data={data} now={NOW + 4 * 3_600_000} />);
    expect(within(screen.getByLabelText("Selected forecast hour")).getByText("15:00")).toBeTruthy();
    expect((screen.getByRole("slider", { name: "Forecast hour" }) as HTMLInputElement).value).toBe("0");
  });

  it("does not draw invalid values when the forecast is exhausted, and still offers daily data", () => {
    const view = render(<Forecast data={{ ...data, hourly: [] }} now={NOW} />);
    expect(screen.getByText(/No upcoming hourly forecast/)).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(view.container.innerHTML).not.toContain("NaN");
    fireEvent.click(screen.getByRole("button", { name: "3-day forecast" }));
    expect(within(screen.getByText("Today").parentElement!).getByText("24°")).toBeTruthy();
    expect(screen.getByText("Tomorrow")).toBeTruthy();
  });
});
