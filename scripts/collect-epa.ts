import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EPA_MAX_AGE_MS, type EpaObservations } from "../shared/epa";
import { parseEpaObservations } from "../src/lib/epa";

// Keep the service-access credential restricted to this existing private backend.
const EPA_BACKEND_URL =
  "https://melbourne-daily-api-eric.boundlessforge.chatgpt.site/api/air/observations";

type FailureCode =
  | "missing_token"
  | "invalid_token"
  | "request_failed"
  | "upstream_http_error"
  | "invalid_payload"
  | "stale_snapshot"
  | "no_current_readings"
  | "credential_echo"
  | "write_failed";

export class EpaSnapshotError extends Error {
  constructor(readonly code: FailureCode, readonly status?: number) {
    super(`EPA snapshot refresh failed: ${code}`);
    this.name = "EpaSnapshotError";
  }
}

interface CollectionOptions {
  token?: string;
  fetcher?: typeof fetch;
  now?: number;
}

/** Fetch privately, then retain only the same public fields accepted by the UI. */
export async function collectEpaSnapshot({
  token,
  fetcher = fetch,
  now,
}: CollectionOptions): Promise<EpaObservations> {
  const credential = token?.trim();
  if (!credential) throw new EpaSnapshotError("missing_token");
  // RFC 6750 bearer-token characters; reject header injection before any request.
  if (!/^[A-Za-z0-9._~+/-]+=*$/.test(credential))
    throw new EpaSnapshotError("invalid_token");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let stage: FailureCode = "request_failed";
  try {
    const response = await fetcher(EPA_BACKEND_URL, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "OAI-Sites-Authorization": `Bearer ${credential}`,
      },
    });
    if (response.status !== 200)
      throw new EpaSnapshotError("upstream_http_error", response.status);
    stage = "invalid_payload";
    const body = await response.text();
    if (body.length > 4_000_000) throw new EpaSnapshotError("invalid_payload");
    const checkedAt = now ?? Date.now();
    const parsed = parseEpaObservations(JSON.parse(body), checkedAt);
    if (checkedAt - Date.parse(parsed.fetchedAt) > EPA_MAX_AGE_MS)
      throw new EpaSnapshotError("stale_snapshot");
    const fresh = <T extends { observedAt: string }>(reading: T | null): T | null => {
      if (!reading) return null;
      const age = checkedAt - Date.parse(reading.observedAt);
      return age >= -120_000 && age <= EPA_MAX_AGE_MS ? reading : null;
    };
    const snapshot: EpaObservations = {
      ...parsed,
      stations: parsed.stations.map((station) => ({
        ...station,
        category: fresh(station.category),
        pm25: fresh(station.pm25),
        pm10: fresh(station.pm10),
      })),
    };
    if (!snapshot.stations.some((station) => station.category || station.pm25 || station.pm10))
      throw new EpaSnapshotError("no_current_readings");
    // Even a credential echoed into an otherwise permitted text field must not publish.
    if (JSON.stringify(snapshot).includes(credential))
      throw new EpaSnapshotError("credential_echo");
    return snapshot;
  } catch (cause) {
    if (cause instanceof EpaSnapshotError) throw cause;
    // Do not retain raw errors, response bodies or request headers in CI logs.
    throw new EpaSnapshotError(stage);
  } finally {
    clearTimeout(timeout);
  }
}

/** Leave the previous file untouched unless collection and validation both succeed. */
export async function refreshEpaSnapshot(
  outputPath: string,
  options: CollectionOptions,
): Promise<EpaObservations> {
  const snapshot = await collectEpaSnapshot(options);
  const destination = resolve(outputPath);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644,
    });
    await rename(temporary, destination);
  } catch {
    throw new EpaSnapshotError("write_failed");
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return snapshot;
}

async function main() {
  try {
    const snapshot = await refreshEpaSnapshot("public/data/epa-observations.json", {
      token: process.env.EPA_BACKEND_TOKEN,
    });
    console.log(JSON.stringify({
      marker: "epa_snapshot_refreshed",
      fetchedAt: snapshot.fetchedAt,
      stations: snapshot.stations.length,
      withCategory: snapshot.stations.filter((station) => station.category).length,
      withPM25: snapshot.stations.filter((station) => station.pm25).length,
      withPM10: snapshot.stations.filter((station) => station.pm10).length,
    }));
  } catch (cause) {
    const failure = cause instanceof EpaSnapshotError ? cause : new EpaSnapshotError("request_failed");
    console.error(JSON.stringify({
      marker: "epa_snapshot_refresh_failed",
      code: failure.code,
      ...(failure.status === undefined ? {} : { status: failure.status }),
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
