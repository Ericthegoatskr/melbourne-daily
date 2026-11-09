import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, Search } from "lucide-react";
import { CITY_DESTINATION_SOURCE_URL, DESTINATION_SOURCE_URL, LANDMARKS, searchTransitDestinations, type TransitDestination } from "../lib/transitDestinations";
import { ExternalLink } from "./ui";
import "./TransitDestinationSearch.css";

export default function TransitDestinationSearch({ onSelect, resetKey = 0 }: {
  onSelect: (destination: TransitDestination) => void;
  resetKey?: number;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TransitDestination[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const requestId = useRef(0);

  function abandon() {
    requestId.current++;
    request.current?.abort();
    request.current = null;
  }
  function clearResults() {
    setResults([]);
    setSearched(false);
    setPartial(false);
    setError("");
    setLoading(false);
  }
  useEffect(() => {
    abandon();
    setQuery("");
    clearResults();
    return abandon;
  }, [resetKey]);

  function choose(destination: TransitDestination, restoreInputFocus = false) {
    abandon();
    clearResults();
    setQuery(destination.label);
    if (restoreInputFocus) input.current?.focus({ preventScroll: true });
    onSelect(destination);
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    abandon();
    clearResults();
    const id = requestId.current;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const response = await searchTransitDestinations(query, controller.signal);
      if (id !== requestId.current || controller.signal.aborted) return;
      setResults(response.destinations);
      setPartial(response.partial);
      setSearched(true);
    } catch (reason) {
      if (id !== requestId.current || controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "Destination search is unavailable. Try again or choose a landmark.");
    } finally {
      if (id === requestId.current) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  return <section className="transit-destination-search" aria-label="Find stops near a destination">
    <form onSubmit={search} aria-label="Destination search">
      <label className="transit-destination-field">
        <span>Find a destination</span>
        <input ref={input} type="text" value={query} placeholder="Address + suburb, or landmark name" maxLength={100} autoComplete="off"
          onChange={(event) => { abandon(); clearResults(); setQuery(event.target.value); }} />
      </label>
      <button className="transit-destination-submit" type="submit" disabled={loading || query.trim().length < 2}>
        <Search size={16} aria-hidden="true" />{loading ? "Searching destinations…" : "Search destinations"}
      </button>
    </form>
    <label className="transit-landmark-field">
      <span>Choose a landmark</span>
      <select value="" onChange={(event) => {
        const landmark = LANDMARKS.find((place) => place.id === event.target.value);
        if (landmark) choose(landmark);
      }}>
        <option value="">Select a landmark…</option>
        {LANDMARKS.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
      </select>
    </label>
    <p className="transit-destination-help">Search Greater Melbourne. For an address, include the suburb, e.g. 8 Arnold Street Box Hill. For a landmark, start with its name.</p>
    <p className="transit-destination-help">Only submitted searches go to Victorian Government Vicmap services (including Esri hosting) and City of Melbourne. Your device location is not included. Listed landmarks work without a search request.</p>
    {loading && <button className="text-button" type="button" onClick={() => { abandon(); clearResults(); input.current?.focus({ preventScroll: true }); }}>Cancel destination search</button>}
    {(loading || error || searched) && <p role="status" className="transit-destination-status">
      {loading ? "Looking up Greater Melbourne addresses and landmarks…" : error || (partial
        ? "Some results could not be loaded. You can select an available result, search again or choose a landmark."
        : results.length ? `${results.length} destination${results.length === 1 ? "" : "s"} found. Choose one to find nearby stations and stops.`
        : "No matching destinations in the Greater Melbourne search area. For an address, include the street number and suburb. For a landmark, try its name without the suburb, or choose a listed landmark.")}
    </p>}
    {results.length > 0 && <div className="transit-destination-results" role="region" aria-label="Matching destinations">
      <ul>{results.map((destination) => <li key={destination.id}>
        <button type="button" onClick={() => choose(destination, true)}><MapPin size={16} aria-hidden="true" /><span>{destination.label}</span></button>
      </li>)}</ul>
    </div>}
    <p className="transit-destination-source"><ExternalLink href={DESTINATION_SOURCE_URL}>Vicmap · CC BY 4.0</ExternalLink><span aria-hidden="true"> · </span><ExternalLink href={CITY_DESTINATION_SOURCE_URL}>City of Melbourne · CC BY 4.0</ExternalLink></p>
  </section>;
}
