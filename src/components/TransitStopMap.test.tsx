// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransitStopMap, type TransitStopMapProps } from "./TransitStopMap";
import type { TransitStop } from "../lib/transit";

const leaflet = vi.hoisted(() => ({
  map: vi.fn(), tileLayer: vi.fn(), circle: vi.fn(), layerGroup: vi.fn(), latLngBounds: vi.fn(),
  markers: [] as any[], instance: null as any, tile: null as any,
  mobile: false, throwMap: false,
}));
vi.mock("leaflet", () => ({ default: {
  get Browser() { return { mobile: leaflet.mobile }; }, Popup: class {},
  map: leaflet.map, tileLayer: leaflet.tileLayer, circle: leaflet.circle, layerGroup: leaflet.layerGroup,
  latLngBounds: leaflet.latLngBounds,
  divIcon: (options: unknown) => options,
  marker: (coordinates: number[], options: any) => {
    const element = document.createElement("div");
    element.className = options.icon.className;
    element.append(options.icon.html);
    const marker: any = {
      element, coordinates, options, callbacks: {} as Record<string, () => void>,
      bindTooltip: vi.fn().mockReturnThis(),
      bindPopup: vi.fn(function(this: any, popup: HTMLElement, options: unknown) { this.popup = popup; this.popupInstance = { options, update: vi.fn() }; return this; }),
      getPopup: vi.fn(function(this: any) { return this.popupInstance; }),
      on: vi.fn(function(this: any, event: string, callback: () => void) { this.callbacks[event] = callback; return this; }),
      addTo: vi.fn(function(this: any, layer: any) { layer.elements.push(element); leaflet.instance.container.append(element); return this; }),
      getElement: () => element, getLatLng: () => coordinates,
      openPopup: vi.fn(function(this: any) { if (this.popup) leaflet.instance.container.append(this.popup); return this; }),
      setZIndexOffset: vi.fn(),
    };
    leaflet.markers.push(marker);
    return marker;
  },
} }));

const train: TransitStop = {
  id: 1, idScheme: "gtfs", mode: "train", name: "Central", suburb: "", latitude: -37.81, longitude: 144.96,
};
const tram: TransitStop = { ...train, id: 2, mode: "tram", name: "Mall", longitude: 144.961 };
const base: TransitStopMapProps = {
  center: { latitude: -37.812, longitude: 144.962, label: "Library" }, radiusMetres: 2000,
  nearby: [{ stop: train, label: "Central", distanceMetres: 200, platformCount: 2 }, { stop: tram, label: "Mall", distanceMetres: 300, platformCount: 1 }],
  onSelect: vi.fn(), onViewDepartures: vi.fn(),
};
const observe = vi.fn(), disconnect = vi.fn();
let resize: ResizeObserverCallback;

