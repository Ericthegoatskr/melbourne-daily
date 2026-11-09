import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  RefreshCw,
  Search,
  TrainFront,
  TramFront,
  Trash2,
} from "lucide-react";
import {
  fetchTransitBoard,
  transitApiConfigured,
  parseTransitStop,
  upcomingDepartures,
  TRANSIT_REFRESH_MS,
  TRANSIT_MAX_AGE_MS,
  TRANSIT_ATTRIBUTION,
  type TransitSelection,
  type TransitMode,
} from "../lib/transit";
import {
  fetchStopDirectory,
  findStops,
  type StopDirectory,
} from "../lib/stopDirectory";
import {
  useResource,
  readPreference,
  savePreference,
  melbourneTime,
} from "../lib/resource";
import { Badge, ExternalLink, SourceTime } from "./ui";
import "./TransitPanel.css";

const serviceDate = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  dateStyle: "medium",
  timeStyle: "short",
});

function selectionId(item: TransitSelection) {
  return `${item.stop.idScheme}:${item.stop.mode}:${item.stop.id}:${item.routeId ?? "all"}:${item.directionId ?? "all"}`;
}
function readSaved(): TransitSelection[] {
  try {
    const raw: unknown = JSON.parse(readPreference("commutes", "[]"));
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 6).flatMap((item) => {
      try {
        const stop = parseTransitStop(item.stop);
        if (
          (item.routeId !== undefined &&
            (!Number.isSafeInteger(item.routeId) || item.routeId < 0)) ||
          (item.directionId !== undefined &&
            (!Number.isSafeInteger(item.directionId) || item.directionId < 0))
        )
          return [];
        return [
          {
            stop,
            routeId: item.routeId,
            directionId: item.directionId,
            directionName:
              typeof item.directionName === "string"
                ? item.directionName.slice(0, 150)
                : undefined,
          },
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export default function CommutePanel({
  now,
  revision,
  variant = "compact",
}: {
  now: number;
  revision: number;
  variant?: "compact" | "dashboard";
}) {
  const dashboard = variant === "dashboard";
  const [saved, setSaved] = useState(readSaved);
  const [selection, setSelection] = useState<TransitSelection | null>(
    () => readSaved()[0] || null,
  );
  const [editing, setEditing] = useState(() => !readSaved().length);
  const [mode, setMode] = useState<TransitMode>("train");
  const [query, setQuery] = useState("");
  const [directory, setDirectory] = useState<StopDirectory>();
  const [directoryError, setDirectoryError] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [localRevision, setLocalRevision] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const configured = transitApiConfigured();
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    setDirectoryLoading(true);
    fetchStopDirectory(controller.signal)
      .then((data) => {
        if (!disposed) {
          setDirectory(data);
          setDirectoryError("");
        }
      })
      .catch(() => {
        if (!disposed)
          setDirectoryError("Stop search is temporarily unavailable.");
      })
      .finally(() => {
        if (!disposed) setDirectoryLoading(false);
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [revision, localRevision]);
  const boardKey = selection ? selectionId(selection) : "none";
  const resource = useResource(
    `commute:${boardKey}`,
    async (signal) =>
      selection && configured ? fetchTransitBoard(selection, signal) : null,
    TRANSIT_REFRESH_MS,
    revision + localRevision,
    (data) => data?.checkedAt || new Date(0).toISOString(),
  );
  const board =
    resource.data &&
    now - Date.parse(resource.data.checkedAt) <= TRANSIT_MAX_AGE_MS
      ? resource.data
      : undefined;
  const departures = upcomingDepartures(board, now, 5);
  const results = directory ? findStops(directory, query, mode) : [];
  const isSaved =
    selection &&
    saved.some((item) => selectionId(item) === selectionId(selection));
  const allDirections = board?.directions || [];
  const allPlatforms =
    selection?.stop.idScheme === "gtfs" && selection.stop.mode === "train";
  const departureStopName = allPlatforms
    ? selection.stop.name.replace(/ · Platform .+$/, "")
    : selection?.stop.name;

  function save() {
    if (!selection || isSaved || saved.length >= 6) return;
    const next = [...saved, selection];
    setSaved(next);
    savePreference("commutes", JSON.stringify(next));
  }
  function remove(item: TransitSelection) {
    const next = saved.filter(
      (value) => selectionId(value) !== selectionId(item),
    );
    setSaved(next);
    savePreference("commutes", JSON.stringify(next));
  }
  function changeDirection(value: string) {
    if (!selection) return;
    const direction = allDirections.find(
      (item) => `${item.routeId}:${item.id}` === value,
    );
    setSelection({
      stop: selection.stop,
      routeId: direction?.routeId,
      directionId: direction?.id,
      directionName: direction
        ? `${direction.routeName} · ${direction.name}`
        : undefined,
    });
  }

  // Both presentations use the same request, persistence and freshness state.
  const savedStops = (
    <>
      {saved.length > 0 && (
        <div className="saved-commutes" aria-label="Saved stops">
          {saved.map((item) => (
            <div className="saved-commute" key={selectionId(item)}>
              <button
                aria-pressed={
                  !!selection && selectionId(selection) === selectionId(item)
                }
                onClick={() => {
                  setSelection(item);
                  setEditing(false);
                }}
              >
                <span>
                  {item.stop.mode === "tram" ? (
                    <TramFront size={14} />
                  ) : (
                    <TrainFront size={14} />
                  )}
                  {item.stop.name}
                </span>
                <small>{item.directionName || "All directions"}</small>
              </button>
              <button
                className="remove-commute"
                onClick={() => remove(item)}
                aria-label={`Remove ${item.stop.name}${item.directionName ? ` towards ${item.directionName}` : ""}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
  const stopSearch = (
    <>
      {(editing || dashboard) && (
        <div className="stop-search">
          <div className="segmented" role="group" aria-label="Transport mode">
            <button
              aria-pressed={mode === "train"}
              onClick={() => setMode("train")}
            >
              Metro trains
            </button>
            <button
              aria-pressed={mode === "tram"}
              onClick={() => setMode("tram")}
            >
              Trams
            </button>
          </div>
          <label className="stop-search-input">
            <Search size={16} />
            <span className="sr-only">Find a station or tram stop</span>
            <input
              ref={searchInput}
              type="search"
              value={query}
              maxLength={80}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                mode === "train"
                  ? "Search station, e.g. Richmond"
                  : "Search tram stop or stop number"
              }
              autoComplete="off"
            />
          </label>
          {directoryLoading && !directory && (
            <p role="status">Loading the official stop directory…</p>
          )}
          {directoryError && !directory && (
            <p role="status">
              {directoryError}{" "}
              <button
                className="inline-button"
                onClick={() => setLocalRevision((n) => n + 1)}
              >
                Try again
              </button>
            </p>
          )}
          {query.trim().length >= 2 && directory && (
            <div
              className="stop-results"
              role="region"
              aria-label="Matching stops"
            >
              {results.length ? (
                results.map((stop) => (
                  <button
                    key={`${stop.mode}:${stop.id}`}
                    onClick={() => {
                      setSelection({ stop });
                      setEditing(false);
                      setQuery("");
                    }}
                  >
                    <MapPin size={15} />
                    <span>
                      <strong>{stop.name}</strong>
                      <small>
                        {stop.suburb ||
                          (stop.mode === "train" ? "Metro train" : "Tram")}{" "}
                        · Stop {stop.id}
                      </small>
                    </span>
                  </button>
                ))
              ) : (
                <p role="status">
                  No matching stops. Try a nearby street or a shorter name.
                </p>
              )}
            </div>
          )}
          <p className="commute-help">
            Save up to six stops on this device. Route and direction choices
            appear when departures are available. Train boards cover all
            platforms; tram boards may include both directions.
          </p>
          {directory && (
            <small className="directory-date">
              <ExternalLink href={directory.sourceUrl}>
                Stop data: DTP (CC BY 4.0)
              </ExternalLink>{" "}
              · Updated{" "}
              {new Intl.DateTimeFormat("en-AU", {
                timeZone: "Australia/Melbourne",
                dateStyle: "medium",
              }).format(new Date(directory.sourceUpdatedAt))}
            </small>
          )}
        </div>
      )}
    </>
  );
  const selectedStop = selection && (
    <>
      <div className="selected-stop">
        <div>
          <strong>{selection.stop.name}</strong>
          <span>
            {selection.stop.mode === "train" ? "Metro train" : "Tram"} ·{" "}
            {allPlatforms && "All platforms · "}
            {selection.directionName || "All directions"}
          </span>
        </div>
        <button
          className="icon-button save-stop"
          aria-label={
            isSaved ? "Stop saved" : "Save this stop and direction"
          }
          disabled={!!isSaved || saved.length >= 6}
          onClick={save}
        >
          {isSaved ? <Check size={18} /> : <BookmarkPlus size={18} />}
        </button>
      </div>
      {saved.length >= 6 && !isSaved && (
        <p className="commute-help">
          Remove a saved stop to make room for another.
        </p>
      )}
      {allDirections.length > 0 && (
        <label className="direction-picker">
          <span>Route & direction</span>
          <select
            value={
              selection.routeId !== undefined &&
              selection.directionId !== undefined
                ? `${selection.routeId}:${selection.directionId}`
                : ""
            }
            onChange={(event) => changeDirection(event.target.value)}
          >
            <option value="">All directions</option>
            {allDirections.map((direction) => (
              <option
                key={`${direction.routeId}:${direction.id}`}
                value={`${direction.routeId}:${direction.id}`}
              >
                {direction.routeName} · {direction.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
      )}
    </>
  );
  const departureRows = (
    <>
      <div className="departure-list">
        {departures.length ? (
          departures.map((departure) => {
            const minutes = Math.max(
              0,
              Math.ceil(
                (Date.parse(
                  departure.estimatedAt ?? departure.scheduledAt,
                ) -
                  now) /
                  60_000,
              ),
            );
            const delay = departure.estimatedAt
              ? Math.round(
                  (Date.parse(departure.estimatedAt) -
                    Date.parse(departure.scheduledAt)) /
                    60_000,
                )
              : 0;
            return (
              <div
                className={`departure-row ${departure.status === "cancelled" ? "is-cancelled" : ""}`}
                key={departure.id}
              >
                <div>
                  <strong>{departure.destination}</strong>
                  <span>
                    {departure.routeNumber
                      ? `Route ${departure.routeNumber}`
                      : departure.routeName}
                    {departure.platform
                      ? ` · Platform ${departure.platform}`
                      : ""}
                  </span>
                  <small>
                    {departure.status === "cancelled"
                      ? "Cancelled"
                      : departure.status === "estimated"
                        ? `Live estimate${delay > 1 ? ` · ${delay} min later than scheduled` : ""}`
                        : "Scheduled · no live estimate"}
                    {departure.notes ? ` · ${departure.notes}` : ""}
                  </small>
                </div>
                <div className="departure-time">
                  <strong>
                    {departure.status === "cancelled"
                      ? "Cancelled"
                      : minutes === 0
                        ? "Due"
                        : `${minutes} min`}
                  </strong>
                  <span>
                    {melbourneTime(
                      departure.estimatedAt ?? departure.scheduledAt,
                    )}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <p className="commute-help">
            No upcoming departures returned for this selection. Check
            the official service for later trips.
          </p>
        )}
      </div>
    </>
  );
  const serviceAlerts = (
    <>
      {board && board.disruptions.length > 0 && (
        <div className="service-alerts">
          {!dashboard && <h4>
            <AlertTriangle size={14} />
            Service updates
          </h4>}
          {board.disruptions.map((alert) => (
            <details key={alert.id}>
              <summary>{alert.title}</summary>
              <p>
                {alert.description || "Check the operator for details."}
              </p>
              {(alert.startsAt || alert.endsAt) && (
                <p>
                  {alert.startsAt && (
                    <>
                      From{" "}
                      <time dateTime={alert.startsAt}>
                        {serviceDate.format(new Date(alert.startsAt))}
                      </time>
                    </>
                  )}
                  {alert.startsAt && alert.endsAt ? " · " : ""}
                  {alert.endsAt && (
                    <>
                      Until{" "}
                      <time dateTime={alert.endsAt}>
                        {serviceDate.format(new Date(alert.endsAt))}
                      </time>
                    </>
                  )}
                </p>
              )}
              {alert.url && (
                <ExternalLink href={alert.url}>
                  Operator update
                </ExternalLink>
              )}
            </details>
          ))}
        </div>
      )}
    </>
  );
  const boardFooter = board && (
    <>
      <div className="board-footer">
        <SourceTime
          label="Checked"
          timestamp={board.checkedAt}
          now={now}
          refreshing={resource.loading}
        />
        <button
          className="icon-button"
          aria-label="Refresh departures"
          onClick={() => setLocalRevision((n) => n + 1)}
          disabled={resource.loading}
        >
          <RefreshCw size={13} />
        </button>
      </div>
      {resource.error && (
        <p className="refresh-warning">
          Refresh failed. These results will expire automatically.
        </p>
      )}
    </>
  );
  const attribution = (
    <>
      {board && (
        <p className="commute-attribution">
          {TRANSIT_ATTRIBUTION} Lookup time is shown; PTV does not provide an
          observation timestamp here.
        </p>
      )}
    </>
  );

  const departureContent = !configured || (resource.error && !board) ? (
    <div className="commute-unavailable" role="status">
      <Clock3 size={19} aria-hidden />
      <div>
        <strong>Live departures are currently unavailable.</strong>
        {dashboard && !configured && <p>Live arrivals will appear once this service is activated.</p>}
        <p>
          {selection
            ? isSaved ? "Your stop is saved locally." : "You can save this stop locally."
            : "You can search and save your stops now."}{" "}
          Check official departures before travelling.
        </p>
        <ExternalLink href="https://transport.vic.gov.au/departures">Check official departures</ExternalLink>
      </div>
    </div>
  ) : !selection ? (
    <div className="tr-panel-empty" role="status"><TrainFront size={30} aria-hidden /><strong>Choose your next stop.</strong><p>Search for a station or tram stop to see its departures here.</p></div>
  ) : resource.loading && !board ? (
    <p className="commute-help" role="status">Checking departures…</p>
  ) : !board ? (
    <p className="commute-help" role="status">Departure information has expired.{" "}<button className="inline-button" onClick={() => setLocalRevision((n) => n + 1)}>Refresh</button></p>
  ) : <>
    {allPlatforms ? (
      <p className="commute-help">
        <strong>All station platforms.</strong> Check the platform shown for
        each service.
      </p>
    ) : selection.stop.idScheme === "gtfs" && selection.stop.mode === "tram" && (
      <p className="commute-help">
        {selection.directionId === undefined ? (
          <><strong>Both directions may appear.</strong> Choose Route &amp; direction
            to narrow the board.</>
        ) : "Showing your selected route and direction. Check the destination before boarding."}
      </p>
    )}
    {departureRows}{!dashboard && serviceAlerts}{boardFooter}
  </>;

  const serviceContent = !configured ? (
    <div className="tr-panel-empty" role="status"><Clock3 size={29} aria-hidden /><strong>Live service updates are awaiting activation.</strong><p>Check Transport Victoria for current disruptions before travelling.</p></div>
  ) : !selection ? (
    <div className="tr-panel-empty" role="status"><AlertTriangle size={29} aria-hidden /><strong>Updates for your journey.</strong><p>Choose a stop to see the service updates returned for that selection.</p></div>
  ) : !board ? (
    <div className="tr-panel-empty" role="status"><AlertTriangle size={29} aria-hidden /><strong>{resource.loading ? "Checking service updates…" : resource.data ? "Service updates have expired." : "Service updates are unavailable."}</strong><p>Check official sources before travelling.</p></div>
  ) : board.disruptions.length ? serviceAlerts : (
    <div className="tr-panel-empty" role="status"><AlertTriangle size={29} aria-hidden /><strong>No service updates were returned.</strong><p>This applies to the selected stop and direction. Check official sources for wider network changes.</p></div>
  );

  const boardStatus = !configured ? "Awaiting activation" : !selection ? "Choose a stop" : board ? "PTV response" : resource.loading ? "Checking" : resource.data ? "Expired" : "Unavailable";

  if (dashboard) return (
    <div className="tr-workspace">
      <section className="card tr-stop-panel" id="stops" aria-labelledby="tr-stops-title">
        <div className="card-heading"><div className="card-title"><MapPin size={19} aria-hidden /><h2 id="tr-stops-title">Find your stop</h2></div><Badge>{saved.length} / 6 saved</Badge></div>
        <p className="card-subtitle">Your regular journeys, a little closer.</p>
        {savedStops}
        {stopSearch}
        {selection && <div className="departure-board" role="region" aria-label="Selected stop">{selectedStop}</div>}
      </section>
      <section className="card tr-departures-panel" id="departures" aria-labelledby="tr-departures-title">
        <div className="card-heading"><div className="card-title"><TrainFront size={19} aria-hidden /><h2 id="tr-departures-title">Departures</h2></div><Badge tone={!configured ? "amber" : "neutral"}>{boardStatus}</Badge></div>
        <p className="card-subtitle">{selection ? `${departureStopName}${allPlatforms ? " · All platforms" : ""} · ${selection.directionName || "All directions"}` : "Your next train or tram, when live data is available."}</p>
        {departureContent}
      </section>
      <section className="card tr-services-panel" id="services" aria-labelledby="tr-services-title">
        <div className="card-heading"><div className="card-title"><AlertTriangle size={19} aria-hidden /><h2 id="tr-services-title">Service updates</h2></div><Badge tone={!configured ? "amber" : "neutral"}>{boardStatus}</Badge></div>
        <p className="card-subtitle">Changes that may affect your selected journey.</p>
        {serviceContent}
        <div className="card-footer"><ExternalLink href="https://transport.vic.gov.au/disruptions/disruptions-information">Check official disruptions</ExternalLink>{board && <SourceTime label="Checked" timestamp={board.checkedAt} now={now} refreshing={resource.loading} />}</div>
        {resource.error && board && <p className="refresh-warning">Refresh failed. These updates will expire automatically.</p>}
      </section>
      {attribution}
    </div>
  );

  return (
    <div className="commute-panel">
      <div className="commute-heading">
        <h3><TrainFront size={17} />My commute</h3>
        <button className="text-button" onClick={() => { setEditing(!editing); if (!editing) setTimeout(() => searchInput.current?.focus(), 0); }}>{editing ? "Close search" : "Find a stop"}</button>
      </div>
      {savedStops}
      {stopSearch}
      {selection && <div className="departure-board" aria-label="Selected stop departures">{selectedStop}{departureContent}</div>}
      {attribution}
    </div>
  );
}
