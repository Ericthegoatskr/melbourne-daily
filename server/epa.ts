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
 * Authenticated responses on 7 Nov 2026 verified decimal-string count/quality metadata;
 * production confidence can exceed 100. Live retrieval is checked after deployment.
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

export type EpaFailureStage = "configuration" | "network" | "http" | "json" | "schema";
type EpaRuntimeClass =
  | "none"
  | "illegal_invocation"
  | "invalid_header"
  | "fetch_unavailable"
  | "unsupported_redirect"
  | "url_input_type"
  | "invalid_request"
  | "blocked_egress"
  | "timeout"
  | "aborted"
  | "network_error"
  | "type_error"
  | "syntax_error"
  | "range_error"
  | "error"
  | "unknown";

const EPA_FAILURES = {
  not_configured: { stage: "configuration", message: "EPA_API_NOT_CONFIGURED" },
  invalid_service_configuration: { stage: "configuration", message: "Invalid EPA service configuration" },
  invalid_authentication_configuration: { stage: "configuration", message: "Invalid EPA authentication configuration" },
  request_failed: { stage: "network", message: "EPA upstream request failed" },
  upstream_http_error: { stage: "http", message: "EPA upstream request failed" },
  invalid_json: { stage: "json", message: "Invalid EPA provider JSON" },
  invalid_response: { stage: "schema", message: "Invalid EPA provider response" },
  duplicate_station: { stage: "schema", message: "Duplicate EPA provider station" },
  no_station_metadata: { stage: "schema", message: "No usable EPA station metadata" },
} as const;
type EpaFailureCode = keyof typeof EPA_FAILURES;

/** Only controlled diagnostics are retained; never attach the upstream error as a cause. */
export class EpaServiceError extends Error {
  readonly stage: EpaFailureStage;
  readonly status?: number;

  constructor(
    readonly code: EpaFailureCode,
    readonly runtimeClass: EpaRuntimeClass = "none",
    status?: number,
  ) {
    const definition = EPA_FAILURES[code];
    const safeStatus = code === "upstream_http_error" && typeof status === "number" &&
      Number.isInteger(status) && status >= 0 && status <= 599
      ? status : undefined;
    super(definition.message + (safeStatus === undefined ? "" : ` (HTTP ${safeStatus})`));
    this.name = "EpaServiceError";
    this.stage = definition.stage;
    this.status = safeStatus;
  }
}

/** Match known runtime failures without ever returning/logging their raw text or names. */
function runtimeClass(cause: unknown, timedOut: boolean): EpaRuntimeClass {
  if (timedOut) return "timeout";
  if (!(cause instanceof Error)) return "unknown";
  if (/illegal invocation|incorrect receiver|incompatible receiver/i.test(cause.message))
    return "illegal_invocation";
  if (/invalid[^\n]*header|header[^\n]*invalid|header[^\n]*bytestring/i.test(cause.message))
    return "invalid_header";
  if (/fetch is not (?:defined|a function)|fetch[^\n]*unavailable/i.test(cause.message))
    return "fetch_unavailable";
  if (/redirect[^\n]*(?:unsupported|not supported|not implemented|invalid)|(?:unsupported|invalid)[^\n]*redirect/i.test(cause.message))
    return "unsupported_redirect";
  if (/startsWith is not a function|url[^\n]*(?:must be|expected)[^\n]*string|input[^\n]*(?:must be|expected)[^\n]*string/i.test(cause.message))
    return "url_input_type";
  if (/invalid url|invalid request|failed to parse url/i.test(cause.message))
    return "invalid_request";
  if (/(?:egress|outbound|network|host|domain)[^\n]*(?:blocked|forbidden|denied|not allowed)|(?:blocked|forbidden|denied)[^\n]*(?:egress|outbound|network|host|domain)/i.test(cause.message))
    return "blocked_egress";
  if (cause.name === "TimeoutError") return "timeout";
  if (cause.name === "AbortError") return "aborted";
  if (/failed to fetch|fetch failed|network error|networkerror|connection refused|enotfound|econnreset/i.test(cause.message))
    return "network_error";
  if (cause.name === "TypeError") return "type_error";
  if (cause.name === "SyntaxError") return "syntax_error";
  if (cause.name === "RangeError") return "range_error";
  return "error";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const EPA_RECOGNIZED_ROOT_KEYS = [
  "records", "totalRecords", "data", "value", "items", "result", "results",
  "sites", "features", "statusCode", "error", "errors", "message",
] as const;

function boundedCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000
    ? value : undefined;
}

function providerRecordCount(value: unknown): number | null {
  // Authenticated production response (7 Nov 2026) uses a decimal string,
  // whereas EPA's published Swagger declares this count as an integer.
  const count = typeof value === "number" ? value :
    typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(count) && count >= 0 && count <= 500 ? count : null;
}

function providerConfidence(value: unknown): number | null {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && /^(0|[1-9]\d*)(\.\d+)?$/.test(value) ? Number(value) : NaN;
  // EPA production values can exceed 100; retain the minimum quality requirement.
  return Number.isFinite(parsed) ? parsed : null;
}

