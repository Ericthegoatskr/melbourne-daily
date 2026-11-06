import {
  ArrowUpRight,
  CloudSun,
  CloudMoon,
  CloudFog,
  CloudRain,
  Cloud,
  Sun,
  Moon,
  Snowflake,
  CloudLightning,
  AlertCircle,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { ago, melbourneTime, type Freshness } from "../lib/resource";

export function WeatherIcon({
  code,
  isDay = true,
  size = 26,
}: {
  code: number;
  isDay?: boolean;
  size?: number;
}) {
  const Icon =
    code >= 95
      ? CloudLightning
      : (code >= 71 && code <= 77) || code === 85 || code === 86
        ? Snowflake
        : code >= 51
          ? CloudRain
          : code === 45 || code === 48
            ? CloudFog
            : code >= 3
              ? Cloud
              : code > 0
                ? isDay
                  ? CloudSun
                  : CloudMoon
                : isDay
                  ? Sun
                  : Moon;
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
export function ExternalLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
      <ArrowUpRight size={16} aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  return (
    <span className={`badge badge-${tone}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}
export function SourceTime({
  label,
  timestamp,
  now,
  state = "fresh",
  refreshing = false,
}: {
  label: string;
  timestamp: string;
  now: number;
  state?: Freshness;
  refreshing?: boolean;
}) {
  return (
    <span
      className={`source-time ${state === "fresh" ? "" : "warning-text"}`}
      title={`${new Date(timestamp).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", hourCycle: "h23" })} · Melbourne`}
    >
      {refreshing ? (
        <RefreshCw size={11} className="spin" aria-hidden="true" />
      ) : (
        <span className="tiny-dot" aria-hidden="true" />
      )}
      {label} {melbourneTime(timestamp)} · {ago(timestamp, now)}
      {state === "delayed" ? " · Delayed" : state === "stale" ? " · Stale" : ""}
    </span>
  );
}
export function EmptyState({
  loading,
  message = "This source is temporarily unavailable",
  onRetry,
  compact = false,
}: {
  loading: boolean;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`} role="status">
      {loading ? (
        <LoaderCircle className="spin" size={25} />
      ) : (
        <AlertCircle size={25} />
      )}
      <strong>{loading ? "Loading latest data" : message}</strong>
      <p>
        {loading
          ? "Connecting to public data sources…"
          : "Automatic updates will retry. You can also check the official source."}
      </p>
      {!loading && onRetry && (
        <button className="text-button" onClick={onRetry}>
          <RefreshCw size={14} />
          Try again
        </button>
      )}
    </div>
  );
}
