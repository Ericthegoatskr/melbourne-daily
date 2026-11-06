import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import snapshot from "../../public/data/transport-stops.json";
import type { StopDirectory } from "./stopDirectory";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("BASE_URL", "/melbourne-daily/");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("official static stop directory", () => {
  it("accepts the committed source snapshot with real, distinct train and tram boarding records", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(snapshot)));
    const { fetchStopDirectory } = await import("./stopDirectory");
    const result = await fetchStopDirectory();
    expect(result.stops.length).toBeGreaterThan(1_000);
    expect(
      result.stops.filter((stop) => stop.mode === "train").length,
    ).toBeGreaterThan(100);
    expect(
      result.stops.filter((stop) => stop.mode === "tram").length,
    ).toBeGreaterThan(500);
    expect(
      new Set(result.stops.map((stop) => `${stop.mode}:${stop.id}`)).size,
    ).toBe(result.stops.length);
    expect(
      result.stops.every(
        (stop) => stop.idScheme === "gtfs" && Number.isSafeInteger(stop.id),
      ),
    ).toBe(true);
    expect(result.stops.some((stop) => /Platform \d/.test(stop.name))).toBe(
      true,
    );
    expect(
      result.stops.some((stop) => /replacement bus/i.test(stop.name)),
    ).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/melbourne-daily/data/transport-stops.json",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("retries a failed download and reuses the successfully verified directory", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot)));
    const { fetchStopDirectory } = await import("./stopDirectory");
    await expect(fetchStopDirectory()).rejects.toThrow(
      /temporarily unavailable/,
    );
    const firstSuccess = await fetchStopDirectory();
    expect(await fetchStopDirectory()).toBe(firstSuccess);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache directories with invalid timestamps, locations or mixed identifier schemes", async () => {
    const { fetchStopDirectory } = await import("./stopDirectory");
    const invalid = [
      { ...snapshot, generatedAt: "not-a-date" },
      {
        ...snapshot,
        stops: snapshot.stops.map((stop, index) =>
          index ? stop : { ...stop, latitude: 0 },
        ),
      },
      {
        ...snapshot,
        stops: snapshot.stops.map((stop, index) =>
          index ? stop : { ...stop, idScheme: "ptv" },
        ),
      },
    ];
    for (const body of invalid) {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(body)),
      );
      await expect(fetchStopDirectory()).rejects.toThrow();
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(snapshot)),
    );
    expect((await fetchStopDirectory()).stops.length).toBeGreaterThan(1_000);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("matches stop names, platform terms and numeric IDs within the selected mode and bounds large result sets", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(snapshot)));
    const { fetchStopDirectory, findStops } = await import("./stopDirectory");
    const directory = await fetchStopDirectory();
    const station = findStops(directory, "fLiNdErS platform", "train");
    expect(station.length).toBeGreaterThan(0);
    expect(
      station.every(
        (stop) =>
          stop.mode === "train" &&
          /flinders/i.test(stop.name) &&
          /platform/i.test(stop.name),
      ),
    ).toBe(true);
    const tram = directory.stops.find((stop) => stop.mode === "tram")!;
    expect(
      findStops(directory, String(tram.id), "tram").some(
        (stop) => stop.id === tram.id,
      ),
    ).toBe(true);
    expect(findStops(directory, String(tram.id), "train")).toEqual([]);
    expect(findStops(directory, "a", "train")).toEqual([]);
    expect(findStops(directory, "a".repeat(81), "train")).toEqual([]);
    const broad = findStops(directory, "st", "tram");
    expect(broad.length).toBeGreaterThan(0);
    expect(broad.length).toBeLessThanOrEqual(25);
    const empty: StopDirectory = { ...directory, stops: [] };
    expect(findStops(empty, "Richmond", "train")).toEqual([]);
  });
});