beforeEach(() => {
  vi.clearAllMocks();
  leaflet.markers = []; leaflet.mobile = false; leaflet.throwMap = false;
  leaflet.map.mockImplementation((container, options) => {
    if (leaflet.throwMap) throw new Error("unavailable");
    const instance = {
      container, options, fitBounds: vi.fn(), panTo: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), invalidateSize: vi.fn(), eachLayer: vi.fn(),
      closePopup: vi.fn(() => { for (const marker of leaflet.markers) marker.popup?.remove(); }),
      remove: vi.fn(() => container.replaceChildren()),
    };
    leaflet.instance = instance;
    return instance;
  });
  leaflet.tileLayer.mockImplementation(() => {
    const tile = {
      events: {} as Record<string, () => void>,
      on: vi.fn(function(this: any, event: string, callback: () => void) { this.events[event] = callback; return this; }),
      addTo: vi.fn().mockReturnThis(), off: vi.fn(), redraw: vi.fn(),
    };
    leaflet.tile = tile;
    return tile;
  });
  leaflet.circle.mockImplementation(() => ({ addTo: vi.fn().mockReturnThis(), getBounds: () => ({ radiusBounds: true }) }));
  leaflet.latLngBounds.mockImplementation((points) => ({ points }));
  leaflet.layerGroup.mockImplementation(() => {
    const layer = { elements: [] as HTMLElement[], addTo: vi.fn().mockReturnThis(), clearLayers: vi.fn(() => { layer.elements.forEach((element) => element.remove()); layer.elements = []; }) };
    return layer;
  });
  vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe = observe; disconnect = disconnect; });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("nearby stop map", () => {
  it("uses attributed standard OSM tiles and numbered mode markers, retaining page scrolling on phones", () => {
    leaflet.mobile = true;
    render(<TransitStopMap {...base} />);
    expect(leaflet.map.mock.calls[0][1]).toMatchObject({ scrollWheelZoom: false, dragging: false, touchZoom: true, zoomControl: false });
    expect(leaflet.tileLayer).toHaveBeenCalledWith("https://tile.openstreetmap.org/{z}/{x}/{y}.png", expect.objectContaining({ attribution: expect.stringContaining("https://www.openstreetmap.org/copyright") }));
    expect(leaflet.markers.map((marker) => marker.element.textContent)).toEqual(["C", "T1", "R2"]);
    expect(screen.getByRole("button", { name: /1\. Train: Central, 200 m away/ })).toBeTruthy();
    expect(screen.getByText("R · Tram")).toBeTruthy();
    expect(leaflet.circle.mock.calls[0][1]).toMatchObject({ radius: 2000, interactive: false });
  });

  it("keeps keyboard-accessible zoom controls outside the map so they cannot cover popups", async () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("reduced-motion") })));
    const user = userEvent.setup();
    render(<TransitStopMap {...base} />);
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    expect(leaflet.instance.container.contains(zoomIn)).toBe(false);
    zoomIn.focus();
    await user.keyboard("{Enter}");
    expect(leaflet.instance.zoomIn).toHaveBeenCalledExactlyOnceWith(1, { animate: false });
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(leaflet.instance.zoomOut).toHaveBeenCalledExactlyOnceWith(1, { animate: false });
  });

  it("separates selection from explicit board navigation and treats destination labels as text", () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const props = { ...base, nearby: [{ ...base.nearby[0], label: malicious }] };
    const view = render(<TransitStopMap {...props} />);
    const marker = leaflet.markers[1];
    act(() => marker.callbacks.click());
    expect(base.onSelect).toHaveBeenCalledExactlyOnceWith(train);
    expect(base.onViewDepartures).not.toHaveBeenCalled();
    expect(marker.popup.querySelector("img")).toBeNull();
    expect(marker.popup.querySelector("strong").textContent).toBe(`1. ${malicious}`);
    const newestAction = vi.fn();
    view.rerender(<TransitStopMap {...props} onViewDepartures={newestAction} />);
    fireEvent.click(screen.getByRole("button", { name: "View departures & walking directions" }));
    expect(newestAction).toHaveBeenCalledExactlyOnceWith(train);
    expect(base.onViewDepartures).not.toHaveBeenCalled();
    fireEvent.keyDown(marker.element, { key: " " });
    expect(base.onSelect).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(marker.element, { key: "Enter" });
    expect(base.onSelect).toHaveBeenCalledTimes(3);
  });

  it("preserves the user's map view on clock renders, but fits a changed search area", () => {
    const view = render(<TransitStopMap {...base} />);
    const map = leaflet.instance;
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenCalledWith({ points: [
      [base.center.latitude, base.center.longitude], [train.latitude, train.longitude], [tram.latitude, tram.longitude],
    ] }, { padding: [40, 40], maxZoom: 17, animate: false });
    view.rerender(<TransitStopMap {...base} center={{ ...base.center }} nearby={base.nearby.map((result) => ({ ...result, stop: { ...result.stop } }))} onSelect={vi.fn()} />);
    expect(leaflet.map).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(leaflet.markers).toHaveLength(3);
    expect(map.panTo).not.toHaveBeenCalled();
    view.rerender(<TransitStopMap {...base} center={{ ...base.center, latitude: -37.82 }} />);
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Show all nearby stops" }));
    expect(map.fitBounds).toHaveBeenCalledTimes(3);
  });

  it("fits the full search circle only when there are no nearby results", () => {
    render(<TransitStopMap {...base} nearby={[]} />);
    expect(leaflet.latLngBounds).not.toHaveBeenCalled();
    expect(leaflet.instance.fitBounds).toHaveBeenCalledWith({ radiusBounds: true }, { padding: [40, 40], maxZoom: 17, animate: false });
  });

  it("closes an open popup before fitting the overview after resize without changing the selected stop", () => {
    const view = render(<TransitStopMap {...base} selectedStop={train} />);
    const map = leaflet.instance, marker = leaflet.markers[1];
    expect(screen.getByRole("button", { name: "View departures & walking directions" })).toBeTruthy();
    act(() => resize([], {} as ResizeObserver));
    map.fitBounds.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Show all nearby stops" }));
    expect(map.closePopup).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.closePopup.mock.invocationCallOrder[0]).toBeLessThan(map.fitBounds.mock.invocationCallOrder[0]);
    expect(screen.queryByRole("button", { name: "View departures & walking directions" })).toBeNull();
    expect(marker.element.getAttribute("aria-pressed")).toBe("true");
    expect(base.onSelect).not.toHaveBeenCalled();
    expect(base.onViewDepartures).not.toHaveBeenCalled();
    view.rerender(<TransitStopMap {...base} selectedStop={{ ...train }} />);
    expect(marker.openPopup).toHaveBeenCalledTimes(1);
  });

  it("keeps popup content within a narrow map and updates it after resizing", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(250);
    try {
      render(<TransitStopMap {...base} />);
      const popup = leaflet.markers[1].popupInstance;
      expect(popup.options.maxWidth).toBe(200);
      width.mockReturnValue(220);
      act(() => resize([], {} as ResizeObserver));
      expect(popup.options.maxWidth).toBe(170);
      expect(popup.update).toHaveBeenCalledTimes(1);
    } finally {
      width.mockRestore();
    }
  });

  it("syncs an external selection once, respects reduced motion, and does not pan to a filtered-out stop", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("reduced-motion") })));
    const view = render(<TransitStopMap {...base} />);
    const map = leaflet.instance, marker = leaflet.markers[2];
    view.rerender(<TransitStopMap {...base} selectedStop={tram} />);
    expect(marker.element.getAttribute("aria-pressed")).toBe("true");
    expect(marker.element.classList.contains("is-selected")).toBe(true);
    expect(map.panTo).toHaveBeenCalledExactlyOnceWith(marker.coordinates, expect.objectContaining({ animate: false }));
    expect(marker.openPopup).toHaveBeenCalledTimes(1);
    view.rerender(<TransitStopMap {...base} selectedStop={{ ...tram }} />);
    expect(map.panTo).toHaveBeenCalledTimes(1);
    view.rerender(<TransitStopMap {...base} selectedStop={{ ...tram, idScheme: "ptv" }} />);
    expect(marker.element.getAttribute("aria-pressed")).toBe("false");
    expect(map.panTo).toHaveBeenCalledTimes(1);
  });

  it("offers tile retry and cleans up the map, listeners and resize observer when hidden", () => {
    const view = render(<TransitStopMap {...base} />);
    const map = leaflet.instance, tile = leaflet.tile;
    act(() => { resize([], {} as ResizeObserver); tile.events.tileerror(); });
    expect(map.invalidateSize).toHaveBeenCalledWith({ pan: false });
    expect(screen.getByText(/The basemap is unavailable/)).toBeTruthy();
    act(() => tile.events.tileload());
    expect(screen.getByText(/Some map tiles could not load/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry map tiles" }));
    expect(tile.redraw).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Some map tiles could not load/)).toBeNull();
    view.unmount();
    expect(map.remove).toHaveBeenCalledTimes(1);
    expect(tile.off).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed map contained and retries initialization on request", () => {
    leaflet.throwMap = true;
    render(<TransitStopMap {...base} />);
    expect(screen.getByText(/The stop list and departures still work/)).toBeTruthy();
    expect(leaflet.tileLayer).not.toHaveBeenCalled();
    leaflet.throwMap = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry stop map" }));
    expect(leaflet.map).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/The stop list and departures still work/)).toBeNull();
    expect(leaflet.markers).toHaveLength(3);
  });
});
