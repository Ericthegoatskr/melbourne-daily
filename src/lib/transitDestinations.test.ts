import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANDMARKS, searchTransitDestinations } from "./transitDestinations";

const address = { gisid: "37995", address_pnt: "120 Swanston Street  Melbourne", geo_point_2d: { lat: -37.814719495194, lon: 144.966364782516 } };
const square = LANDMARKS.find((p) => p.id === "landmark:federation-square")!;
const landmark = { feature_name: square.label, co_ordinates: { lat: square.latitude, lon: square.longitude } };
const response = (results: unknown[], total_count = results.length) => ({ ok: true, json: async () => ({ results, total_count }) });
const fetcher = vi.fn();

beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("City of Melbourne destination lookup", () => {
  it("combines validated address and landmark points and omits credentials", async () => {
    fetcher.mockResolvedValueOnce(response([address])).mockResolvedValueOnce(response([landmark]));
    const result = await searchTransitDestinations("Swanston");
    expect(result.partial).toBe(false);
    expect(result.destinations).toEqual([
      { id: "address:37995", label: "120 Swanston Street Melbourne", latitude: address.geo_point_2d.lat, longitude: address.geo_point_2d.lon }, square,
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetcher.mock.calls) {
      expect(new URL(url).origin).toBe("https://data.melbourne.vic.gov.au");
      expect(new URL(url).searchParams.get("limit")).toBe("8");
      expect(options.credentials).toBe("omit");
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options).not.toHaveProperty("headers");
    }
  });
  it("escapes quote and backslash literals before encoding the submitted query", async () => {
    fetcher.mockResolvedValue(response([]));
    await searchTransitDestinations('Cafe "West" \\ or 1=1');
    const where = new URL(fetcher.mock.calls[0][0]).searchParams.get("where");
    expect(where).toBe('suggest(address_pnt, "Cafe \\"West\\" \\\\ or 1=1")');
  });
  it("deduplicates matching bundled landmarks and duplicate address IDs", async () => {
    fetcher.mockResolvedValueOnce(response([address, address])).mockResolvedValueOnce(response([landmark, landmark]));
    const result = await searchTransitDestinations("Federation Square");
    expect(result.destinations).toHaveLength(2);
    expect(result.destinations[0]).toBe(square);
  });
  it.each(["", "a", " ", "x".repeat(101)])("rejects invalid query length before network: %j", async (query) => {
    await expect(searchTransitDestinations(query)).rejects.toThrow("between 2 and 100");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { ...address, geo_point_2d: { lat: "-37.81", lon: 144.96 } },
    { ...address, geo_point_2d: { lat: -37.81, lon: NaN } },
    { ...address, geo_point_2d: { lat: 144.96, lon: -37.81 } },
    { ...address, geo_point_2d: { lat: -33.8688, lon: 151.2093 } },
    { ...address, address_pnt: " " },
    { ...address, gisid: null },
  ])("rejects corrupt results while preserving a valid other source", async (bad) => {
    fetcher.mockResolvedValueOnce(response([bad])).mockResolvedValueOnce(response([landmark]));
    const result = await searchTransitDestinations("unbundled query");
    expect(result).toEqual({ destinations: [square], partial: true });
  });
  it("returns bundled landmark matches when both network sources fail", async () => {
    fetcher.mockRejectedValue(new Error("Offline"));
    const result = await searchTransitDestinations("state library");
    expect(result.partial).toBe(true);
    expect(result.destinations).toEqual([LANDMARKS.find((p) => p.id === "landmark:state-library")]);
  });
  it("distinguishes a complete no-match from unavailable responses", async () => {
    fetcher.mockResolvedValue(response([]));
    expect(await searchTransitDestinations("not a listed address")).toEqual({ destinations: [], partial: false });
    fetcher.mockResolvedValue({ ok: false });
    await expect(searchTransitDestinations("not a listed address")).rejects.toThrow("temporarily unavailable");
  });
  it.each([{ results: [], total_count: 2 }, { results: [address] }, null])("rejects inconsistent/unreadable payloads", async (payload) => {
    fetcher.mockResolvedValue({ ok: true, json: async () => payload });
    await expect(searchTransitDestinations("not bundled")).rejects.toThrow("temporarily unavailable");
  });
  it("does not start an already cancelled query", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(searchTransitDestinations("Federation Square", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("cancellation never returns a bundled fallback or late network results", async () => {
    // Resolve both sources after cancellation to exercise stale completion.
    const pending: Array<(value: unknown) => void> = [];
    fetcher.mockImplementation(() => new Promise((r) => pending.push(r)));
    const controller = new AbortController();
    const promise = searchTransitDestinations("Federation Square", controller.signal);
    controller.abort();
    pending.forEach((done) => done(response([landmark])));
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true);
  });
  it("aborts hung network requests after ten seconds and offers a bundled fallback", async () => {
    vi.useFakeTimers();
    fetcher.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
    }));
    const promise = searchTransitDestinations("Federation Square");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toEqual({ destinations: [square], partial: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});
