import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchParking, PARKING_FEED_URL, validateParking } from "./parking";

const now = new Date("2026-11-07T01:00:00Z");
const fresh = "2026-11-07T00:59:00Z";
const old = "2026-11-06T23:00:00Z";
const crosswalk = {
  "7000": { street: "Swanston Street" },
  "7001": { street: "Elizabeth Street" },
};
type RawBay = {
  kerbsideid: number;
  zone_number: number | null;
  status_description: string;
  status_timestamp: string;
  lastupdated: string;
  location: { lat: number; lon: number };
};
function fixture(): RawBay[] {
  return Array.from({ length: 5_000 }, (_, i) => ({
    kerbsideid: i + 1,
    zone_number: i % 2 ? 7000 : 7001,
    status_description: i % 2 ? "Present" : "Unoccupied",
    // A state may have stayed unchanged for hours; freshness uses lastupdated.
    status_timestamp: old,
    lastupdated: fresh,
    location: { lat: -37.81, lon: 144.96 },
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("parking trust rules", () => {
  it("excludes silent sensors and reconciles unknowns, without treating unknown as vacant", () => {
    const rows = fixture();
    rows.slice(0, 100).forEach((row) => {
      row.lastupdated = old;
    });
    const result = validateParking(rows, crosswalk, now);
    expect(result).toMatchObject({
      total: 5_000,
      reporting: 4_900,
      available: 2_450,
      occupied: 2_450,
      unknown: 100,
      observedAt: new Date(fresh).toISOString(),
      fetchedAt: now.toISOString(),
    });
    expect(result.available + result.occupied + result.unknown).toBe(
      result.total,
    );
    expect(result.streets).toEqual([
      {
        name: "Elizabeth Street",
        available: 2_450,
        total: 2_450,
        latitude: expect.closeTo(-37.81),
        longitude: expect.closeTo(144.96),
      },
    ]);
  });

  it("includes a tolerated malformed row in unknown rather than availability", () => {
    const rows = fixture();
    rows[0]!.status_description = "New unknown status";
    const result = validateParking(rows, crosswalk, now);
    expect(result.unknown).toBe(1);
    expect(result.available).toBe(2_499);
  });

  it("rejects malformed payloads, truncated networks, duplicates, and too many unreadable records", () => {
    expect(() => validateParking({}, crosswalk, now)).toThrow();
    expect(() =>
      validateParking(fixture().slice(0, 4_999), crosswalk, now),
    ).toThrow();
    const duplicated = fixture();
    duplicated[1]!.kerbsideid = duplicated[0]!.kerbsideid;
    expect(() => validateParking(duplicated, crosswalk, now)).toThrow(
      /Duplicate/,
    );
    const malformed = fixture();
    malformed.slice(0, 101).forEach((row) => {
      row.status_description = "unknown";
    });
    expect(() => validateParking(malformed, crosswalk, now)).toThrow(/format/);
    const invalidCoordinates = fixture();
    invalidCoordinates.slice(0, 101).forEach((row) => {
      row.location.lat = 0;
    });
    expect(() => validateParking(invalidCoordinates, crosswalk, now)).toThrow(
      /format/,
    );
  });

  it("rejects stale or impossible source clocks and future sensor states", () => {
    const stale = fixture().map((row) => ({ ...row, lastupdated: old }));
    expect(() => validateParking(stale, crosswalk, now)).toThrow(/15 minutes/);
    const future = fixture();
    future[0]!.lastupdated = "2026-11-07T01:03:00Z";
    expect(() => validateParking(future, crosswalk, now)).toThrow(
      /in the future/,
    );
    const stateFuture = fixture();
    stateFuture[0]!.status_timestamp = "2026-11-07T01:03:00Z";
    expect(() => validateParking(stateFuture, crosswalk, now)).toThrow(
      /Invalid parking source timestamp/,
    );
  });

  it("requires 60% of the whole network to report within 30 minutes of the newest source time", () => {
    const rows = fixture();
    rows.slice(0, 2_000).forEach((row) => {
      row.lastupdated = old;
    });
    expect(validateParking(rows, crosswalk, now).reporting).toBe(3_000);
    rows[2_000]!.lastupdated = old;
    expect(() => validateParking(rows, crosswalk, now)).toThrow(
      /Not enough sensors/,
    );
  });

  it("keeps unmapped bays in city counts and excludes tiny or empty streets from suggestions", () => {
    const rows = fixture();
    rows.forEach((row) => {
      row.zone_number = null;
    });
    rows.slice(0, 4).forEach((row) => {
      row.zone_number = 7000;
    });
    const result = validateParking(rows, crosswalk, now);
    expect(result.available).toBe(2_500);
    expect(result.streets).toEqual([]);
  });

  it("ranks at most five real streets by available reporting bays", () => {
    const rows = fixture();
    const zones = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [
        String(7000 + i),
        { street: `Street ${i}` },
      ]),
    );
    rows.forEach((row, i) => {
      row.zone_number = 7000 + (i % 7);
    });
    const result = validateParking(rows, zones, now);
    expect(result.streets).toHaveLength(5);
    expect(
      result.streets.every(
        (street, i, all) =>
          i === 0 || street.available <= all[i - 1]!.available,
      ),
    ).toBe(true);
  });
});

describe("parking fetch", () => {
  it("fetches the official full feed and local crosswalk then validates source time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const mock = vi.fn(
      async (input: string) =>
        new Response(
          JSON.stringify(input === PARKING_FEED_URL ? fixture() : crosswalk),
        ),
    );
    vi.stubGlobal("fetch", mock);
    const result = await fetchParking();
    expect(mock).toHaveBeenCalledWith(
      PARKING_FEED_URL,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(
      mock.mock.calls.some(([url]) =>
        url.endsWith("/data/zone-crosswalk.json"),
      ),
    ).toBe(true);
    expect(result.available).toBe(2_500);
  });

  it("does not accept HTTP errors as data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unavailable", { status: 503 })),
    );
    await expect(fetchParking()).rejects.toThrow(/503/);
  });

  it("propagates caller cancellation to both network requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = options.signal!;
            if (signal.aborted) reject(signal.reason);
            else
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              });
          }),
      ),
    );
    const controller = new AbortController();
    const result = fetchParking(controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});
