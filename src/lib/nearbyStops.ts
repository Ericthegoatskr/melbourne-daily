import type { StopDirectory } from "./stopDirectory";
import type { TransitMode, TransitStop } from "./transit";

export interface NearbyStop {
  stop: TransitStop;
  label: string;
  distanceMetres: number;
  platformCount: number;
}

type Coordinates = { latitude: number; longitude: number };
type NearbyOptions = {
  radiusMetres?: number;
  mode?: "all" | TransitMode;
  limit?: number;
};

const EARTH_RADIUS_METRES = 6_371_000;
const MAX_RADIUS_METRES = 5000;
const PLATFORM_CLUSTER_METRES = 500;

function validCoordinates(value: Coordinates): boolean {
  return (
    Number.isFinite(value?.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180
  );
}

function distanceMetres(a: Coordinates, b: Coordinates): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(Math.min(1, haversine)))
  );
}

function compareNearbyStops(a: NearbyStop, b: NearbyStop): number {
  return (
    a.distanceMetres - b.distanceMetres ||
    a.stop.mode.localeCompare(b.stop.mode, "en-AU") ||
    a.stop.id - b.stop.id
  );
}

/** Straight-line distance to mapped stop points, not entrances or walking routes. */
export function findNearbyStops(
  directory: StopDirectory,
  location: Coordinates,
  options: NearbyOptions = {},
): NearbyStop[] {
  const radius = options.radiusMetres ?? 2000;
  const limit = options.limit ?? 12;
  const mode = options.mode ?? "all";
  if (
    !validCoordinates(location) ||
    !Number.isFinite(radius) ||
    radius < 0 ||
    !Number.isFinite(limit) ||
    limit < 1 ||
    !["all", "train", "tram", "bus"].includes(mode)
  ) {
    return [];
  }

  const candidates: NearbyStop[] = directory.stops
    .filter(
      (stop) =>
        (mode === "all" || stop.mode === mode) &&
        validCoordinates(stop) &&
        !/rail\s+replacement\s+bus/i.test(stop.name),
    )
    .map((stop) => ({
      stop,
      label:
        stop.mode === "train"
          ? stop.name.replace(/ · Platform .+$/, "")
          : stop.name,
      distanceMetres: distanceMetres(location, stop),
      platformCount: 1,
    }))
    .sort(compareNearbyStops);

  const groups: NearbyStop[] = [];
  const trainGroups = new Map<string, NearbyStop[]>();
  // Nearest-first means each cluster keeps its nearest original boarding record.
  // Compare with that representative, rather than chaining neighbouring points,
  // so same-name stations farther away cannot join through intermediate stops.
  for (const candidate of candidates) {
    if (candidate.stop.mode !== "train") {
      groups.push(candidate);
      continue;
    }
    const sameName = trainGroups.get(candidate.label) ?? [];
    const group = sameName.find(
      (existing) =>
        distanceMetres(existing.stop, candidate.stop) <= PLATFORM_CLUSTER_METRES,
    );
    if (group) {
      group.platformCount += 1;
    } else {
      sameName.push(candidate);
      trainGroups.set(candidate.label, sameName);
      groups.push(candidate);
    }
  }

  // Group before applying the radius, so nearby stations retain their complete
  // platform count even if a farther platform lies just outside the radius.
  return groups
    .filter((candidate) => candidate.distanceMetres <= Math.min(radius, MAX_RADIUS_METRES))
    .slice(0, Math.min(Math.floor(limit), 25));
}

export function formatStopDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "—";
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
