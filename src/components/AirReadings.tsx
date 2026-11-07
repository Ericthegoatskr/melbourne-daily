import { Layers, MapPin, ShieldCheck, Wind } from "lucide-react";
import type { EpaCategory, EpaPollutantReading } from "../../shared/epa";
import type { Location } from "../lib/weather";
import type { NearbyEpaStation } from "../lib/epa";
import { EPA_SOURCE_URL, epaStationUrl } from "../lib/epa";
import { AIR_SOURCE_URL, type AirData } from "../lib/air";
import { airLinks } from "../lib/community";
import { freshness, type Resource } from "../lib/resource";
import { Badge, EmptyState, ExternalLink, SourceTime } from "./ui";
import ValueChange from "./ValueChange";
import "./AirReadings.css";

const categoryClass: Record<EpaCategory, string> = {
  Good: "good",
  Fair: "fair",
  Poor: "poor",
  "Very Poor": "very-poor",
  "Extremely Poor": "extremely-poor",
};

/** A decorative city illustration, not a map or a pollution measurement. */
function AirScene() {
  return (
    <svg className="aq-air-scene" viewBox="0 0 180 150" aria-hidden="true">
      <ellipse cx="90" cy="131" rx="70" ry="7" fill="#d7e6dd" opacity=".5" />
      <g className="aq-scene-buildings">
        <rect x="29" y="74" width="32" height="57" rx="7" fill="#c7d8d4" />
        <rect x="65" y="47" width="42" height="84" rx="8" fill="#dfd5ed" />
        <rect x="112" y="88" width="31" height="43" rx="6" fill="#eddbc5" />
        <path d="M75 63h8m9 0h5M75 77h8m9 0h5M75 91h8m9 0h5M39 88h12m-12 14h12m-12 14h12m83-14h-11m11 13h-11" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".75" />
        <path d="M81 131v-20a5 5 0 0 1 10 0v20" fill="#c1b4d5" />
      </g>
      <g className="aq-scene-air" fill="none" strokeLinecap="round" strokeWidth="4">
        <path d="M23 34h77c18 0 18-22 2-22" stroke="#b6cbc5" />
        <path d="M44 46h83c18 0 18 21 3 21" stroke="#c9b7df" />
        <path d="M19 58h31" stroke="#d6b78d" />
      </g>
      <circle cx="154" cy="35" r="4" fill="#dcc8a9" />
      <circle cx="22" cy="111" r="3" fill="#b8c9bd" />
    </svg>
  );
}

export function CategoryCard({ station, location, now, loading, refreshing, error, onRetry, isNearest }: {
  station: NearbyEpaStation | null;
  location: Location;
  now: number;
  loading: boolean;
  refreshing: boolean;
  error?: string;
  onRetry: () => void;
  isNearest: boolean;
}) {
  return (
    <section className="card aq-category-card" id="station" aria-labelledby="aq-category-title">
      <div className="card-heading">
        <div className="card-title"><Wind size={19} aria-hidden /><h2 id="aq-category-title">EPA station status</h2></div>
        <Badge>Station observations</Badge>
      </div>
      {station ? <>
        <div className="aq-station-name"><MapPin size={17} aria-hidden /><div><strong>{station.name}</strong><span>About {station.distanceKm.toFixed(1)} km from {location.name}</span></div></div>
        <div className="aq-category-hero">
          <div className="aq-category-copy">
            <p className="aq-reading-kicker">{isNearest ? "NEAREST REPORTING STATION" : "SELECTED REPORTING STATION"}</p>
            <div className={`aq-category-value ${station.category ? `aq-category--${categoryClass[station.category.value]}` : "aq-category--unavailable"}`}>
              <span className="aq-category-dot" aria-hidden />
              {station.category ? <ValueChange value={station.category.value} /> : <strong>Category unavailable</strong>}
            </div>
            <p className="aq-category-caption">{station.category ? "Category supplied by EPA Victoria" : "EPA has no current category for this station."}</p>
          </div>
          <AirScene />
        </div>
        <p className="aq-reading-note">{isNearest ? "Nearest reporting station" : "Selected reporting station"} within 100 km of {location.name}. These measurements represent this site; conditions at your location can differ.</p>
        {error && <p className="aq-reading-warning" role="status">Refresh failed. Showing earlier observations until they expire.</p>}
      </> : <EmptyState loading={loading} message="EPA station readings are currently unavailable." onRetry={onRetry} />}
      <div className="card-footer">
        <ExternalLink href={station ? epaStationUrl(station.id) : EPA_SOURCE_URL}>{station ? "View this station at EPA" : "Check EPA AirWatch"}</ExternalLink>
        {station?.category && <SourceTime label="Observed" timestamp={station.category.observedAt} now={now} state={freshness(station.category.observedAt, now, 90, 180)} refreshing={refreshing} />}
      </div>
    </section>
  );
}

