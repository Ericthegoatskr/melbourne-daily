import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  CarFront,
  ChevronDown,
  CloudSun,
  Compass,
  Database,
  Droplets,
  ExternalLink as ExternalIcon,
  LayoutGrid,
  MapPin,
  Menu,
  RefreshCw,
  ShieldCheck,
  Star,
  Sun,
  Sunrise,
  Sunset,
  TrainFront,
  TramFront,
  Wind,
  X,
} from "lucide-react";
import {
  LOCATIONS,
  fetchWeather,
  fetchUV,
  weatherLabel,
} from "./lib/weather";
import { fetchParking } from "./lib/parking";
import { fetchAir, AIR_SOURCE_URL, AIR_REFRESH_MS } from "./lib/air";
import { transportLinks, airLinks, roadTrafficLink } from "./lib/community";
import {
  useResource,
  useNow,
  freshness,
  melbourneTime,
  readPreference,
  savePreference,
} from "./lib/resource";
import {
  Badge,
  EmptyState,
  ExternalLink,
  SourceTime,
} from "./components/ui";
import { melbourneDate } from "./lib/forecast";
import Forecast from "./components/Forecast";
import WeatherScene from "./components/WeatherScene";
import ValueChange from "./components/ValueChange";
import CommutePanel from "./components/CommutePanel";
import EpaPanel from "./components/EpaPanel";

const PARKING_URL =
  "https://ericthegoatskr.github.io/melbourne-parking-dashboard/";
const REPO_URL = "https://github.com/Ericthegoatskr/melbourne-daily";
const ARPANSA_URL =
  "https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radiation-index";
const navItems = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "weather", label: "Weather & UV", icon: CloudSun },
  { id: "transport", label: "Getting around", icon: TrainFront },
  { id: "parking", label: "Street parking", icon: CarFront },
  { id: "air", label: "Air quality", icon: Wind },
];
function sectionFromHash() {
  const id = window.location.hash.slice(1);
  return navItems.some((item) => item.id === id) || id === "collection" || id === "sources"
    ? id
    : "overview";
}
const fmt = (n: number) => new Intl.NumberFormat("en-AU").format(n);
const rounded = (n: number) => Math.round(n);
function uvLabel(value: number) {
  return value < 3
    ? "Low"
    : value < 6
      ? "Moderate"
      : value < 8
        ? "High"
        : value < 11
          ? "Very high"
          : "Extreme";
}

