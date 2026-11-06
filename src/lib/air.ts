/** CAMS Global modeled pollution, served by Open-Meteo. Not EPA measurements. */
export interface AirData {
  fetchedAt: string;
  /** Valid time of the modeled current value; NOT model issue/update time. */
  modelTime: string;
  pm25: number;
  pm10: number;
}

export const AIR_MODEL_LABEL = "Regional model estimate (not an EPA reading)";
export const AIR_MODEL_RESOLUTION_KM = 45;
export const AIR_REFRESH_MS = 30 * 60 * 1000;
export const AIR_MAX_AGE_MS = 3 * 60 * 60 * 1000;
export const AIR_SOURCE_URL = "https://open-meteo.com/en/docs/air-quality-api";
export const AIR_ATTRIBUTION =
  "CAMS / Copernicus Atmosphere Monitoring Service · Open-Meteo";

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid air quality data format");
  }
  return value as Record<string, unknown>;
}

function concentration(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Missing or invalid air pollutant concentration");
  }
  return value;
}

export function parseAirResponse(value: unknown, now = Date.now()): AirData {
  const data = record(value);
  const units = record(data.current_units);
  const current = record(data.current);
  if (
    units.time !== "unixtime" ||
    units.pm2_5 !== "μg/m³" ||
    units.pm10 !== "μg/m³"
  ) {
    throw new Error("Unexpected air quality units");
  }
  if (typeof current.time !== "number" || !Number.isFinite(current.time)) {
    throw new Error("Missing air quality timestamp");
  }
  const modelMs = current.time * 1000;
  if (modelMs > now + 5 * 60 * 1000 || now - modelMs > AIR_MAX_AGE_MS) {
    throw new Error(
      "Air quality model data is stale or has an invalid timestamp",
    );
  }
  return {
    fetchedAt: new Date(now).toISOString(),
    modelTime: new Date(modelMs).toISOString(),
    pm25: concentration(current.pm2_5),
    pm10: concentration(current.pm10),
  };
}

export async function fetchAir(
  location: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<AirData> {
  if (
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    Math.abs(location.latitude) > 90 ||
    Math.abs(location.longitude) > 180
  ) {
    throw new Error("Invalid location coordinates");
  }
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "pm2_5,pm10",
    domains: "cams_global",
    timezone: "Australia/Melbourne",
    timeformat: "unixtime",
    forecast_days: "1",
  }).toString();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok)
      throw new Error(
        `The air quality source is unavailable (HTTP ${response.status})`,
      );
    return parseAirResponse(await response.json());
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
