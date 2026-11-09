import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchVicmapDestinations } from "./vicmapDestinations";

const address = { address: "45 PRINCES HIGHWAY WERRIBEE 3030", location: { x: 144.67081107963173, y: -37.897915663075665 }, score: 98.2 };
const landmark = { attributes: { pfi: 998299, name: "WERRIBEE OPEN RANGE ZOO" }, geometry: { x: 144.67003635515297, y: -37.91937832179078 } };
const response = (value: unknown, ok = true) => ({ ok, json: async () => value });
const fetcher = vi.fn();
function results(candidates: unknown[] = [], features: unknown[] = []) {
  fetcher.mockResolvedValueOnce(response({ candidates })).mockResolvedValueOnce(response({ features }));
}
beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Greater Melbourne Vicmap lookup", () => {
  it("combines public suburb address and landmark sources with bounded keyless requests", async () => {
    results([address], [landmark]);
    const controller = new AbortController();
    const result = await searchVicmapDestinations("Werribee", controller.signal);
    expect(result.partial).toBe(false);
    expect(result.destinations).toEqual([
      { id: "vicmap-address:45 PRINCES HIGHWAY WERRIBEE 3030:-37.897916,144.670811", label: address.address, latitude: address.location.y, longitude: address.location.x },
      { id: "vicmap-foi:998299", label: landmark.attributes.name, latitude: landmark.geometry.y, longitude: landmark.geometry.x },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const urls = fetcher.mock.calls.map(([url]) => new URL(url));
    expect(urls[0].hostname).toBe("corp-geo.mapshare.vic.gov.au");
    expect(urls[0].searchParams.get("maxLocations")).toBe("8");
    expect(urls[1].hostname).toBe("services-ap1.arcgis.com");
    expect(urls[1].pathname).toMatch(/Vicmap_Features_of_Interest\/FeatureServer\/4\/query$/);
    expect(urls[1].searchParams.get("resultRecordCount")).toBe("8");
    expect(urls.every((url) => url.searchParams.get("outSR") === "4326" && !url.searchParams.has("token"))).toBe(true);
    for (const [, options] of fetcher.mock.calls) expect(options).toEqual({ credentials: "omit", signal: expect.any(AbortSignal) });
    expect(JSON.parse(urls[0].searchParams.get("searchExtent")!)).toMatchObject({ xmin: 144.4, ymin: -38.55, xmax: 146.25, ymax: -37.35 });
    expect(JSON.parse(urls[1].searchParams.get("geometry")!)).toMatchObject({ xmin: 144.4, ymin: -38.55, xmax: 146.25, ymax: -37.35 });
  });

  it("matches all FOI query tokens against name or parent and escapes SQL literals", async () => {
    results();
    await searchVicmapDestinations("Queen's %Park_ Carlton");
    const params = new URL(fetcher.mock.calls[1][0]).searchParams;
    expect(params.get("where")).toBe("(UPPER(name) LIKE '%QUEEN''S%' OR UPPER(parent_name) LIKE '%QUEEN''S%') AND (UPPER(name) LIKE '%PARK%' OR UPPER(parent_name) LIKE '%PARK%') AND (UPPER(name) LIKE '%CARLTON%' OR UPPER(parent_name) LIKE '%CARLTON%')");
  });

  it.each([
    ["8 Arnold St Box Hill", "8 Arnold STREET Box Hill"],
    ["246 Clayton Rd Clayton", "246 Clayton ROAD Clayton"],
    ["100 St Kilda Rd Melbourne", "100 St Kilda ROAD Melbourne"],
    ["8 St Georges Street Northcote", "8 St Georges Street Northcote"],
    ["St Kilda", "St Kilda"],
  ])("normalizes road abbreviations without treating Saint as Street: %s", async (query, expected) => {
    results();
    await searchVicmapDestinations(query);
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("SingleLine")).toBe(expected);
  });

  it("does not accept a unit number as the requested street number despite a high score", async () => {
    results([
      { ...address, address: "915/850 WHITEHORSE ROAD BOX HILL 3128", score: 97.75 },
      { ...address, address: "915 WHITEHORSE ROAD BOX HILL 3128", score: 90 },
    ]);
    expect((await searchVicmapDestinations("915 Whitehorse Road Box Hill")).destinations.map((p) => p.label))
      .toEqual(["915 WHITEHORSE ROAD BOX HILL 3128"]);
  });

  it.each(["2/8 Arnold St Box Hill", "Unit 2, 8 Arnold Street Box Hill"])("preserves requested unit and house: %s", async (query) => {
    results([
      { ...address, address: "2/8 ARNOLD STREET BOX HILL 3128" },
      { ...address, address: "3/8 ARNOLD STREET BOX HILL 3128" },
      { ...address, address: "2/80 ARNOLD STREET BOX HILL 3128" },
    ]);
    expect((await searchVicmapDestinations(query)).destinations.map((p) => p.label)).toEqual(["2/8 ARNOLD STREET BOX HILL 3128"]);
  });

  it("supports street suffixes and numeric ranges without accepting a different house", async () => {
    results([{ ...address, address: "8-10 ARNOLD STREET BOX HILL 3128" }, { ...address, address: "80 ARNOLD STREET BOX HILL 3128" }]);
    expect((await searchVicmapDestinations("8 Arnold Street Box Hill")).destinations).toHaveLength(1);
    results([{ ...address, address: "8A ARNOLD STREET BOX HILL 3128" }, { ...address, address: "8 ARNOLD STREET BOX HILL 3128" }]);
    expect((await searchVicmapDestinations("8A Arnold Street Box Hill")).destinations.map((p) => p.label)).toEqual(["8A ARNOLD STREET BOX HILL 3128"]);
  });

  it("filters low scores and out-of-envelope points as normal no-matches", async () => {
    results([{ ...address, score: 79 }, { ...address, location: { x: 151.2, y: -33.8 } }], [{ ...landmark, geometry: { x: 144.0, y: -37.5 } }]);
    expect(await searchVicmapDestinations("Werribee")).toEqual({ destinations: [], partial: false });
  });

  it.each([
    { ...address, score: "98" }, { ...address, score: NaN }, { ...address, address: " " },
    { ...address, address: "a".repeat(501) }, { ...address, location: { x: "144.6", y: -37.9 } },
    { ...address, location: { x: Infinity, y: -37.9 } }, null,
  ])("drops malformed address rows and keeps valid landmarks", async (bad) => {
    results([bad], [landmark]);
    const result = await searchVicmapDestinations("Werribee");
    expect(result.partial).toBe(true);
    expect(result.destinations.map((p) => p.id)).toEqual(["vicmap-foi:998299"]);
  });

  it.each([
    { attributes: { name: "Zoo", pfi: null }, geometry: landmark.geometry },
    { attributes: { name: "Zoo", pfi: -1 }, geometry: landmark.geometry },
    { attributes: { name: "Zoo", pfi: "x'" }, geometry: landmark.geometry },
    { ...landmark, geometry: { x: NaN, y: -37.9 } }, null,
  ])("drops malformed landmark rows and keeps valid addresses", async (bad) => {
    results([address], [bad]);
    const result = await searchVicmapDestinations("Werribee");
    expect(result.partial).toBe(true);
    expect(result.destinations.map((p) => p.label)).toEqual([address.address]);
  });

  it("limits even oversized upstream arrays and deduplicates stable IDs", async () => {
    results([address, address], Array.from({ length: 12 }, (_, index) => ({ ...landmark, attributes: { ...landmark.attributes, pfi: index + 1 } })));
    expect((await searchVicmapDestinations("Werribee")).destinations).toHaveLength(9);
  });

  it.each([null, { candidates: {} }, { error: { code: 499 }, candidates: [] }, { candidates: [address], spatialReference: { wkid: 3857 } }])("treats unreadable/ArcGIS error responses as partial", async (bad) => {
    fetcher.mockResolvedValueOnce(response(bad)).mockResolvedValueOnce(response({ features: [landmark] }));
    expect(await searchVicmapDestinations("Werribee")).toMatchObject({ partial: true, destinations: [{ id: "vicmap-foi:998299" }] });
  });

  it("reports HTTP and network failures without discarding successful source results", async () => {
    fetcher.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(response({ features: [landmark] }));
    expect((await searchVicmapDestinations("Werribee")).destinations).toHaveLength(1);
    fetcher.mockResolvedValueOnce(response({}, false)).mockRejectedValueOnce(new Error("Offline"));
    expect(await searchVicmapDestinations("Werribee")).toEqual({ destinations: [], partial: true });
  });

  it("does not fetch an already cancelled query", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(searchVicmapDestinations("Werribee", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rethrows caller cancellation rather than returning late partial results", async () => {
    const pending: Array<(value: unknown) => void> = [];
    fetcher.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const controller = new AbortController();
    const request = searchVicmapDestinations("Werribee", controller.signal);
    controller.abort();
    pending[0](response({ candidates: [address] })); pending[1](response({ features: [landmark] }));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true);
  });

  it("preserves a valid address when the landmark source times out and clears timers", async () => {
    vi.useFakeTimers();
    fetcher.mockResolvedValueOnce(response({ candidates: [address] }));
    fetcher.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
    }));
    const result = searchVicmapDestinations("Werribee");
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await result).toMatchObject({ partial: true, destinations: [{ label: address.address }] });
    expect(vi.getTimerCount()).toBe(0);
  });
});
