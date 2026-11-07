import { useEffect, useRef, useState } from "react";
import CollectionNav from "./components/CollectionNav";
import { useNavigationDrawer } from "./lib/useNavigationDrawer";
import {
  ArrowUpRight, Bookmark, BusFront, CloudSun, Compass, Database, LayoutGrid,
  MapPin, Menu, RadioTower, RefreshCw, Route, Star, TrainFront, TramFront, Wind, X,
} from "lucide-react";
import CommutePanel from "./components/CommutePanel";
import TransportScene from "./components/TransportScene";
import { Badge, ExternalLink } from "./components/ui";
import { transportLinks, roadTrafficLink } from "./lib/community";
import { transitApiConfigured } from "./lib/transit";
import { melbourneTime, readPreference, savePreference, useNow } from "./lib/resource";
import "./TransportDashboard.css";

const DAILY_URL = import.meta.env.BASE_URL;
const navItems = [
  { id: "overview", label: "Transport overview", Icon: TrainFront },
  { id: "commute", label: "Stops & departures", Icon: MapPin },
  { id: "tools", label: "Official travel tools", Icon: Compass },
  { id: "sources", label: "Sources & status", Icon: Database },
];
const sectionFromHash = () => navItems.some(({ id }) => id === window.location.hash.slice(1))
  ? window.location.hash.slice(1) : "overview";

function readPinned(): string[] {
  try {
    const value: unknown = JSON.parse(readPreference("transport-favorites", '["departures","network"]'));
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === "string" && transportLinks.some((link) => link.id === id)))]
      : ["departures", "network"];
  } catch { return ["departures", "network"]; }
}

