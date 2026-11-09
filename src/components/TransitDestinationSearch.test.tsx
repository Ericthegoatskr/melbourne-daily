// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TransitDestinationSearch from "./TransitDestinationSearch";
import { LANDMARKS, searchTransitDestinations, type TransitDestinationSearchResult } from "../lib/transitDestinations";

vi.mock("../lib/transitDestinations", async (original) => ({
  ...(await original<typeof import("../lib/transitDestinations")>()), searchTransitDestinations: vi.fn(),
}));
const square = LANDMARKS.find((place) => place.id === "landmark:federation-square")!;
function deferred() {
  let resolve!: (result: TransitDestinationSearchResult) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<TransitDestinationSearchResult>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function type(query: string) { fireEvent.change(screen.getByRole("textbox", { name: "Find a destination" }), { target: { value: query } }); }
async function submit() { await act(async () => { fireEvent.submit(screen.getByRole("form", { name: "Destination search" })); }); }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(searchTransitDestinations).mockResolvedValue({ destinations: [square], partial: false }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("submitted destination selection", () => {
  it("keeps suburb-qualified results distinct and passes the selected place unchanged", async () => {
    const boxHill = { id: "vicmap:box-hill", label: "8 Arnold Street, Box Hill VIC 3128", latitude: -37.8187, longitude: 145.122 };
    const nearbyAddress = { id: "vicmap:mont-albert", label: "8 Arnold Street, Other Suburb VIC 3000", latitude: -37.817, longitude: 145.107 };
    vi.mocked(searchTransitDestinations).mockResolvedValue({ destinations: [boxHill, nearbyAddress], partial: false });
    const onSelect = vi.fn();
    render(<TransitDestinationSearch onSelect={onSelect} />);
    expect(screen.getByText(/Search Greater Melbourne\. For an address, include the suburb/)).toBeTruthy();
    type("8 Arnold Street Box Hill");
    expect(searchTransitDestinations).not.toHaveBeenCalled();
    await submit();
    const results = within(screen.getByRole("region", { name: "Matching destinations" }));
    expect(results.getByRole("button", { name: nearbyAddress.label })).toBeTruthy();
    fireEvent.click(results.getByRole("button", { name: boxHill.label }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(boxHill);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Find a destination" }));
  });

  it("does not search while typing or select a returned result automatically", async () => {
    const onSelect = vi.fn();
    render(<TransitDestinationSearch onSelect={onSelect} />);
    type("Federation");
    expect(searchTransitDestinations).not.toHaveBeenCalled();
    await submit();
    expect(searchTransitDestinations).toHaveBeenCalledWith("Federation", expect.any(AbortSignal));
    expect(onSelect).not.toHaveBeenCalled();
    const result = within(screen.getByRole("region", { name: "Matching destinations" })).getByRole("button", { name: "Federation Square" });
    result.focus();
    fireEvent.click(result);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(square);
    expect(screen.queryByRole("region", { name: "Matching destinations" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Find a destination" }));
  });
  it.each([square, LANDMARKS.find((place) => place.label === "Box Hill Central, Box Hill")!])("selects the bundled landmark $label without any query", (landmark) => {
    const onSelect = vi.fn();
    render(<TransitDestinationSearch onSelect={onSelect} />);
    const landmarkSelect = screen.getByRole("combobox", { name: "Choose a landmark" });
    landmarkSelect.focus();
    fireEvent.change(landmarkSelect, { target: { value: landmark.id } });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(landmark);
    expect(searchTransitDestinations).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Choose a landmark" })).toHaveProperty("value", "");
    expect(document.activeElement).toBe(landmarkSelect);
  });
  it("abandons and clears old results when text changes, then ignores late completion", async () => {
    const old = deferred();
    vi.mocked(searchTransitDestinations).mockReturnValueOnce(old.promise);
    render(<TransitDestinationSearch onSelect={vi.fn()} />);
    type("Federation"); await submit();
    const signal = vi.mocked(searchTransitDestinations).mock.calls[0][1]!;
    type("Library");
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => { old.resolve({ destinations: [square], partial: false }); });
    expect(screen.queryByRole("region", { name: "Matching destinations" })).toBeNull();
    await submit();
    expect(screen.getByRole("region", { name: "Matching destinations" })).toBeTruthy();
    type("another place");
    expect(screen.queryByRole("region", { name: "Matching destinations" })).toBeNull();
  });
  it("a landmark choice cancels a pending request and ignores its late rejection", async () => {
    const old = deferred(); const onSelect = vi.fn();
    vi.mocked(searchTransitDestinations).mockReturnValueOnce(old.promise);
    render(<TransitDestinationSearch onSelect={onSelect} />);
    type("Library"); await submit();
    fireEvent.change(screen.getByRole("combobox", { name: "Choose a landmark" }), { target: { value: square.id } });
    expect(vi.mocked(searchTransitDestinations).mock.calls[0][1]!.aborted).toBe(true);
    await act(async () => { old.reject(new Error("Late error")); });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(square);
    expect(screen.queryByText("Late error")).toBeNull();
  });
  it("supports cancel, reset and unmount without restoring obsolete results", async () => {
    const old = deferred();
    vi.mocked(searchTransitDestinations).mockReturnValue(old.promise);
    const view = render(<TransitDestinationSearch onSelect={vi.fn()} resetKey={0} />);
    type("Library"); await submit();
    const cancel = screen.getByRole("button", { name: "Cancel destination search" });
    cancel.focus();
    fireEvent.click(cancel);
    expect(vi.mocked(searchTransitDestinations).mock.calls[0][1]!.aborted).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Find a destination" }));
    await submit();
    view.rerender(<TransitDestinationSearch onSelect={vi.fn()} resetKey={1} />);
    expect(screen.getByRole("textbox", { name: "Find a destination" })).toHaveProperty("value", "");
    expect(vi.mocked(searchTransitDestinations).mock.calls[1][1]!.aborted).toBe(true);
    type("Library"); await submit();
    view.unmount();
    expect(vi.mocked(searchTransitDestinations).mock.calls[2][1]!.aborted).toBe(true);
    await act(async () => { old.resolve({ destinations: [square], partial: false }); });
  });
  it("distinguishes error, empty and partial results and allows a manual retry", async () => {
    vi.mocked(searchTransitDestinations)
      .mockRejectedValueOnce(new Error("Destination search is temporarily unavailable."))
      .mockResolvedValueOnce({ destinations: [], partial: false })
      .mockResolvedValueOnce({ destinations: [square], partial: true });
    render(<TransitDestinationSearch onSelect={vi.fn()} />);
    type("Library"); await submit();
    expect(screen.getByRole("status").textContent).toContain("temporarily unavailable");
    await submit();
    expect(screen.getByRole("status").textContent).toContain("No matching destinations");
    await submit();
    expect(screen.getByRole("status").textContent).toContain("Some results could not be loaded");
    expect(within(screen.getByRole("region", { name: "Matching destinations" })).getByRole("button", { name: square.label })).toBeTruthy();
  });
});
