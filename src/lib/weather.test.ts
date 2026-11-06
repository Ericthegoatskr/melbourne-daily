// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchUV,
  fetchWeather,
  LOCATIONS,
  parseUV,
  parseWeather,
  weatherLabel,
} from "./weather";

const fetchedAt = "2026-11-06T17:22:00.000Z";
const midnight = Date.parse("2026-11-06T13:00:00.000Z") / 1000;

function weatherFixture() {
  return {
    timezone: "Australia/Melbourne",
    current_units: {
      time: "unixtime",
      temperature_2m: "°C",
      apparent_temperature: "°C",
      wind_speed_10m: "km/h",
      precipitation: "mm",
    },
    hourly_units: {
      time: "unixtime",
      temperature_2m: "°C",
      precipitation_probability: "%",
    },
    daily_units: {
      time: "unixtime",
      temperature_2m_min: "°C",
      temperature_2m_max: "°C",
      precipitation_probability_max: "%",
      sunrise: "unixtime",
      sunset: "unixtime",
    },
    current: {
      time: midnight + 15_300,
      temperature_2m: 10.3,
      apparent_temperature: 7.7,
      wind_speed_10m: 13.5,
      precipitation: 0,
      weather_code: 3,
      is_day: 0,
    },
    hourly: {
      time: Array.from({ length: 48 }, (_, index) => midnight + index * 3600),
      temperature_2m: Array<number | null>(48).fill(10.3),
      precipitation_probability: Array<number>(48).fill(20),
      uv_index: Array<number | null>(48).fill(0),
      weather_code: Array<number>(48).fill(3),
    },
    daily: {
      time: [midnight, midnight + 86400],
      temperature_2m_min: [9.4, 9.6],
      temperature_2m_max: [13, 15.8],
      precipitation_probability_max: [100, 7],
      uv_index_max: [7.35, 8.3],
      sunrise: [midnight + 22000, midnight + 86400 + 21900],
      sunset: [midnight + 72000, midnight + 86400 + 72100],
    },
  };
}

function uvFixture(value = "0.0", utc = "2026/11/06 17:21", status = "ok") {
  return `\uFEFF<?xml version="1.0"?><stations><location id="Sydney"><index>7.0</index></location><location id="Melbourne"><name>mel</name><index>${value}</index><time>3:21 AM</time><date>7/11/2026</date><utcdatetime>${utc}</utcdatetime><status>${status}</status></location></stations>`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("weather model parsing", () => {
  it("keeps UTC instants and Melbourne daily dates independent of the viewer timezone", () => {
    const data = parseWeather(weatherFixture(), fetchedAt);
    expect(data.current).toEqual({
      time: "2026-11-06T17:15:00.000Z",
      temperature: 10.3,
      feelsLike: 7.7,
      windSpeed: 13.5,
      precipitation: 0,
      weatherCode: 3,
      isDay: false,
    });
    expect(data.daily[0].date).toBe("2026-11-07");
    expect(data.hourly[0].time).toBe("2026-11-06T13:00:00.000Z");
    expect(data.fetchedAt).toBe(fetchedAt);
  });

  it("preserves zero and unavailable UV separately", () => {
    const payload = weatherFixture();
    payload.hourly.uv_index[1] = null;
    const data = parseWeather(payload, fetchedAt);
    expect(data.hourly[0].uvIndex).toBe(0);
    expect(data.hourly[1].uvIndex).toBeNull();
  });

  it("rejects a truncated hourly array instead of misaligning timestamps", () => {
    const payload = weatherFixture();
    payload.hourly.temperature_2m.pop();
    expect(() => parseWeather(payload)).toThrow("Incomplete");
  });

  it("rejects missing temperature values instead of displaying zero", () => {
    const payload = weatherFixture();
    payload.hourly.temperature_2m[0] = null;
    expect(() => parseWeather(payload)).toThrow("Invalid weather value");
  });

  it("rejects wrong units and out-of-range rain probability", () => {
    const wrongUnits = weatherFixture();
    wrongUnits.current_units.wind_speed_10m = "mph";
    expect(() => parseWeather(wrongUnits)).toThrow("Unexpected weather units");
    const wrongRain = weatherFixture();
    wrongRain.hourly.precipitation_probability[0] = 101;
    expect(() => parseWeather(wrongRain)).toThrow("Invalid weather value");
  });

  it("rejects duplicate timestamps, invalid weather codes, and reversed extremes", () => {
    const duplicate = weatherFixture();
    duplicate.hourly.time[1] = duplicate.hourly.time[0];
    expect(() => parseWeather(duplicate)).toThrow("out of order");
    const code = weatherFixture();
    code.current.weather_code = 4;
    expect(() => parseWeather(code)).toThrow("Invalid weather code");
    const reversed = weatherFixture();
    reversed.daily.temperature_2m_min[0] = 30;
    expect(() => parseWeather(reversed)).toThrow("minimum exceeds maximum");
  });

  it("does not invent a known weather label for unknown codes", () => {
    expect(weatherLabel(0)).toBe("Clear");
    expect(weatherLabel(999)).toBe("Weather unavailable");
  });
});

describe("UV station observations", () => {
  it("uses the UTC field, accepts UTF-8 BOM and retains legitimate nighttime zero", () => {
    expect(parseUV(uvFixture(), fetchedAt)).toEqual({
      value: 0,
      observedAt: "2026-11-06T17:21:00.000Z",
      station: "Melbourne",
      fetchedAt,
    });
  });

  it.each(["", "null", "-1", "NaN", "31"])(
    "rejects invalid UV value %s",
    (value) => {
      expect(() => parseUV(uvFixture(value), fetchedAt)).toThrow();
    },
  );

  it("rejects an unhealthy station and malformed XML", () => {
    expect(() =>
      parseUV(uvFixture("1.2", "2026/11/06 17:21", "offline"), fetchedAt),
    ).toThrow("not reporting");
    expect(() => parseUV("<stations><location></stations>", fetchedAt)).toThrow(
      "Invalid UV data format",
    );
  });

  it("rejects impossible or future timestamps", () => {
    expect(() =>
      parseUV(uvFixture("1.2", "2026/02/30 17:21"), fetchedAt),
    ).toThrow("Invalid UV observation date");
    expect(() =>
      parseUV(uvFixture("1.2", "2026/11/06 17:25"), fetchedAt),
    ).toThrow("in the future");
  });

  it("retains old observations with their actual time so the UI can show stale status", () => {
    expect(
      parseUV(uvFixture("4.5", "2026/11/05 17:21"), fetchedAt).observedAt,
    ).toBe("2026-11-05T17:21:00.000Z");
  });
});

describe("source requests", () => {
  it("sends the selected coordinates and explicit units without API credentials", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(weatherFixture()), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    await fetchWeather(LOCATIONS[1]);
    const url = new URL(fetch.mock.calls[0][0] as string);
    expect(url.searchParams.get("latitude")).toBe(
      String(LOCATIONS[1].latitude),
    );
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(url.searchParams.get("timezone")).toBe("Australia/Melbourne");
    expect(fetch.mock.calls[0][1].credentials).toBe("omit");
  });

  it("reports HTTP failures instead of parsing the error as observations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );
    await expect(fetchUV()).rejects.toThrow("503");
  });

  it("forwards cancellation to the network request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn().mockImplementation((_url, init: RequestInit) => {
      expect(init.signal?.aborted).toBe(true);
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    });
    vi.stubGlobal("fetch", fetch);
    await expect(fetchUV(controller.signal)).rejects.toThrow("Aborted");
  });
});
