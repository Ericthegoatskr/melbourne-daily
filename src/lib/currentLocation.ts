export interface CurrentLocation {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  capturedAt: number;
}

export type LocationErrorCode =
  | "insecure"
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "invalid"
  | "stale"
  | "inaccurate";

const MESSAGES: Record<LocationErrorCode, string> = {
  insecure:
    "Location needs a secure connection. Open the HTTPS site, or search for a station or stop instead.",
  unsupported:
    "This browser cannot share your location. Search for a station or stop instead.",
  denied:
    "Location access was not allowed. You can enable it in your browser or device settings, or search for a station or stop instead.",
  unavailable:
    "Your browser could not find your location. Check your device location settings and try again, or search for a station or stop.",
  timeout:
    "Location took too long. Check the browser permission prompt, then try again or search for a station or stop.",
  invalid:
    "Your browser returned an unusable location. Try again, or search for a station or stop instead.",
  stale:
    "Your browser returned an old or incorrectly timed location. Try again, or search for a station or stop instead.",
  inaccurate:
    "Your location estimate is wider than 1 km. Try again with a better signal, or search for a station or stop instead.",
};

export class LocationError extends Error {
  constructor(readonly code: LocationErrorCode) {
    super(MESSAGES[code]);
    this.name = "LocationError";
  }
}

const POSITION_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_POSITION_AGE_MS = 120_000;
const MAX_CLOCK_SKEW_MS = 10_000;
const MAX_ACCURACY_METRES = 1000;

function asCurrentLocation(position: GeolocationPosition): CurrentLocation {
  const coords = position?.coords;
  if (
    !coords ||
    !Number.isFinite(coords.latitude) ||
    Math.abs(coords.latitude) > 90 ||
    !Number.isFinite(coords.longitude) ||
    Math.abs(coords.longitude) > 180 ||
    !Number.isFinite(coords.accuracy) ||
    coords.accuracy < 0 ||
    !Number.isFinite(position.timestamp)
  ) {
    throw new LocationError("invalid");
  }
  const age = Date.now() - position.timestamp;
  if (age > MAX_POSITION_AGE_MS || age < -MAX_CLOCK_SKEW_MS) {
    throw new LocationError("stale");
  }
  if (coords.accuracy > MAX_ACCURACY_METRES) {
    throw new LocationError("inaccurate");
  }
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMetres: coords.accuracy,
    capturedAt: position.timestamp,
  };
}

/**
 * Request one location fix after an explicit user action. Coordinates are only
 * returned in memory; this module does not send, store, or log them.
 *
 * Native getCurrentPosition cannot be cancelled. Aborting abandons its result
 * and removes our timer/listener, but cannot dismiss a browser permission prompt.
 */
export async function requestCurrentLocation(
  signal?: AbortSignal,
): Promise<CurrentLocation> {
  if (signal?.aborted) {
    throw new DOMException("Location request cancelled.", "AbortError");
  }
  if (typeof window === "undefined" || !window.isSecureContext) {
    throw new LocationError("insecure");
  }
  let geolocation: Geolocation;
  try {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.geolocation?.getCurrentPosition !== "function"
    ) {
      throw new LocationError("unsupported");
    }
    geolocation = navigator.geolocation;
  } catch (error) {
    throw error instanceof LocationError
      ? error
      : new LocationError("unavailable");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const cancel = () =>
      fail(new DOMException("Location request cancelled.", "AbortError"));
    // The native acquisition timeout excludes waiting for permission. This
    // deadline also lets the UI recover from an unanswered permission prompt.
    const timer = setTimeout(
      () => fail(new LocationError("timeout")),
      REQUEST_TIMEOUT_MS,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) {
      cancel();
      return;
    }
    try {
      geolocation.getCurrentPosition(
        (position) => {
          if (settled) return;
          try {
            const location = asCurrentLocation(position);
            settled = true;
            cleanup();
            resolve(location);
          } catch (error) {
            fail(
              error instanceof LocationError
                ? error
                : new LocationError("invalid"),
            );
          }
        },
        (error) => {
          fail(
            new LocationError(
              error?.code === 1
                ? "denied"
                : error?.code === 3
                  ? "timeout"
                  : "unavailable",
            ),
          );
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: POSITION_TIMEOUT_MS },
      );
    } catch (error) {
      fail(
        new LocationError(
          error instanceof DOMException && error.name === "SecurityError"
            ? "denied"
            : "unavailable",
        ),
      );
    }
  });
}
