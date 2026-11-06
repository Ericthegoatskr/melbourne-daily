import { describe, expect, it } from "vitest";
import { forecastDayLabel, forecastIsDay, melbourneDate } from "./forecast";

describe("Melbourne calendar boundaries", () => {
  it("changes day at Melbourne midnight, independent of the browser timezone", () => {
    expect(melbourneDate("2026-11-06T12:59:59Z")).toBe("2026-11-06");
    expect(melbourneDate("2026-11-06T13:00:00Z")).toBe("2026-11-07");
    expect(
      forecastDayLabel("2026-11-06", Date.parse("2026-11-06T13:00:00Z")),
    ).not.toBe("Today");
    expect(
      forecastDayLabel("2026-11-07", Date.parse("2026-11-06T13:00:00Z")),
    ).toBe("Today");
  });
  it("computes the next calendar day across the 23-hour daylight saving day", () => {
    const now = Date.parse("2026-10-03T14:30:00Z"); // October 4, 00:30 AEST
    expect(forecastDayLabel("2026-10-05", now)).toBe("Tomorrow");
    expect(melbourneDate("2026-10-04T13:00:00Z")).toBe("2026-10-05");
  });
  it("uses forecast sunrise and sunset for summer evenings instead of fixed hours", () => {
    const days = [
      { sunrise: "2026-12-31T18:00:00Z", sunset: "2027-01-01T09:45:00Z" },
    ];
    expect(forecastIsDay("2027-01-01T09:00:00Z", days)).toBe(true); // 20:00 AEDT
    expect(forecastIsDay("2027-01-01T10:00:00Z", days)).toBe(false);
  });
});
