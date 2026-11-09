import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { NearbyStop } from "../lib/nearbyStops";
import { formatStopDistance } from "../lib/nearbyStops";
import type { TransitStop } from "../lib/transit";
import "leaflet/dist/leaflet.css";
import "./TransitStopMap.css";

export interface TransitStopMapProps {
  center: { latitude: number; longitude: number; label: string };
  nearby: readonly NearbyStop[];
  radiusMetres: number;
  selectedStop?: TransitStop;
  onSelect: (stop: TransitStop) => void;
  onViewDepartures: (stop: TransitStop) => void;
}

const identity = (stop?: TransitStop) => stop ? `${stop.idScheme}:${stop.mode}:${stop.id}` : "";
const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fitOptions: L.FitBoundsOptions = { padding: [40, 40], maxZoom: 17, animate: false };

/** Loaded only after Show stop map. No location request, route lookup or key. */
export function TransitStopMap({ center, nearby, radiusMetres, selectedStop, onSelect, onViewDepartures }: TransitStopMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const bounds = useRef<L.LatLngBounds | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const current = useRef({ center, nearby, radiusMetres, onSelect, onViewDepartures });
  current.current = { center, nearby, radiusMetres, onSelect, onViewDepartures };
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [hasLoadedTiles, setHasLoadedTiles] = useState(false);
  const lastSelected = useRef("");
  const popupMaxWidth = () => Math.max(50, Math.min(260, (container.current?.clientWidth || 310) - 50));
  // The directory and distance results are recomputed by the page clock. Use
  // semantic values, so those renders do not reset a map someone is exploring.
  const resultKey = JSON.stringify(nearby.map(({ stop, label, distanceMetres, platformCount }) =>
    [identity(stop), stop.latitude, stop.longitude, label, distanceMetres, platformCount]));
  const centerKey = JSON.stringify([center.latitude, center.longitude, center.label]);
  const selectedKey = identity(selectedStop);

  useEffect(() => {
    if (!container.current) return;
    let instance: L.Map | undefined;
    let observer: ResizeObserver | undefined;
    setFailed(false);
    setTileError(false);
    setHasLoadedTiles(false);
    try {
      instance = L.map(container.current, {
        center: [current.current.center.latitude, current.current.center.longitude], zoom: 14,
        scrollWheelZoom: false, zoomControl: false,
        dragging: !L.Browser.mobile && !(typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches),
        touchZoom: true,
        zoomAnimation: !reducedMotion(), fadeAnimation: !reducedMotion(), markerZoomAnimation: !reducedMotion(),
      });
      map.current = instance;
      // Normal browser caching and referrer behavior satisfy the OSM tile policy.
      // No prefetch, offline download or cache-busting request is added.
      tiles.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on("tileerror", () => setTileError(true)).on("tileload", () => setHasLoadedTiles(true)).addTo(instance);
      layers.current = L.layerGroup().addTo(instance);
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
          instance?.invalidateSize({ pan: false });
          for (const marker of markers.current.values()) {
            const popup = marker.getPopup();
            if (popup) {
              popup.options.maxWidth = popupMaxWidth();
              popup.update();
            }
          }
        });
        observer.observe(container.current);
      }
    } catch {
      instance?.remove();
      map.current = null;
      layers.current = null;
      tiles.current = null;
      setFailed(true);
    }
    return () => {
      observer?.disconnect();
      tiles.current?.off();
      map.current?.remove();
      map.current = null;
      layers.current = null;
      tiles.current = null;
      bounds.current = null;
      markers.current.clear();
      lastSelected.current = "";
    };
  }, [attempt]);

  useEffect(() => {
    const instance = map.current, layer = layers.current;
    if (!instance || !layer) return;
    const { center: point, nearby: results, radiusMetres: radius } = current.current;
    layer.clearLayers();
    markers.current.clear();
    const circle = L.circle([point.latitude, point.longitude], {
      radius, color: "#5f439c", weight: 1.5, dashArray: "6 6",
      fillColor: "#8d73bd", fillOpacity: 0.06, interactive: false,
    }).addTo(layer);
    // Fit the displayed stops rather than the entire radius: a sparse local
    // result set should remain legible even when the search radius is large.
    bounds.current = results.length ? L.latLngBounds([
      [point.latitude, point.longitude],
      ...results.map(({ stop }) => [stop.latitude, stop.longitude] as L.LatLngTuple),
    ]) : circle.getBounds();
    const centerIcon = document.createElement("span");
    centerIcon.className = "transit-map-center-label";
    centerIcon.textContent = "C";
    const centerTooltip = document.createElement("span");
    centerTooltip.textContent = `Search centre: ${point.label}`;
    const centerMarker = L.marker([point.latitude, point.longitude], {
      icon: L.divIcon({ html: centerIcon, className: "transit-map-center", iconSize: [44, 44], iconAnchor: [22, 22] }),
      title: `Search centre: ${point.label}`, keyboard: true, zIndexOffset: 500,
    }).bindTooltip(centerTooltip, { direction: "top", offset: [0, -18] }).addTo(layer);
    centerMarker.getElement()?.setAttribute("aria-label", `Search centre: ${point.label}`);

    results.forEach((result, index) => {
      const { stop, label, distanceMetres } = result;
      const mode = { train: "Train", tram: "Tram", bus: "Bus" }[stop.mode];
      const icon = document.createElement("span");
      icon.className = "transit-map-stop-label";
      icon.textContent = `${{ train: "T", tram: "R", bus: "B" }[stop.mode]}${index + 1}`;
      const marker = L.marker([stop.latitude, stop.longitude], {
        icon: L.divIcon({ html: icon, className: `transit-map-stop transit-map-${stop.mode}`, iconSize: [44, 44], iconAnchor: [22, 22] }),
        title: `${index + 1}. ${mode}: ${label}`, keyboard: true, riseOnHover: true,
      });
      const popup = document.createElement("div");
      popup.className = "transit-map-popup";
      const title = document.createElement("strong");
      title.textContent = `${index + 1}. ${label}`;
      const detail = document.createElement("p");
      detail.textContent = `${mode} · ${formatStopDistance(distanceMetres)} straight line from ${point.label}`;
      const action = document.createElement("button");
      action.type = "button";
      action.textContent = "View departures & walking directions";
      action.addEventListener("click", () => current.current.onViewDepartures(stop));
      popup.append(title, detail, action);
      marker.bindPopup(popup, { maxWidth: popupMaxWidth(), maxHeight: 190, autoPan: true, keepInView: false });
      const select = () => { current.current.onSelect(stop); marker.openPopup(); };
      marker.on("click", select).addTo(layer);
      const element = marker.getElement();
      element?.setAttribute("aria-label", `${index + 1}. ${mode}: ${label}, ${formatStopDistance(distanceMetres)} away`);
      element?.setAttribute("role", "button");
      element?.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          select();
        }
      });
      markers.current.set(identity(stop), marker);
    });
    instance.fitBounds(bounds.current, fitOptions);
  }, [attempt, centerKey, resultKey, radiusMetres]);

  useEffect(() => {
    for (const [key, marker] of markers.current) {
      marker.getElement()?.classList.toggle("is-selected", key === selectedKey);
      marker.getElement()?.setAttribute("aria-pressed", String(key === selectedKey));
      marker.setZIndexOffset(key === selectedKey ? 1000 : 0);
    }
    const selected = markers.current.get(selectedKey);
    if (selected && lastSelected.current !== selectedKey) {
      map.current?.panTo(selected.getLatLng(), { animate: !reducedMotion(), duration: 0.2 });
      selected.openPopup();
    }
    lastSelected.current = selectedKey;
  }, [attempt, selectedKey, centerKey, resultKey]);

  return <div className="transit-stop-map">
    <div className="transit-map-toolbar">
      <span>Near {center.label}</span>
      {!failed && <div className="transit-map-actions">
        <button type="button" onClick={() => {
          const instance = map.current, searchBounds = bounds.current;
          if (!instance || !searchBounds) return;
          instance.closePopup();
          instance.fitBounds(searchBounds, fitOptions);
        }}>Show all nearby stops</button>
        <div className="transit-map-zoom" role="group" aria-label="Stop map zoom">
          <button type="button" aria-label="Zoom out" onClick={() => map.current?.zoomOut(1, { animate: !reducedMotion() })}><span aria-hidden>−</span></button>
          <button type="button" aria-label="Zoom in" onClick={() => map.current?.zoomIn(1, { animate: !reducedMotion() })}><span aria-hidden>+</span></button>
        </div>
      </div>}
    </div>
    {failed && <p role="status" className="transit-map-message">The map could not load. The stop list and departures still work. <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry stop map</button></p>}
    <div ref={container} className={`transit-map-canvas${failed ? " is-unavailable" : ""}`} role="region" aria-label={`Nearby stop map around ${center.label}`} />
    {tileError && !failed && <p role="status" className="transit-map-message">{hasLoadedTiles ? "Some map tiles could not load." : "The basemap is unavailable."} The numbered markers and stop list still work. <button type="button" onClick={() => { setTileError(false); setHasLoadedTiles(false); tiles.current?.redraw(); }}>Retry map tiles</button></p>}
    <div className="transit-map-legend"><span><i className="train-key" aria-hidden />T · Train</span><span><i className="tram-key" aria-hidden />R · Tram</span><span><i className="bus-key" aria-hidden />B · Bus</span><span><i className="center-key" aria-hidden />C · Search centre</span></div>
    <p className="transit-map-note">Numbers match the list. The dashed circle is the {radiusMetres / 1000} km search radius, not a walking route. Use the zoom buttons or pinch. On phones, one-finger swipes scroll the page.</p>
  </div>;
}
