import {
  EPA_CATEGORIES,
  EPA_MAX_AGE_MS,
  type EpaCategoryReading,
  type EpaObservations,
  type EpaPollutantReading,
  type EpaStation,
} from "../shared/epa";

/**
 * Upstream fields verified against EPA's official Environment Monitoring API 1.0.0
 * Swagger served by the DataVic-linked Victorian Developer Portal (7 Nov 2026).
 * https://discover.data.vic.gov.au/dataset/environment-monitoring-api
 * API catalogue id: abadeb94-477c-479f-996d-47b3d8dc1c37.
 * Authenticated production responses still need verification with this project's key.
 */
export interface EpaEnvironment {
  EPA_API_KEY?: string;
  /** Default is the host plus version prefix from the official Swagger. */
  EPA_API_BASE_URL?: string;
  /** Confirm against the subscribed product when configuring a key. */
  EPA_API_KEY_HEADER?: "X-API-Key" | "Ocp-Apim-Subscription-Key";
}

export const DEFAULT_EPA_BASE_URL =
  "https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1";
/** Product quality rule, not an EPA guarantee or health threshold. */
export const EPA_MIN_CONFIDENCE_PERCENT = 75;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function time(value: unknown): number | null {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** All surfaced observations are fresh one-hour averages, never 8h/24h values. */
function interval(value: Record<string, unknown>, now: number): string | null {
  const start = time(value.since);
  const end = time(value.until);
  if (
    start === null ||
    end === null ||
    end - start !== 3_600_000 ||
    end > now + 120_000 ||
    now - end > EPA_MAX_AGE_MS
  )
    return null;
  return new Date(end).toISOString();
}

function canonicalCategory(value: unknown): EpaCategoryReading["value"] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return (
    EPA_CATEGORIES.find((category) => category.toLowerCase() === normalized) ??
    null
  );
}

function micrograms(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // These forms occur in the official schema's SiteHealthReadings and Readings.
  const normalized = value
    .toLowerCase()
    .replace(/&micro;/g, "µ")
    .replace(/&sup3;/g, "³")
    .replace(/μ/g, "µ")
    .replace(/\s/g, "");
  return ["ug/m3", "µg/m³", "µg/m3"].includes(normalized);
}

function siteCategory(raw: unknown, now: number): EpaCategoryReading | null {
  if (!Array.isArray(raw)) return null;
  const readings: EpaCategoryReading[] = [];
  for (const entry of raw) {
    if (!record(entry)) continue;
    const observedAt = interval(entry, now);
    const value = canonicalCategory(entry.healthAdvice);
    if (
      !observedAt ||
      !value ||
      typeof entry.averageValue !== "number" ||
      !Number.isFinite(entry.averageValue) ||
      entry.averageValue < 0 ||
      typeof entry.healthParameter !== "string" ||
      !entry.healthParameter.trim()
    )
      continue;
    readings.push({ value, observedAt });
  }
  readings.sort(
    (left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt),
  );
  // Conflicting categories for the same current interval are not resolved by guessing.
  if (
    readings.length > 1 &&
    readings[0].observedAt === readings[1].observedAt &&
    readings[0].value !== readings[1].value
  )
    return null;
  return readings[0] ?? null;
}

