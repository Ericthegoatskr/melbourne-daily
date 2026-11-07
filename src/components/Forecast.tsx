import { useId, useState, type PointerEvent } from "react";
import { ArrowDown, ArrowUp, Droplets } from "lucide-react";
import type { WeatherData } from "../lib/weather";
import { forecastDayLabel, forecastIsDay, melbourneDate } from "../lib/forecast";
import { melbourneTime } from "../lib/resource";
import { WeatherIcon } from "./ui";
import "./Forecast.css";

const WIDTH = 640;
const LEFT = 30;
const RIGHT = 596;
const TOP = 18;
const BOTTOM = 126;
const round = (value: number) => Math.round(value);

export default function Forecast({ data, now }: { data: WeatherData; now: number }) {
  const [view, setView] = useState<"hourly" | "daily">("hourly");
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const gradientId = useId();
  const hourly = data.hourly
    .filter((hour) => Date.parse(hour.time) >= Math.floor(now / 3_600_000) * 3_600_000)
    .slice(0, 24);
  const days = data.daily.filter((day) => day.date >= melbourneDate(now));
  const selectedIndex = Math.max(0, hourly.findIndex((hour) => hour.time === selectedTime));
  const selected = hourly[selectedIndex];
  const low = hourly.length ? Math.floor(Math.min(...hourly.map((hour) => hour.temperature))) - 2 : 0;
  const high = hourly.length ? Math.ceil(Math.max(...hourly.map((hour) => hour.temperature))) + 2 : 1;
  const x = (index: number) => hourly.length === 1
    ? (LEFT + RIGHT) / 2
    : LEFT + index * (RIGHT - LEFT) / Math.max(1, hourly.length - 1);
  const y = (value: number) => BOTTOM - (value - low) / (high - low) * (BOTTOM - TOP);
  const points = hourly.map((hour, index) => ({ x: x(index), y: y(hour.temperature) }));
  // Each segment stays between its two actual readings; smoothing adds no peaks.
  const line = points.map((point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const midpoint = (previous.x + point.x) / 2;
    return `C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
  }).join(" ");
  const labelIndices = [...new Set([0, Math.floor((hourly.length - 1) / 3), Math.floor(2 * (hourly.length - 1) / 3), hourly.length - 1])];
  const selectAtPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!hourly.length) return;
    if (event.type === "pointermove" && event.pointerType !== "mouse" && !event.buttons) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    const plotX = (event.clientX - box.left) / box.width * WIDTH;
    const index = Math.max(0, Math.min(hourly.length - 1, Math.round((plotX - LEFT) / (RIGHT - LEFT) * (hourly.length - 1))));
    setSelectedTime(hourly[index].time);
  };

  return (
    <div className="forecast forecast-interactive">
      <div className="forecast-heading">
        <span>{view === "hourly" ? "Your next 24 hours" : "The days ahead"}</span>
        <div className="segmented" role="group" aria-label="Forecast range">
          <button aria-pressed={view === "hourly"} onClick={() => setView("hourly")}>24 hours</button>
          <button aria-pressed={view === "daily"} onClick={() => setView("daily")}>3-day forecast</button>
        </div>
      </div>

      {view === "hourly" ? selected ? (
        <div className="forecast-hourly-view">
          <div className="forecast-chart-meta">
            <div className="forecast-chart-legend" aria-label="Chart legend">
              <span><i className="forecast-temperature-key" />Temperature · °C</span>
              <span><i className="forecast-rain-key" />Rain chance · %</span>
            </div>
            <output className="forecast-selected" aria-label="Selected forecast hour">
              <time dateTime={selected.time}>{melbourneTime(selected.time)}</time>
              <strong>{round(selected.temperature)}°C</strong>
              <span><Droplets size={12} aria-hidden="true" />{selected.rainProbability}%</span>
            </output>
          </div>
          <svg
            className="forecast-chart"
            viewBox={`0 0 ${WIDTH} 160`}
            role="img"
            aria-label="Hourly forecast: orange temperature line uses the left °C axis; purple rain probability bars use the right % axis. Use Forecast hour below to explore readings."
            onPointerMove={selectAtPointer}
            onPointerDown={selectAtPointer}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f47a42" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#f47a42" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((ratio) => (
              <g key={ratio} className="forecast-gridline">
                <line x1={LEFT} x2={RIGHT} y1={TOP + ratio * (BOTTOM - TOP)} y2={TOP + ratio * (BOTTOM - TOP)} />
                <text x={LEFT - 9} y={TOP + ratio * (BOTTOM - TOP) + 4} textAnchor="end">{round(high - ratio * (high - low))}°</text>
                <text x={RIGHT + 9} y={TOP + ratio * (BOTTOM - TOP) + 4}>{100 - ratio * 100}%</text>
              </g>
            ))}
            {hourly.map((hour, index) => (
              <rect
                key={hour.time}
                className="forecast-rain-bar"
                x={x(index) - 5}
                y={BOTTOM - hour.rainProbability / 100 * (BOTTOM - TOP)}
                width="10"
                height={hour.rainProbability / 100 * (BOTTOM - TOP)}
                rx="4"
              />
            ))}
            {points.length > 1 && (
              <path d={`${line} L ${points.at(-1)!.x} ${BOTTOM} L ${points[0].x} ${BOTTOM} Z`} fill={`url(#${gradientId})`} />
            )}
            <path className="forecast-temperature-line" d={line} pathLength="1" />
            <line className="forecast-cursor" x1={x(selectedIndex)} x2={x(selectedIndex)} y1={TOP} y2={BOTTOM} />
            <circle className="forecast-point-halo" cx={x(selectedIndex)} cy={y(selected.temperature)} r="9" />
            <circle className="forecast-point" cx={x(selectedIndex)} cy={y(selected.temperature)} r="4.5" />
            {labelIndices.map((index) => hourly[index] && (
              <text className="forecast-time-tick" key={index} x={x(index)} y="151" textAnchor={index === 0 ? "start" : index === hourly.length - 1 ? "end" : "middle"}>
                {melbourneTime(hourly[index].time)}
              </text>
            ))}
          </svg>
          <label className="forecast-scrubber">
            <span>Explore the forecast</span>
            <input
              aria-label="Forecast hour"
              type="range"
              min={0}
              max={Math.max(0, hourly.length - 1)}
              step={1}
              value={selectedIndex}
              disabled={hourly.length < 2}
              aria-valuetext={`${melbourneTime(selected.time)}, ${round(selected.temperature)} degrees Celsius, ${selected.rainProbability}% chance of rain`}
              onChange={(event) => setSelectedTime(hourly[Number(event.target.value)].time)}
            />
          </label>
          <div className="forecast-hours-scroll" tabIndex={0} role="region" aria-label="24-hour forecast, scroll horizontally">
            <div className="forecast-hours-track">
              {hourly.map((hour, index) => (
                <button
                  key={hour.time}
                  className={`forecast-hour-button ${index === selectedIndex ? "is-selected" : ""}`}
                  aria-pressed={index === selectedIndex}
                  aria-label={`${melbourneTime(hour.time)}, ${round(hour.temperature)} degrees, ${hour.rainProbability}% chance of rain`}
                  onClick={() => setSelectedTime(hour.time)}
                >
                  <time dateTime={hour.time}>{index === 0 && Date.parse(hour.time) <= now ? "Now" : melbourneTime(hour.time)}</time>
                  <WeatherIcon code={hour.weatherCode} isDay={forecastIsDay(hour.time, data.daily)} size={19} />
                  <strong>{round(hour.temperature)}°</strong>
                  <span><Droplets size={10} aria-hidden="true" />{hour.rainProbability}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="forecast-empty" role="status">No upcoming hourly forecast is available. Try refreshing the weather.</p>
      ) : (
        <div className="daily-forecast">
          {days.length ? days.map((day) => (
            <div className="day" key={day.date}>
              <span>{forecastDayLabel(day.date, now)}</span>
              <span><ArrowDown size={12} />{round(day.min)}° <b><ArrowUp size={12} />{round(day.max)}°</b></span>
              <span><Droplets size={13} />{day.rainProbability}%</span>
              <span>Max UV <b>{day.uvMax.toFixed(1)}</b></span>
            </div>
          )) : <p className="forecast-empty" role="status">No upcoming daily forecast is available.</p>}
        </div>
      )}
    </div>
  );
}
