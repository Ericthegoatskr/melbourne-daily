import { describe, expect, it } from "vitest";
import { isMelbourneMetro } from "./melbourneMetro";
import boundary from "../data/melbourneMetroBoundary.json";
import { LANDMARKS } from "./transitDestinations";

describe("metropolitan destination coverage", () => {
  it("uses all 31 distinct councils with closed, finite rings", () => {
    expect(boundary.features).toHaveLength(31);
    expect(new Set(boundary.features.map((feature) => feature.properties.lga_code)).size).toBe(31);
    for (const feature of boundary.features) {
      expect(feature.geometry.type).toBe("Polygon");
      for (const ring of feature.geometry.coordinates) {
        expect(ring.length).toBeGreaterThan(3);
        expect(ring[0]).toEqual(ring.at(-1));
        expect(ring.every((point) => point.length === 2 && point.every(Number.isFinite))).toBe(true);
      }
    }
  });
  it("includes all 24 verified local landmark choices", () => {
    expect(LANDMARKS).toHaveLength(24);
    for (const point of LANDMARKS) expect(isMelbourneMetro(point.latitude, point.longitude), point.label).toBe(true);
  });
  it.each([
    [-37.814095, 145.118685], // Box Hill
    [-37.920722, 145.123074], // Clayton
    [-37.897916, 144.670811], // Werribee
    [-38.143, 145.122], // Frankston
    [-37.579, 144.729], // Sunbury
    [-37.754, 145.69], // Warburton / Yarra Ranges
  ])("includes metropolitan address points %j, %j", (lat, lon) => expect(isMelbourneMetro(lat, lon)).toBe(true));
  it.each([
    [-38.1499, 144.3617], // Geelong
    [-37.5622, 143.8503], // Ballarat
    [-37.675, 144.438], // Bacchus Marsh
    [-33.8688, 151.2093], // Sydney
    [NaN, 145], [-37.8, Infinity], [144.96, -37.81],
  ])("excludes out-of-area or invalid points %j, %j", (lat, lon) => expect(isMelbourneMetro(lat, lon)).toBe(false));
});
