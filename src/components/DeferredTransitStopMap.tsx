import { Component, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { MapPinned } from "lucide-react";
import type { TransitStopMapProps } from "./TransitStopMap";
import "./TransitStopMap.css";

class MapBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** A location or destination choice alone never requests third-party map tiles. */
export default function DeferredTransitStopMap(props: TransitStopMapProps) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [MapComponent, setMapComponent] = useState<ComponentType<TransitStopMapProps> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || MapComponent) return;
    let disposed = false;
    setFailed(false);
    void import("./TransitStopMap").then(
      (module) => { if (!disposed) setMapComponent(() => module.TransitStopMap); },
      () => { if (!disposed) setFailed(true); },
    );
    return () => { disposed = true; };
  }, [open, attempt, MapComponent]);
  const retry = () => { setFailed(false); setAttempt((value) => value + 1); };
  const fallback = <p className="transit-map-message" role="status">The map could not load. You can still use the stop list. <button type="button" onClick={retry}>Retry stop map</button></p>;
  return <section className="transit-map-panel" aria-label="Stop map">
    <div className="transit-map-toggle-row">
      <button className="transit-map-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}><MapPinned size={17} aria-hidden />{open ? "Hide stop map" : "Show stop map"}</button>
      <p>Map tiles load from OpenStreetMap only when opened. The tile provider receives the viewed area; your device coordinates are not sent to PTV.</p>
    </div>
    {open && (failed ? fallback : MapComponent
      ? <MapBoundary key={attempt} fallback={fallback}><MapComponent {...props} /></MapBoundary>
      : <p className="transit-map-message" role="status">Loading the stop map…</p>)}
  </section>;
}
