import type { TransitDestination } from "./transitDestinations";

const ADDRESS_URL = "https://corp-geo.mapshare.vic.gov.au/arcgis/rest/services/Geocoder/VMAddressEZIAdd/GeocodeServer/findAddressCandidates";
const LANDMARK_URL = "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services/Vicmap_Features_of_Interest/FeatureServer/4/query";
const LIMIT = 8;
const SOURCE_TIMEOUT_MS = 8_000;
// A search envelope, not the metropolitan boundary. The caller applies the
// municipality boundary to the validated candidates before displaying them.
const EXTENT = { xmin: 144.4, ymin: -38.55, xmax: 146.25, ymax: -37.35, spatialReference: { wkid: 4326 } };
type Result = { destinations: TransitDestination[]; partial: boolean };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function label(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.length <= 500
    ? value.trim().replace(/\s+/g, " ") : null;
}
function point(value: unknown): Pick<TransitDestination, "latitude" | "longitude"> | null {
  if (!object(value)) return null;
  const { x, y } = value;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { latitude: y, longitude: x };
}
function withinExtent(coordinate: { latitude: number; longitude: number }): boolean {
  return coordinate.longitude >= EXTENT.xmin && coordinate.longitude <= EXTENT.xmax &&
    coordinate.latitude >= EXTENT.ymin && coordinate.latitude <= EXTENT.ymax;
}

/** Preserve house and unit numbers: a high score can still match 915 to 915/850. */
function addressNumbers(value: string): { unit?: string; street: string; end?: string } | null {
  const normalized = value.trim().toUpperCase().replace(/^(?:UNIT|FLAT|APARTMENT|APT|SUITE)\s+/, "");
  const match = normalized.match(/^(?:(\d+[A-Z]?)\s*[/,]\s*)?(\d+[A-Z]?)(?:\s*[-–]\s*(\d+[A-Z]?))?(?=\s|$)/);
  return match ? { unit: match[1], street: match[2], end: match[3] } : null;
}
function matchesNumbers(query: string, candidate: string): boolean {
  const requested = addressNumbers(query);
  if (!requested) return true;
  const returned = addressNumbers(candidate);
  if (!returned || requested.unit && requested.unit !== returned.unit) return false;
  if (requested.street === returned.street && (!requested.end || requested.end === returned.end)) return true;
  // A single house number can be represented by a genuine numeric range.
  return !requested.end && /^\d+$/.test(requested.street) && /^\d+$/.test(returned.street) &&
    !!returned.end && /^\d+$/.test(returned.end) && Number(requested.street) >= Number(returned.street) &&
    Number(requested.street) <= Number(returned.end);
}

function locatorQuery(query: string): string {
  const roads: Record<string, string> = { RD: "ROAD", AVE: "AVENUE", AV: "AVENUE", DR: "DRIVE", CRES: "CRESCENT", CT: "COURT", PL: "PLACE", PDE: "PARADE", TCE: "TERRACE", HWY: "HIGHWAY", BLVD: "BOULEVARD", CCT: "CIRCUIT", GR: "GROVE", LN: "LANE", CL: "CLOSE" };
  const words = [...query.matchAll(/\b([A-Za-z]+)\.?(?=\s|$)/g)];
  // The locator expects full road types. Prefer an unambiguous type first:
  // "St Kilda Rd" becomes "St Kilda ROAD", never "STREET Kilda ROAD".
  let word = words.find((entry, index) => index > 0 && roads[entry[1].toUpperCase()]);
  let replacement = word ? roads[word[1].toUpperCase()] : undefined;
  if (!word && !words.some((entry) => ["STREET", ...Object.values(roads)].includes(entry[1].toUpperCase()))) {
    word = words.find((entry, index) => index > 0 && entry[1].toUpperCase() === "ST");
    replacement = word ? "STREET" : undefined;
  }
  return word && replacement ? query.slice(0, word.index) + replacement + query.slice(word.index + word[0].length) : query;
}

