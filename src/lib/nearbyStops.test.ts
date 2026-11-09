import { describe, expect, it } from "vitest";
import snapshot from "../../public/data/transport-stops.json";
import { findNearbyStops, formatStopDistance } from "./nearbyStops";
import { findStops, type StopDirectory } from "./stopDirectory";
import { parseTransitStop, type TransitStop } from "./transit";

const origin = { latitude: 0, longitude: 0 };
const directory = (stops: TransitStop[]): StopDirectory => ({
  generatedAt: snapshot.generatedAt,
  sourceUpdatedAt: snapshot.sourceUpdatedAt,
  sourceUrl: snapshot.sourceUrl,
  stops,
});
const north = (metres: number) => ({
  latitude: (metres / 6_371_000) * (180 / Math.PI),
  longitude: 0,
});
const stop = (id: number, metres: number, overrides: Partial<TransitStop> = {}): TransitStop => ({
  id,
  idScheme: "gtfs",
  name: `Stop ${id}`,
  suburb: "",
  mode: "tram",
  ...north(metres),
  ...overrides,
});

describe("nearby stops", () => {
  it("finds a real Flinders Street station and nearby tram stops, excluding replacement buses", () => {
    const source = directory(snapshot.stops.map(parseTransitStop));
    const flindersPlatform = source.stops.find((item) => item.id === 11212)!;
    const nearby = findNearbyStops(source, flindersPlatform);
    expect(nearby).toHaveLength(12);
    const station = nearby.find((item) => item.label === "Flinders Street Station")!;
    expect(station.stop).toBe(flindersPlatform);
    expect(station.distanceMetres).toBe(0);
    expect(station.platformCount).toBe(12);
    expect(station.stop.name).toBe("Flinders Street Station · Platform 1");
    expect(station.stop.idScheme).toBe("gtfs");
    expect(nearby.some((item) => item.stop.mode === "tram")).toBe(true);
    expect(nearby.every((item) => !/replacement bus/i.test(item.label))).toBe(true);
    expect(nearby.every((item) => item.distanceMetres <= 2000)).toBe(true);
    const trains = findNearbyStops(source, flindersPlatform, { mode: "train" });
    expect(trains.every((item) => item.stop.mode === "train")).toBe(true);
    expect(trains.filter((item) => item.label === station.label)).toHaveLength(1);
    // Nearby discovery leaves the existing manual directory search intact.
    expect(findStops(source, "Flinders replacement", "train")).toHaveLength(1);
  });

  it("uses raw Haversine distance before display rounding", () => {
    const farther = stop(1, 10.49);
    const nearer = stop(9, 10.01);
    const results = findNearbyStops(directory([farther, nearer]), origin);
    expect(results.map((item) => item.stop.id)).toEqual([9, 1]);
    expect(results[0].distanceMetres).toBeCloseTo(10.01, 8);
    expect(results.map((item) => formatStopDistance(item.distanceMetres))).toEqual(["10 m", "10 m"]);
  });

  it("uses mode then numeric ID for equal-distance ties independent of input order", () => {
    const input = [
      stop(0, 0),
      stop(9, 0, { mode: "train", name: "B Station · Platform 1" }),
      stop(1, 0, { mode: "train", name: "A Station · Platform 1" }),
    ];
    const expected = [1, 9, 0];
    expect(findNearbyStops(directory(input), origin).map((item) => item.stop.id)).toEqual(expected);
    expect(findNearbyStops(directory([...input].reverse()), origin).map((item) => item.stop.id)).toEqual(expected);
  });

  it("includes the exact radius boundary and excludes the next mapped point", () => {
    const point = stop(1, 1000);
    const exactDistance = findNearbyStops(directory([point]), origin)[0].distanceMetres;
    expect(findNearbyStops(directory([point, stop(2, 1000.01)]), origin, {
      radiusMetres: exactDistance,
    }).map((item) => item.stop.id)).toEqual([1]);
    expect(findNearbyStops(directory([point]), origin, {
      radiusMetres: exactDistance - 0.0001,
    })).toEqual([]);
  });

  it("supports zero distance and a zero-radius search without discarding valid coordinates", () => {
    const result = findNearbyStops(directory([stop(1, 0), stop(2, 1)]), origin, { radiusMetres: 0 });
    expect(result.map((item) => item.stop.id)).toEqual([1]);
    expect(result[0].distanceMetres).toBe(0);
  });

  it("bounds the radius to 5 km and result count to 25", () => {
    expect(findNearbyStops(directory([stop(1, 4999), stop(2, 5001)]), origin, {
      radiusMetres: 99_999,
    }).map((item) => item.stop.id)).toEqual([1]);
    const stops = Array.from({ length: 40 }, (_, index) => stop(index, index));
    expect(findNearbyStops(directory(stops), origin)).toHaveLength(12);
    expect(findNearbyStops(directory(stops), origin, { limit: 100 })).toHaveLength(25);
    expect(findNearbyStops(directory(stops), origin, { limit: 2.9 })).toHaveLength(2);
  });

  it("returns only the selected mode and never includes rail replacement buses nearby", () => {
    const source = directory([
      stop(1, 0, { mode: "train", name: "Central Rail Replacement Bus Stop" }),
      stop(2, 5, { mode: "train", name: "Central Station · Platform 1" }),
      stop(3, 10),
    ]);
    expect(findNearbyStops(source, origin, { mode: "train" }).map((item) => item.stop.id)).toEqual([2]);
    expect(findNearbyStops(source, origin, { mode: "tram" }).map((item) => item.stop.id)).toEqual([3]);
    expect(source.stops).toHaveLength(3);
  });

  it("groups exact station names using the nearest original platform, including farther platforms beyond the search radius", () => {
    const farther = stop(1, 150, { mode: "train", name: "Central Station · Platform 1" });
    const nearest = stop(9, 50, { mode: "train", name: "Central Station · Platform 2" });
    const source = directory([farther, nearest]);
    const before = JSON.stringify(source);
    const result = findNearbyStops(source, origin, { radiusMetres: 100 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: "Central Station", platformCount: 2 });
    expect(result[0].stop).toBe(nearest);
    expect(result[0].distanceMetres).toBeCloseTo(50, 8);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("does not merge tram opposite sides, similar station names, or far-apart same-name platforms", () => {
    const source = directory([
      stop(1, 0, { name: "Central / Main St" }),
      stop(2, 5, { name: "Central / Main St" }),
      stop(3, 10, { mode: "train", name: "Central Station · Platform 1" }),
      stop(4, 20, { mode: "train", name: "Central West Station · Platform 1" }),
      stop(5, 1000, { mode: "train", name: "Central Station · Platform 2" }),
    ]);
    const result = findNearbyStops(source, origin);
    expect(result).toHaveLength(5);
    expect(result.map((item) => item.platformCount)).toEqual([1, 1, 1, 1, 1]);
  });

  it("bounds train clusters by the nearest representative instead of chaining adjacent platforms", () => {
    const stops = [0, 400, 800].map((metres, index) => stop(index, metres, {
      mode: "train",
      name: `Central Station · Platform ${index + 1}`,
    }));
    const results = findNearbyStops(directory(stops), origin);
    expect(results.map((item) => [item.stop.id, item.platformCount])).toEqual([[0, 2], [2, 1]]);
    expect(findNearbyStops(directory([...stops].reverse()), origin)).toEqual(results);
  });

  it.each([
    { latitude: NaN, longitude: 0 },
    { latitude: 90.1, longitude: 0 },
    { latitude: -90.1, longitude: 0 },
    { latitude: 0, longitude: 180.1 },
    { latitude: 0, longitude: -180.1 },
    { latitude: 0, longitude: Infinity },
  ])("returns no results for invalid input coordinates %j", (location) => {
    expect(findNearbyStops(directory([stop(1, 0)]), location)).toEqual([]);
  });

  it.each([
    { radiusMetres: NaN }, { radiusMetres: Infinity }, { radiusMetres: -1 },
    { limit: NaN }, { limit: Infinity }, { limit: 0 }, { limit: -1 },
  ])("returns no results for invalid bounds %j", (options) => {
    expect(findNearbyStops(directory([stop(1, 0)]), origin, options)).toEqual([]);
  });

  it("skips invalid mapped coordinates and handles an empty directory", () => {
    expect(findNearbyStops(directory([
      stop(1, 0, { latitude: NaN }),
      stop(2, 0, { longitude: 181 }),
      stop(3, 0),
    ]), origin).map((item) => item.stop.id)).toEqual([3]);
    expect(findNearbyStops(directory([]), origin)).toEqual([]);
  });
});

describe("stop distance formatting", () => {
  it.each([
    [0, "0 m"], [8.6, "9 m"], [250, "250 m"], [999, "999 m"],
    [1000, "1.0 km"], [1250, "1.3 km"], [5000, "5.0 km"],
    [NaN, "—"], [Infinity, "—"], [-1, "—"],
  ])("formats %s metres as %s", (metres, expected) => {
    expect(formatStopDistance(metres)).toBe(expected);
  });
});
