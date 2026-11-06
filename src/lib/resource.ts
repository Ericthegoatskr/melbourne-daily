import { useEffect, useRef, useState } from "react";

export type Resource<T> = {
  key: string;
  data?: T;
  error?: string;
  loading: boolean;
};

/** Poll independent feeds; cancel superseded requests and reject timestamp regressions. */
export function useResource<T>(
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
  interval: number,
  revision: number,
  timestamp: (data: T) => string,
) {
  const [state, setState] = useState<Resource<T>>({ key, loading: true });
  const loaderRef = useRef(loader);
  const timestampRef = useRef(timestamp);
  loaderRef.current = loader;
  timestampRef.current = timestamp;
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      controller = new AbortController();
      setState((previous) => ({
        ...(previous.key === key ? previous : { key }),
        loading: true,
      }));
      try {
        const data = await loaderRef.current(controller.signal);
        if (disposed) return;
        setState((previous) => {
          const prior = previous.key === key ? previous.data : undefined;
          if (
            prior &&
            Date.parse(timestampRef.current(data)) <
              Date.parse(timestampRef.current(prior))
          ) {
            return {
              key,
              data: prior,
              loading: false,
              error:
                "The source returned older data. The previous result has been kept.",
            };
          }
          return { key, data, loading: false };
        });
      } catch (error) {
        if (disposed) return;
        setState((previous) => ({
          ...(previous.key === key ? previous : { key }),
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Data is temporarily unavailable",
        }));
      } finally {
        if (!disposed) timer = setTimeout(poll, interval);
      }
    }
    void poll();
    // The regular polling cycle recovers a connection; manual refresh restarts this effect.
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [key, interval, revision]);
  return state.key === key ? state : { key, loading: true };
}

export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 15_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  return now;
}

export type Freshness = "fresh" | "delayed" | "stale";
export function freshness(
  timestamp: string | undefined,
  now: number,
  freshMinutes: number,
  staleMinutes: number,
): Freshness {
  if (!timestamp) return "stale";
  const age = now - Date.parse(timestamp);
  if (!Number.isFinite(age) || age < -120_000 || age > staleMinutes * 60_000)
    return "stale";
  return age <= freshMinutes * 60_000 ? "fresh" : "delayed";
}

export const melbourneTime = (
  date: string | number,
  options?: Intl.DateTimeFormatOptions,
) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...options,
  }).format(new Date(date));

export function ago(timestamp: string, now: number) {
  const minutes = Math.max(
    0,
    Math.floor((now - Date.parse(timestamp)) / 60_000),
  );
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  const hours = Math.floor(minutes / 60);
  if (minutes < 1440) return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
  const days = Math.floor(minutes / 1440);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function readPreference(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`melbourne-daily:${key}`) || fallback;
  } catch {
    return fallback;
  }
}
export function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(`melbourne-daily:${key}`, value);
  } catch {
    /* Private browsing can disable storage. */
  }
}