function addressUrl(query: string): string {
  const params = new URLSearchParams({
    f: "json", SingleLine: locatorQuery(query), outSR: "4326", maxLocations: String(LIMIT),
    outFields: "Match_addr,Score", searchExtent: JSON.stringify(EXTENT),
  });
  return `${ADDRESS_URL}?${params}`;
}
function landmarkUrl(query: string): string {
  // Escape SQL literals before URL encoding; discard wildcard characters so a
  // user's percent or underscore cannot widen the search into a bulk query.
  const tokens = query.toUpperCase().replace(/[%_]/g, " ").replace(/[’‘]/g, "'")
    .split(/[\s,;]+/).filter(Boolean).slice(0, 12);
  if (!tokens.length) throw new Error("Enter a destination name or address.");
  const where = tokens.map((token) => {
    const literal = token.replace(/'/g, "''");
    return `(UPPER(name) LIKE '%${literal}%' OR UPPER(parent_name) LIKE '%${literal}%')`;
  }).join(" AND ");
  const params = new URLSearchParams({
    f: "json", where, outFields: "pfi,name,parent_name,feature_type,feature_subtype", outSR: "4326",
    returnGeometry: "true", resultRecordCount: String(LIMIT),
    geometry: JSON.stringify(EXTENT), geometryType: "esriGeometryEnvelope", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
  });
  return `${LANDMARK_URL}?${params}`;
}

async function payload(url: string, field: "candidates" | "features", signal?: AbortSignal): Promise<unknown[]> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { credentials: "omit", signal: controller.signal });
    if (!response.ok) throw new Error("Vicmap destination source unavailable.");
    const data: unknown = await response.json();
    if (!object(data) || data.error || !Array.isArray(data[field])) throw new Error("Unreadable Vicmap destination response.");
    if (object(data.spatialReference) && data.spatialReference.wkid !== 4326 && data.spatialReference.latestWkid !== 4326) {
      throw new Error("Unexpected Vicmap coordinate reference.");
    }
    return data[field].slice(0, LIMIT);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
async function addresses(query: string, signal?: AbortSignal): Promise<Result> {
  const rows = await payload(addressUrl(query), "candidates", signal);
  const destinations: TransitDestination[] = [];
  let partial = false;
  for (const row of rows) {
    if (!object(row)) { partial = true; continue; }
    const name = label(row.address), coordinate = point(row.location);
    if (!name || !coordinate || typeof row.score !== "number" || !Number.isFinite(row.score)) { partial = true; continue; }
    if (!withinExtent(coordinate) || row.score < 80 || row.score > 100 || !matchesNumbers(query, name)) continue;
    destinations.push({ id: `vicmap-address:${name}:${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`, label: name, ...coordinate });
  }
  return { destinations, partial };
}
async function landmarks(query: string, signal?: AbortSignal): Promise<Result> {
  const rows = await payload(landmarkUrl(query), "features", signal);
  const destinations: TransitDestination[] = [];
  let partial = false;
  for (const row of rows) {
    if (!object(row) || !object(row.attributes)) { partial = true; continue; }
    const name = label(row.attributes.name), coordinate = point(row.geometry), pfi = row.attributes.pfi;
    if (!name || !coordinate || !((typeof pfi === "number" && Number.isSafeInteger(pfi) && pfi > 0) ||
        (typeof pfi === "string" && /^\d{1,20}$/.test(pfi)))) { partial = true; continue; }
    if (!withinExtent(coordinate)) continue;
    destinations.push({ id: `vicmap-foi:${pfi}`, label: name, ...coordinate });
  }
  return { destinations, partial };
}

/** Keyless submitted searches. Source deadlines preserve partial results before the caller's overall timeout. */
export async function searchVicmapDestinations(query: string, signal?: AbortSignal): Promise<Result> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 100) throw new Error("Enter a destination between 2 and 100 characters.");
  if (signal?.aborted) throw new DOMException("Destination search cancelled.", "AbortError");
  const responses = await Promise.allSettled([addresses(trimmed, signal), landmarks(trimmed, signal)]);
  if (signal?.aborted) throw new DOMException("Destination search cancelled.", "AbortError");
  const unique = new Map<string, TransitDestination>();
  let partial = false;
  for (const response of responses) {
    if (response.status === "rejected") partial = true;
    else {
      partial ||= response.value.partial;
      for (const destination of response.value.destinations) unique.set(destination.id, destination);
    }
  }
  return { destinations: [...unique.values()], partial };
}
