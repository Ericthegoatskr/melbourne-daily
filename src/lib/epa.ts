import {
  EPA_CATEGORIES,
  EPA_MAX_AGE_MS,
  EPA_SOURCE_URL,
  type EpaCategoryReading,
  type EpaObservations,
  type EpaPollutantReading,
  type EpaStation,
} from "../../shared/epa";
import { apiUrl } from "./api";

export {
  EPA_MAX_AGE_MS,
  EPA_REFRESH_MS,
  EPA_SOURCE_URL,
  type EpaCategory,
  type EpaObservations,
  type EpaStation,
} from "../../shared/epa";

type Coordinates = { latitude: number; longitude: number };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= Date.UTC(2010, 0, 1);
}

function coordinates(value: Coordinates): boolean {
  return (
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

function category(value: unknown, now: number): EpaCategoryReading | null {
  if (
    !object(value) ||
    !EPA_CATEGORIES.some((known) => known === value.value) ||
    !timestamp(value.observedAt) ||
    Date.parse(value.observedAt) > now + 120_000
  )
    return null;
  return {
    value: value.value as EpaCategoryReading["value"],
    observedAt: value.observedAt,
  };
}

function pollutant(value: unknown, now: number): EpaPollutantReading | null {
  if (
    !object(value) ||
    typeof value.value !== "number" ||
    !Number.isFinite(value.value) ||
    value.value < 0 ||
    value.unit !== "µg/m³" ||
    value.averagingPeriod !== "1h" ||
    !timestamp(value.observedAt) ||
    Date.parse(value.observedAt) > now + 120_000
  )
    return null;
  return {
    value: value.value,
    unit: "µg/m³",
    averagingPeriod: "1h",
    observedAt: value.observedAt,
  };
}

/** Validate our proxy contract without assuming undocumented EPA field names. */
export function parseEpaObservations(
  payload: unknown,
  now = Date.now(),
): EpaObservations {
  if (
    !object(payload) ||
    payload.source !== "EPA Victoria" ||
    !timestamp(payload.fetchedAt) ||
    !Array.isArray(payload.stations) ||
    payload.stations.length > 500 ||
    !Number.isFinite(now) ||
    Date.parse(payload.fetchedAt) > now + 120_000
  )
    throw new Error("Invalid EPA station response");

  const ids = new Set<string>();
  const stations: EpaStation[] = [];
  for (const raw of payload.stations) {
    if (
      !object(raw) ||
      typeof raw.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id) ||
      typeof raw.name !== "string" ||
      !raw.name.trim() ||
      raw.name.length > 160 ||
      typeof raw.latitude !== "number" ||
      typeof raw.longitude !== "number" ||
      !coordinates({ latitude: raw.latitude, longitude: raw.longitude })
    )
      continue;
    if (ids.has(raw.id)) throw new Error("Duplicate EPA monitoring station");
    ids.add(raw.id);
    // Victoria station coordinates cannot use the API's historical [lat, lon]
    // order as conventional GeoJSON [lon, lat]. Reject reversed/outside metadata.
    if (
      raw.latitude < -40 ||
      raw.latitude > -33 ||
      raw.longitude < 140 ||
      raw.longitude > 151
    )
      continue;
    stations.push({
      id: raw.id,
      name: raw.name.trim(),
      latitude: raw.latitude,
      longitude: raw.longitude,
      category: category(raw.category, now),
      pm25: pollutant(raw.pm25, now),
      pm10: pollutant(raw.pm10, now),
    });
  }
  return { source: "EPA Victoria", fetchedAt: payload.fetchedAt, stations };
}

function fresh<T extends { observedAt: string }>(
  reading: T | null,
  now: number,
): T | null {
  if (!reading) return null;
  const age = now - Date.parse(reading.observedAt);
  return Number.isFinite(age) && age >= -120_000 && age <= EPA_MAX_AGE_MS
    ? reading
    : null;
}

export function distanceKm(from: Coordinates, to: Coordinates): number {
  if (!coordinates(from) || !coordinates(to))
    throw new Error("Invalid location coordinates");
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const square =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return (
    6371 * 2 * Math.atan2(Math.sqrt(square), Math.sqrt(Math.max(0, 1 - square)))
  );
}

export interface NearbyEpaStation extends EpaStation {
  distanceKm: number;
}

/** Select by distance after expiring each field separately. Call again as time passes. */
export function nearestEpaStation(
  data: EpaObservations | undefined,
  location: Coordinates,
  now = Date.now(),
  maxDistanceKm = 100,
): NearbyEpaStation | null {
  if (
    !coordinates(location) ||
    !Number.isFinite(now) ||
    !Number.isFinite(maxDistanceKm) ||
    maxDistanceKm <= 0
  )
    throw new Error("Invalid EPA location or time");
  if (!data) return null;
  const candidates = data.stations
    .map((station) => ({
      ...station,
      category: fresh(station.category, now),
      pm25: fresh(station.pm25, now),
      pm10: fresh(station.pm10, now),
      distanceKm: distanceKm(location, station),
    }))
    .filter(
      (station) =>
        station.distanceKm <= maxDistanceKm &&
        (station.category || station.pm25 || station.pm10),
    );
  candidates.sort(
    (left, right) =>
      left.distanceKm - right.distanceKm || left.id.localeCompare(right.id),
  );
  return candidates[0] ?? null;
}

export function epaStationUrl(stationId: string): string {
  const url = new URL(EPA_SOURCE_URL);
  url.search = new URLSearchParams({
    site: `air|${stationId}`,
    tab: "map",
  }).toString();
  return url.toString();
}

/** Used only for request-regression detection; display each field's own source time. */
export function latestEpaObservation(data: EpaObservations): string {
  const times = data.stations
    .flatMap((station) => [station.category, station.pm25, station.pm10])
    .flatMap((reading) => (reading ? [Date.parse(reading.observedAt)] : []));
  return times.length
    ? new Date(Math.max(...times)).toISOString()
    : "1970-01-01T00:00:00.000Z";
}

export async function fetchEpa(
  location: Coordinates,
  signal?: AbortSignal,
): Promise<EpaObservations> {
  if (!coordinates(location)) throw new Error("Invalid location coordinates");
  const url = new URL(apiUrl("/api/air/observations"), window.location.href);
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok)
      throw new Error(
        `EPA station readings are unavailable (HTTP ${response.status})`,
      );
    return parseEpaObservations(await response.json());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
