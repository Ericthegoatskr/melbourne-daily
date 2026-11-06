/** Open-Meteo provides model estimates, not station observations. */
export interface Location {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export const LOCATIONS: Location[] = [
  {
    id: "melbourne",
    name: "Melbourne CBD",
    latitude: -37.8136,
    longitude: 144.9631,
  },
  { id: "richmond", name: "Richmond", latitude: -37.8182, longitude: 145.0018 },
  { id: "fitzroy", name: "Fitzroy", latitude: -37.7984, longitude: 144.9785 },
  { id: "st-kilda", name: "St Kilda", latitude: -37.8676, longitude: 144.9809 },
  { id: "footscray", name: "Footscray", latitude: -37.8, longitude: 144.9 },
  { id: "box-hill", name: "Box Hill", latitude: -37.817, longitude: 145.125 },
  {
    id: "brunswick",
    name: "Brunswick",
    latitude: -37.7675,
    longitude: 144.9612,
  },
  {
    id: "dandenong",
    name: "Dandenong",
    latitude: -37.9875,
    longitude: 145.2149,
  },
  { id: "werribee", name: "Werribee", latitude: -37.9033, longitude: 144.6577 },
];

export interface WeatherData {
  fetchedAt: string;
  current: {
    time: string;
    temperature: number;
    feelsLike: number;
    windSpeed: number;
    precipitation: number;
    weatherCode: number;
    isDay: boolean;
  };
  hourly: Array<{
    time: string;
    temperature: number;
    rainProbability: number;
    uvIndex: number | null;
    weatherCode: number;
  }>;
  daily: Array<{
    date: string;
    min: number;
    max: number;
    rainProbability: number;
    uvMax: number;
    sunrise: string;
    sunset: string;
  }>;
}

export interface UVData {
  value: number;
  observedAt: string;
  station: string;
  fetchedAt: string;
}

type RecordValue = Record<string, unknown>;
const TIMEOUT_MS = 15_000;
const WEATHER_CODES = new Set([
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
  80, 81, 82, 85, 86, 95, 96, 99,
]);

function record(value: unknown, field: string): RecordValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid weather data: ${field}`);
  }
  return value as RecordValue;
}

function finite(value: unknown, field: string, min = -100, max = 100): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`Invalid weather value: ${field}`);
  }
  return value;
}

function wmo(value: unknown): number {
  const code = finite(value, "weather_code", 0, 99);
  if (!WEATHER_CODES.has(code)) throw new Error("Invalid weather code");
  return code;
}

function timestamp(value: unknown, field: string): string {
  const seconds = finite(value, field, 946684800, 7258118400);
  return new Date(seconds * 1000).toISOString();
}

function series(source: RecordValue, field: string, length: number): unknown[] {
  const values = source[field];
  if (!Array.isArray(values) || values.length !== length) {
    throw new Error(`Incomplete weather series: ${field}`);
  }
  return values;
}

function times(source: RecordValue, minLength: number): string[] {
  if (!Array.isArray(source.time) || source.time.length < minLength) {
    throw new Error("Not enough forecast hours");
  }
  const values = source.time.map((value) => timestamp(value, "time"));
  if (values.some((value, index) => index > 0 && value <= values[index - 1])) {
    throw new Error("Weather timestamps are out of order");
  }
  return values;
}

function melbourneDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** All instants are ISO UTC; daily.date is a calendar date in Melbourne. */
export function parseWeather(
  payload: unknown,
  fetchedAt = new Date().toISOString(),
): WeatherData {
  const root = record(payload, "root");
  if (root.timezone !== "Australia/Melbourne")
    throw new Error("Unexpected forecast time zone");
  const current = record(root.current, "current");
  const hourly = record(root.hourly, "hourly");
  const daily = record(root.daily, "daily");
  const currentUnits = record(root.current_units, "current_units");
  const hourlyUnits = record(root.hourly_units, "hourly_units");
  const dailyUnits = record(root.daily_units, "daily_units");
  if (
    currentUnits.time !== "unixtime" ||
    hourlyUnits.time !== "unixtime" ||
    dailyUnits.time !== "unixtime" ||
    currentUnits.temperature_2m !== "°C" ||
    currentUnits.apparent_temperature !== "°C" ||
    currentUnits.wind_speed_10m !== "km/h" ||
    currentUnits.precipitation !== "mm" ||
    hourlyUnits.temperature_2m !== "°C" ||
    hourlyUnits.precipitation_probability !== "%" ||
    dailyUnits.temperature_2m_min !== "°C" ||
    dailyUnits.temperature_2m_max !== "°C" ||
    dailyUnits.precipitation_probability_max !== "%" ||
    dailyUnits.sunrise !== "unixtime" ||
    dailyUnits.sunset !== "unixtime"
  )
    throw new Error("Unexpected weather units");

  const hourlyTimes = times(hourly, 24);
  const hourlyTemperatures = series(
    hourly,
    "temperature_2m",
    hourlyTimes.length,
  );
  const hourlyRain = series(
    hourly,
    "precipitation_probability",
    hourlyTimes.length,
  );
  const hourlyUV = series(hourly, "uv_index", hourlyTimes.length);
  const hourlyCodes = series(hourly, "weather_code", hourlyTimes.length);
  const dailyTimes = times(daily, 2);
  const mins = series(daily, "temperature_2m_min", dailyTimes.length);
  const maxes = series(daily, "temperature_2m_max", dailyTimes.length);
  const dailyRain = series(
    daily,
    "precipitation_probability_max",
    dailyTimes.length,
  );
  const dailyUV = series(daily, "uv_index_max", dailyTimes.length);
  const sunrise = series(daily, "sunrise", dailyTimes.length);
  const sunset = series(daily, "sunset", dailyTimes.length);
  const isDay = finite(current.is_day, "is_day", 0, 1);
  if (isDay !== 0 && isDay !== 1)
    throw new Error("Invalid day or night indicator");

  return {
    fetchedAt,
    current: {
      time: timestamp(current.time, "current.time"),
      temperature: finite(current.temperature_2m, "temperature_2m"),
      feelsLike: finite(current.apparent_temperature, "apparent_temperature"),
      windSpeed: finite(current.wind_speed_10m, "wind_speed_10m", 0, 500),
      precipitation: finite(current.precipitation, "precipitation", 0, 1000),
      weatherCode: wmo(current.weather_code),
      isDay: isDay === 1,
    },
    hourly: hourlyTimes.map((time, index) => ({
      time,
      temperature: finite(hourlyTemperatures[index], "hourly.temperature_2m"),
      rainProbability: finite(
        hourlyRain[index],
        "hourly.precipitation_probability",
        0,
        100,
      ),
      // A provider null is explicitly unavailable, never assumed zero.
      uvIndex:
        hourlyUV[index] === null
          ? null
          : finite(hourlyUV[index], "hourly.uv_index", 0, 30),
      weatherCode: wmo(hourlyCodes[index]),
    })),
    daily: dailyTimes.map((time, index) => {
      const min = finite(mins[index], "daily.temperature_2m_min");
      const max = finite(maxes[index], "daily.temperature_2m_max");
      if (min > max)
        throw new Error("Daily minimum exceeds maximum temperature");
      const rises = timestamp(sunrise[index], "sunrise");
      const sets = timestamp(sunset[index], "sunset");
      if (rises >= sets) throw new Error("Sunrise and sunset are out of order");
      return {
        date: melbourneDate(time),
        min,
        max,
        rainProbability: finite(
          dailyRain[index],
          "daily.precipitation_probability_max",
          0,
          100,
        ),
        uvMax: finite(dailyUV[index], "daily.uv_index_max", 0, 30),
        sunrise: rises,
        sunset: sets,
      };
    }),
  };
}

async function request<T>(
  url: string,
  parse: (response: Response) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error("The data source timed out")),
    TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok)
      throw new Error(
        `The data source is unavailable (HTTP ${response.status})`,
      );
    return await parse(response);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

export async function fetchWeather(
  location: Location,
  signal?: AbortSignal,
): Promise<WeatherData> {
  const query = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current:
      "temperature_2m,apparent_temperature,wind_speed_10m,precipitation,weather_code,is_day",
    hourly: "temperature_2m,precipitation_probability,uv_index,weather_code",
    daily:
      "temperature_2m_min,temperature_2m_max,precipitation_probability_max,uv_index_max,sunrise,sunset",
    timezone: "Australia/Melbourne",
    timeformat: "unixtime",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    forecast_days: "3",
  });
  return request(
    `https://api.open-meteo.com/v1/forecast?${query}`,
    async (response) => parseWeather(await response.json()),
    signal,
  );
}

