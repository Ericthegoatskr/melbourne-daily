// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeferredTransitStopMap from "./DeferredTransitStopMap";
import type { TransitStopMapProps } from "./TransitStopMap";

const mapMock = vi.hoisted(() => ({ render: vi.fn(), fail: false, loaded: vi.fn() }));
vi.mock("./TransitStopMap", () => {
  mapMock.loaded();
  return {
    TransitStopMap: (props: TransitStopMapProps) => {
      mapMock.render(props);
      if (mapMock.fail) throw new Error("map initialization failed");
      return <div data-testid="loaded-map">Map near {props.center.label}</div>;
    },
  };
});

const props: TransitStopMapProps = {
  center: { latitude: -37.81, longitude: 144.96, label: "Library" },
  nearby: [], radiusMetres: 2000, onSelect: vi.fn(), onViewDepartures: vi.fn(),
};
beforeEach(() => { mapMock.render.mockClear(); mapMock.fail = false; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("optional stop map", () => {
  it("discloses tile sharing before explicit consent, uses the latest centre and unmounts on Hide", async () => {
    const view = render(<DeferredTransitStopMap {...props} />);
    expect(mapMock.loaded).not.toHaveBeenCalled();
    expect(mapMock.render).not.toHaveBeenCalled();
    expect(screen.getByText(/tile provider receives the viewed area/)).toBeTruthy();
    const updated = { ...props, center: { ...props.center, label: "Museum" } };
    view.rerender(<DeferredTransitStopMap {...updated} />);
    expect(mapMock.render).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show stop map" }));
    expect(await screen.findByTestId("loaded-map")).toHaveProperty("textContent", "Map near Museum");
    expect(screen.getByRole("button", { name: "Hide stop map" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hide stop map" }));
    expect(screen.queryByTestId("loaded-map")).toBeNull();
    expect(screen.getByRole("button", { name: "Show stop map" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("contains map initialization failures and lets the user retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mapMock.fail = true;
    render(<DeferredTransitStopMap {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Show stop map" }));
    expect(await screen.findByText(/You can still use the stop list/)).toBeTruthy();
    mapMock.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry stop map" }));
    expect(await screen.findByTestId("loaded-map")).toBeTruthy();
  });
});
