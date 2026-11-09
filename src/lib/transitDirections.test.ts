import { describe, expect, it } from "vitest";
import snapshot from "../../public/data/transport-stops.json";
import { getTransitWalkingDirections } from "./transitDirections";

describe("walking directions to a transit stop", () => {
  it.each([11213, 18090, 18175])("uses the precise public coordinates of boarding point %i", (id) => {
    const stop = snapshot.stops.find((item) => item.id === id)!;
    const links = getTransitWalkingDirections(stop)!;
    const google = new URL(links.googleMaps);
    const apple = new URL(links.appleMaps);
    const destination = `${stop.latitude},${stop.longitude}`;

    expect(google.origin + google.pathname).toBe("https://www.google.com/maps/dir/");
    expect(Object.fromEntries(google.searchParams)).toEqual({
      api: "1", destination, travelmode: "walking", dir_action: "navigate",
    });
    expect(apple.origin + apple.pathname).toBe("https://maps.apple.com/directions");
    expect(Object.fromEntries(apple.searchParams)).toEqual({ destination, mode: "walking" });
    expect(google.hash + apple.hash).toBe("");
    expect(google.username + google.password + apple.username + apple.password).toBe("");
  });

  it("keeps opposite-side tram points distinct instead of geocoding their shared name", () => {
    const first = snapshot.stops.find((item) => item.id === 18090)!;
    const opposite = snapshot.stops.find((item) => item.id === 18175)!;
    expect(first.name).toBe(opposite.name);
    expect(getTransitWalkingDirections(first)).not.toEqual(getTransitWalkingDirections(opposite));
  });

  it("does not copy unrelated selection fields or origin coordinates into the links", () => {
    const stop = Object.freeze({
      latitude: -37.818071234,
      longitude: 144.966701234,
      name: "Stop & origin=private-value",
      origin: "private-value",
      source: "private-value",
      apiKey: "private-value",
      deviceLocation: { latitude: -37.9, longitude: 145.1 },
    });
    const links = getTransitWalkingDirections(stop)!;
    for (const link of Object.values(links)) {
      const parsed = new URL(link);
      expect(parsed.searchParams.get("destination")).toBe("-37.818071234,144.966701234");
      expect(parsed.searchParams.has("origin")).toBe(false);
      expect(parsed.searchParams.has("source")).toBe(false);
      expect(parsed.searchParams.has("saddr")).toBe(false);
      expect(link).not.toContain("private-value");
      expect(link).not.toContain("145.1");
    }
  });

  it.each([
    { latitude: 0, longitude: 0 },
    { latitude: 90, longitude: 180 },
    { latitude: -90, longitude: -180 },
  ])("accepts valid zero and boundary coordinates %j", (stop) => {
    expect(getTransitWalkingDirections(stop)).not.toBeNull();
  });

  it.each([
    undefined,
    null,
    {},
    { latitude: null, longitude: 144.96 },
    { latitude: -37.81, longitude: null },
    { latitude: "", longitude: 144.96 },
    { latitude: -37.81, longitude: "144.96" },
    { latitude: "-37.81", longitude: 144.96 },
    { latitude: NaN, longitude: 144.96 },
    { latitude: -37.81, longitude: NaN },
    { latitude: Infinity, longitude: 144.96 },
    { latitude: -37.81, longitude: -Infinity },
    { latitude: 90.001, longitude: 144.96 },
    { latitude: -90.001, longitude: 144.96 },
    { latitude: -37.81, longitude: 180.001 },
    { latitude: -37.81, longitude: -180.001 },
  ])("returns no navigation link for unusable coordinates %j", (stop) => {
    expect(getTransitWalkingDirections(stop as Parameters<typeof getTransitWalkingDirections>[0])).toBeNull();
  });
});
