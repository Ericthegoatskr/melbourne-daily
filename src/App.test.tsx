// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fetchUV, fetchWeather, type WeatherData } from "./lib/weather";
import { fetchParking, type ParkingData } from "./lib/parking";
import { fetchAir, type AirData } from "./lib/air";
import entryHtml from "../index.html?raw";

vi.mock("./lib/weather", async (original) => ({
  ...(await original<typeof import("./lib/weather")>()),
  fetchWeather: vi.fn(),
  fetchUV: vi.fn(),
}));
vi.mock("./lib/parking", async (original) => ({
  ...(await original<typeof import("./lib/parking")>()),
  fetchParking: vi.fn(),
}));
vi.mock("./lib/air", async (original) => ({
  ...(await original<typeof import("./lib/air")>()),
  fetchAir: vi.fn(),
}));

const clock = Date.now();
const iso = (milliseconds: number) => new Date(milliseconds).toISOString();
const date = (milliseconds: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(milliseconds);

function weatherData(temperature = 16, at = clock): WeatherData {
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
    hourly: Array.from({ length: 48 }, (_, i) => ({
      time: iso(firstHour + i * 3_600_000),
      temperature: temperature + (i % 5),
      rainProbability: 20,
      uvIndex: 3,
      weatherCode: 2,
    })),
    daily: Array.from({ length: 3 }, (_, i) => ({
      date: date(at + i * 86_400_000),
      min: 11,
      max: 20 + i,
      rainProbability: 30 + i,
      uvMax: 7.3 + i,
      sunrise: iso(at + i * 86_400_000),
      sunset: iso(at + i * 86_400_000 + 36_000_000),
    })),
  };
}

const parkingData = (): ParkingData => ({
  fetchedAt: iso(clock),
  observedAt: iso(clock),
  total: 6000,
  reporting: 5400,
  available: 1234,
  occupied: 4166,
  unknown: 600,
  streets: [
    {
      name: "Lygon Street",
      available: 38,
      total: 70,
      latitude: -37.8,
      longitude: 144.967,
    },
  ],
});
const airData = (): AirData => ({
  fetchedAt: iso(clock),
  modelTime: iso(clock),
  pm25: 4.2,
  pm10: 8.5,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(fetchWeather).mockResolvedValue(weatherData());
  vi.mocked(fetchUV).mockResolvedValue({
    value: 0,
    observedAt: iso(clock),
    station: "Melbourne",
    fetchedAt: iso(clock),
  });
  vi.mocked(fetchParking).mockResolvedValue(parkingData());
  vi.mocked(fetchAir).mockResolvedValue(airData());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openApp() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<App />);
  });
  return view;
}

