/** Public, credential-free data contract shared by the browser and API. */
export type TransitMode = "train" | "tram" | "bus";

export interface TransitStop {
  id: number;
  idScheme: "ptv" | "gtfs";
  name: string;
  suburb: string;
  mode: TransitMode;
  latitude: number;
  longitude: number;
}

export interface TransitDirection {
  id: number;
  name: string;
  routeId: number;
  routeName: string;
}

export interface TransitDeparture {
  id: string;
  runRef: string;
  routeId: number;
  routeName: string;
  routeNumber: string;
  directionId: number;
  destination: string;
  scheduledAt: string;
  estimatedAt: string | null;
  platform: string | null;
  status: "cancelled" | "estimated" | "scheduled";
  atPlatform: boolean;
  disruptionIds: number[];
  notes: string | null;
}

export interface TransitDisruption {
  id: number;
  title: string;
  description: string;
  url: string | null;
  status: string;
  updatedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  routeIds: number[];
  stopIds: number[];
}

export interface TransitSearch {
  /** API lookup time, not an upstream observation time. Preserve through caching. */
  checkedAt: string;
  stops: TransitStop[];
}

export interface TransitBoard {
  stopId: number;
  idScheme: "ptv" | "gtfs";
  /** PTV's returned stop identifier; it can differ from a requested GTFS ID. */
  upstreamStopId: number | null;
  mode: TransitMode;
  /** PTV does not expose a feed observation time here. This is the API lookup time. */
  checkedAt: string;
  directions: TransitDirection[];
  departures: TransitDeparture[];
  disruptions: TransitDisruption[];
}

export interface TransitSelection {
  stop: TransitStop;
  routeId?: number;
  directionId?: number;
  directionName?: string;
}

export const TRANSIT_REFRESH_MS = 30_000;
export const TRANSIT_MAX_AGE_MS = 120_000;
export const TRANSIT_ATTRIBUTION =
  "Source: Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence.";
