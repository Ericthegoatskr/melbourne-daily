/** Our public proxy contract. This is not the EPA upstream response schema. */
export const EPA_CATEGORIES = [
  "Good",
  "Fair",
  "Poor",
  "Very Poor",
  "Extremely Poor",
] as const;

export type EpaCategory = (typeof EPA_CATEGORIES)[number];

export interface EpaCategoryReading {
  /** Copied from the official provider; never calculated from modeled pollution. */
  value: EpaCategory;
  observedAt: string;
}

export interface EpaPollutantReading {
  value: number;
  unit: "µg/m³";
  /** End of the provider's hourly observation interval. */
  observedAt: string;
  averagingPeriod: "1h";
}

export interface EpaStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Missing, unmonitored, invalid or unverified data must remain null. */
  category: EpaCategoryReading | null;
  pm25: EpaPollutantReading | null;
  pm10: EpaPollutantReading | null;
}

export interface EpaObservations {
  source: "EPA Victoria";
  fetchedAt: string;
  stations: EpaStation[];
}

/** Product freshness threshold for hourly observations, not a provider guarantee. */
export const EPA_MAX_AGE_MS = 3 * 60 * 60_000;
export const EPA_REFRESH_MS = 15 * 60_000;
export const EPA_SOURCE_URL =
  "https://www.epa.vic.gov.au/check-air-and-water-quality";
