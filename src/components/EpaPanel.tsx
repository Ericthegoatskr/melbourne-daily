import { MapPin } from "lucide-react";
import type { EpaPollutantReading } from "../../shared/epa";
import { apiConfigured } from "../lib/api";
import {
  EPA_REFRESH_MS,
  EPA_SOURCE_URL,
  epaStationUrl,
  fetchEpa,
  nearestEpaStation,
  type EpaObservations,
} from "../lib/epa";
import { freshness, useResource } from "../lib/resource";
import { Badge, ExternalLink, SourceTime } from "./ui";

interface EpaPanelProps {
  location: { name: string; latitude: number; longitude: number };
  now: number;
  revision: number;
}

export default function EpaPanel({ location, now, revision }: EpaPanelProps) {
  const configured = apiConfigured();
  const resource = useResource<EpaObservations | null>(
    `epa:${configured}:${location.latitude}:${location.longitude}`,
    (signal) =>
      configured ? fetchEpa(location, signal) : Promise.resolve(null),
    EPA_REFRESH_MS,
    revision,
    // This is a complete snapshot. A newer snapshot with withdrawn observations
    // must clear previously displayed values, rather than keeping an older Good.
    (data) => data?.fetchedAt || "1970-01-01T00:00:00.000Z",
  );
  const station = nearestEpaStation(resource.data || undefined, location, now);
  const loading = configured && resource.loading && !resource.data;

  return (
    <section className="epa-panel" aria-label="EPA station observations">
      <div className="epa-heading">
        <h3>Nearby EPA station</h3>
        <Badge>Station observations</Badge>
      </div>
      {station ? (
        <>
          <div className="epa-station">
            <MapPin size={16} aria-hidden="true" />
            <div>
              <strong>{station.name}</strong>
              <span>
                About {station.distanceKm.toFixed(1)} km from {location.name}
              </span>
            </div>
          </div>
          <div className="epa-category">
            <span>EPA category</span>
            {station.category ? (
              <>
                <Badge
                  tone={
                    station.category.value === "Good"
                      ? "green"
                      : station.category.value === "Fair"
                        ? "amber"
                        : "red"
                  }
                >
                  {station.category.value}
                </Badge>
                <SourceTime
                  label="Observed"
                  timestamp={station.category.observedAt}
                  now={now}
                  state={freshness(station.category.observedAt, now, 90, 180)}
                  refreshing={resource.loading}
                />
              </>
            ) : (
              <strong className="epa-unavailable">Unavailable</strong>
            )}
          </div>
          <div className="epa-readings">
            <Pollutant
              label="PM2.5"
              reading={station.pm25}
              now={now}
              refreshing={resource.loading}
            />
            <Pollutant
              label="PM10"
              reading={station.pm10}
              now={now}
              refreshing={resource.loading}
            />
          </div>
          <p className="epa-explanation">
            Nearest reporting station within 100 km of {location.name}. These
            measurements represent this site; conditions at your location can
            differ.
          </p>
          {resource.error && (
            <p className="epa-refresh-warning" role="status">
              Refresh failed. Showing earlier observations until they expire.
            </p>
          )}
        </>
      ) : (
        <div className="epa-empty" role="status">
          <p>
            {loading
              ? "Checking nearby EPA monitoring stations…"
              : "EPA station readings are currently unavailable."}
          </p>
          <span>
            {loading
              ? "Looking for recent observations near your selected suburb."
              : "Check EPA AirWatch for monitoring sites, equipment notices and the latest official advice."}
          </span>
        </div>
      )}
      <ExternalLink
        className="epa-official-link"
        href={station ? epaStationUrl(station.id) : EPA_SOURCE_URL}
      >
        {station ? "View this station at EPA" : "Check EPA AirWatch"}
      </ExternalLink>
    </section>
  );
}

function Pollutant({
  label,
  reading,
  now,
  refreshing,
}: {
  label: string;
  reading: EpaPollutantReading | null;
  now: number;
  refreshing: boolean;
}) {
  return (
    <div
      className="epa-pollutant"
      role="group"
      aria-label={`${label} station measurement`}
    >
      <span>{label}</span>
      {reading ? (
        <>
          <strong>
            {reading.value.toFixed(1)}
            <small>µg/m³</small>
          </strong>
          <span>1-hour mean</span>
          <SourceTime
            label="Hour ending"
            timestamp={reading.observedAt}
            now={now}
            state={freshness(reading.observedAt, now, 90, 180)}
            refreshing={refreshing}
          />
        </>
      ) : (
        <strong className="epa-unavailable">Unavailable</strong>
      )}
    </div>
  );
}