describe("dashboard interactions and data honesty", () => {
  it("uses Australian English in document metadata, visible content and accessible labels", async () => {
    const { container } = await openApp();
    expect(entryHtml).toMatch(/<html lang="en-AU">/);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your Melbourne day, in one place.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Choose your suburb" }),
    ).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/\p{Script=Han}/u);
    expect(entryHtml).not.toMatch(/\p{Script=Han}/u);
  });

  it("distinguishes modeled conditions, measured UV zero, and valid parking counts", async () => {
    await openApp();
    const weather = within(screen.getByRole("region", { name: "Weather" }));
    const uv = within(screen.getByRole("region", { name: "UV index" }));
    const parking = within(
      screen.getByRole("region", { name: "Street parking" }),
    );
    expect(weather.getByText("Model estimate")).toBeTruthy();
    expect(weather.getByText(/Feels like 15°/)).toBeTruthy();
    expect(uv.getByText("Observed")).toBeTruthy();
    expect(uv.getByRole("img", { name: "UV 0.0, Low" })).toBeTruthy();
    expect(
      uv.getByText(/This reading is the same for all suburbs./),
    ).toBeTruthy();
    expect(parking.getByText("1,234")).toBeTruthy();
    const glance = within(screen.getByRole("region", { name: "At a glance" }));
    expect(glance.getByText("1,234")).toBeTruthy();
    expect(glance.getByText("0.0")).toBeTruthy();
    expect(glance.getByText("Regional PM2.5 estimate")).toBeTruthy();
    expect(glance.getByText(/CAMS model · valid/)).toBeTruthy();
    expect(screen.getByText("4 data feeds available")).toBeTruthy();
  });

  it("clears old local weather while a new suburb loads and persists the selection", async () => {
    await openApp();
    let resolveWeather!: (data: WeatherData) => void;
    let resolveAir!: (data: AirData) => void;
    vi.mocked(fetchWeather).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWeather = resolve;
        }),
    );
    vi.mocked(fetchAir).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAir = resolve;
        }),
    );
    await act(async () => {
      fireEvent.change(
        screen.getByRole("combobox", { name: "Choose your suburb" }),
        { target: { value: "richmond" } },
      );
    });
    const weather = within(screen.getByRole("region", { name: "Weather" }));
    expect(weather.getByText("Richmond")).toBeTruthy();
    expect(weather.queryByText(/Feels like 15°/)).toBeNull();
    expect(weather.getByText("Loading latest data")).toBeTruthy();
    expect(vi.mocked(fetchWeather).mock.calls.at(-1)?.[0].id).toBe("richmond");
    expect(vi.mocked(fetchUV)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchParking)).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("melbourne-daily:location")).toBe("richmond");
    await act(async () => {
      resolveWeather(weatherData(22));
      resolveAir(airData());
    });
    expect(weather.getByText(/Feels like 21°/)).toBeTruthy();
  });

  it("switches between 24-hour and daily forecasts", async () => {
    await openApp();
    expect(
      screen.getByRole("region", {
        name: "24-hour forecast, scroll horizontally",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "3-day forecast" }));
    expect(
      screen
        .getByRole("button", { name: "3-day forecast" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.queryByRole("region", {
        name: "24-hour forecast, scroll horizontally",
      }),
    ).toBeNull();
    expect(within(screen.getByRole("region", { name: "Weather" })).getByText("Today")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Weather" })).getByText("Tomorrow")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "24 hours" }));
    expect(
      screen.getByRole("region", {
        name: "24-hour forecast, scroll horizontally",
      }),
    ).toBeTruthy();
  });

  it("rolls today’s temperature and UV forecast forward at Melbourne midnight without a new download", async () => {
    const beforeMidnight = Date.parse("2026-11-07T12:59:45Z"); // 23:59:45 AEDT
    vi.setSystemTime(beforeMidnight);
    vi.mocked(fetchWeather).mockResolvedValue(weatherData(16, beforeMidnight));
    await openApp();
    const uv = within(screen.getByRole("region", { name: "UV index" }));
    const weather = within(screen.getByRole("region", { name: "Weather" }));
    fireEvent.click(weather.getByRole("button", { name: "3-day forecast" }));
    expect(uv.getByText("7.3")).toBeTruthy();
    expect(
      within(weather.getByText("Today").parentElement!).getByText("20°"),
    ).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetchWeather)).toHaveBeenCalledTimes(1);
    expect(uv.queryByText("7.3")).toBeNull();
    expect(uv.getByText("8.3")).toBeTruthy();
    expect(
      within(weather.getByText("Today").parentElement!).getByText("21°"),
    ).toBeTruthy();
    expect(weather.queryByText("20°")).toBeNull();
    expect(
      within(weather.getByText("Tomorrow").parentElement!).getByText("22°"),
    ).toBeTruthy();
  });

  it("keeps transport favorites after remount and lets users remove a favorite", async () => {
    const view = await openApp();
    fireEvent.click(
      screen.getByRole("button", { name: "Pin Tram service changes" }),
    );
    expect(
      JSON.parse(localStorage.getItem("melbourne-daily:transport-favorites")!),
    ).toContain("trams");
    view.unmount();
    await openApp();
    expect(
      screen
        .getByRole("button", { name: "Unpin Tram service changes" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: "Unpin Tram service changes" }),
    );
    expect(
      JSON.parse(localStorage.getItem("melbourne-daily:transport-favorites")!),
    ).not.toContain("trams");
  });

  it("keeps keyboard focus inside the open navigation and restores focus when Escape closes it", async () => {
    await openApp();
    const menuButton = screen.getByRole("button", { name: "Open menu" });
    menuButton.focus();
    fireEvent.click(menuButton);
    const drawer = screen.getByRole("dialog", { name: "Main navigation" });
    const closeButton = within(drawer).getByRole("button", {
      name: "Close navigation",
    });
    expect(document.activeElement).toBe(closeButton);
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(
      within(drawer).getByRole("link", { name: /^View on GitHub/ }),
    );
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Main navigation" }),
    ).toBeNull();
    expect(document.activeElement).toBe(menuButton);
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens actual official services and preserves the existing parking dashboard", async () => {
    await openApp();
    const destinations: Array<[RegExp, string]> = [
      [/^Next departures/, "https://transport.vic.gov.au/departures"],
      [/^Network status/, "https://networkstatus.ptv.vic.gov.au/"],
      [/^Tram service changes/, "https://yarratrams.com.au/service-changes"],
      [
        /^EPA station readings/,
        "https://www.epa.vic.gov.au/check-air-and-water-quality",
      ],
      [
        /^Open the full parking map/,
        "https://ericthegoatskr.github.io/melbourne-parking-dashboard/",
      ],
    ];
    for (const [name, href] of destinations) {
      for (const link of screen.getAllByRole("link", { name })) {
        expect(link.getAttribute("href")).toBe(href);
        expect(link.getAttribute("target")).toBe("_blank");
        expect(link.getAttribute("rel")).toContain("noopener");
      }
    }
    expect(screen.getByRole("link", { name: "Open PTV transport dashboard" }).getAttribute("href"))
      .toBe(`${import.meta.env.BASE_URL}transport.html`);
  });

  it("ages out UV and parking numbers even when repeated downloads have an old source timestamp", async () => {
    await openApp();
    expect(screen.getByLabelText("UV 0.0, Low")).toBeTruthy();
    expect(screen.getAllByText("1,234")).toHaveLength(2);
    // Mocks keep returning the original source timestamp, despite a later fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16 * 60_000);
    });
    expect(screen.queryByLabelText("UV 0.0, Low")).toBeNull();
    expect(screen.queryAllByText("1,234")).toHaveLength(0);
    const glance = within(screen.getByRole("region", { name: "At a glance" }));
    expect(glance.queryByText("0.0")).toBeNull();
    expect(glance.getByText("Melbourne station awaiting data")).toBeTruthy();
    expect(screen.getByText("UV observation has expired")).toBeTruthy();
    expect(
      screen.getByText("Parking data has expired; counts are hidden"),
    ).toBeTruthy();
    expect(screen.getByText(/Feels like 15°/)).toBeTruthy();
    expect(screen.getByText("Some feeds unavailable")).toBeTruthy();
  });

  it("shows a source failure independently while keeping working modules usable", async () => {
    vi.mocked(fetchUV).mockRejectedValue(new Error("Station unavailable"));
    await openApp();
    expect(screen.getByText("UV is temporarily unavailable")).toBeTruthy();
    expect(screen.getAllByText("1,234")).toHaveLength(2);
    expect(screen.getByText(/Feels like 15°/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Refresh" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});
