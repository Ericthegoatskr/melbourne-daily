// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WeatherApp from "./WeatherApp";
import { fetchUV, fetchWeather, type WeatherData } from "./lib/weather";
import { melbourneDate } from "./lib/forecast";

vi.mock("./lib/weather", async (original) => ({
  ...(await original<typeof import("./lib/weather")>()),
  fetchWeather: vi.fn(),
  fetchUV: vi.fn(),
}));

const CLOCK = Date.parse("2026-11-07T00:15:00Z");
const iso = (time: number) => new Date(time).toISOString();

function weatherData(temperature = 21, at = CLOCK): WeatherData {
  const firstHour = Math.floor(at / 3_600_000) * 3_600_000;
  return {
    fetchedAt: iso(at),
    current: {
      time: iso(at),
      temperature,
      feelsLike: temperature - 1,
      windSpeed: 12,
      precipitation: 0,
      weatherCode: 2,
      isDay: true,
    },
    hourly: Array.from({ length: 72 }, (_, index) => ({
      time: iso(firstHour + index * 3_600_000),
      temperature: temperature + index % 5,
      rainProbability: 20,
      uvIndex: index === 2 ? null : 3,
      weatherCode: 2,
    })),
    daily: Array.from({ length: 3 }, (_, index) => ({
      date: melbourneDate(at + index * 86_400_000),
      min: 11 + index,
      max: 25 + index,
      rainProbability: 30 + index,
      uvMax: 7.3 + index,
      sunrise: iso(at + index * 86_400_000),
      sunset: iso(at + index * 86_400_000 + 36_000_000),
    })),
  };
}

function uvData(at = CLOCK, value = 0) {
  return { value, observedAt: iso(at), station: "Melbourne", fetchedAt: iso(at) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(CLOCK);
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/weather.html");
  vi.mocked(fetchWeather).mockResolvedValue(weatherData());
  vi.mocked(fetchUV).mockResolvedValue(uvData());
  // The dedicated weather page must not request parking, EPA or transit data.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected unrelated request")));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openWeather() {
  await act(async () => {
    render(<WeatherApp />);
  });
}

describe("dedicated weather dashboard data and interactions", () => {
  it("keeps measured UV zero separate from model forecasts and requests only its own feeds", async () => {
    await openWeather();
    expect(screen.getByRole("heading", { level: 1, name: "Weather for your Melbourne day." })).toBeTruthy();
    const weather = within(screen.getByRole("region", { name: "Current weather" }));
    const uv = within(screen.getByRole("region", { name: "UV index" }));
    expect(weather.getByText("Model estimate")).toBeTruthy();
    expect(weather.getByText("21", { exact: true })).toBeTruthy();
    expect(uv.getByRole("img", { name: "UV 0.0, Low" })).toBeTruthy();
    expect(uv.getByText(/This reading is the same for all suburbs/)).toBeTruthy();
    expect(uv.getByText("7.3", { exact: true })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Forecast hour" })).toBeTruthy();
    expect(fetchWeather).toHaveBeenCalledTimes(1);
    expect(fetchUV).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clears the old suburb while new weather loads, retaining the shared station observation", async () => {
    await openWeather();
    let resolveWeather!: (data: WeatherData) => void;
    vi.mocked(fetchWeather).mockImplementationOnce(() => new Promise((resolve) => {
      resolveWeather = resolve;
    }));
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "Choose your suburb" }), {
        target: { value: "richmond" },
      });
    });
    const weather = within(screen.getByRole("region", { name: "Current weather" }));
    expect(weather.queryByText("21", { exact: true })).toBeNull();
    expect(weather.getByText("Loading latest data")).toBeTruthy();
    expect(screen.getByRole("img", { name: "UV 0.0, Low" })).toBeTruthy();
    expect(vi.mocked(fetchWeather).mock.calls.at(-1)?.[0].id).toBe("richmond");
    expect(fetchUV).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("melbourne-daily:location")).toBe("richmond");
    await act(async () => {
      resolveWeather(weatherData(26));
    });
    expect(weather.getByText("26", { exact: true })).toBeTruthy();
  });

  it("expires UV before weather and never makes old source data fresh through repeated downloads", async () => {
    await openWeather();
    // Polling keeps returning the same source timestamps, not fresh observations.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16 * 60_000);
    });
    const weather = within(screen.getByRole("region", { name: "Current weather" }));
    const uv = within(screen.getByRole("region", { name: "UV index" }));
    expect(uv.queryByRole("img", { name: "UV 0.0, Low" })).toBeNull();
    expect(uv.getByText("UV observation has expired")).toBeTruthy();
    expect(weather.getByText("21", { exact: true })).toBeTruthy();
    expect(uv.getByText("7.3", { exact: true })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Forecast hour" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(75 * 60_000);
    });
    expect(weather.queryByText("21", { exact: true })).toBeNull();
    expect(weather.getByText("Weather data has expired")).toBeTruthy();
    expect(uv.queryByText("7.3", { exact: true })).toBeNull();
    expect(screen.queryByRole("slider", { name: "Forecast hour" })).toBeNull();
  });

  it("keeps weather usable during a UV source failure and retries both feeds on request", async () => {
    vi.mocked(fetchUV).mockRejectedValueOnce(new Error("Station unavailable"));
    await openWeather();
    expect(screen.getByText("UV is temporarily unavailable")).toBeTruthy();
    const weather = within(screen.getByRole("region", { name: "Current weather" }));
    expect(weather.getByText("21", { exact: true })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Forecast hour" })).toBeTruthy();
    const refresh = screen.getByRole("button", { name: "Refresh weather and UV" });
    expect(refresh.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(refresh);
    });
    expect(fetchWeather).toHaveBeenCalledTimes(2);
    expect(fetchUV).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("img", { name: "UV 0.0, Low" })).toBeTruthy();
    expect(screen.queryByText("UV is temporarily unavailable")).toBeNull();
  });

  it("moves today's model UV and daily forecast forward at Melbourne midnight without a download", async () => {
    const beforeMidnight = Date.parse("2026-11-07T12:59:45Z");
    vi.setSystemTime(beforeMidnight);
    vi.mocked(fetchWeather).mockResolvedValue(weatherData(21, beforeMidnight));
    vi.mocked(fetchUV).mockResolvedValue(uvData(beforeMidnight));
    await openWeather();
    const uv = within(screen.getByRole("region", { name: "UV index" }));
    const forecast = within(screen.getByRole("region", { name: "Forecast" }));
    fireEvent.click(forecast.getByRole("button", { name: "3-day forecast" }));
    expect(uv.getByText("7.3", { exact: true })).toBeTruthy();
    expect(within(forecast.getByText("Today").parentElement!).getByText("25°")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchWeather).toHaveBeenCalledTimes(1);
    expect(uv.queryByText("7.3", { exact: true })).toBeNull();
    expect(uv.getByText("8.3", { exact: true })).toBeTruthy();
    expect(within(forecast.getByText("Today").parentElement!).getByText("26°")).toBeTruthy();
    expect(forecast.queryByText("25°")).toBeNull();
  });
});