export function PollutantCard({ label, reading, stationName, now, refreshing }: {
  label: "PM2.5" | "PM10";
  reading: EpaPollutantReading | null;
  stationName?: string;
  now: number;
  refreshing: boolean;
}) {
  return (
    <section className={`card aq-pollutant-card aq-pollutant-card--${label === "PM2.5" ? "fine" : "coarse"}`} aria-label={`${label} station measurement`}>
      <div className="aq-pollutant-heading"><span className="aq-pollutant-icon"><Layers size={20} aria-hidden /></span><h2>{label}</h2></div>
      <p className="aq-pollutant-description">{label === "PM2.5" ? "Fine particulate matter" : "Particulate matter"}</p>
      {reading ? <>
        <div className="aq-pollutant-value"><ValueChange value={reading.value.toFixed(1)} /><small>µg/m³</small></div>
        <p className="aq-pollutant-period">1-hour mean</p>
      </> : <div className="aq-pollutant-empty"><strong>Unavailable</strong><span>No current station measurement</span></div>}
      <p className="aq-pollutant-site">{stationName || "EPA monitoring station"}</p>
      <div className="card-footer">
        {reading ? <SourceTime label="Hour ending" timestamp={reading.observedAt} now={now} state={freshness(reading.observedAt, now, 90, 180)} refreshing={refreshing} /> : <span>Missing readings are not counted as zero.</span>}
      </div>
    </section>
  );
}

export function RegionalAirCard({ resource, location, now, onRetry }: {
  resource: Resource<AirData>;
  location: Location;
  now: number;
  onRetry: () => void;
}) {
  const state = freshness(resource.data?.modelTime, now, 90, 180);
  const data = state !== "stale" ? resource.data : undefined;
  return (
    <section className="card aq-regional-card" id="model" aria-labelledby="aq-regional-title">
      <div className="card-heading"><div className="card-title"><Layers size={19} aria-hidden /><h2 id="aq-regional-title">Regional model estimate</h2></div><Badge tone={data && state === "delayed" ? "amber" : "neutral"}>{data && state === "delayed" ? "Delayed model" : "Model estimate"}</Badge></div>
      <p className="aq-regional-caption">{location.name} area · CAMS / Open-Meteo</p>
      {data ? <div className="aq-regional-readings">
        <div><span>PM2.5</span><strong><ValueChange value={data.pm25.toFixed(1)} /><small>µg/m³</small></strong><p>Fine particulate matter</p></div>
        <div><span>PM10</span><strong><ValueChange value={data.pm10.toFixed(1)} /><small>µg/m³</small></strong><p>Particulate matter</p></div>
      </div> : <EmptyState compact loading={resource.loading} message={resource.data ? "Air quality estimate has expired" : "Air quality estimate is unavailable"} onRetry={onRetry} />}
      <div className="aq-regional-context"><ShieldCheck size={19} aria-hidden /><p>A regional estimate on a ~45 km grid, not an EPA measurement or a street-level reading. See EPA for measured air quality and activity advice.</p></div>
      <div className="aq-regional-links">{airLinks.map((link) => <ExternalLink key={link.id} href={link.url}>{link.label}</ExternalLink>)}</div>
      {resource.error && data && <p className="aq-reading-warning" role="status">Refresh failed. Showing the previous regional estimate until it expires.</p>}
      <div className="card-footer"><ExternalLink href={AIR_SOURCE_URL}>CAMS · Open-Meteo</ExternalLink>{resource.data && <SourceTime label="Valid at" timestamp={resource.data.modelTime} now={now} state={state} refreshing={resource.loading} />}</div>
    </section>
  );
}
