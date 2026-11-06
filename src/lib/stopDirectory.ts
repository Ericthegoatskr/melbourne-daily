import {
  parseTransitStop,
  type TransitStop,
  type TransitMode,
} from "./transit";

export interface StopDirectory {
  generatedAt: string;
  sourceUpdatedAt: string;
  sourceUrl: string;
  stops: TransitStop[];
}
let cached: StopDirectory | undefined;
export async function fetchStopDirectory(
  signal?: AbortSignal,
): Promise<StopDirectory> {
  if (cached) return cached;
  const response = await fetch(
    `${import.meta.env.BASE_URL}data/transport-stops.json`,
    { signal },
  );
  if (!response.ok)
    throw new Error(
      "The stop directory is temporarily unavailable. Please try again.",
    );
  const raw = await response.json();
  if (
    !raw ||
    !Array.isArray(raw.stops) ||
    raw.stops.length < 100 ||
    !Number.isFinite(Date.parse(raw.sourceUpdatedAt)) ||
    !Number.isFinite(Date.parse(raw.generatedAt))
  )
    throw new Error("The stop directory could not be verified.");
  const stops = raw.stops.map(parseTransitStop);
  if (stops.some((stop: TransitStop) => stop.idScheme !== "gtfs"))
    throw new Error("The stop directory uses an unexpected identifier format.");
  const result: StopDirectory = {
    generatedAt: raw.generatedAt,
    sourceUpdatedAt: raw.sourceUpdatedAt,
    sourceUrl: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule",
    stops,
  };
  cached = result;
  return result;
}

export function findStops(
  directory: StopDirectory,
  query: string,
  mode: TransitMode,
): TransitStop[] {
  const terms = query
    .toLocaleLowerCase("en-AU")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (query.trim().length < 2 || query.length > 80) return [];
  return directory.stops
    .filter(
      (stop) =>
        stop.mode === mode &&
        terms.every((term) =>
          `${stop.name} ${stop.suburb} ${stop.id}`
            .toLocaleLowerCase("en-AU")
            .includes(term),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "en-AU") || a.id - b.id)
    .slice(0, 25);
}
