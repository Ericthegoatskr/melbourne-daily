// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectEpaSnapshot, refreshEpaSnapshot } from "./collect-epa";

const now = Date.parse("2026-11-07T05:30:00Z");
const token = "synthetic-private-service-credential";
const observedAt = "2026-11-07T05:00:00Z";
const fixture = () => ({
  source: "EPA Victoria",
  fetchedAt: "2026-11-07T05:25:00Z",
  stations: [{
    id: "synthetic-station",
    name: "Test station",
    latitude: -37.8,
    longitude: 145,
    category: { value: "Good", observedAt },
    pm25: { value: 0, unit: "µg/m³", averagingPeriod: "1h", observedAt },
    pm10: null,
  }],
});
const response = (payload: unknown = fixture()) => new Response(JSON.stringify(payload));
const directories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("private EPA snapshot collection", () => {
  it("uses the fixed private host without redirects and publishes only accepted fields", async () => {
    const raw = fixture();
    const payload = { ...raw, apiKey: token, internal: { token }, stations: raw.stations.map((station) => ({
      ...station, privateNote: token, pm25: { ...station.pm25, secret: token },
    })) };
    const fetcher = vi.fn().mockResolvedValue(response(payload));
    const snapshot = await collectEpaSnapshot({ token, now, fetcher });
    expect(snapshot).toEqual(raw);
    expect(JSON.stringify(snapshot)).not.toContain(token);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("https://melbourne-daily-api-eric.boundlessforge.chatgpt.site/api/air/observations");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      redirect: "manual",
      headers: { Accept: "application/json", "OAI-Sites-Authorization": `Bearer ${token}` },
    });
    expect(snapshot.stations[0].pm25?.value).toBe(0);
  });

  it.each([undefined, "", "   "])("rejects a missing service credential before fetching (%s)", async (value) => {
    const fetcher = vi.fn();
    await expect(collectEpaSnapshot({ token: value, now, fetcher })).rejects.toMatchObject({ code: "missing_token" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects header injection before fetching", async () => {
    const fetcher = vi.fn();
    await expect(collectEpaSnapshot({ token: `${token}\r\nX-Key: value`, now, fetcher })).rejects.toMatchObject({ code: "invalid_token" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([302, 307, 401, 503])("rejects HTTP %s without following or reading its response body", async (status) => {
    const upstream = new Response(token, { status, headers: { Location: "https://untrusted.example/collect" } });
    const fetcher = vi.fn().mockResolvedValue(upstream);
    const failure = await collectEpaSnapshot({ token, now, fetcher }).catch((error) => error);
    expect(failure).toMatchObject({ code: "upstream_http_error", status });
    expect(String(failure)).not.toContain(token);
    expect(failure).not.toHaveProperty("cause");
    expect(upstream.bodyUsed).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("sanitizes malformed JSON and upstream network errors", async () => {
    await expect(collectEpaSnapshot({ token, now, fetcher: vi.fn().mockResolvedValue(new Response(`{${token}`)) }))
      .rejects.toMatchObject({ code: "invalid_payload" });
    const failure = await collectEpaSnapshot({ token, now, fetcher: vi.fn().mockRejectedValue(new Error(`failed ${token}`)) }).catch((error) => error);
    expect(failure).toMatchObject({ code: "request_failed" });
    expect(String(failure)).not.toContain(token);
  });

  it("aborts a stalled backend request after twenty seconds", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error(token)), { once: true });
    }));
    const rejected = expect(collectEpaSnapshot({ token, now, fetcher })).rejects.toMatchObject({ code: "request_failed" });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
  });

  it("expires each field separately without inventing data or refreshing observation timestamps", async () => {
    const raw = fixture();
    raw.stations[0].category.observedAt = "2026-11-07T01:00:00Z";
    const snapshot = await collectEpaSnapshot({ token, now, fetcher: vi.fn().mockResolvedValue(response(raw)) });
    expect(snapshot.stations[0].category).toBeNull();
    expect(snapshot.stations[0].pm25?.observedAt).toBe(observedAt);
    expect(snapshot.fetchedAt).toBe(raw.fetchedAt);
  });

  it.each(["old snapshot", "old readings", "empty stations"])("rejects unusable snapshots: %s", async (scenario) => {
    const raw = fixture();
    if (scenario === "old snapshot") raw.fetchedAt = "2026-11-07T01:00:00Z";
    if (scenario === "old readings") {
      raw.stations[0].category.observedAt = "2026-11-07T01:00:00Z";
      raw.stations[0].pm25.observedAt = "2026-11-07T01:00:00Z";
    }
    if (scenario === "empty stations") raw.stations = [];
    await expect(collectEpaSnapshot({ token, now, fetcher: vi.fn().mockResolvedValue(response(raw)) }))
      .rejects.toMatchObject({ code: scenario === "old snapshot" ? "stale_snapshot" : "no_current_readings" });
  });

  it("refuses credentials echoed into permitted public text fields", async () => {
    const raw = fixture();
    raw.stations[0].name = `Echo ${token}`;
    await expect(collectEpaSnapshot({ token, now, fetcher: vi.fn().mockResolvedValue(response(raw)) }))
      .rejects.toMatchObject({ code: "credential_echo" });
  });

  it("preserves the previous file on collection failure and atomically replaces it on success", async () => {
    const directory = await mkdtemp(join(tmpdir(), "epa-snapshot-test-"));
    directories.push(directory);
    const output = join(directory, "epa-observations.json");
    await writeFile(output, "previous snapshot");
    await expect(refreshEpaSnapshot(output, { token, now, fetcher: vi.fn().mockResolvedValue(new Response("error", { status: 503 })) }))
      .rejects.toMatchObject({ code: "upstream_http_error" });
    expect(await readFile(output, "utf8")).toBe("previous snapshot");
    const snapshot = await refreshEpaSnapshot(output, { token, now, fetcher: vi.fn().mockResolvedValue(response()) });
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(snapshot);
    expect(await readdir(directory)).toEqual(["epa-observations.json"]);
  });
});
