import { Moon, Sun, Sunrise, Sunset } from "lucide-react";
import type { Location, UVData, WeatherData } from "../lib/weather";
import { freshness, melbourneTime, type Resource } from "../lib/resource";
import { melbourneDate } from "../lib/forecast";
import { Badge, EmptyState, ExternalLink, SourceTime } from "./ui";
import ValueChange from "./ValueChange";
import "./WeatherUVPanel.css";

const ARPANSA_URL = "https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radiation-index";

function uvCategory(value: number) {
  return value < 3 ? "Low" : value < 6 ? "Moderate" : value < 8 ? "High" : value < 11 ? "Very high" : "Extreme";
}

/** Observations belong to one station; the forecast belongs to the selected suburb. */
export default function WeatherUVPanel({ uv, weather, location, now, onRetry }: {
  uv: Resource<UVData>;
  weather: WeatherData | undefined;
  location: Location;
  now: number;
  onRetry: () => void;
}) {
  const state = freshness(uv.data?.observedAt, now, 5, 15);
  const observed = state !== "stale" ? uv.data : undefined;
  const today = weather?.daily.find((day) => day.date === melbourneDate(now));

  return (
    <section className="card wx-uv-card" id="uv" aria-labelledby="wx-uv-title">
      <div className="card-heading">
        <div className="card-title"><Sun size={19} aria-hidden /><h2 id="wx-uv-title">UV index</h2></div>
        <Badge tone={observed && state === "fresh" ? "green" : observed ? "amber" : "neutral"}>
          {observed ? state === "fresh" ? "Observed" : "Delayed" : "Awaiting data"}
        </Badge>
      </div>
      {observed ? (
        <div className="wx-uv-observation">
          <p className="wx-panel-kicker">MELBOURNE STATION</p>
          <div className="wx-uv-reading">
            <ValueChange value={observed.value.toFixed(1)} />
            <span className={`wx-uv-category wx-uv-category--${observed.value < 3 ? "low" : observed.value < 6 ? "moderate" : "high"}`}>
              {uvCategory(observed.value)}
            </span>
          </div>
          <div className="wx-uv-meter" role="img" aria-label={`UV ${observed.value.toFixed(1)}, ${uvCategory(observed.value)}`}>
            <div className="wx-uv-meter-track"><i /><i /><i /><i /><i /></div>
            <span className="wx-uv-pointer" style={{ left: `${Math.min(observed.value / 12 * 100, 98)}%` }} />
          </div>
          <div className="wx-uv-meter-labels" aria-hidden><span>0</span><span>3</span><span>6</span><span>8</span><span>11+</span></div>
          <p className="wx-panel-note">Observed at the Melbourne station. This reading is the same for all suburbs.</p>
        </div>
      ) : (
        <EmptyState compact loading={uv.loading} message={uv.data ? "UV observation has expired" : "UV is temporarily unavailable"} onRetry={onRetry} />
      )}

      <div className="wx-uv-model">
        <div className="wx-uv-model-heading">
          <span>Today’s max UV<small>{location.name} · Model forecast</small></span>
          <strong>{today?.uvMax.toFixed(1) ?? "—"}</strong>
        </div>
        <p className="wx-panel-note">Observed UV and the daily maximum are different measures.</p>
        {weather ? <UVForecast weather={weather} now={now} /> : <p className="wx-uv-model-empty">UV forecast is unavailable until weather data returns.</p>}
      </div>
      <div className="card-footer">
        <ExternalLink href={ARPANSA_URL}>ARPANSA</ExternalLink>
        {uv.data && <SourceTime label="Observed" timestamp={uv.data.observedAt} now={now} state={state} refreshing={uv.loading} />}
      </div>
      {uv.error && observed && <p className="refresh-warning" role="status">Refresh failed. Showing the previous observation until it expires.</p>}
    </section>
  );
}

