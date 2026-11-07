import { useEffect, useRef, useState } from "react";
import CollectionNav from "./components/CollectionNav";
import { useNavigationDrawer } from "./lib/useNavigationDrawer";
import {
  ArrowUpRight, ChevronDown, CloudSun, Database, LayoutGrid, LocateFixed,
  MapPin, Menu, RadioTower, RefreshCw, Search, ShieldCheck, Wind, X,
} from "lucide-react";
import { LOCATIONS } from "./lib/weather";
import {
  EPA_REFRESH_MS, EPA_SOURCE_URL, epaConfigured, fetchEpa, nearbyEpaStations,
  type EpaObservations,
} from "./lib/epa";
import { AIR_REFRESH_MS, AIR_SOURCE_URL, fetchAir } from "./lib/air";
import { freshness, melbourneTime, readPreference, savePreference, useNow, useResource } from "./lib/resource";
import { Badge, ExternalLink } from "./components/ui";
import { CategoryCard, PollutantCard, RegionalAirCard } from "./components/AirReadings";
import "./AirDashboard.css";

const DAILY_URL = import.meta.env.BASE_URL;
const navItems = [
  { id: "overview", label: "Air overview", Icon: Wind },
  { id: "station", label: "Station readings", Icon: RadioTower },
  { id: "stations", label: "Nearby stations", Icon: MapPin },
  { id: "model", label: "Regional model", Icon: CloudSun },
  { id: "sources", label: "Sources & status", Icon: Database },
];
const sectionFromHash = () => navItems.some(({ id }) => id === window.location.hash.slice(1))
  ? window.location.hash.slice(1) : "overview";