/** ARPANSA's local text time can omit DST. Use its explicit UTC field. */
export function parseUV(
  xml: string,
  fetchedAt = new Date().toISOString(),
): UVData {
  const document = new DOMParser().parseFromString(
    xml.replace(/^\uFEFF/, ""),
    "application/xml",
  );
  if (document.querySelector("parsererror"))
    throw new Error("Invalid UV data format");
  const stations = Array.from(document.querySelectorAll("location")).filter(
    (element) => element.getAttribute("id") === "Melbourne",
  );
  if (stations.length !== 1)
    throw new Error("A unique Melbourne UV station could not be found");
  const station = stations[0];
  const value = (name: string) => {
    const fields = station.querySelectorAll(name);
    if (fields.length !== 1) throw new Error(`Missing UV field: ${name}`);
    return fields[0].textContent?.trim() ?? "";
  };
  if (value("status").toLowerCase() !== "ok")
    throw new Error("The Melbourne UV station is not reporting");
  const rawUV = value("index");
  if (!/^\d+(?:\.\d+)?$/.test(rawUV)) throw new Error("Invalid UV reading");
  const uv = Number(rawUV);
  if (!Number.isFinite(uv) || uv < 0 || uv > 30)
    throw new Error("UV reading is out of range");
  const rawTime = value("utcdatetime");
  const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    rawTime,
  );
  if (!match) throw new Error("Invalid UV observation time");
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}.000Z`;
  const observed = new Date(iso);
  if (!Number.isFinite(observed.getTime()) || observed.toISOString() !== iso)
    throw new Error("Invalid UV observation date");
  const retrieved = Date.parse(fetchedAt);
  if (!Number.isFinite(retrieved) || observed.getTime() > retrieved + 120_000)
    throw new Error("UV observation time is in the future");
  return {
    value: uv,
    observedAt: observed.toISOString(),
    station: "Melbourne",
    fetchedAt,
  };
}

export async function fetchUV(signal?: AbortSignal): Promise<UVData> {
  return request(
    "https://uvdata.arpansa.gov.au/xml/uvvalues.xml",
    async (response) => parseUV(await response.text()),
    signal,
  );
}

export function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([56, 57, 66, 67].includes(code)) return "Freezing rain";
  if (code === 61) return "Light rain";
  if (code === 63) return "Rain";
  if (code === 65) return "Heavy rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Weather unavailable";
}
