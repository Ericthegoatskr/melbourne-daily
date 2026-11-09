import boundary from "../data/melbourneMetroBoundary.json";

type Point = number[];
type Polygon = Point[][];
type Geometry = { type: "Polygon"; coordinates: Polygon } | { type: "MultiPolygon"; coordinates: Polygon[] };
const polygons = boundary.features.flatMap((feature) => {
  const geometry = feature.geometry as Geometry;
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}).map((rings) => ({
  rings,
  west: Math.min(...rings[0].map((p) => p[0])), east: Math.max(...rings[0].map((p) => p[0])),
  south: Math.min(...rings[0].map((p) => p[1])), north: Math.max(...rings[0].map((p) => p[1])),
}));

function inRing(x: number, y: number, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Search scope: 31 metropolitan councils, using a simplified Vicmap boundary.
 * This is a discovery filter, not a legal/property or ABS statistical boundary.
 */
export function isMelbourneMetro(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return polygons.some(({ rings, west, east, south, north }) =>
    longitude >= west && longitude <= east && latitude >= south && latitude <= north &&
    inRing(longitude, latitude, rings[0]) && !rings.slice(1).some((ring) => inRing(longitude, latitude, ring)));
}