export default function AirApp() {
  const now = useNow();
  const [locationId, setLocationId] = useState(() => readPreference("location", "melbourne"));
  const location = LOCATIONS.find(({ id }) => id === locationId) || LOCATIONS[0];
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(sectionFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const configured = epaConfigured();
  const epa = useResource<EpaObservations | null>(
    `epa:${configured}:${location.latitude}:${location.longitude}`,
    (signal) => configured ? fetchEpa(location, signal) : Promise.resolve(null),
    EPA_REFRESH_MS, revision,
    // A new complete snapshot can withdraw fields. Do not retain an older Good.
    (data) => data?.fetchedAt || "1970-01-01T00:00:00.000Z",
  );
  const air = useResource(`air:${location.id}`, (signal) => fetchAir(location, signal), AIR_REFRESH_MS, revision, (data) => data.modelTime);
  const stations = nearbyEpaStations(epa.data || undefined, location, now);
  const selected = stations.find(({ id }) => id === selectedId);
  const station = selected || stations[0] || null;
  const isNearest = station?.id === stations[0]?.id;
  const fallback = selectedId !== null && !selected && station !== null;
  const matches = stations.filter(({ name }) => name.toLocaleLowerCase("en-AU").includes(query.trim().toLocaleLowerCase("en-AU")));
  const loading = configured && epa.loading && !epa.data;
  const airState = freshness(air.data?.modelTime, now, 90, 180);
  const model = airState !== "stale" ? air.data : undefined;
  const busy = (configured && epa.loading) || air.loading;
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

  const closeMenu = () => { setMenuOpen(false); menuButton.current?.focus(); };
  useNavigationDrawer({ open: menuOpen, onClose: closeMenu, sidebar, trigger: menuButton });
  const navigate = (id: string) => { setActive(id); if (menuOpen) closeMenu(); };

  return (
    <div className="app-shell air-dashboard">
      <a className="skip-link" href="#main">Skip to content</a>
      {menuOpen && <div className="menu-backdrop" aria-hidden="true" onClick={closeMenu} />}
      <aside id="main-navigation" ref={sidebar} className={`sidebar ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation" role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen ? true : undefined}>
        {menuOpen && <button className="drawer-close icon-button" aria-label="Close navigation" onClick={closeMenu}><X size={19} /></button>}
        <a className="brand" href="#overview" onClick={() => navigate("overview")}><span className="brand-mark">m<span>.</span></span><span>melbourne<span>air<span className="brand-period">.</span></span></span></a>
        <CollectionNav current="air" placement="sidebar" onNavigate={closeMenu} />
        <span className="sidebar-label">On this page</span>
        <nav className="page-section-nav" aria-label="On this page">{navItems.map(({ id, label, Icon }) => <a key={id} href={`#${id}`} className={active === id ? "active" : ""} aria-current={active === id ? "location" : undefined} onClick={() => navigate(id)}><Icon size={19} strokeWidth={1.7} aria-hidden /><span>{label}</span>{active === id && <span className="nav-dot" />}</a>)}</nav>
        <div className="sidebar-bottom">
          <ExternalLink href="https://github.com/Ericthegoatskr/melbourne-daily">View on GitHub</ExternalLink>
          <span className="version">THE MELBOURNE COLLECTION</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><div className="topbar-left"><button ref={menuButton} className="menu-button icon-button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-controls="main-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button><span className="breadcrumb">Your city, at a glance <span>/</span> <strong>Air quality</strong></span></div><div className="topbar-right"><span className="local-clock">MEL {melbourneTime(now)}</span><a className="original-link" href={DAILY_URL}>Melbourne Daily<ArrowUpRight size={14} aria-hidden /></a></div></header>
        <main id="main">
          <section className="intro" id="overview">
            <div><div className="eyebrow"><span />{date} · MELBOURNE</div><h1>Air quality, closer to home<span>.</span></h1><p>Station observations, with their source and time in view.</p></div>
            <div className="page-controls"><label className="location-picker"><MapPin size={17} aria-hidden /><span className="sr-only">Choose your suburb</span><select value={location.id} onChange={(event) => { setLocationId(event.target.value); savePreference("location", event.target.value); setSelectedId(null); setQuery(""); }}>{LOCATIONS.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select><ChevronDown size={14} aria-hidden /></label><button className="refresh-button" onClick={refresh} disabled={busy} aria-label="Refresh air quality"><RefreshCw size={16} className={busy ? "spin" : ""} aria-hidden /><span>{busy ? "Updating" : "Refresh"}</span></button></div>
          </section>
          {!online && <div className="offline-banner" role="status">You’re offline. Observations will expire automatically. We’ll retry when the next refresh is due.</div>}
          <div className="aq-status-strip" aria-label="Air data source status"><div className="aq-status-pill"><RadioTower size={17} aria-hidden /><strong>EPA observations</strong><span>{loading ? "Loading stations" : stations.length ? `${stations.length} reporting ${stations.length === 1 ? "station" : "stations"} within 100 km` : "Unavailable"}</span></div><div className="aq-status-pill"><CloudSun size={17} aria-hidden /><strong>Regional model</strong><span>{model ? `${airState === "delayed" ? "Delayed · " : ""}Valid ${melbourneTime(model.modelTime)}` : air.loading ? "Loading" : air.data ? "Expired" : "Unavailable"}</span></div></div>
          {fallback && <p className="aq-selection-notice" role="status">The selected station no longer has recent readings. Showing the nearest reporting station.</p>}
          <div className="aq-grid">
            <CategoryCard station={station} location={location} now={now} loading={loading} refreshing={epa.loading} error={epa.error} onRetry={refresh} isNearest={isNearest} />
            <PollutantCard label="PM2.5" reading={station?.pm25 || null} stationName={station?.name} now={now} refreshing={epa.loading} />
            <PollutantCard label="PM10" reading={station?.pm10 || null} stationName={station?.name} now={now} refreshing={epa.loading} />
            <section className="card aq-stations-card" id="stations" aria-labelledby="stations-title">
              <div className="card-heading"><div className="card-title"><MapPin size={19} aria-hidden /><h2 id="stations-title">Nearby reporting stations</h2></div><Badge>{stations.length} {stations.length === 1 ? "station" : "stations"}</Badge></div>
              <p className="card-subtitle">Within 100 km of {location.name}, ordered by distance. Select a station to see its readings above.</p>
              <div className="aq-station-controls"><label className="aq-station-search"><Search size={17} aria-hidden /><span className="sr-only">Find an EPA station</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an EPA station" /></label><button className="aq-nearest-button" disabled={selectedId === null} onClick={() => { setSelectedId(null); setQuery(""); }}><LocateFixed size={15} aria-hidden />Use nearest station</button></div>
              {matches.length ? <ul className="aq-station-list" aria-label="EPA stations by distance">{matches.map((item) => <li key={item.id}><button className="aq-station-row" aria-label={`View ${item.name}`} aria-pressed={station?.id === item.id} onClick={() => setSelectedId(item.id)}><span className="aq-station-marker" aria-hidden><RadioTower size={17} /></span><span className="aq-station-copy"><strong>{item.name}</strong><span>{item.distanceKm.toFixed(1)} km away · {[item.pm25 && "PM2.5", item.pm10 && "PM10"].filter(Boolean).join(" & ") || "Category only"}</span></span><span className="aq-station-row-end"><Badge tone={!item.category ? "neutral" : item.category.value === "Good" ? "green" : item.category.value === "Fair" ? "amber" : "red"}>{item.category?.value || "Category unavailable"}</Badge><ArrowUpRight size={14} aria-hidden /></span></button></li>)}</ul> : <p className="aq-stations-empty" role="status">{loading ? "Checking nearby EPA monitoring stations…" : stations.length ? `No station matches “${query}”. Try a shorter search.` : "No recent station readings are available within 100 km. Check EPA AirWatch for the latest monitoring information."}</p>}
              <p className="aq-coverage-note"><ShieldCheck size={16} aria-hidden />A station appears when at least one observation is recent. Missing or expired fields stay unavailable; a reporting station may not measure every pollutant.</p>
            </section>
            <RegionalAirCard resource={air} location={location} now={now} onRetry={refresh} />
          </div>
          <section className="aq-sources" id="sources" aria-labelledby="sources-title">
            <div className="aq-sources-heading"><div><span className="eyebrow">KNOW WHAT YOU’RE READING</span><h2 id="sources-title">Clear readings. Clear sources.</h2></div><Badge tone={station && model ? "green" : "neutral"}>{busy ? "Updating sources" : station && model ? "2 feeds available" : "Some feeds unavailable"}</Badge></div>
            <div className="aq-source-grid">
              <article><h3><RadioTower size={18} aria-hidden />EPA station observations</h3><p>Official EPA categories and one-hour mean PM2.5 / PM10 measurements. Each field keeps its own observation time: delayed after 90 minutes and hidden after 3 hours. A category is never inferred from a missing measurement.</p><p>This page checks for a newer published snapshot every 15 minutes. Publishing is best effort; the time beside each reading is the time to rely on.</p><ExternalLink href={EPA_SOURCE_URL}>EPA AirWatch</ExternalLink><ExternalLink href="https://www.epa.vic.gov.au/air-quality-categories">Understanding EPA ratings</ExternalLink></article>
              <article><h3><CloudSun size={18} aria-hidden />Regional model estimates</h3><p>CAMS / Copernicus Atmosphere Monitoring Service, delivered by Open-Meteo. These values describe a roughly 45 km grid and are separate from EPA station observations.</p><p>The model is checked every 30 minutes, marked delayed after 90 minutes and hidden after 3 hours. Open-Meteo’s free API is for non-commercial use.</p><ExternalLink href={AIR_SOURCE_URL}>About the regional model</ExternalLink></article>
            </div>
            <p className="aq-source-note">Times are shown in Australia/Melbourne time. A station reading describes that site; conditions at your location can differ. Check EPA for official activity advice and monitoring notices.</p>
          </section>
          <footer className="aq-footer"><a href={DAILY_URL}><LayoutGrid size={15} aria-hidden />Back to Melbourne Daily<ArrowUpRight size={14} aria-hidden /></a><a href={`${DAILY_URL}weather.html`}><CloudSun size={15} aria-hidden />Weather & UV<ArrowUpRight size={14} aria-hidden /></a><ExternalLink href="https://github.com/Ericthegoatskr/melbourne-daily">View on GitHub</ExternalLink><span>THE MELBOURNE COLLECTION</span></footer>
        </main>
      </div>
      <CollectionNav current="air" placement="mobile" onNavigate={closeMenu} hidden={menuOpen} />
    </div>
  );
}
