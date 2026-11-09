import { useEffect, useRef, useState } from "react";
import { LocateFixed, TrainFront, TramFront } from "lucide-react";
import { LocationError, requestCurrentLocation, type CurrentLocation } from "../lib/currentLocation";
import { findNearbyStops, formatStopDistance } from "../lib/nearbyStops";
import type { StopDirectory } from "../lib/stopDirectory";
import type { TransitStop } from "../lib/transit";
import { melbourneTime } from "../lib/resource";
import "./NearbyStops.css";

// A one-time position becomes less useful as the traveller moves. Never track
// movement or silently request another fix; ask for an explicit refresh.
const LOCATION_MAX_AGE_MS = 10 * 60_000;

export default function NearbyStops({
  directory, directoryLoading, directoryError, onRetryDirectory, onSelect, selectedStop, now,
}: {
  directory?: StopDirectory;
  directoryLoading: boolean;
  directoryError: string;
  onRetryDirectory: () => void;
  onSelect: (stop: TransitStop) => void;
  selectedStop?: TransitStop;
  now: number;
}) {
  const [location, setLocation] = useState<CurrentLocation>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"all" | "train" | "tram">("all");
  const [radius, setRadius] = useState(2000);
  const request = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const actionButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!loading && restoreFocus.current) {
      restoreFocus.current = false;
      actionButton.current?.focus();
    }
  }, [loading]);
  useEffect(() => () => {
    requestId.current++;
    request.current?.abort();
  }, []);

  function cancel() {
    requestId.current++;
    request.current?.abort();
    request.current = null;
    restoreFocus.current = loading;
    setLoading(false);
    if (!loading) actionButton.current?.focus();
  }
  async function locate() {
    request.current?.abort();
    const id = ++requestId.current;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLocation(undefined);
    setError("");
    try {
      const fix = await requestCurrentLocation(controller.signal);
      if (id !== requestId.current || controller.signal.aborted) return;
      setLocation(fix);
    } catch (reason) {
      if (id !== requestId.current || controller.signal.aborted) return;
      setError(reason instanceof LocationError ? reason.message : "Could not find your location. Try again or search for a stop by name.");
    } finally {
      if (id === requestId.current) {
        request.current = null;
        setLoading(false);
      }
    }
  }
  // The page clock ticks every 15 seconds; a new fix may be ahead of it.
  // requestCurrentLocation already validates timestamps against the real clock.
  const expired = !!location && now - location.capturedAt > LOCATION_MAX_AGE_MS;
  const nearby = location && !expired && directory
    ? findNearbyStops(directory, location, { mode, radiusMetres: radius, limit: 12 }) : [];

  return <section className="nearby-transit" aria-label="Find stops near you">
    <div className="nearby-transit-actions">
      <button ref={actionButton} className="nearby-location-button" onClick={locate} disabled={loading}>
        <LocateFixed size={17} aria-hidden />
        {loading ? "Finding your location…" : location ? "Update my location" : "Use my current location"}
      </button>
      {loading && <button className="text-button" onClick={cancel}>Cancel location request</button>}
      {location && <button className="text-button" onClick={() => { cancel(); setLocation(undefined); setError(""); }}>Clear location</button>}
    </div>
    <p className="nearby-transit-privacy">Find train and tram stops near you. One-time location, with your permission. Your coordinates stay in this tab and are not saved or sent to the transport service.</p>
    <div role="status" className="nearby-location-status">
      {loading ? "Allow location access in your browser. You can still search by name below." : error || (expired ? "This location is over 10 minutes old. Update your location to find nearby stops again." : location ? `Location captured at ${melbourneTime(new Date(location.capturedAt).toISOString())} · Accuracy about ${formatStopDistance(location.accuracyMetres)}. ${nearby.length ? `${nearby.length} nearby results, nearest first.` : ""}` : "")}
    </div>
    {location && !expired && <>
      <div className="nearby-transit-filters">
        <div className="segmented" role="group" aria-label="Nearby transport mode">
          {([['all', 'All'], ['train', 'Trains'], ['tram', 'Trams']] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}
        </div>
        <label className="nearby-radius"><span>Nearby search radius</span><select value={radius} onChange={(event) => setRadius(Number(event.target.value))}><option value={1000}>1 km</option><option value={2000}>2 km</option><option value={5000}>5 km</option></select></label>
      </div>
      {!directory && directoryLoading && <p className="commute-help" role="status">Loading the official stop directory…</p>}
      {!directory && directoryError && <p className="commute-help" role="status">The stop directory is unavailable. Your location is ready. <button className="inline-button" onClick={onRetryDirectory}>Retry nearby stop directory</button></p>}
      {directory && <>
        <p className="nearby-distance-note">Up to 12 results within {radius / 1000} km, by straight-line distance to mapped stops, not a walking route or station entrance. Train platforms are grouped; tram boarding points stay separate. This location does not follow you as you move.</p>
        <div className="nearby-stop-results" role="region" aria-label="Nearby stops">
          {nearby.length ? <ol>{nearby.map(({ stop, label, distanceMetres, platformCount }) => <li key={`${stop.mode}:${stop.id}`}>
            <button aria-pressed={selectedStop?.id === stop.id && selectedStop.mode === stop.mode && selectedStop.idScheme === stop.idScheme} onClick={() => onSelect(stop)}>
              {stop.mode === "train" ? <TrainFront size={18} aria-hidden /> : <TramFront size={18} aria-hidden />}
              <span className="nearby-stop-copy"><strong>{label}</strong><small>{stop.mode === "train" ? `Metro train${platformCount > 1 ? ` · ${platformCount} mapped platforms` : ""}` : `Tram · Boarding point ${stop.id}`}</small></span>
              <span className="nearby-stop-distance">≈ {formatStopDistance(distanceMetres)}</span>
            </button>
          </li>)}</ol> : <p>No {mode === "train" ? "train stations" : mode === "tram" ? "tram stops" : "train or tram stops"} found within {radius / 1000} km in the Melbourne directory. Try a wider radius, another mode or search by name.</p>}
        </div>
        <p className="nearby-distance-note">Select a stop for departures and service updates. Check its route, direction and platform before boarding. Rail-replacement bus stops are available through name search.</p>
      </>}
    </>}
  </section>;
}
