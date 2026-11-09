import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocationError,
  requestCurrentLocation,
  type LocationErrorCode,
} from "./currentLocation";

const now = Date.parse("2026-11-09T00:00:00Z");
let success: PositionCallback;
let failure: PositionErrorCallback;
const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>();

function position(
  coords: Partial<GeolocationCoordinates> = {},
  timestamp = now,
): GeolocationPosition {
  return {
    coords: {
      latitude: -37.818,
      longitude: 144.967,
      accuracy: 25,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      ...coords,
    },
    timestamp,
  } as GeolocationPosition;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubGlobal("isSecureContext", true);
  getCurrentPosition.mockReset().mockImplementation((onSuccess, onError) => {
    success = onSuccess;
    failure = onError!;
  });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("one-time current location", () => {
  it("requests one fresh fix and returns only in-memory coordinates and accuracy", async () => {
    const fetch = vi.fn();
    const persist = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", { setItem: persist });
    vi.stubGlobal("sessionStorage", { setItem: persist });
    const request = requestCurrentLocation();
    expect(getCurrentPosition).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
    success(position());
    await expect(request).resolves.toEqual({
      latitude: -37.818,
      longitude: 144.967,
      accuracyMetres: 25,
      capturedAt: now,
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([
    [false, { geolocation: { getCurrentPosition } }, "insecure"],
    [true, {}, "unsupported"],
    [true, { geolocation: {} }, "unsupported"],
  ])("detects secure context and browser support (%s, %s)", async (secure, navigator, code) => {
    vi.stubGlobal("isSecureContext", secure);
    vi.stubGlobal("navigator", navigator);
    await expect(requestCurrentLocation()).rejects.toMatchObject({ code });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles a browser that throws while accessing geolocation", async () => {
    vi.stubGlobal("navigator", {
      get geolocation() {
        throw new Error("Unavailable browser API");
      },
    });
    await expect(requestCurrentLocation()).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
    [99, "unavailable"],
  ])("maps native error %s and offers station search", async (code, expected) => {
    const request = requestCurrentLocation();
    failure({ code } as GeolocationPositionError);
    await expect(request).rejects.toMatchObject({
      name: "LocationError",
      code: expected,
      message: expect.stringMatching(/search for a station or stop/i),
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [new DOMException("Blocked", "SecurityError"), "denied"],
    [new Error("API failed"), "unavailable"],
  ])("handles a synchronous native failure", async (error, code) => {
    getCurrentPosition.mockImplementation(() => { throw error; });
    await expect(requestCurrentLocation()).rejects.toMatchObject({ code });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { latitude: NaN },
    { latitude: 90.01 },
    { latitude: -90.01 },
    { longitude: Infinity },
    { longitude: 180.01 },
    { longitude: -180.01 },
    { accuracy: NaN },
    { accuracy: -1 },
  ])("rejects unusable coordinates %j", async (coords) => {
    const request = requestCurrentLocation();
    success(position(coords));
    await expect(request).rejects.toMatchObject({ code: "invalid" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [NaN, "invalid"],
    [now - 120_001, "stale"],
    [now + 10_001, "stale"],
  ])("rejects invalid, old, and future timestamps", async (timestamp, code) => {
    const request = requestCurrentLocation();
    success(position({}, timestamp));
    await expect(request).rejects.toMatchObject({ code });
  });

  it.each([now - 120_000, now + 10_000])("accepts age, accuracy and zero-coordinate boundaries", async (timestamp) => {
    const request = requestCurrentLocation();
    success(position({ latitude: 0, longitude: 0, accuracy: 1000 }, timestamp));
    await expect(request).resolves.toMatchObject({
      latitude: 0,
      longitude: 0,
      accuracyMetres: 1000,
      capturedAt: timestamp,
    });
  });

  it("rejects estimates wider than 1 km", async () => {
    const request = requestCurrentLocation();
    success(position({ accuracy: 1000.01 }));
    await expect(request).rejects.toMatchObject({ code: "inaccurate" });
  });

  it("restores control after 20 seconds even if permission receives no answer", async () => {
    const settled = vi.fn();
    const request = requestCurrentLocation().catch((error) => {
      settled(error);
      return error;
    });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await request).toMatchObject({ code: "timeout" });
    success(position());
    failure({ code: 1 } as GeolocationPositionError);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not request a fix for an already cancelled action", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(requestCurrentLocation(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("abandons an aborted request, removes its listener, and ignores late callbacks", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const settled = vi.fn();
    const request = requestCurrentLocation(controller.signal).catch((error) => {
      settled(error);
      return error;
    });
    controller.abort();
    expect(await request).toMatchObject({ name: "AbortError" });
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    success(position());
    failure({ code: 2 } as GeolocationPositionError);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("cleans up successful requests and ignores a second native result", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const request = requestCurrentLocation(controller.signal);
    success(position());
    success(position({ latitude: 0 }));
    failure({ code: 1 } as GeolocationPositionError);
    controller.abort();
    await expect(request).resolves.toMatchObject({ latitude: -37.818 });
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("offers manual search for every user-facing failure", () => {
    const codes: LocationErrorCode[] = [
      "insecure", "unsupported", "denied", "unavailable",
      "timeout", "invalid", "stale", "inaccurate",
    ];
    for (const code of codes) {
      expect(new LocationError(code).message).toMatch(/station or stop/);
    }
  });
});