export default function TransportApp() {
  const now = useNow();
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState(sectionFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [favorites, setFavorites] = useState(readPinned);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const configured = transitApiConfigured();
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
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    setFavorites(next);
    savePreference("transport-favorites", JSON.stringify(next));
  };

  return (
    <div className="app-shell transport-dashboard">
      <a className="skip-link" href="#main">Skip to content</a>
      {menuOpen && <div className="menu-backdrop" aria-hidden="true" onClick={closeMenu} />}
      <aside id="main-navigation" ref={sidebar} className={`sidebar ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation" role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen ? true : undefined}>
        {menuOpen && <button className="drawer-close icon-button" aria-label="Close navigation" onClick={closeMenu}><X size={19} /></button>}
        <a className="brand" href="#overview" onClick={() => navigate("overview")}><span className="brand-mark">m<span>.</span></span><span>melbourne<span>transport<span className="brand-period">.</span></span></span></a>
        <CollectionNav current="transport" placement="sidebar" onNavigate={closeMenu} />
        <span className="sidebar-label">On this page</span>
        <nav className="page-section-nav" aria-label="On this page">{navItems.map(({ id, label, Icon }) => <a key={id} href={`#${id}`} className={active === id ? "active" : ""} aria-current={active === id ? "location" : undefined} onClick={() => navigate(id)}><Icon size={19} strokeWidth={1.7} aria-hidden /><span>{label}</span>{active === id && <span className="nav-dot" />}</a>)}</nav>
        <div className="sidebar-bottom">
          <ExternalLink href="https://github.com/Ericthegoatskr/melbourne-daily">View on GitHub</ExternalLink>
          <span className="version">THE MELBOURNE COLLECTION</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><div className="topbar-left"><button ref={menuButton} className="menu-button icon-button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-controls="main-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button><span className="breadcrumb">Your city, at a glance <span>/</span> <strong>Transport</strong></span></div><div className="topbar-right"><span className="local-clock">MEL {melbourneTime(now)}</span><a className="original-link" href={DAILY_URL}>Melbourne Daily<ArrowUpRight size={14} aria-hidden /></a></div></header>
        <main id="main">
          <section className="intro" id="overview">
            <div><h1>A little less rush<span>.</span></h1><p>Your train and tram stops, all in one place.</p><p className="intro-date">{date} · Melbourne</p></div>
            <div className="page-controls"><Badge tone={configured ? "neutral" : "amber"}>{configured ? "PTV departures" : "Live data awaiting activation"}</Badge><button className="refresh-button" onClick={() => setRevision((value) => value + 1)} aria-label="Refresh transport"><RefreshCw size={16} aria-hidden /><span>Refresh</span></button></div>
          </section>
          {!online && <div className="offline-banner" role="status">You’re offline. Saved stops stay on this device. Any previously loaded departures will expire automatically.</div>}
          <section className="tr-hero" aria-labelledby="tr-hero-title">
            <div className="tr-hero-copy"><h2 id="tr-hero-title">Start with your usual stop.</h2><p>Find a Metro station or tram stop and save it for next time. {configured ? "Choose a stop to check available departures and associated service updates." : "Live arrival times and service updates are awaiting activation. Official travel tools are available below."}</p><div className="tr-hero-links"><a href="#commute" onClick={() => navigate("commute")}><MapPin size={16} aria-hidden />Find my stop<ArrowUpRight size={15} aria-hidden /></a><ExternalLink href="https://transport.vic.gov.au/journey">Plan a journey</ExternalLink></div></div>
            <TransportScene />
          </section>
          <div className="tr-status-grid" aria-label="Transport feature availability">
            <div className="tr-status-card tr-status-card--ready"><MapPin size={20} aria-hidden /><span>STOPS & FAVOURITES</span><strong>Make it yours</strong><p>Search the published directory and save up to six stops on this device.</p></div>
            <div className={`tr-status-card ${configured ? "" : "tr-status-card--pending"}`}><TrainFront size={20} aria-hidden /><span>LIVE DEPARTURES</span><strong>{configured ? "Choose a stop" : "Awaiting activation"}</strong><p>{configured ? "Live estimates and scheduled times are labelled separately in your board." : "Arrival predictions will appear here once the live service is enabled."}</p></div>
            <div className={`tr-status-card ${configured ? "" : "tr-status-card--pending"}`}><RadioTower size={20} aria-hidden /><span>SERVICE UPDATES</span><strong>{configured ? "Check your selection" : "Awaiting activation"}</strong><p>{configured ? "Updates relate to your selected stop and routes, rather than the entire network." : "Use the official network status and disruption links before travelling."}</p></div>
          </div>
          <section className="tr-commute-section" id="commute" aria-labelledby="commute-title">
            <div className="tr-section-heading"><div><h2 id="commute-title">One stop closer.</h2><p>Metro trains and trams · Saved stops are shared with Melbourne Daily.</p></div></div>
            <CommutePanel now={now} revision={revision} variant="dashboard" />
          </section>
          <section className="tr-tools" id="tools" aria-labelledby="tools-title">
            <div className="tr-section-heading"><div><h2 id="tools-title">Official tools for the rest of your trip.</h2><p>These links open the transport operators’ websites. Pin the ones you use most.</p></div></div>
            {favorites.length > 0 && <div className="tr-pinned-strip" aria-label="Pinned travel tools"><Bookmark size={15} aria-hidden /><span>Pinned</span>{favorites.map((id) => transportLinks.find((link) => link.id === id)!).map((link) => <ExternalLink key={link.id} href={link.url}>{link.label}</ExternalLink>)}</div>}
            <div className="tr-tools-grid">{transportLinks.map((link) => {
              const Icon = link.mode === "tram" ? TramFront : link.mode === "journey" ? Compass : link.mode === "bus" ? BusFront : TrainFront;
              return <article className="tr-tool-card" key={link.id}><ExternalLink href={link.url} className="tr-tool-main"><span className={`tr-tool-icon ${link.mode}`}><Icon size={22} aria-hidden /></span><span className="tr-tool-copy"><strong>{link.label}</strong><p>{link.description}</p></span></ExternalLink><button className={`favorite-button ${favorites.includes(link.id) ? "is-favorite" : ""}`} aria-label={`${favorites.includes(link.id) ? "Unpin " : "Pin "}${link.label}`} aria-pressed={favorites.includes(link.id)} onClick={() => toggleFavorite(link.id)}><Star size={17} fill={favorites.includes(link.id) ? "currentColor" : "none"} aria-hidden /></button></article>;
            })}<article className="tr-tool-card"><ExternalLink href={roadTrafficLink.url} className="tr-tool-main"><span className="tr-tool-icon journey"><Route size={22} aria-hidden /></span><span className="tr-tool-copy"><strong>{roadTrafficLink.label}</strong><p>{roadTrafficLink.description}</p></span></ExternalLink></article></div>
          </section>
          <section className="tr-sources" id="sources" aria-labelledby="sources-title">
            <div className="tr-sources-heading"><h2 id="sources-title">Know what’s available.</h2><Badge>{configured ? "Source information" : "Live features pending"}</Badge></div>
            <div className="tr-source-grid">
              <article><h3><MapPin size={18} aria-hidden />Stop directory & saved places</h3><p>The published DTP directory covers Metro train platforms and tram boarding points. It contains stop information, not arrival predictions. Bus and regional rail trips are available through the official journey planner.</p><p>The directory update date is shown beside search. The collection is refreshed weekly on a best-effort basis. Saved stops and pinned links stay in this browser and are shared with the homepage.</p><ExternalLink href="https://opendata.transport.vic.gov.au/dataset/gtfs-schedule">DTP stop data · CC BY 4.0</ExternalLink></article>
              <article><h3><TrainFront size={18} aria-hidden />Departures & service updates</h3><p>{configured ? "Select a stop to request its departure board." : "Live PTV departures and service updates have not been activated yet. Until then, the dashboard does not show predictions or claim that services are running normally."}</p><p>When active, the board checks every 30 seconds and hides results after two minutes without a successful lookup. Live estimates, scheduled times and reported train cancellations remain distinct. PTV does not promise tram cancellation status.</p><ExternalLink href="https://transport.vic.gov.au/departures">Check official departures</ExternalLink></article>
            </div>
            <p className="tr-source-note">An independent Melbourne dashboard. Times use Australia/Melbourne. Check official information before travelling; this page is not operated by Public Transport Victoria.</p>
          </section>
          <footer className="tr-footer"><a href={DAILY_URL}><LayoutGrid size={15} aria-hidden />Back to Melbourne Daily<ArrowUpRight size={14} aria-hidden /></a><a href={`${DAILY_URL}weather.html`}><CloudSun size={15} aria-hidden />Weather & UV<ArrowUpRight size={14} aria-hidden /></a><a href={`${DAILY_URL}air.html`}><Wind size={15} aria-hidden />Air quality<ArrowUpRight size={14} aria-hidden /></a><ExternalLink href="https://github.com/Ericthegoatskr/melbourne-daily">View on GitHub</ExternalLink><span>THE MELBOURNE COLLECTION</span></footer>
        </main>
      </div>
      <CollectionNav current="transport" placement="mobile" onNavigate={closeMenu} hidden={menuOpen} />
    </div>
  );
}