function UVForecast({ weather, now }: { weather: WeatherData; now: number }) {
  const hours = weather.hourly.filter((hour) => Date.parse(hour.time) >= Math.floor(now / 3_600_000) * 3_600_000).slice(0, 24);
  const available = hours.filter((hour) => hour.uvIndex !== null);
  if (!available.length) return <p className="wx-uv-model-empty">No upcoming hourly UV forecast is available.</p>;
  const ceiling = Math.max(12, Math.ceil(Math.max(...available.map((hour) => hour.uvIndex!))));
  const step = 264 / Math.max(hours.length, 1);
  return (
    <div className="wx-uv-forecast">
      <div className="wx-uv-forecast-heading"><span>Next 24 hours · model UV</span><span>0–{ceiling}</span></div>
      <svg className="wx-uv-chart" viewBox="0 0 280 82" role="img" aria-label="Hourly model UV forecast. Each bar is a forecast reading; a dashed mark means unavailable.">
        <line x1="8" y1="66" x2="272" y2="66" className="wx-uv-baseline" />
        {hours.map((hour, index) => {
          const x = 8 + index * step;
          const height = hour.uvIndex === null ? 0 : hour.uvIndex / ceiling * 58;
          return <g key={hour.time}>
            <title>{melbourneTime(hour.time)}: {hour.uvIndex === null ? "UV unavailable" : `UV ${hour.uvIndex.toFixed(1)}`}</title>
            {hour.uvIndex === null
              ? <line x1={x + 1} x2={x + step - 2} y1="69" y2="69" className="wx-uv-missing" />
              : hour.uvIndex === 0
                ? <line x1={x + 1} x2={x + step - 2} y1="66" y2="66" className="wx-uv-zero" />
                : <rect x={x + 1} y={66 - height} width={Math.max(1, step - 3)} height={height} rx="2" className="wx-uv-bar" />}
          </g>;
        })}
      </svg>
      <div className="wx-uv-chart-times"><span>{melbourneTime(hours[0].time)}</span><span>{melbourneTime(hours.at(-1)!.time)}</span></div>
      <p className="wx-uv-model-source">Open-Meteo · valid {melbourneTime(weather.current.time)} Melbourne time{freshness(weather.current.time, now, 30, 90) === "delayed" ? " · Delayed" : ""}</p>
    </div>
  );
}

export function DaylightPanel({ weather, now, loading, onRetry }: {
  weather: WeatherData | undefined;
  now: number;
  loading: boolean;
  onRetry: () => void;
}) {
  const today = weather?.daily.find((day) => day.date === melbourneDate(now));
  const rise = today ? Date.parse(today.sunrise) : 0;
  const set = today ? Date.parse(today.sunset) : 0;
  const duration = set - rise;
  const valid = !!today && duration > 0;
  const progress = valid ? Math.max(0, Math.min(1, (now - rise) / duration)) : 0;
  const angle = Math.PI * (1 - progress);
  const x = 160 + 132 * Math.cos(angle);
  const y = 108 - 75 * Math.sin(angle);
  const minutes = Math.round(duration / 60_000);
  const daylight = valid && now >= rise && now < set;
  const phase = now < rise ? "Before sunrise" : now >= set ? "Sun has set" : "Daylight hours";
  return (
    <section className="card wx-daylight-card" id="daylight" aria-labelledby="wx-daylight-title">
      <div className="card-heading">
        <div className="card-title"><Sunrise size={19} aria-hidden /><h2 id="wx-daylight-title">Daylight</h2></div>
        <Badge>Today · Melbourne time</Badge>
      </div>
      {valid ? <>
        <div className="wx-daylight-duration"><strong>{Math.floor(minutes / 60)}<small>h</small> {minutes % 60}<small>m</small></strong><span>between sunrise and sunset</span></div>
        <svg className="wx-daylight-arc" viewBox="0 0 320 132" role="img" aria-label={`Daylight progress: ${phase}. Sunrise ${melbourneTime(today.sunrise)}, sunset ${melbourneTime(today.sunset)}.`}>
          <path d="M28 108 A132 75 0 0 1 292 108" className="wx-daylight-track" />
          <path d="M28 108 A132 75 0 0 1 292 108" className="wx-daylight-progress" pathLength="1" strokeDasharray={`${progress} 1`} />
          <line x1="16" x2="304" y1="108" y2="108" className="wx-daylight-horizon" />
          <circle cx="28" cy="108" r="4" className="wx-daylight-end" /><circle cx="292" cy="108" r="4" className="wx-daylight-end" />
          <g className={`wx-daylight-marker ${daylight ? "is-day" : "is-night"}`} transform={`translate(${x} ${y})`}>
            <circle r="15" />
            {daylight ? <Sun x="-9" y="-9" width="18" height="18" aria-hidden /> : <Moon x="-8" y="-8" width="16" height="16" aria-hidden />}
          </g>
        </svg>
        <div className="wx-daylight-times">
          <div><Sunrise size={18} aria-hidden /><span>Sunrise<strong>{melbourneTime(today.sunrise)}</strong></span></div>
          <div><Sunset size={18} aria-hidden /><span>Sunset<strong>{melbourneTime(today.sunset)}</strong></span></div>
        </div>
        <p className="wx-daylight-phase">{daylight ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}{phase}</p>
        <p className="wx-panel-note">The arc shows elapsed daylight, rather than the sun’s position in the sky.</p>
      </> : <EmptyState compact loading={loading} message="Daylight forecast is unavailable" onRetry={onRetry} />}
      <div className="card-footer">
        <ExternalLink href="https://open-meteo.com/">Open-Meteo</ExternalLink>
        {weather && <SourceTime label="Valid at" timestamp={weather.current.time} now={now} state={freshness(weather.current.time, now, 30, 90)} refreshing={loading} />}
      </div>
    </section>
  );
}