function providerSampleCount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Shape only: no body values, unrecognized key names, or raw numeric strings. */
function responseShape(payload: unknown, includeContainers = true): Record<string, unknown> {
  const valueType = (value: unknown) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const root = { rootType: valueType(payload) };
  if (Array.isArray(payload))
    return { ...root, length: boundedCount(payload.length) };
  if (!record(payload)) return root;
  // Preserve casing only for names that match the known finite vocabulary.
  const recognizedKeys = Object.keys(payload).filter((key) =>
    EPA_RECOGNIZED_ROOT_KEYS.some((known) => known.toLowerCase() === key.toLowerCase()),
  ).slice(0, 26);
  const keyFor = (name: string) => recognizedKeys.find((key) => key === name) ??
    recognizedKeys.find((key) => key.toLowerCase() === name.toLowerCase());
  const recordsKey = keyFor("records");
  const totalKey = keyFor("totalRecords");
  const recordsValue = recordsKey === undefined ? undefined : payload[recordsKey];
  const totalValue = totalKey === undefined ? undefined : payload[totalKey];
  const count = boundedCount(totalValue);
  const strictlyNumeric = typeof totalValue === "string" && /^\d+$/.test(totalValue);
  const numericValue = strictlyNumeric ? boundedCount(Number(totalValue)) : undefined;
  const containers = includeContainers ? Object.fromEntries(
    ["data", "value", "items", "result", "results", "sites", "features"]
      .map(keyFor).filter((key): key is string => key !== undefined)
      .map((key) => [key, responseShape(payload[key], false)]),
  ) : {};
  return {
    ...root,
    recognizedKeys,
    records: {
      present: recordsKey !== undefined,
      type: valueType(recordsValue),
      ...(Array.isArray(recordsValue) ? { length: boundedCount(recordsValue.length) } : {}),
    },
    totalRecords: {
      present: totalKey !== undefined,
      type: valueType(totalValue),
      ...(count === undefined ? {} : { numericValue: count }),
      ...(typeof totalValue === "string" ? {
        strictlyNumeric,
        ...(numericValue === undefined ? {} : { numericValue }),
      } : {}),
    },
    ...(Object.keys(containers).length ? { containers } : {}),
  };
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
        const confidence = providerConfidence(reading.confidence);
        const totalSample = providerSampleCount(reading.totalSample);
        if (
          !observedAt ||
          typeof reading.averageValue !== "number" ||
          !Number.isFinite(reading.averageValue) ||
          reading.averageValue < 0 ||
          !micrograms(reading.unit) ||
          confidence === null ||
          confidence < EPA_MIN_CONFIDENCE_PERCENT ||
          totalSample === null
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
    providerRecordCount(payload.totalRecords) !== payload.records.length ||
    !Number.isFinite(now)
  )
    throw new EpaServiceError("invalid_response");
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
    if (ids.has(raw.siteID)) throw new EpaServiceError("duplicate_station");
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
    throw new EpaServiceError("no_station_metadata");
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
  fetcher?: typeof fetch,
): Promise<EpaObservations> {
  let stage: EpaFailureStage = "configuration";
  let timedOut = false;
  let cleanup = () => {};
  let schemaShape: ReturnType<typeof responseShape> | undefined;
  try {
    if (!env.EPA_API_KEY?.trim()) throw new EpaServiceError("not_configured");
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
      throw new EpaServiceError("invalid_service_configuration");
    const keyHeader = env.EPA_API_KEY_HEADER || "X-API-Key";
    if (!["X-API-Key", "Ocp-Apim-Subscription-Key"].includes(keyHeader))
      throw new EpaServiceError("invalid_authentication_configuration");
    const url = new URL(`${base.toString().replace(/\/$/, "")}/sites/parameters`);
    url.searchParams.set("environmentalSegment", "air");
    stage = "network";
    const request = fetcher ?? globalThis.fetch;
    if (typeof request !== "function")
      throw new EpaServiceError("request_failed", "fetch_unavailable");
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);
    cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    const response = await request(url, {
      signal: controller.signal,
      // Workers rejects redirect:"error" before sending the request. Manual mode
      // returns 3xx unchanged; the non-ok check below rejects it without forwarding keys.
      // https://developers.cloudflare.com/workers/runtime-apis/request/#parameters
      redirect: "manual",
      headers: {
        Accept: "application/json",
        [keyHeader]: env.EPA_API_KEY.trim(),
      },
    });
    stage = "http";
    if (!response.ok)
      throw new EpaServiceError("upstream_http_error", "none", response.status);
    stage = "json";
    const payload: unknown = await response.json();
    stage = "schema";
    schemaShape = responseShape(payload);
    return normalizeEpaResponse(payload);
  } catch (cause) {
    const codes: Record<EpaFailureStage, EpaFailureCode> = {
      configuration: "invalid_service_configuration",
      network: "request_failed",
      http: "upstream_http_error",
      json: "invalid_json",
      schema: "invalid_response",
    };
    const failure = cause instanceof EpaServiceError ? cause :
      new EpaServiceError(codes[stage], runtimeClass(cause, timedOut));
    console.error(JSON.stringify({
      marker: "epa_service_error",
      code: failure.code,
      stage: failure.stage,
      runtimeClass: failure.runtimeClass,
      ...(failure.status === undefined ? {} : { status: failure.status }),
      ...(failure.stage === "schema" && schemaShape ? { responseShape: schemaShape } : {}),
    }));
    throw failure;
  } finally {
    cleanup();
  }
}
