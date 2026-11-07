import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight, CarFront, ChartNoAxesCombined, ChevronDown, CloudSun,
  Database, Droplets, LayoutGrid, MapPin, Menu, RefreshCw, Sun,
  Sunrise, Thermometer, Umbrella, Wind, X,
} from "lucide-react";
import { LOCATIONS, fetchWeather, fetchUV, weatherLabel } from "./lib/weather";
import { freshness, melbourneTime, readPreference, savePreference, useNow, useResource } from "./lib/resource";
import { melbourneDate } from "./lib/forecast";
import { Badge, EmptyState, ExternalLink, SourceTime } from "./components/ui";
import Forecast from "./components/Forecast";
import WeatherScene from "./components/WeatherScene";
import ValueChange from "./components/ValueChange";
import WeatherUVPanel, { DaylightPanel } from "./components/WeatherUVPanel";
import "./WeatherDashboard.css";

const DAILY_URL = import.meta.env.BASE_URL;
const PARKING_URL = "https://ericthegoatskr.github.io/melbourne-parking-dashboard/";
const navItems = [
  { id: "overview", label: "Current conditions", Icon: CloudSun },
  { id: "forecast", label: "Forecast", Icon: ChartNoAxesCombined },
  { id: "uv", label: "UV index", Icon: Sun },
  { id: "daylight", label: "Sunrise & sunset", Icon: Sunrise },
  { id: "sources", label: "Sources & status", Icon: Database },
];
const sectionFromHash = () => navItems.some(({ id }) => id === window.location.hash.slice(1))
  ? window.location.hash.slice(1) : "overview";

