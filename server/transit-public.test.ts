// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearGatewayState } from "./index";
import { handlePublicTransitRequest } from "./transit-public";
import { getDepartures } from "./transit";
import { fetchEpaObservations } from "./epa";

vi.mock("./transit", async (original) => ({
  ...(await original<typeof import("./transit")>()),
  getDepartures: vi.fn(),
}));
vi.mock("./epa", () => ({ fetchEpaObservations: vi.fn() }));

const origin = "https://ericthegoatskr.github.io";
const env = {
  PTV_DEV_ID: "999999",
  PTV_API_KEY: "00000000-0000-4000-8000-000000000000",
  EPA_API_KEY: "unrelated-provider-test-secret",
  EPA_BACKEND_TOKEN: "unrelated-private-service-test-token",
  ALLOWED_ORIGINS: origin,
};
const path = "/api/transit/departures?stopId=11212&idScheme=gtfs&mode=train";
const request = (url = path) =>
  new Request(`https://transit.example.test${url}`, { headers: { Origin: origin } });

beforeEach(() => {
  clearGatewayState();
  vi.clearAllMocks();
});
afterEach(clearGatewayState);

it("serves an anonymous departure board using only PTV runtime configuration", async () => {
  const board = {
    checkedAt: new Date().toISOString(),
    stopId: 11212,
    idScheme: "gtfs" as const,
    upstreamStopId: 1071,
    mode: "train" as const,
    directions: [],
    departures: [],
    disruptions: [],
  };
  vi.mocked(getDepartures).mockResolvedValue(board);
  const response = await handlePublicTransitRequest(request(), env);
  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  expect(await response.json()).toEqual(board);
  const providerEnv = vi.mocked(getDepartures).mock.calls[0][1];
  expect(providerEnv).toEqual({
    PTV_DEV_ID: env.PTV_DEV_ID,
    PTV_API_KEY: env.PTV_API_KEY,
    ALLOWED_ORIGINS: origin,
  });
  expect(fetchEpaObservations).not.toHaveBeenCalled();
});

it("does not expose EPA, health, search or arbitrary proxy routes even with extra secrets", async () => {
  for (const url of [
    "/", "/api/health", "/api/air/observations",
    "/api/transit/stops?q=Flinders&mode=train",
    "/proxy?url=https://gateway.api.epa.vic.gov.au/",
  ]) {
    const response = await handlePublicTransitRequest(request(url), env);
    expect(response.status, url).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Resource not found." },
    });
  }
  expect(getDepartures).not.toHaveBeenCalled();
  expect(fetchEpaObservations).not.toHaveBeenCalled();
});

it("cannot activate PTV using an EPA key or private service token", async () => {
  const response = await handlePublicTransitRequest(request(), {
    ...env, PTV_API_KEY: undefined, PTV_DEV_ID: undefined,
  });
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("not_configured");
  expect(getDepartures).not.toHaveBeenCalled();
  expect(fetchEpaObservations).not.toHaveBeenCalled();
});
