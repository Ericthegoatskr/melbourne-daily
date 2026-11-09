import type { TransitStop } from "./transit";

type StopCoordinates = Pick<TransitStop, "latitude" | "longitude">;

/**
 * Open walking directions to the selected public stop point. The maps provider
 * resolves the starting location itself; never include the device fix here.
 * Formats: developers.google.com/maps/documentation/urls/get-started and
 * developer.apple.com/documentation/mapkit/unified-map-urls.
 */
export function getTransitWalkingDirections(
  stop: StopCoordinates,
): { googleMaps: string; appleMaps: string } | null {
  const latitude = stop?.latitude;
  const longitude = stop?.longitude;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  const destination = `${latitude},${longitude}`;
  const google = new URL("https://www.google.com/maps/dir/");
  google.search = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "walking",
    dir_action: "navigate",
  }).toString();
  const apple = new URL("https://maps.apple.com/directions");
  apple.search = new URLSearchParams({
    destination,
    mode: "walking",
  }).toString();
  return { googleMaps: google.href, appleMaps: apple.href };
}