function parameter(
  raw: unknown,
  name: "PM2.5" | "PM10",
  now: number,
): EpaPollutantReading | null {
  if (!Array.isArray(raw)) return null;
  const values: EpaPollutantReading[] = [];
  for (const entry of raw) {
    if (
      !record(entry) ||
      entry.name !== name ||
      !Array.isArray(entry.timeSeriesReadings)
    )
      continue;
    for (const series of entry.timeSeriesReadings) {
      if (
        !record(series) ||
        series.timeSeriesName !== "1HR_AV" ||
        !Array.isArray(series.readings)
      )
        continue;
      for (const reading of series.readings) {
        if (!record(reading)) continue;
        const observedAt = interval(reading, now);
        if (
          !observedAt ||
          typeof reading.averageValue !== "number" ||
          !Number.isFinite(reading.averageValue) ||
          reading.averageValue < 0 ||
          !micrograms(reading.unit) ||
          typeof reading.confidence !== "number" ||
          !Number.isFinite(reading.confidence) ||
          reading.confidence < EPA_MIN_CONFIDENCE_PERCENT ||
          reading.confidence > 100 ||
          typeof reading.totalSample !== "number" ||
          !Number.isInteger(reading.totalSample) ||
          reading.totalSample <= 0
        )
          continue;
        values.push({
          value: reading.averageValue,
          unit: "µg/m³",
          observedAt,
          averagingPeriod: "1h",
        });
      }
    }
  }
  values.sort(
    (left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt),
  );
  if (
    values.length > 1 &&
    values[0].observedAt === values[1].observedAt &&
    values[0].value !== values[1].value
  )
    return null;
  return values[0] ?? null;
}

export function normalizeEpaResponse(
  payload: unknown,
  now = Date.now(),
): EpaObservations {
  if (
    !record(payload) ||
    !Array.isArray(payload.records) ||
    payload.records.length > 500 ||
    !Number.isInteger(payload.totalRecords) ||
    payload.totalRecords !== payload.records.length ||
    !Number.isFinite(now)
  )
    throw new Error("Invalid EPA provider response");
  const ids = new Set<string>();
  const stations: EpaStation[] = [];
  for (const raw of payload.records) {
    if (
      !record(raw) ||
      typeof raw.siteID !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        raw.siteID,
      ) ||
      typeof raw.siteName !== "string" ||
      !raw.siteName.trim() ||
      raw.siteName.length > 160 ||
      !record(raw.geometry) ||
      raw.geometry.type !== "Point" ||
      !Array.isArray(raw.geometry.coordinates)
    )
      continue;
    // EPA's published Point3D example is [latitude, longitude], unlike GeoJSON.
    const [latitude, longitude] = raw.geometry.coordinates;
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -40 ||
      latitude > -33 ||
      longitude < 140 ||
      longitude > 151
    )
      continue;
    if (ids.has(raw.siteID)) throw new Error("Duplicate EPA provider station");
    ids.add(raw.siteID);
    stations.push({
      id: raw.siteID,
      name: raw.siteName.trim(),
      latitude,
      longitude,
      category: siteCategory(raw.siteHealthAdvices, now),
      pm25: parameter(raw.parameters, "PM2.5", now),
      pm10: parameter(raw.parameters, "PM10", now),
    });
  }
  if (payload.records.length && !stations.length)
    throw new Error("No usable EPA station metadata");
  return {
    source: "EPA Victoria",
    fetchedAt: new Date(now).toISOString(),
    stations,
  };
}

/** Single all-site request so the shared backend can cache this response for all suburbs. */
export async function fetchEpaObservations(
  env: EpaEnvironment,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<EpaObservations> {
  if (!env.EPA_API_KEY?.trim()) throw new Error("EPA_API_NOT_CONFIGURED");
  const base = new URL(env.EPA_API_BASE_URL || DEFAULT_EPA_BASE_URL);
  // Secrets must only be sent to the official service, including on redirects.
  if (
    base.protocol !== "https:" ||
    base.hostname !== "gateway.api.epa.vic.gov.au" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("Invalid EPA service configuration");
  const keyHeader = env.EPA_API_KEY_HEADER || "X-API-Key";
  if (!["X-API-Key", "Ocp-Apim-Subscription-Key"].includes(keyHeader))
    throw new Error("Invalid EPA authentication configuration");
  const url = new URL(`${base.toString().replace(/\/$/, "")}/sites/parameters`);
  url.searchParams.set("environmentalSegment", "air");
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      redirect: "error",
      headers: {
        Accept: "application/json",
        [keyHeader]: env.EPA_API_KEY.trim(),
      },
    });
    if (!response.ok)
      throw new Error(`EPA upstream request failed (HTTP ${response.status})`);
    return normalizeEpaResponse(await response.json());
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