export default function App() {
  const now = useNow();
  const [locationId, setLocationId] = useState(() =>
    readPreference("location", "melbourne"),
  );
  const location =
    LOCATIONS.find((place) => place.id === locationId) || LOCATIONS[0];
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState(sectionFromHash);
  useEffect(() => {
    const syncNavigation = () => setActive(sectionFromHash());
    window.addEventListener("hashchange", syncNavigation);
    return () => window.removeEventListener("hashchange", syncNavigation);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const focusable = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) || [],
      );
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [menuOpen]);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        readPreference("transport-favorites", '["departures","network"]'),
      );
      return Array.isArray(value)
        ? value.filter(
            (id): id is string =>
              typeof id === "string" &&
              transportLinks.some((link) => link.id === id),
          )
        : ["departures", "network"];
    } catch {
      return ["departures", "network"];
    }
  });
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const weather = useResource(
    `weather:${location.id}`,
    (signal) => fetchWeather(location, signal),
    15 * 60_000,
    revision,
    (data) => data.current.time,
  );
  const uv = useResource(
    "uv:melbourne",
    fetchUV,
    60_000,
    revision,
    (data) => data.observedAt,
  );
  const parking = useResource(
    "parking:melbourne",
    fetchParking,
    120_000,
    revision,
    (data) => data.observedAt,
  );
  const air = useResource(
    `air:${location.id}`,
    (signal) => fetchAir(location, signal),
    AIR_REFRESH_MS,
    revision,
    (data) => data.modelTime,
  );
  const weatherState = freshness(weather.data?.current.time, now, 30, 90);
  const uvState = freshness(uv.data?.observedAt, now, 5, 15);
  const parkingState = freshness(parking.data?.observedAt, now, 5, 15);
  const airState = freshness(air.data?.modelTime, now, 90, 180);
  const w = weatherState !== "stale" ? weather.data : undefined;
  const u = uvState !== "stale" ? uv.data : undefined;
  const p = parkingState !== "stale" ? parking.data : undefined;
  const a = airState !== "stale" ? air.data : undefined;
  const busy = weather.loading || uv.loading || parking.loading || air.loading;
  const refresh = () => setRevision((value) => value + 1);
  const date = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
  const localDate = melbourneDate(now);
  const today = w?.daily.find((day) => day.date === localDate);
  const allAvailable = !!(w && u && p && a);

  function toggleFavorite(id: string) {
    setFavorites((previous) => {
      const next = previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id];
      savePreference("transport-favorites", JSON.stringify(next));
      return next;
    });
  }
  function navigate(id: string) {
    setActive(id);
    setMenuOpen(false);
  }
  function closeMenu() {
    setMenuOpen(false);
    menuButton.current?.focus();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {menuOpen && (
        <div className="menu-backdrop" aria-hidden="true" onClick={closeMenu} />
      )}
      <aside
        ref={sidebar}
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen ? true : undefined}
        className={`sidebar ${menuOpen ? "is-open" : ""}`}
        aria-label="Main navigation"
      >
        {menuOpen && (
          <button
            className="drawer-close icon-button"
            aria-label="Close navigation"
            onClick={closeMenu}
          >
            <X size={19} />
          </button>
        )}
        <a
          href="#overview"
          className="brand"
          onClick={() => navigate("overview")}
        >
          <span className="brand-mark">
            m<span>.</span>
          </span>
          <span>
            melbourne
            <span>
              daily<span className="brand-period">.</span>
            </span>
          </span>
        </a>
        <span className="sidebar-label">YOUR CITY. YOUR EVERYDAY.</span>
        <nav>
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={active === item.id ? "active" : ""}
              aria-current={active === item.id ? "location" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{item.label}</span>
              {active === item.id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="small-sun">
            <Sun size={23} />
          </span>
          <strong>A little more local.</strong>
          <p>
            A few useful things,
            <br />
            before you head out.
          </p>
          <span>MADE FOR MELBOURNE ↗</span>
        </div>
        <div className="sidebar-bottom">
          <a href="#sources" onClick={() => navigate("sources")}>
            <Database size={17} />
            Sources & status
          </a>
          <ExternalLink href={REPO_URL}>View on GitHub</ExternalLink>
          <span className="version">THE MELBOURNE COLLECTION</span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              ref={menuButton}
              className="menu-button icon-button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <span className="breadcrumb">
              Your city, at a glance <span>/</span> <strong>{navItems.find((item) => item.id === active)?.label || (active === "collection" ? "The collection" : "Sources & status")}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="local-clock">
              <i />
              MEL {melbourneTime(now)}
            </span>
            <span className="topbar-divider" />
            <ExternalLink href={PARKING_URL} className="original-link">
              Parking explorer
            </ExternalLink>
          </div>
        </header>
        <main id="main">
          <section id="overview" className="intro">
            <div>
              <div className="eyebrow">
                <span />
                {date} · MELBOURNE
              </div>
              <h1>
                Your Melbourne day, in one place<span>.</span>
              </h1>
              <p>A little local knowledge for whatever today brings.</p>
            </div>
            <div className="page-controls">
              <label className="location-picker">
                <MapPin size={17} />
                <span className="sr-only">Choose your suburb</span>
                <select
                  value={location.id}
                  onChange={(event) => {
                    setLocationId(event.target.value);
                    savePreference("location", event.target.value);
                  }}
                >
                  {LOCATIONS.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
              <button
                className="refresh-button"
                disabled={busy}
                onClick={refresh}
                title="Refresh all data"
              >
                <RefreshCw size={16} className={busy ? "spin" : ""} />
                <span>{busy ? "Updating" : "Refresh"}</span>
              </button>
            </div>
          </section>
          {!online && (
            <div className="offline-banner" role="status">
              You’re offline. Older readings will expire automatically. We’ll
              retry when the next refresh is due.
            </div>
          )}

          <section className="summary-grid" aria-label="At a glance">
            <a className="summary-tile summary-tile--weather" href="#weather" onClick={() => navigate("weather")}>
              <span className="summary-icon"><CloudSun size={20} /></span>
              <ArrowUpRight className="summary-arrow" size={17} aria-hidden="true" />
              <span className="summary-label">Outside right now</span>
              <strong className="summary-value">
                <ValueChange value={w ? `${rounded(w.current.temperature)}°` : "—"} />
                <small>{w ? weatherLabel(w.current.weatherCode) : weather.loading ? "Loading" : "Unavailable"}</small>
              </strong>
              <span className="summary-detail">{w ? `Model · valid ${melbourneTime(w.current.time)}${weatherState === "delayed" ? " · Delayed" : ""}` : "Weather model awaiting data"}</span>
            </a>
            <a className="summary-tile summary-tile--uv" href="#weather" onClick={() => navigate("weather")}>
              <span className="summary-icon"><Sun size={20} /></span>
              <ArrowUpRight className="summary-arrow" size={17} aria-hidden="true" />
              <span className="summary-label">Observed UV</span>
              <strong className="summary-value">
                <ValueChange value={u ? u.value.toFixed(1) : "—"} />
                <small>{u ? uvLabel(u.value) : uv.loading ? "Loading" : "Unavailable"}</small>
              </strong>
              <span className="summary-detail">{u ? `ARPANSA · ${melbourneTime(u.observedAt)}${uvState === "delayed" ? " · Delayed" : ""}` : "Melbourne station awaiting data"}</span>
            </a>
            <a className="summary-tile summary-tile--parking" href="#parking" onClick={() => navigate("parking")}>
              <span className="summary-icon"><CarFront size={20} /></span>
              <ArrowUpRight className="summary-arrow" size={17} aria-hidden="true" />
              <span className="summary-label">Available parking bays</span>
              <strong className="summary-value">
                <ValueChange value={p ? fmt(p.available) : "—"} />
                <small>{p ? "reporting" : parking.loading ? "Loading" : "Unavailable"}</small>
              </strong>
              <span className="summary-detail">{p ? `City of Melbourne · ${melbourneTime(p.observedAt)}${parkingState === "delayed" ? " · Delayed" : ""}` : "City of Melbourne sensors awaiting data"}</span>
            </a>
            <a className="summary-tile summary-tile--air" href="#air" onClick={() => navigate("air")}>
              <span className="summary-icon"><Wind size={20} /></span>
              <ArrowUpRight className="summary-arrow" size={17} aria-hidden="true" />
              <span className="summary-label">Regional PM2.5 estimate</span>
              <strong className="summary-value">
                <ValueChange value={a ? a.pm25.toFixed(1) : "—"} />
                <small>{a ? "µg/m³" : air.loading ? "Loading" : "Unavailable"}</small>
              </strong>
              <span className="summary-detail">{a ? `CAMS model · valid ${melbourneTime(a.modelTime)}${airState === "delayed" ? " · Delayed" : ""}` : "Regional model awaiting data"}</span>
            </a>
          </section>

          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR DAILY OVERVIEW</span>
              <h2>A closer look</h2>
            </div>
            <nav className="overview-tabs" aria-label="Dashboard shortcuts">
              <a href="#overview" className={active === "overview" ? "active" : ""} aria-current={active === "overview" ? "location" : undefined} onClick={() => navigate("overview")}>Today</a>
              <a href="#transport" className={active === "transport" ? "active" : ""} aria-current={active === "transport" ? "location" : undefined} onClick={() => navigate("transport")}>My commute</a>
              <a href="#collection" className={active === "collection" ? "active" : ""} aria-current={active === "collection" ? "location" : undefined} onClick={() => navigate("collection")}>The collection <ArrowUpRight size={13} /></a>
            </nav>
          </div>

          <div className="dashboard-grid">
            <section
              className="card weather-card"
              id="weather"
              aria-labelledby="weather-title"
            >
              <div className="card-heading">
                <div className="card-title">
                  <CloudSun size={19} />
                  <h2 id="weather-title">Weather</h2>
                  <span className="location-caption">{location.name}</span>
                </div>
                <Badge tone={w ? "amber" : "neutral"}>Model estimate</Badge>
              </div>
              {w ? (
                <>
                  <div className="weather-current">
                    <div className="temperature-block">
                      <div className="temperature">
                        <ValueChange value={rounded(w.current.temperature)} />
                        <span>°C</span>
                      </div>
                      <div className="weather-description">
                        <strong>{weatherLabel(w.current.weatherCode)}</strong>
                        <span>
                          Feels like {rounded(w.current.feelsLike)}° ·{" "}
                          {today ? (
                            <>
                              {rounded(today.min)}° / {rounded(today.max)}°
                            </>
                          ) : (
                            "Forecast updating"
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="weather-hero-icon">
                      <WeatherScene
                        code={w.current.weatherCode}
                        isDay={w.current.isDay}
                      />
                    </div>
                  </div>
                  <div className="weather-metrics">
                    <div>
                      <Droplets size={16} />
                      <span>Chance of rain</span>
                      <strong>
                        {today ? (
                          <>
                            {today.rainProbability}
                            <small>%</small>
                          </>
                        ) : (
                          "—"
                        )}
                      </strong>
                    </div>
                    <div>
                      <Wind size={17} />
                      <span>Wind</span>
                      <strong>
                        {rounded(w.current.windSpeed)}
                        <small>km/h</small>
                      </strong>
                    </div>
                    <div>
                      <Sunset size={17} />
                      <span>Sunset</span>
                      <strong>
                        {today ? melbourneTime(today.sunset) : "—"}
                      </strong>
                    </div>
                  </div>
                  <Forecast data={w} now={now} />
                </>
              ) : (
                <EmptyState
                  loading={weather.loading}
                  message={
                    weather.data
                      ? "Weather data has expired"
                      : "Weather is temporarily unavailable"
                  }
                  onRetry={refresh}
                />
              )}
              <div className="card-footer">
                <ExternalLink href="https://open-meteo.com/">
                  Open-Meteo
                </ExternalLink>
                <a href={`${import.meta.env.BASE_URL}weather.html`}>
                  Open weather & UV dashboard<ArrowUpRight size={14} aria-hidden="true" />
                </a>
                {weather.data && (
                  <SourceTime
                    label="Valid at"
                    timestamp={weather.data.current.time}
                    now={now}
                    state={weatherState}
                    refreshing={weather.loading}
                  />
                )}
              </div>
              {weather.error && w && (
                <p className="refresh-warning" role="status">
                  Refresh failed. Showing the previous forecast until it
                  expires.
                </p>
              )}
            </section>

            <section className="card uv-card" aria-labelledby="uv-title">
              <div className="card-heading">
                <div className="card-title">
                  <Sun size={19} />
                  <h2 id="uv-title">UV index</h2>
                </div>
                <Badge tone={u && uvState === "fresh" ? "green" : "neutral"}>
                  {u
                    ? uvState === "fresh"
                      ? "Observed"
                      : "Delayed"
                    : "Awaiting data"}
                </Badge>
              </div>
              {u ? (
                <div className="uv-content">
                  <p className="section-kicker">MELBOURNE STATION</p>
                  <div className="uv-number">
                    <ValueChange value={u.value.toFixed(1)} />
                    <span
                      className={`uv-category uv-${u.value < 3 ? "low" : u.value < 6 ? "medium" : "high"}`}
                    >
                      {uvLabel(u.value)}
                    </span>
                  </div>
                  <div
                    className="uv-scale"
                    role="img"
                    aria-label={`UV ${u.value.toFixed(1)}, ${uvLabel(u.value)}`}
                  >
                    <span
                      className="uv-marker"
                      style={{ left: `${Math.min((u.value / 12) * 100, 98)}%` }}
                    />
                    <div />
                    <div />
                    <div />
                    <div />
                    <div />
                  </div>
                  <div className="uv-scale-labels">
                    <span>0</span>
                    <span>3</span>
                    <span>6</span>
                    <span>8</span>
                    <span>11+</span>
                  </div>
                  <p className="uv-explanation">
                    Observed at the Melbourne station. This reading is the same
                    for all suburbs.
                  </p>
                </div>
              ) : (
                <EmptyState
                  compact
                  loading={uv.loading}
                  message={
                    uv.data
                      ? "UV observation has expired"
                      : "UV is temporarily unavailable"
                  }
                  onRetry={refresh}
                />
              )}
              <div className="uv-forecast">
                <div>
                  <Sunrise size={18} />
                  <span>
                    Today’s max UV
                    <small>{location.name} · Model forecast</small>
                  </span>
                  <strong>{today?.uvMax.toFixed(1) ?? "—"}</strong>
                </div>
                <p>Live UV and the daily maximum are different measures.</p>
              </div>
              <div className="card-footer">
                <ExternalLink href={ARPANSA_URL}>ARPANSA</ExternalLink>
                {uv.data && (
                  <SourceTime
                    label="Observed"
                    timestamp={uv.data.observedAt}
                    now={now}
                    state={uvState}
                    refreshing={uv.loading}
                  />
                )}
              </div>
              {uv.error && u && (
                <p className="refresh-warning" role="status">
                  Refresh failed. Showing the previous observation until it
                  expires.
                </p>
              )}
            </section>

            <section
              className="card transport-card"
              id="transport"
              aria-labelledby="transport-title"
            >
              <div className="card-heading">
                <div className="card-title">
                  <TrainFront size={19} />
                  <h2 id="transport-title">Getting around</h2>
                </div>
                <Badge>Official services</Badge>
              </div>
              <p className="card-subtitle">
                Your everyday links for a smoother trip.
              </p>
              <CommutePanel now={now} revision={revision} />
              {favorites.length > 0 && (
                <div className="favorite-strip">
                  <Bookmark size={13} />
                  <span>Pinned</span>
                  {favorites
                    .map((id) => transportLinks.find((link) => link.id === id))
                    .filter(Boolean)
                    .map((link) => (
                      <a
                        key={link!.id}
                        href={link!.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link!.label}
                        <ArrowUpRight size={12} />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ))}
                </div>
              )}
              <div className="transport-links">
                {transportLinks.map((link) => (
                  <div className="transport-row" key={link.id}>
                    <span className={`transport-icon ${link.mode}`}>
                      {link.mode === "tram" ? (
                        <TramFront size={19} />
                      ) : link.mode === "journey" ? (
                        <Compass size={19} />
                      ) : (
                        <TrainFront size={19} />
                      )}
                    </span>
                    <ExternalLink
                      href={link.url}
                      className="transport-destination"
                    >
                      <span>
                        <strong>{link.label}</strong>
                        <small>{link.description}</small>
                      </span>
                    </ExternalLink>
                    <button
                      className={`favorite-button ${favorites.includes(link.id) ? "is-favorite" : ""}`}
                      aria-label={`${favorites.includes(link.id) ? "Unpin " : "Pin "}${link.label}`}
                      aria-pressed={favorites.includes(link.id)}
                      onClick={() => toggleFavorite(link.id)}
                    >
                      <Star
                        size={17}
                        fill={
                          favorites.includes(link.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </div>
                ))}
              </div>
              <div className="transport-bottom">
                <span>More official transport tools.</span>
                <ExternalLink href={roadTrafficLink.url}>
                  {roadTrafficLink.label}
                </ExternalLink>
              </div>
            </section>

            <section
              className="card parking-card"
              id="parking"
              aria-labelledby="parking-title"
            >
              <div className="card-heading">
                <div className="card-title">
                  <CarFront size={19} />
                  <h2 id="parking-title">Street parking</h2>
                </div>
                <Badge
                  tone={p && parkingState === "fresh" ? "green" : "neutral"}
                >
                  {p
                    ? parkingState === "fresh"
                      ? "Live feed"
                      : "Delayed"
                    : "Awaiting data"}
                </Badge>
              </div>
              <p className="card-subtitle">
                City of Melbourne sensors · Not all Greater Melbourne
              </p>
              {p ? (
                <>
                  <div className="parking-summary">
                    <div>
                      <span className="parking-number">{fmt(p.available)}</span>
                      <span className="parking-number-label">
                        spaces reporting available
                      </span>
                    </div>
                    <div className="reporting-summary">
                      <strong>
                        {fmt(p.reporting)} <span>/ {fmt(p.total)}</span>
                      </strong>
                      <span>sensors reporting</span>
                    </div>
                  </div>
                  <div
                    className="parking-bar"
                    role="img"
                    aria-label={`Available ${p.available}, occupied ${p.occupied}, unknown ${p.unknown}`}
                  >
                    <span
                      style={{ width: `${(p.available / p.total) * 100}%` }}
                    />
                    <span
                      style={{ width: `${(p.occupied / p.total) * 100}%` }}
                    />
                    <span
                      style={{ width: `${(p.unknown / p.total) * 100}%` }}
                    />
                  </div>
                  <div className="parking-legend">
                    <span>
                      <i />
                      Available {fmt(p.available)}
                    </span>
                    <span>
                      <i />
                      Occupied {fmt(p.occupied)}
                    </span>
                    <span>
                      <i />
                      Unknown {fmt(p.unknown)}
                    </span>
                  </div>
                  <div className="streets-heading">
                    <span>Streets with more spaces</span>
                    <span>Available / reporting</span>
                  </div>
                  <div className="streets">
                    {p.streets.length ? (
                      p.streets.map((street, i) => (
                        <ExternalLink
                          key={street.name}
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${street.name}, Melbourne Victoria Australia`)}`}
                          className="street-row"
                        >
                          <span className="street-rank">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="street-name">{street.name}</span>
                          <span className="street-count">
                            {fmt(street.available)}
                            <small> / {fmt(street.total)}</small>
                          </span>
                        </ExternalLink>
                      ))
                    ) : (
                      <p className="muted-note">
                        No streets have enough trusted reports to recommend
                        right now.
                      </p>
                    )}
                  </div>
                  <p className="parking-note">
                    Availability is not a guarantee. Check on-street signs, time
                    limits and fees.
                  </p>
                </>
              ) : (
                <EmptyState
                  loading={parking.loading}
                  message={
                    parking.data
                      ? "Parking data has expired; counts are hidden"
                      : "No reliable parking data right now"
                  }
                  onRetry={refresh}
                />
              )}
              <ExternalLink href={PARKING_URL} className="parking-cta">
                <span>
                  <MapPin size={16} />
                  Open the full parking map
                </span>
              </ExternalLink>
              <div className="card-footer">
                <span>City of Melbourne</span>
                {parking.data && (
                  <SourceTime
                    label="Feed"
                    timestamp={parking.data.observedAt}
                    now={now}
                    state={parkingState}
                    refreshing={parking.loading}
                  />
                )}
              </div>
              {parking.error && p && (
                <p className="refresh-warning" role="status">
                  Refresh failed. Showing the last valid report until it
                  expires.
                </p>
              )}
            </section>

            <section
              className="card air-card"
              id="air"
              aria-labelledby="air-title"
            >
              <div className="card-heading">
                <div className="card-title">
                  <Wind size={19} />
                  <h2 id="air-title">Air quality</h2>
                </div>
                <Badge>Observations & model</Badge>
              </div>
              <p className="card-subtitle">
                {location.name} area · Station readings and regional estimates
              </p>
              <EpaPanel location={location} now={now} revision={revision} />
              <h3 className="regional-model-heading">
                Regional model estimate
              </h3>
              {a ? (
                <div className="air-numbers">
                  <div>
                    <span>PM2.5</span>
                    <strong>
                      {a.pm25.toFixed(1)}
                      <small>μg/m³</small>
                    </strong>
                    <p>Fine particulate matter</p>
                  </div>
                  <div>
                    <span>PM10</span>
                    <strong>
                      {a.pm10.toFixed(1)}
                      <small>μg/m³</small>
                    </strong>
                    <p>Particulate matter</p>
                  </div>
                </div>
              ) : (
                <EmptyState
                  compact
                  loading={air.loading}
                  message={
                    air.data
                      ? "Air quality estimate has expired"
                      : "Air quality estimate is unavailable"
                  }
                  onRetry={refresh}
                />
              )}
              <div className="air-context">
                <ShieldCheck size={19} />
                <p>
                  A regional estimate on a ~45 km grid, not a street-level
                  reading. See EPA for measured air quality and activity advice.
                </p>
              </div>
              <div className="air-links">
                {airLinks.map((link) => (
                  <ExternalLink key={link.id} href={link.url}>
                    {link.label}
                  </ExternalLink>
                ))}
              </div>
              <div className="card-footer">
                <ExternalLink href={AIR_SOURCE_URL}>
                  CAMS · Open-Meteo
                </ExternalLink>
                {air.data && (
                  <SourceTime
                    label="Valid at"
                    timestamp={air.data.modelTime}
                    now={now}
                    state={airState}
                    refreshing={air.loading}
                  />
                )}
              </div>
              {air.error && a && (
                <p className="refresh-warning" role="status">
                  Refresh failed. Showing the previous regional estimate until
                  it expires.
                </p>
              )}
            </section>

            <section id="collection" className="explore-card" aria-labelledby="explore-title">
              <div className="explore-topline">
                <span>THE DASHBOARD COLLECTION</span>
                <span>01 / MORE TO COME</span>
              </div>
              <div className="mini-city" aria-hidden="true">
                <div className="city-road" />
                <div className="city-building building-1" />
                <div className="city-building building-2" />
                <div className="city-building building-3" />
                <span className="city-p">P</span>
                <span className="city-tree tree-1" />
                <span className="city-tree tree-2" />
              </div>
              <div className="explore-copy">
                <span className="collection-tag">
                  <CarFront size={13} />
                  PARKING EXPLORER
                </span>
                <h2 id="explore-title">
                  Find your next
                  <br />
                  spot in the city.
                </h2>
                <p>
                  Explore Melbourne’s sensor-equipped bays
                  <br />
                  with the original Parking Dashboard.
                </p>
                <ExternalLink href={PARKING_URL}>
                  Explore the parking dashboard
                  <span className="round-arrow">
                    <ArrowUpRight size={19} />
                  </span>
                </ExternalLink>
              </div>
            </section>
          </div>

          <section
            className="sources-section"
            id="sources"
            aria-labelledby="sources-title"
          >
            <div className="sources-title">
              <div>
                <h2 id="sources-title">
                  <Database size={18} />
                  Good data. Clear sources.
                </h2>
                <p>Every reading has a source, a time and a limit.</p>
              </div>
              <Badge tone={allAvailable ? "green" : "neutral"}>
                {busy
                  ? "Refreshing sources"
                  : allAvailable
                    ? "4 data feeds available"
                    : "Some feeds unavailable"}
              </Badge>
            </div>
            <div className="source-grid">
              <SourceInfo
                title="Weather"
                name="Open-Meteo"
                url="https://open-meteo.com/en/docs"
                detail="Model forecasts for your selected area. Fetched every 15 minutes; model updates vary by provider."
                available={!!w}
                loading={weather.loading}
                delayed={weatherState === "delayed"}
                failed={!!weather.error}
              />
              <SourceInfo
                title="UV observations"
                name="ARPANSA"
                url="https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information"
                detail="One Melbourne station, fetched every minute. UTC observation timestamps are displayed in local time."
                available={!!u}
                loading={uv.loading}
                delayed={uvState === "delayed"}
                failed={!!uv.error}
              />
              <SourceInfo
                title="Parking sensors"
                name="City of Melbourne"
                url="https://data.melbourne.vic.gov.au/explore/dataset/on-street-parking-bay-sensors/"
                detail="Fetched every 2 minutes. Counts expire after 15 minutes. Individual sensors must also pass freshness checks."
                available={!!p}
                loading={parking.loading}
                delayed={parkingState === "delayed"}
                failed={!!parking.error}
              />
              <SourceInfo
                title="Regional air model"
                name="CAMS / Open-Meteo"
                url={AIR_SOURCE_URL}
                detail="A ~45 km grid, fetched every 30 minutes. The model updates every 12 hours. Not EPA measurements or categories."
                available={!!a}
                loading={air.loading}
                delayed={airState === "delayed"}
                failed={!!air.error}
              />
            </div>
            <details className="data-details">
              <summary>
                About coverage, updates and attribution
                <ChevronDown size={16} />
              </summary>
              <div>
                <p>
                  All times use Australia/Melbourne and adjust for daylight
                  saving. “Valid at” is the forecast’s effective time, not its
                  model issue time. A successful download does not mean a new
                  observation. Departures and station readings are shown when
                  the official services are available. Missing live estimates
                  remain explicitly scheduled; missing air readings never imply
                  good air quality.
                </p>
                <p>
                  Weather and air estimates use Open-Meteo’s free non-commercial
                  service. Data: Open-Meteo (CC BY 4.0), CAMS / Copernicus
                  Atmosphere Monitoring Service and City of Melbourne (CC BY
                  4.0). UV observations courtesy of ARPANSA; see the{" "}
                  <a
                    href="https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information#Disclaimer"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ARPANSA UV data disclaimer (opens in a new tab)
                  </a>
                  . This independent project is not affiliated with these
                  organisations.
                </p>
                <p>
                  Your suburb and pinned links are saved only in this browser.
                  No account is needed. Your browser contacts the data providers
                  directly. See the{" "}
                  <a
                    href={`${REPO_URL}/blob/main/docs/data-sources.md`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    data source documentation on GitHub (opens in a new tab)
                  </a>
                  .
                </p>
              </div>
            </details>
          </section>
          <footer className="page-footer">
            <span>
              <span className="footer-logo">m.</span>Melbourne Daily{" "}
              <span className="footer-dash">—</span> A little more local.
            </span>
            <span>
              Built for everyday Melbourne <span className="footer-dot">·</span>{" "}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                GitHub <ExternalIcon size={11} />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function SourceInfo({
  title,
  name,
  url,
  detail,
  available,
  loading,
  delayed,
  failed,
}: {
  title: string;
  name: string;
  url: string;
  detail: string;
  available: boolean;
  loading: boolean;
  delayed: boolean;
  failed: boolean;
}) {
  return (
    <div className="source-info">
      <div>
        <span
          className={`source-dot ${available && !failed && !delayed ? "ok" : "pending"}`}
        />
        <strong>{title}</strong>
        <span className="source-status">
          {loading
            ? "Loading"
            : !available
              ? "Unavailable"
              : failed
                ? "Retrying"
                : delayed
                  ? "Delayed"
                  : "Available"}
        </span>
      </div>
      <ExternalLink href={url}>{name}</ExternalLink>
      <p>{detail}</p>
    </div>
  );
}
