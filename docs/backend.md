# Authenticated data backend

The PTV and EPA adapters and their UI are implemented and tested. They are not yet verified with this project's authorised provider credentials. The public Pages frontend leaves `VITE_DATA_API_URL` unset and shows unavailable states with official links for these feeds. Stop search and stop favourites continue to work from the public GTFS directory.

The current Sites hosting project is owner-private. A private deployment is not a public API connection: anonymous Pages visitors cannot use it. Public backend access, runtime credentials and successful end-to-end verification are all release gates.

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

Request PTV access using the registration instructions linked from the [official Timetable API page](https://www.vic.gov.au/public-transport-timetable-api); the API requires both a developer ID and signing key. For EPA, register at the [developer portal](https://portal.api.epa.vic.gov.au/) and subscribe to the Environment Monitoring product before using its issued key. These are separate access processes; no registration or email request has been sent by this workflow.

Configure these values in the backend host's runtime secret/environment settings, using [server/.env.example](../server/.env.example) as the variable reference. A local example file is not automatically loaded by the worker bundle.

| Variable | Purpose |
| --- | --- |
| `PTV_DEV_ID` | PTV Timetable API developer identifier. |
| `PTV_API_KEY` | PTV signing key; separate from DTP GTFS Realtime credentials. |
| `EPA_API_KEY` | Key for the subscribed EPA Environment Monitoring product. |
| `EPA_API_KEY_HEADER` | Confirm against the subscribed product; defaults to `X-API-Key`, supports `Ocp-Apim-Subscription-Key` when required. |
| `EPA_API_BASE_URL` | Defaults to the official `https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1` service; the adapter restricts requests to the official HTTPS host and rejects redirects. |
| `ALLOWED_ORIGINS` | Comma-separated allowed browser origins; defaults to `https://ericthegoatskr.github.io`. Origins contain no `/melbourne-daily/` path. |

The only frontend variable is `VITE_DATA_API_URL`, a public backend base URL. Never put provider credentials in any `VITE_*` variable, Pages artifact or committed `.env` file. Vite embeds its environment at build time, so enabling or changing the origin requires a new frontend build and Pages deployment. The Pages workflow maps the GitHub Actions repository variable `VITE_DATA_API_URL` into the frontend build only. That repository variable is currently unset. After the public backend and authorised data checks pass, set it to the verified public origin and run the Pages workflow on `main`.

## Endpoints and timing

| Endpoint | Behavior | Cache / client refresh |
| --- | --- | --- |
| `/api/health` | Reports provider configuration flags, never keys. `configured` means a value is present/structurally valid, not that provider access has succeeded. | Not cached. |
| `/api/transit/stops?q=…&mode=train` | PTV name lookup when credentials are available. The current UI searches its bundled GTFS directory instead. | One hour per query. |
| `/api/transit/departures?stopId=…&mode=train&idScheme=gtfs` | PTV departures, route/direction options and service updates. Optional `routeId` and `directionId` retain their PTV identity. | 25 seconds / 30 seconds. |
| `/api/air/observations?latitude=…&longitude=…` | Validated EPA monitoring stations; the frontend chooses an eligible nearby station. | Five minutes for the shared station payload / 15 minutes. |

Transit `checkedAt` is lookup time because the PTV response does not provide a common observation timestamp. Departures and their associated service updates are hidden after two minutes without a successful refresh. Scheduled services remain explicitly marked when no live estimate exists. EPA readings preserve their own hourly interval-end timestamps and expire individually after three hours; a newly downloaded stale reading does not become fresh.

The gateway validates allowed parameters and browser origins, deduplicates concurrent requests and applies bounded in-memory caching and burst limits. These are per-worker-isolate protections, not a distributed quota guarantee. Check the actual provider subscription limits before a higher-traffic launch.

## Remaining production gates

- [ ] Enable and verify anonymous public access to the backend host.
- [ ] Configure authorised PTV and EPA runtime credentials; confirm the EPA subscription's authentication header.
- [ ] Fetch actual train and tram responses, including GTFS stop-ID mapping, and compare scheduled/live/cancelled services with the official source.
- [ ] Fetch an actual EPA response and verify coordinates, interval boundaries, units, quality fields, missing sensors and provider categories against AirWatch.
- [ ] Confirm CORS permits the exact Pages origin and rejects unrelated origins; credentials never appear in errors or bundles.
- [ ] Supply the verified public origin to the frontend build, redeploy Pages and test normal, empty, stale and unavailable states through the public site.
- [ ] Record the deployed frontend/backend revisions and successful live checks in the release checklist.

No provider registration, email notification or credential submission has been performed by this implementation workflow.
