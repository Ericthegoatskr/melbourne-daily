# Authenticated data backend

The PTV and EPA adapters and their UI are implemented and tested. `EPA_API_KEY` is configured as a Sites Secret in environment revision 3, and the redeployed owner-private backend has passed live EPA verification for station metadata, categories and hourly PM2.5/PM10 readings. PTV credentials are still pending. The public Pages frontend leaves `VITE_DATA_API_URL` unset and shows unavailable states with official links for these feeds. Stop search and stop favourites continue to work from the public GTFS directory.

The current Sites hosting project is owner-private. Anonymous Pages visitors cannot use it. EPA publication will use a validated JSON snapshot on GitHub Pages, so it does not require changing the backend's audience. Authorisation for the Actions service-access Secret and public end-to-end snapshot checks remain release gates.

## Canonical source and build

`server/index.ts`, `server/transit.ts`, `server/epa.ts` and `shared/` in the `melbourne-daily` repository are the source of truth. The sibling `melbourne-daily-api` project contains generated Sites worker hosting scaffolding. Do not maintain adapter changes only in that generated project.

```sh
npm ci
npm run verify
npm run build:api
```

The default bundle is `dist-api/index.js`. The build script also accepts an explicit output path, used when preparing the sibling host:

```sh
node scripts/build-api.mjs ../melbourne-daily-api/worker/index.js
```

Build the hosting artifact from the same reviewed repository revision as the frontend. Rebuild and redeploy the backend after a source change; deploying GitHub Pages does not deploy the separate worker.

## Configuration

