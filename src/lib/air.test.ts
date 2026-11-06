import { afterEach, describe, expect, it, vi } from "vitest";
import { AIR_MAX_AGE_MS, fetchAir, parseAirResponse } from "./air";

const now = Date.UTC(2026, 10, 6, 17, 30);
const sample = () => ({
  current_units: {
    time: "unixtime",
    interval: "seconds",
    pm2_5: "μg/m³",
    pm10: "μg/m³",
  },
  current: {
    time: Date.UTC(2026, 10, 6, 17) / 1000,
    interval: 3600,
    pm2_5: 3.5,
    pm10: 5.6,
  },
});

afterEach(() => vi.unstubAllGlobals());

describe("modeled air quality", () => {
  it("retains model valid time separately from retrieval time and preserves zero", () => {
    const payload = sample();
    payload.current.pm2_5 = 0;
    expect(parseAirResponse(payload, now)).toEqual({
      fetchedAt: "2026-11-06T17:30:00.000Z",
      modelTime: "2026-11-06T17:00:00.000Z",
      pm25: 0,
      pm10: 5.6,
    });
  });

  it.each([null, undefined, NaN, -1, "3.5"])(
    "rejects invalid PM readings: %s",
    (pm25) => {
      const payload = {
        ...sample(),
        current: { ...sample().current, pm2_5: pm25 },
      };
      expect(() => parseAirResponse(payload, now)).toThrow(
        "Missing or invalid air pollutant concentration",
      );
    },
  );

  it("rejects unexpected units rather than displaying a mislabeled concentration", () => {
    const payload = sample();
    payload.current_units.pm10 = "mg/m³";
    expect(() => parseAirResponse(payload, now)).toThrow(
      "Unexpected air quality units",
    );
  });

  it.each([now - AIR_MAX_AGE_MS - 1, now + 6 * 60 * 1000])(
    "rejects stale or future valid times",
    (ms) => {
      const payload = sample();
      payload.current.time = ms / 1000;
      expect(() => parseAirResponse(payload, now)).toThrow("invalid timestamp");
    },
  );

  it("propagates endpoint errors without synthesizing air data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );
    await expect(
      fetchAir({ latitude: -37.81, longitude: 144.96 }),
    ).rejects.toThrow("429");
  });

  it("does not request unsupported coordinates", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchAir({ latitude: 100, longitude: 144.96 }),
    ).rejects.toThrow("Invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
