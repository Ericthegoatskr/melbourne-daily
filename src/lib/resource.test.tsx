import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ago,
  freshness,
  melbourneTime,
  useNow,
  useResource,
  type Resource,
} from "./resource";

type Reading = { observedAt: string; value: string };
const timestamp = (reading: Reading) => reading.observedAt;
const initial: Reading = {
  observedAt: "2026-11-07T01:00:00Z",
  value: "Melbourne CBD",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("resource lifecycle visible to dashboard cards", () => {
  it("never renders previous suburb data under a newly selected suburb", async () => {
    const first = deferred<Reading>();
    const second = deferred<Reading>();
    const renders: Resource<Reading>[] = [];
    const { result, rerender } = renderHook(
      ({ key }) => {
        const resource = useResource(
          key,
          () => (key === "melbourne" ? first.promise : second.promise),
          60_000,
          0,
          timestamp,
        );
        renders.push(resource);
        return resource;
      },
      { initialProps: { key: "melbourne" } },
    );
    await act(async () => {
      first.resolve(initial);
    });
    expect(result.current.data?.value).toBe("Melbourne CBD");

    rerender({ key: "richmond" });
    expect(result.current).toEqual({ key: "richmond", loading: true });
    expect(
      renders
        .filter((state) => state.key === "richmond")
        .every((state) => state.data === undefined),
    ).toBe(true);

    // A different suburb may legitimately have an older forecast timestamp.
    const richmond = { observedAt: "2026-11-07T00:45:00Z", value: "Richmond" };
    await act(async () => {
      second.resolve(richmond);
    });
    expect(result.current.data).toEqual(richmond);
    expect(result.current.error).toBeUndefined();
  });

  it("aborts a superseded request and ignores its response even if its loader ignores cancellation", async () => {
    const old = deferred<Reading>();
    const current = deferred<Reading>();
    const signals: AbortSignal[] = [];
    const { result, rerender } = renderHook(
      ({ key }) =>
        useResource(
          key,
          (signal) => {
            signals.push(signal);
            return key === "melbourne" ? old.promise : current.promise;
          },
          60_000,
          0,
          timestamp,
        ),
      { initialProps: { key: "melbourne" } },
    );

    rerender({ key: "richmond" });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    const latest = { ...initial, value: "Richmond" };
    await act(async () => {
      current.resolve(latest);
    });
    await act(async () => {
      old.resolve({ ...initial, observedAt: "2026-11-07T02:00:00Z" });
    });
    expect(result.current).toEqual({
      key: "richmond",
      data: latest,
      loading: false,
    });
  });

  it("retains last successful data during refresh failure without affecting another feed", async () => {
    const failure = deferred<Reading>();
    const uvRefresh = deferred<Reading>();
    const weatherLoader = vi
      .fn<(signal: AbortSignal) => Promise<Reading>>()
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(() => failure.promise);
    const uvLoader = vi
      .fn<(signal: AbortSignal) => Promise<Reading>>()
      .mockResolvedValueOnce({ ...initial, value: "UV 0" })
      .mockImplementationOnce(() => uvRefresh.promise);
    const { result, rerender } = renderHook(
      ({ revision }) => ({
        weather: useResource(
          "weather",
          weatherLoader,
          60_000,
          revision,
          timestamp,
        ),
        uv: useResource("uv", uvLoader, 60_000, revision, timestamp),
      }),
      { initialProps: { revision: 0 } },
    );
    await act(async () => {});
    rerender({ revision: 1 });
    expect(result.current.weather).toMatchObject({
      data: initial,
      loading: true,
    });
    await act(async () => {
      failure.reject(new Error("Network unavailable"));
      uvRefresh.resolve({
        ...initial,
        observedAt: "2026-11-07T01:01:00Z",
        value: "UV 0.1",
      });
    });
    expect(result.current.weather).toMatchObject({
      data: initial,
      error: "Network unavailable",
      loading: false,
    });
    expect(result.current.uv.data?.value).toBe("UV 0.1");
    expect(result.current.uv.error).toBeUndefined();
  });

  it("rejects source timestamp regression and recovers when a newer source arrives", async () => {
    const loader = vi
      .fn<(signal: AbortSignal) => Promise<Reading>>()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({
        observedAt: "2026-11-07T00:59:00Z",
        value: "Old response",
      })
      .mockResolvedValueOnce({
        observedAt: "2026-11-07T01:02:00Z",
        value: "New response",
      });
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useResource("parking", loader, 60_000, revision, timestamp),
      { initialProps: { revision: 0 } },
    );
    await act(async () => {});
    rerender({ revision: 1 });
    await act(async () => {});
    expect(result.current.data).toEqual(initial);
    expect(result.current.error).toMatch(/older data/);

    rerender({ revision: 2 });
    await act(async () => {});
    expect(result.current.data?.value).toBe("New response");
    expect(result.current.error).toBeUndefined();
  });

  it("polls again after a failed request and aborts the active request on unmount", async () => {
    vi.useFakeTimers();
    const pending = deferred<Reading>();
    const signals: AbortSignal[] = [];
    const loader = vi.fn<(signal: AbortSignal) => Promise<Reading>>(
      (signal) => {
        signals.push(signal);
        return signals.length === 1
          ? Promise.reject(new Error("Offline"))
          : pending.promise;
      },
    );
    const { result, unmount } = renderHook(() =>
      useResource("parking", loader, 60_000, 0, timestamp),
    );
    await act(async () => {});
    expect(result.current.error).toBe("Offline");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
    unmount();
    expect(signals[1].aborted).toBe(true);
  });
});