Request PTV access using the registration instructions linked from the [official Timetable API page](https://www.vic.gov.au/public-transport-timetable-api); the API requires both a developer ID and signing key. These remain unconfigured. The owner has registered at the [EPA developer portal](https://portal.api.epa.vic.gov.au/), subscribed to Environment Monitoring and stored its key directly in Sites as `EPA_API_KEY` with Secret enabled. This workflow has not sent a PTV application email.

Configure these values in the backend host's runtime secret/environment settings, using [server/.env.example](../server/.env.example) as the variable reference. A local example file is not automatically loaded by the worker bundle.

| Variable | Purpose |
| --- | --- |
| `PTV_DEV_ID` | PTV Timetable API developer identifier. |
| `PTV_API_KEY` | PTV signing key; separate from DTP GTFS Realtime credentials. |
| `EPA_API_KEY` | Key for the subscribed EPA Environment Monitoring product. |
| `EPA_API_KEY_HEADER` | Defaults to `X-API-Key`, confirmed by the current EPA endpoint's authentication challenge and successful authorised requests. No override is needed for this subscription. |
| `EPA_API_BASE_URL` | Defaults to the official `https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1` service; the adapter restricts requests to the official HTTPS host and rejects redirects. |
| `ALLOWED_ORIGINS` | Comma-separated allowed browser origins; defaults to `https://ericthegoatskr.github.io`. Origins contain no `/melbourne-daily/` path. |

The frontend accepts public data URLs only. `VITE_EPA_DATA_URL` enables EPA independently by pointing to the complete public JSON snapshot URL. If absent, EPA falls back to the `/api/air/observations` route under `VITE_DATA_API_URL`. Transport uses only `VITE_DATA_API_URL`. Keep that shared variable unset while PTV credentials are unavailable, so enabling EPA does not start unsuccessful transport polling. Neither variable contains a provider key.

Never put provider credentials in any `VITE_*` variable, Pages artifact or committed `.env` file. Vite embeds its environment at build time, so enabling or changing a URL requires a new frontend build and Pages deployment. The Pages workflow maps the matching GitHub Actions repository variables into the frontend build only. Both variables are currently unset.

### Public EPA snapshots through GitHub Pages

The prepared snapshot workflow keeps the Sites backend private. GitHub Actions calls it with a service-access credential in the `EPA_BACKEND_TOKEN` Actions Secret; the EPA provider key remains only in Sites. This workflow injects the credential only into the collection step on main-branch deployments and scheduled runs, never pull-request builds or the frontend build step. Repository writers can modify workflows to use repository secrets, so storing this credential requires the owner's explicit authorisation. It has not yet been stored.

`npm run build:epa-collector` creates a Node collector outside the Pages artifact. The collector requests only the fixed private backend URL, refuses redirects, validates the response, removes unknown fields and expired readings, and rejects empty or stale snapshots. A successful request atomically writes `public/data/epa-observations.json`; failures stop publication and leave the previous deployed website in place. Generated snapshots and the collector bundle are ignored by Git.

The prepared Pages workflow runs every 15 minutes at minutes 2, 17, 32 and 47. GitHub schedules are best effort and may be delayed or disabled after inactivity; this is not a real-time delivery guarantee. The client preserves each observation timestamp and hides readings after three hours. Once authorised, set `VITE_EPA_DATA_URL` to `https://ericthegoatskr.github.io/melbourne-daily/data/epa-observations.json`. The browser then reads only this public JSON file, sends no credentials or location query, and selects its nearest reporting station locally.

Snapshot preparation passed 223 tests and production builds. A local collector check retrieved 93 stations with 28 categories, 27 PM2.5 readings and 15 PM10 readings. The local browser preview showed Melbourne CBD as Good, PM2.5 4.8 µg/m³ and PM10 Unavailable. These checks verify the prepared path locally; the Actions Secret, public snapshot and production browser check remain pending.

## Endpoints and timing

| Endpoint | Behavior | Cache / client refresh |
| --- | --- | --- |
| `/api/health` | Reports provider configuration flags, never keys. `configured` means a value is present/structurally valid, not that provider access has succeeded. | Not cached. |
| `/api/transit/stops?q=…&mode=train` | PTV name lookup when credentials are available. The current UI searches its bundled GTFS directory instead. | One hour per query. |
| `/api/transit/departures?stopId=…&mode=train&idScheme=gtfs` | PTV departures, route/direction options and service updates. Optional `routeId` and `directionId` retain their PTV identity. | 25 seconds / 30 seconds. |
| `/api/air/observations?latitude=…&longitude=…` | Validated EPA monitoring stations; the frontend chooses an eligible nearby station. | Five minutes for the shared station payload / 15 minutes. |

Transit `checkedAt` is lookup time because the PTV response does not provide a common observation timestamp. Departures and their associated service updates are hidden after two minutes without a successful refresh. Scheduled services remain explicitly marked when no live estimate exists. EPA readings preserve their own hourly interval-end timestamps and expire individually after three hours; a newly downloaded stale reading does not become fresh.

The gateway validates allowed parameters and browser origins, deduplicates concurrent requests and applies bounded in-memory caching and burst limits. These are per-worker-isolate protections, not a distributed quota guarantee. Check the actual provider subscription limits before a higher-traffic launch.

## Private EPA verification: 7 November 2026

An authenticated request to the [private backend](https://melbourne-daily-api-eric.boundlessforge.chatgpt.site) passed at 16:32 AEDT (`2026-11-07T05:32:45.883Z`). `/api/health` returned HTTP 200 with EPA configured and PTV unconfigured. `/api/air/observations` returned HTTP 200 from EPA Victoria: 93 stations, including 28 with a category, 27 with PM2.5 and 15 with PM10. All returned non-null readings were within the three-hour freshness limit; station metadata alone does not imply an available reading.

Alphington reported Good, PM2.5 **10.45 µg/m³** and PM10 **22.14 µg/m³**, each for the one-hour interval ending at 16:00 AEDT (`05:00Z`). EPA's public website showed the same category and timestamp, with rounded concentrations of 10.4 and 22.1. Melbourne CBD's PM2.5 was 4.85 µg/m³ while PM10 remained unavailable, confirming missing values are preserved.

The release replaces Workers-unsupported `redirect: "error"` with manual redirect handling, following the [Workers Request documentation](https://developers.cloudflare.com/workers/runtime-apis/request/), and accepts EPA's strictly validated numeric strings, including confidence values above 100. Redirects are not followed, and diagnostics contain only controlled error classifications and bounded field shapes. No credentials or upstream response bodies are logged. `npm run verify` passed 202 tests, TypeScript checking and the frontend/API builds.

An anonymous request to `/api/air/observations` returned HTTP 401, confirming the backend remains private. The frontend build contains none of the provider credential names or authentication header names, and `VITE_DATA_API_URL` remains unset.

| Deployment record | Value |
| --- | --- |
| Sites source commit | `72d128ee4a6cad5afb80795ef2e504c0757004ed` |
| Saved version | `appgprj_6aee16edac8c8191ad4817368db6cf2b~appgver_d3d267cbf9588191a4027fcce131411c` |
| Deployment | `appgdep_6aeeb7d8764c8191af2577f14d8baa1c` |
| Environment revision | `3` |

This verifies the private backend. It does not activate EPA on GitHub Pages or verify PTV access.

## Remaining production gates

- [ ] Obtain owner authorisation to store the existing Sites service-access credential as the `EPA_BACKEND_TOKEN` Actions Secret in `Ericthegoatskr/melbourne-daily`, then configure it.
- [x] Configure `EPA_API_KEY` as a backend Secret and confirm the `X-API-Key` authentication header.
- [ ] Configure authorised PTV runtime credentials.
- [ ] Fetch actual train and tram responses, including GTFS stop-ID mapping, and compare scheduled/live/cancelled services with the official source.
- [x] Fetch an actual EPA response and verify coordinates, interval boundaries, units, quality fields, missing sensors and provider categories against AirWatch.
- [ ] Set `VITE_EPA_DATA_URL` to the public snapshot URL, keep `VITE_DATA_API_URL` unset and publish through the prepared Pages workflow.
- [ ] Verify the deployed JSON contains only approved station fields, no credentials, and current observation timestamps; check normal, missing, stale and unavailable EPA states in the public browser.
- [ ] Record the successful Actions run and deployed frontend revision in the release checklist; preserve the owner-private backend.
- [ ] Before any future direct browser connection to the transport API, verify its authorised access model and CORS for the exact Pages origin.

The owner completed EPA registration and secret entry directly in the provider portal and Sites settings. No key values belong in this repository, frontend assets or verification records.
