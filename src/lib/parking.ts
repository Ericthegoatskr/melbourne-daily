/**
 * City of Melbourne bay data, adapted from the owner's parking dashboard.
 * Source: Ericthegoatskr/melbourne-parking-dashboard at
 * d585e13331aab18a528436a944639e7e50fea87b0 (odsClient / parkingModel).
 * Council data and bundled zone crosswalk: CC BY 4.0, City of Melbourne.
 */
export interface ParkingStreet {
  name: string;
  available: number;
  /** Reporting sensors on this street, not all registered bays. */
  total: number;
  latitude: number | null;
  longitude: number | null;
}

export interface ParkingData {
  fetchedAt: string;
  /** Latest source republish timestamp, never the local download time. */
  observedAt: string;
  total: number;
  reporting: number;
  available: number;
  occupied: number;
  unknown: number;
  streets: ParkingStreet[];
}

export const PARKING_SOURCE_URL =
  "https://data.melbourne.vic.gov.au/explore/dataset/on-street-parking-bay-sensors/information/";
export const PARKING_FEED_URL =
  "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/on-street-parking-bay-sensors/exports/json" +
  "?select=kerbsideid,zone_number,status_description,status_timestamp,lastupdated,location";
export const PARKING_MAX_AGE_MS = 15 * 60_000;
export const PARKING_REFRESH_MS = 120_000;

type Crosswalk = Record<string, { street: string }>;
type Bay = {
  id: number;
  zone: number | null;
  available: boolean;
  reportedAt: number;
  stateChangedAt: number;
  latitude: number;
  longitude: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function timestamp(value: unknown): number | null {
  // Require an explicit zone: browser-local parsing would corrupt source age.
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value))
    return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bayFromRaw(raw: unknown): Bay | null {
  if (!record(raw)) return null;
  const id = raw.kerbsideid;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0)
    return null;
  if (
    raw.status_description !== "Present" &&
    raw.status_description !== "Unoccupied"
  )
    return null;
  const reportedAt = timestamp(raw.lastupdated);
  const stateChangedAt = timestamp(raw.status_timestamp);
  if (reportedAt === null || stateChangedAt === null || !record(raw.location))
    return null;
  const { lat, lon } = raw.location;
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  )
    return null;
  if (lat < -38.2 || lat > -37.5 || lon < 144.5 || lon > 145.4) return null;
  const zone =
    typeof raw.zone_number === "number" && Number.isSafeInteger(raw.zone_number)
      ? raw.zone_number
      : null;
  return {
    id,
    zone,
    reportedAt,
    stateChangedAt,
    latitude: lat,
    longitude: lon,
    available: raw.status_description === "Unoccupied",
  };
}

function parseCrosswalk(raw: unknown): Crosswalk {
  if (!record(raw))
    throw new Error("Parking street reference data could not be read");
  const result: Crosswalk = {};
  for (const [zone, entry] of Object.entries(raw)) {
    if (
      !/^\d+$/.test(zone) ||
      !record(entry) ||
      typeof entry.street !== "string" ||
      !entry.street.trim()
    ) {
      throw new Error("Invalid parking street reference data");
    }
    result[zone] = { street: entry.street.trim() };
  }
  return result;
}

/** Fail closed before deriving any availability. Exported for fixture tests. */
export function validateParking(
  payload: unknown,
  crosswalkPayload: unknown,
  now = new Date(),
): ParkingData {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid device time");
  if (!Array.isArray(payload) || payload.length < 5_000)
    throw new Error("Not enough parking records to show availability");
  const crosswalk = parseCrosswalk(crosswalkPayload);
  const bays: Bay[] = [];
  const ids = new Set<number>();
  let invalid = 0;
  for (const raw of payload) {
    const bay = bayFromRaw(raw);
    if (!bay) {
      invalid++;
      continue;
    }
    if (ids.has(bay.id))
      throw new Error("Duplicate parking bays found; availability is hidden");
    ids.add(bay.id);
    bays.push(bay);
  }
  if (invalid / payload.length > 0.02 || bays.length === 0)
    throw new Error("Invalid parking data format; availability is hidden");
  let sourceTime = -Infinity;
  for (const bay of bays) {
    sourceTime = Math.max(sourceTime, bay.reportedAt);
    if (bay.stateChangedAt > now.getTime() + 120_000)
      throw new Error("Invalid parking source timestamp");
  }
  if (sourceTime > now.getTime() + 120_000)
    throw new Error(
      "Parking source timestamp is in the future; availability is hidden",
    );
  if (now.getTime() - sourceTime > PARKING_MAX_AGE_MS)
    throw new Error(
      "Parking data is over 15 minutes old; availability is hidden",
    );
  const trusted = bays.filter(
    (bay) => bay.reportedAt >= sourceTime - 30 * 60_000,
  );
  if (trusted.length / payload.length < 0.6)
    throw new Error("Not enough sensors are reporting; availability is hidden");

  let available = 0;
  const buckets = new Map<
    string,
    { available: number; total: number; lat: number; lon: number }
  >();
  for (const bay of trusted) {
    if (bay.available) available++;
    const reference =
      bay.zone === null ? undefined : crosswalk[String(bay.zone)];
    // Unmapped bays still count in the city summary, but cannot be a street suggestion.
    if (!reference) continue;
    const bucket = buckets.get(reference.street) ?? {
      available: 0,
      total: 0,
      lat: 0,
      lon: 0,
    };
    bucket.total++;
    if (bay.available) bucket.available++;
    bucket.lat += bay.latitude;
    bucket.lon += bay.longitude;
    buckets.set(reference.street, bucket);
  }
  const streets = [...buckets.entries()]
    .filter(([, bucket]) => bucket.total >= 5 && bucket.available > 0)
    .map(([name, bucket]) => ({
      name,
      available: bucket.available,
      total: bucket.total,
      latitude: bucket.lat / bucket.total,
      longitude: bucket.lon / bucket.total,
    }))
    .sort((a, b) => b.available - a.available || a.name.localeCompare(b.name))
    .slice(0, 5);

  return {
    fetchedAt: now.toISOString(),
    observedAt: new Date(sourceTime).toISOString(),
    total: payload.length,
    reporting: trusted.length,
    available,
    occupied: trusted.length - available,
    unknown: payload.length - trusted.length,
    streets,
  };
}

/**
 * Callers must continue aging observedAt and hide availability after 15 minutes.
 * Abort covers downloads AND body parsing; no stale local cache is treated as live.
 */
export async function fetchParking(signal?: AbortSignal): Promise<ParkingData> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException("The parking source timed out", "TimeoutError"),
      ),
    20_000,
  );
  try {
    const read = async (url: string, cache: RequestCache): Promise<unknown> => {
      const response = await fetch(url, {
        signal: controller.signal,
        cache,
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new Error(
          `Parking data download failed (HTTP ${response.status})`,
        );
      return response.json() as Promise<unknown>;
    };
    const [payload, crosswalk] = await Promise.all([
      read(PARKING_FEED_URL, "no-store"),
      read(
        `${import.meta.env.BASE_URL}data/zone-crosswalk.json`,
        "force-cache",
      ),
    ]);
    return validateParking(payload, crosswalk);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