describe("freshness and retained data aging", () => {
  it("uses Melbourne 24-hour time across daylight saving and standard time", () => {
    expect(melbourneTime("2026-11-06T13:05:00Z")).toBe("00:05");
    expect(melbourneTime("2026-06-06T14:05:00Z")).toBe("00:05");
  });

  it("formats elapsed time in English with singular and plural units", () => {
    const source = Date.parse(initial.observedAt);
    expect(ago(initial.observedAt, source)).toBe("Just now");
    expect(ago(initial.observedAt, source + 60_000)).toBe("1 min ago");
    expect(ago(initial.observedAt, source + 120_000)).toBe("2 mins ago");
    expect(ago(initial.observedAt, source + 3_600_000)).toBe("1 hr ago");
    expect(ago(initial.observedAt, source + 7_200_000)).toBe("2 hrs ago");
    expect(ago(initial.observedAt, source + 86_400_000)).toBe("1 day ago");
    expect(ago(initial.observedAt, source + 172_800_000)).toBe("2 days ago");
  });

  it("distinguishes fresh, delayed and stale while rejecting invalid or impossible clocks", () => {
    const source = Date.parse(initial.observedAt);
    expect(freshness(initial.observedAt, source + 5 * 60_000, 5, 15)).toBe(
      "fresh",
    );
    expect(freshness(initial.observedAt, source + 5 * 60_000 + 1, 5, 15)).toBe(
      "delayed",
    );
    expect(freshness(initial.observedAt, source + 15 * 60_000, 5, 15)).toBe(
      "delayed",
    );
    expect(freshness(initial.observedAt, source + 15 * 60_000 + 1, 5, 15)).toBe(
      "stale",
    );
    expect(freshness(initial.observedAt, source - 120_000, 5, 15)).toBe(
      "fresh",
    );
    expect(freshness(initial.observedAt, source - 120_001, 5, 15)).toBe(
      "stale",
    );
    expect(freshness(undefined, source, 5, 15)).toBe("stale");
    expect(freshness("invalid", source, 5, 15)).toBe("stale");
    expect(freshness(initial.observedAt, NaN, 5, 15)).toBe("stale");
  });

  it("ages the displayed feed without a network response and stops its clock on unmount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(initial.observedAt));
    const { result, unmount } = renderHook(() =>
      freshness(initial.observedAt, useNow(), 5, 15),
    );
    expect(result.current).toBe("fresh");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 15_000);
    });
    expect(result.current).toBe("delayed");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(result.current).toBe("stale");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