export default function WeatherApp() {
  const now = useNow();
  const [locationId, setLocationId] = useState(() => readPreference("location", "melbourne"));
  const location = LOCATIONS.find(({ id }) => id === locationId) || LOCATIONS[0];
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState(sectionFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const weather = useResource(`weather:${location.id}`, (signal) => fetchWeather(location, signal), 15 * 60_000, revision, (data) => data.current.time);
  const uv = useResource("uv:melbourne", fetchUV, 60_000, revision, (data) => data.observedAt);
  const weatherState = freshness(weather.data?.current.time, now, 30, 90);
  const uvState = freshness(uv.data?.observedAt, now, 5, 15);
  const w = weatherState !== "stale" ? weather.data : undefined;
  const u = uvState !== "stale" ? uv.data : undefined;
  const today = w?.daily.find(({ date }) => date === melbourneDate(now));
  const busy = weather.loading || uv.loading;
  const refresh = () => setRevision((value) => value + 1);
  const date = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne", weekday: "long", day: "numeric", month: "long",
  }).format(now);

  useEffect(() => {
    const sync = () => setActive(sectionFromHash());
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener("hashchange", sync);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = () => Array.from(sidebar.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") || [])
      .filter((element) => element.getClientRects().length > 0);
    const focusFrame = requestAnimationFrame(() => items()[0]?.focus());
    const focusAfterReveal = setTimeout(() => {
      if (!sidebar.current?.contains(document.activeElement)) items()[0]?.focus();
    }, 260);
    const resize = () => { if (window.innerWidth > 760) setMenuOpen(false); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
      if (event.key !== "Tab") return;
      const first = items()[0], last = items().at(-1);
      if (!sidebar.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    window.addEventListener("resize", resize);
    document.addEventListener("keydown", keyboard);
    return () => {
      cancelAnimationFrame(focusFrame);
      clearTimeout(focusAfterReveal);
      document.body.style.overflow = overflow;
      window.removeEventListener("resize", resize);
      document.removeEventListener("keydown", keyboard);
    };
  }, [menuOpen]);

  const closeMenu = () => { setMenuOpen(false); menuButton.current?.focus(); };
  const navigate = (id: string) => {
    setActive(id);
    if (menuOpen) closeMenu();
  };

  return (
    <div className="app-shell weather-dashboard">
      <a className="skip-link" href="#main">Skip to content</a>
      {menuOpen && <div className="menu-backdrop" aria-hidden="true" onClick={closeMenu} />}
      <aside ref={sidebar} className={`sidebar ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation" role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen ? true : undefined}>
        {menuOpen && <button className="drawer-close icon-button" aria-label="Close navigation" onClick={closeMenu}><X size={19} /></button>}
        <a className="brand" href="#overview" onClick={() => navigate("overview")}>
          <span className="brand-mark">m<span>.</span></span>
          <span>melbourne<span>weather<span className="brand-period">.</span></span></span>
        </a>
        <span className="sidebar-label">WHATEVER THE SKY BRINGS.</span>
        <nav>{navItems.map(({ id, label, Icon }) => (
          <a key={id} href={`#${id}`} className={active === id ? "active" : ""} aria-current={active === id ? "location" : undefined} onClick={() => navigate(id)}>
            <Icon size={19} strokeWidth={1.7} aria-hidden /><span>{label}</span>{active === id && <span className="nav-dot" />}
          </a>
        ))}</nav>
        <div className="sidebar-note">
          <span className="small-sun"><CloudSun size={23} aria-hidden /></span>
          <strong>A little sky awareness.</strong>
          <p>From the first light<br />to your last tram home.</p>
          <span>MADE FOR MELBOURNE ↗</span>
        </div>
        <div className="sidebar-bottom">
          <a href={DAILY_URL}><LayoutGrid size={17} aria-hidden />Melbourne Daily<ArrowUpRight size={14} aria-hidden /></a>
          <a href={PARKING_URL}><CarFront size={17} aria-hidden />Parking explorer<ArrowUpRight size={14} aria-hidden /></a>
          <span className="version">THE MELBOURNE COLLECTION</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button ref={menuButton} className="menu-button icon-button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
            <span className="breadcrumb">Your city, at a glance <span>/</span> <strong>Weather & UV</strong></span>
          </div>
          <div className="topbar-right">
            <span className="local-clock">MEL {melbourneTime(now)}</span>
            <a className="original-link" href={DAILY_URL}>Melbourne Daily<ArrowUpRight size={14} aria-hidden /></a>
          </div>
        </header>
        <main id="main">
          <section className="intro" id="overview">
            <div><div className="eyebrow"><span />{date} · MELBOURNE</div><h1>Weather for your Melbourne day<span>.</span></h1><p>A clearer look outside, before you step out.</p></div>
            <div className="page-controls">
              <label className="location-picker"><MapPin size={17} aria-hidden /><span className="sr-only">Choose your suburb</span>
                <select value={location.id} onChange={(event) => { setLocationId(event.target.value); savePreference("location", event.target.value); }}>
                  {LOCATIONS.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
                </select><ChevronDown size={14} aria-hidden />
              </label>
              <button className="refresh-button" onClick={refresh} disabled={busy} aria-label="Refresh weather and UV"><RefreshCw size={16} className={busy ? "spin" : ""} aria-hidden /><span>{busy ? "Updating" : "Refresh"}</span></button>
            </div>
          </section>
          {!online && <div className="offline-banner" role="status">You’re offline. Older readings will expire automatically. We’ll retry when the next refresh is due.</div>}
          <div className="wx-source-strip" aria-label="Data source status">
            <div className="wx-source-pill"><CloudSun size={17} aria-hidden /><strong>Weather model</strong><span>{w ? `${weatherState === "delayed" ? "Delayed · " : ""}Valid ${melbourneTime(w.current.time)}` : weather.loading ? "Loading" : weather.data ? "Expired" : "Unavailable"}</span></div>
            <div className="wx-source-pill"><Sun size={17} aria-hidden /><strong>Station UV</strong><span>{u ? `${uvState === "delayed" ? "Delayed · " : ""}Observed ${melbourneTime(u.observedAt)}` : uv.loading ? "Loading" : uv.data ? "Expired" : "Unavailable"}</span></div>
          </div>
          <div className="wx-grid">
            <section className="card weather-card wx-current-card" aria-labelledby="current-title">
              <div className="card-heading"><div className="card-title"><CloudSun size={19} aria-hidden /><h2 id="current-title">Current weather</h2><span className="location-caption">{location.name}</span></div><Badge tone={weatherState === "delayed" ? "amber" : "neutral"}>Model estimate</Badge></div>
              {w ? <>
                <div className="wx-current-body">
                  <div className="wx-temperature-block"><p className="section-kicker">{weatherState === "delayed" ? "DELAYED MODEL ESTIMATE" : "CURRENT MODEL ESTIMATE"}</p><div className="wx-temperature"><ValueChange value={Math.round(w.current.temperature)} /><small>°C</small></div><div className="wx-condition"><strong>{weatherLabel(w.current.weatherCode)}</strong><span>Feels like {Math.round(w.current.feelsLike)}°{today && <> · {Math.round(today.min)}° / {Math.round(today.max)}°</>}</span></div></div>
                  <div className="wx-scene"><WeatherScene code={w.current.weatherCode} isDay={w.current.isDay} /></div>
                </div>
                <div className="wx-weather-metrics">
                  <div className="wx-metric"><Wind size={17} aria-hidden /><span>Wind</span><strong>{Math.round(w.current.windSpeed)}<small> km/h</small></strong></div>
                  <div className="wx-metric"><Umbrella size={17} aria-hidden /><span>Today’s rain chance</span><strong>{today?.rainProbability ?? "—"}<small>{today ? "%" : ""}</small></strong></div>
                  <div className="wx-metric"><Droplets size={17} aria-hidden /><span>Current precipitation</span><strong>{w.current.precipitation}<small> mm</small></strong></div>
                  <div className="wx-metric"><Thermometer size={17} aria-hidden /><span>Today’s low / high</span><strong>{today ? `${Math.round(today.min)}° / ${Math.round(today.max)}°` : "—"}</strong></div>
                </div>
              </> : <EmptyState loading={weather.loading} message={weather.data ? "Weather data has expired" : "Weather is temporarily unavailable"} onRetry={refresh} />}
              <div className="card-footer"><ExternalLink href="https://open-meteo.com/">Open-Meteo</ExternalLink>{weather.data && <SourceTime label="Valid at" timestamp={weather.data.current.time} now={now} state={weatherState} refreshing={weather.loading} />}</div>
              {weather.error && w && <p className="refresh-warning" role="status">Refresh failed. Showing the previous forecast until it expires.</p>}
            </section>
            <WeatherUVPanel uv={uv} weather={w} location={location} now={now} onRetry={refresh} />
            <section className="card wx-forecast-card" id="forecast" aria-labelledby="forecast-title">
              <div className="card-heading"><div className="card-title"><ChartNoAxesCombined size={19} aria-hidden /><h2 id="forecast-title">Forecast</h2></div><Badge>Model forecast</Badge></div>
              <p className="card-subtitle">Temperature and rain chance for {location.name}. Explore an hour or look a few days ahead.</p>
              {w ? <Forecast data={w} now={now} /> : <EmptyState loading={weather.loading} message={weather.data ? "Forecast data has expired" : "Forecast is temporarily unavailable"} onRetry={refresh} />}
              <div className="card-footer"><span>All times are Melbourne local time</span>{weather.data && <SourceTime label="Model valid" timestamp={weather.data.current.time} now={now} state={weatherState} />}</div>
            </section>
            <DaylightPanel weather={w} now={now} loading={weather.loading} onRetry={refresh} />
          </div>
          <section id="sources" className="wx-sources" aria-labelledby="sources-title">
            <div className="wx-sources-heading"><div><span className="eyebrow">KNOW WHAT YOU’RE READING</span><h2 id="sources-title">Two sources. A clearer picture.</h2></div><Badge tone={w && u ? "green" : "neutral"}>{busy ? "Updating sources" : w && u ? "2 feeds available" : "Some feeds unavailable"}</Badge></div>
            <div className="wx-source-grid">
              <article><h3><CloudSun size={18} aria-hidden />Weather & forecasts</h3><p>Open-Meteo model estimates for your selected suburb, not a weather station reading. Checked every 15 minutes. Readings are marked delayed after 30 minutes and hidden after 90 minutes.</p><ExternalLink href="https://open-meteo.com/">About Open-Meteo</ExternalLink></article>
              <article><h3><Sun size={18} aria-hidden />Observed UV</h3><p>UV observations courtesy of ARPANSA. One Melbourne station reading is shared across suburbs. Checked every minute, marked delayed after 5 minutes and hidden after 15 minutes. Forecast UV is a separate model estimate.</p><ExternalLink href="https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information#Disclaimer">ARPANSA UV data disclaimer</ExternalLink></article>
            </div>
            <p className="wx-source-note">Source times are shown in Australia/Melbourne time. Re-fetching a reading does not make it newer. Open-Meteo’s free API is for non-commercial use.</p>
          </section>
          <footer className="wx-footer"><a href={DAILY_URL}><LayoutGrid size={15} aria-hidden />Back to Melbourne Daily<ArrowUpRight size={14} aria-hidden /></a><ExternalLink href="https://github.com/Ericthegoatskr/melbourne-daily">View on GitHub</ExternalLink><span>THE MELBOURNE COLLECTION</span></footer>
        </main>
      </div>
    </div>
  );
}
