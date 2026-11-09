# Authenticated data backend

The public homepage displays live PTV departures and service updates alongside EPA categories and hourly PM2.5/PM10 readings from a validated GitHub Pages snapshot. The dedicated transit API passed anonymous checks at 18:05 AEDT on 9 November 2026; the Pages release and production-browser checks passed at 18:07–18:09 AEDT. `VITE_TRANSIT_API_URL` is configured for the public transit host, while `VITE_DATA_API_URL` remains unset. The combined Sites backend remains owner-private, with EPA and PTV credentials configured as Secrets in environment revision 4. Stop search and stop favourites continue to use the public GTFS directory.

The combined Sites backend remains owner-private and returns HTTP 401 to anonymous EPA requests. The authorised Actions collector can read it using a service-access Secret; anonymous visitors read EPA only through the published JSON snapshot from GitHub Pages. The separate public transit API exposes departures only.

## Canonical source and build

`server/index.ts`, `server/transit-public.ts`, `server/transit.ts`, `server/epa.ts` and `shared/` in the `melbourne-daily` repository are the source of truth. The sibling `melbourne-daily-api` and `melbourne-transit-api` projects contain generated Sites worker hosting scaffolding. Do not maintain adapter changes only in those generated projects.

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

PTV access uses a developer ID and signing key, as described on the [official Timetable API page](https://www.vic.gov.au/public-transport-timetable-api). Both are now configured as Secrets on the existing owner-private backend and have passed authenticated departure requests. The owner has also registered at the [EPA developer portal](https://portal.api.epa.vic.gov.au/), subscribed to Environment Monitoring and stored its key directly in Sites as `EPA_API_KEY` with Secret enabled. This workflow has not sent a PTV application email.

Configure these values in the backend host's runtime secret/environment settings, using [server/.env.example](../server/.env.example) as the variable reference. A local example file is not automatically loaded by the worker bundle.

| Variable | Purpose |
| --- | --- |
| `PTV_DEV_ID` | PTV Timetable API developer identifier. |
| `PTV_API_KEY` | PTV signing key; separate from DTP GTFS Realtime credentials. |
| `EPA_API_KEY` | Key for the subscribed EPA Environment Monitoring product. |
| `EPA_API_KEY_HEADER` | Defaults to `X-API-Key`, confirmed by the current EPA endpoint's authentication challenge and successful authorised requests. No override is needed for this subscription. |
| `EPA_API_BASE_URL` | Defaults to the official `https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1` service; the adapter restricts requests to the official HTTPS host and rejects redirects. |
| `ALLOWED_ORIGINS` | Comma-separated allowed browser origins; defaults to `https://ericthegoatskr.github.io`. Origins contain no `/melbourne-daily/` path. |

The frontend accepts public data URLs only. `VITE_EPA_DATA_URL` enables EPA independently by pointing to the complete public JSON snapshot URL. If absent, EPA falls back to the `/api/air/observations` route under `VITE_DATA_API_URL`. Transport prefers `VITE_TRANSIT_API_URL`, with `VITE_DATA_API_URL` retained as a compatibility fallback. An invalid explicit transport URL fails closed. Public transit access and frontend activation are authorised and verified through `VITE_TRANSIT_API_URL`; the shared URL remains unset. None of these variables contains a provider key.

Never put provider credentials in any `VITE_*` variable, Pages artifact or committed `.env` file. Vite embeds its environment at build time, so enabling or changing a URL requires a new frontend build and Pages deployment. The Pages workflow maps the matching GitHub Actions repository variables into the frontend build only. `VITE_EPA_DATA_URL` is set to `https://ericthegoatskr.github.io/melbourne-daily/data/epa-observations.json`; `VITE_TRANSIT_API_URL` is set to `https://melbourne-transit-api-eric.boundlessforge.chatgpt.site` and included in the verified Pages release. `VITE_DATA_API_URL` remains unset.

### Transport-only public endpoint

`npm run build:transit-api` bundles `server/transit-public.ts` into `dist-api/transit.js`. Its sole route is `/api/transit/departures`, with GET/OPTIONS only; all health, EPA, search and arbitrary proxy paths return 404. Stop lookup remains in the browser's public GTFS directory. The adapter forwards only PTV configuration to the gateway, even if unrelated credentials are accidentally added to its host. It needs no EPA key or private Sites service-access token.

The existing combined backend remains owner-private. The separate transport-only host at `https://melbourne-transit-api-eric.boundlessforge.chatgpt.site`, project `appgprj_6af16e43fb98819195767987520ce362`, is public under audience revision 2. Its runtime contains only `PTV_DEV_ID` and `PTV_API_KEY`, marked as Secrets. The corrected adapter has passed anonymous requests, CORS checks for the Pages origin and rendered-browser verification through the deployed frontend. Never point the browser at the private EPA service or include its access token. The browser explicitly omits credentials and HTTP caching on transport requests.

The gateway retains a 25-second per-query cache and the UI polls every 30 seconds, expiring departures and alerts after two minutes. These are application intervals, not a promise of the provider's update frequency. GitHub Actions' 15-minute EPA snapshot path is unsuitable for these predictions. The [official data-quality statement](https://www.vic.gov.au/public-transport-timetable-api-data-quality-statement) describes realtime coverage as dependent on operator data.

The [official v3 schema](https://timetableapi.ptv.vic.gov.au/swagger/docs/v3) confirms GTFS stop lookup with `gtfs=true`, expanded route/direction data and distinct scheduled/estimated timestamps. Cancellation support is documented for metropolitan trains only. Signed upstream requests reject redirects so authentication-bearing URLs are never forwarded to another host. Empty-departure boards still validate the returned PTV stop identity and mode before associating service updates. Public API access, Pages deployment and production-browser acceptance are verified.

Preparation checks on 7 November 2026 passed 250 tests, TypeScript and all four builds (frontend, private API, transport-only API and EPA collector). Route-only service updates now respect the selected PTV direction when supplied, while explicit departure/stop associations remain authoritative. Browser artifacts contained no provider credential names, signing parameters, private service-authentication header or private-backend origin.

On 7 November 2026, the audited shared adapter was deployed to the existing owner-private host at 17:39 AEDT, preserving environment revision 3: source `2f1028fbe07f12fbd75d05ad4f0dac2634bc9a24`, saved version `appgprj_6aee16edac8c8191ad4817368db6cf2b~appgver_dee80d0d214c81918d50339065a2d9ef`, deployment `appgdep_6aeec7b2b560819198a5d7fcc281c2b0`. An authenticated check at 17:40 AEDT returned EPA HTTP 200 with 93 stations. At that time, health reported PTV unconfigured, and the transport request returned controlled HTTP 503 `not_configured`. The anonymous EPA request was denied with HTTP 403. No public transport URL or new transport host was activated in that release.

### Private PTV verification: 9 November 2026

At 17:53 AEDT, authenticated requests to the existing owner-private backend succeeded. `/api/health` returned HTTP 200 with both transit and EPA configured. Train and tram departure responses included estimated and scheduled times; the train response also included associated disruptions. These checks establish private provider access, not public activation or production-browser acceptance.

The live responses established that GTFS boarding points can resolve to a broader PTV stop:

| Requested GTFS stops | Returned PTV stop | Observed board scope |
| --- | --- | --- |
| Train `11212` and `11213` | `1071` | Entire Flinders Street station, with platforms 1–10 represented. |
| Tram `19497` and `19687` | `2206` | Both directions represented. |

A selected GTFS boarding point therefore does not by itself guarantee a platform-specific or single-direction departure board. The public interface preserves the returned PTV identity and route/direction filters and identifies Flinders Street as an all-platforms station board. Cancellation handling is covered by tests; no cancelled departure was captured during live verification. Capturing one or comparing a simultaneous official-website board remains an optional diagnostic, not a release gate.

| Deployment record | Value |
| --- | --- |
| Existing private Sites project | `appgprj_6aee16edac8c8191ad4817368db6cf2b` |
| Sites source commit | `2f1028fbe07f12fbd75d05ad4f0dac2634bc9a24` |
| Saved version | `8` (unchanged source) |
| Successful deployment | `appgdep_6af16dbecf508191a900edfe137010db` |
| Environment revision | `4` |

The dedicated transit host's initial private deployment succeeded at 17:56 AEDT. Authenticated train and tram departure requests returned HTTP 200; `/api/health` and the EPA route returned HTTP 404, confirming the restricted route surface.

| Dedicated transit deployment record | Value |
| --- | --- |
| Sites project | `appgprj_6af16e43fb98819195767987520ce362` |
| Sites source commit | `5964cf7e7dce484e24be20be33c70d482b6d7578` |
| Saved version | `appgprj_6af16e43fb98819195767987520ce362~appgver_86bdb72553f48191a5d8fbc08a4e635c` |
| Successful deployment | `appgdep_6af16ea441a48191ac5927ea18c48e0b` |
| Environment revision | `1` |

Further requests to the official provider exposed a route-ID compatibility issue: the route-specific departures endpoint returned an empty board when combining a GTFS stop identifier with a PTV route identifier, while the native PTV stop/route endpoint worked. The shared adapter now keeps GTFS requests on the general stop endpoint, retains `direction_id` upstream and filters the returned departures by PTV route during parsing, before applying the result limit. Native PTV stop requests retain the working route-specific endpoint. Both corrected backend bundles have since been deployed successfully; the initial deployment records above predate this correction.

The owner explicitly authorised making the dedicated transit endpoint public and completing homepage activation. The successful public API, Pages and browser verification records follow. The original EPA service remains owner-private. No provider credentials or service-access tokens are recorded here.

### Public PTV API verification: 9 November 2026

At 18:05 AEDT, the dedicated transit host passed anonymous requests without an authentication header. Public audience revision 2 exposes only the transit endpoint. The current API source is GitHub commit `534c1ea`; 314 tests across 25 suites, TypeScript checking and all four builds passed.

| Corrected deployment | Combined private backend | Dedicated public transit backend |
| --- | --- | --- |
| Sites source commit | `e2e36e33c97aad9b77848fbd05c342bf27ec46ae` | `cb4213307a8316c342a34aee1851f5e9c9cdcf3c` |
| Saved version | `appgprj_6aee16edac8c8191ad4817368db6cf2b~appgver_fa7c256372388191a8484e8b7913f68d` | `appgprj_6af16e43fb98819195767987520ce362~appgver_69ca22ee6ee08191b83090b6b0542db4` |
| Successful deployment | `appgdep_6af1707c15c881918f446db05434f92c` | `appgdep_6af170585cfc8191a7af55590a1583d1` |
| Environment revision | `4` | `1` |

The following public responses returned HTTP 200 and passed the actual frontend response parser. Counts describe these verification responses, not the number of rows rendered by the UI.

| GTFS stop and mode | PTV route / direction | Departures | Associated alerts |
| --- | --- | --- | --- |
| Train `11212` | Unfiltered | 100 | 22 |
| Train `11212` | Route `5`, direction `9` | 50 | 5 |
| Tram `19497` | Route `721`, direction `0` | 50 | 0 |
| Tram `19497` | Route `721`, direction `1` | 50 | 0 |

CORS allowed the exact Pages origin, `https://ericthegoatskr.github.io`; a different origin received HTTP 403. `OPTIONS` returned 204 and `POST` returned 405. The public transit host returned 404 for health and EPA paths. An anonymous request to the original EPA backend still returned 401. These checks verify the public API and frontend parsing; the subsequent Pages and browser verification is recorded below.

### Pages and browser activation: 9 November 2026

[Actions run 42577153638](https://github.com/Ericthegoatskr/melbourne-daily/actions/runs/42577153638), triggered by `workflow_dispatch`, successfully built and deployed commit `534c1ea7cd04c975741a332955e71fc8d669d40f` with the configured `VITE_TRANSIT_API_URL`. Public-browser checks passed between 18:07 and 18:09 AEDT on both the transport page and homepage.

The transport page displayed the real Flinders Street station board with its all-platforms scope. Selecting Mernda showed only Mernda departures, with live and scheduled labels. Expanded service updates showed their start date and operator link. At Bourke Street Mall, GTFS tram stop `19497`, selecting route 1 toward East Coburg showed only route 1 departures, including live and scheduled times, and the explicit message that no service updates were returned. The homepage also displayed real Flinders Street departures and alerts.

The 30-second refresh was observed through `checkedAt` advancing from 18:07:35 to 18:08:06 AEDT. The client parser also passed an exact two-minute expiry check using recorded live responses. The 390 CSS-pixel mobile transport layout and 1,440 CSS-pixel desktop homepage had no horizontal overflow, and captured console error logs were empty. Screenshot evidence was saved locally outside Git.

Cancellation rendering, expiry and failure handling are covered by tests; no actual cancelled service was captured in the live check. Observing a live cancellation or comparing a simultaneous official-website departure board is optional follow-up diagnostic work. A 139-file source and Pages-artifact scan found no PTV signing key or either Sites service-access token. Provider credentials remain in backend Secrets, and the original EPA endpoint remains private with anonymous HTTP 401.

### Public EPA snapshots through GitHub Pages

The snapshot workflow keeps the Sites backend private. With the owner's explicit authorisation, its service-access credential was stored as the `EPA_BACKEND_TOKEN` Actions Secret at 17:13 AEDT on 7 November 2026. The EPA provider key remains only in Sites. The workflow injects the service credential only into the collection step on main-branch deployments and scheduled runs, never pull-request builds or the frontend build step. Repository writers can modify workflows to use repository secrets.

`npm run build:epa-collector` creates a Node collector outside the Pages artifact. The collector requests only the fixed private backend URL, refuses redirects, validates the response, removes unknown fields and expired readings, and rejects empty or stale snapshots. A successful request atomically writes `public/data/epa-observations.json`; failures stop publication and leave the previous deployed website in place. Generated snapshots and the collector bundle are ignored by Git.

The Pages workflow is configured to run at UTC minutes 2, 17, 32 and 47 of each hour. GitHub schedules are best effort and may be delayed or disabled after inactivity; this is not a real-time delivery guarantee. The client preserves each observation timestamp and hides readings after three hours. The browser reads only the public JSON file, sends no credentials or location query, and selects its nearest reporting station locally. The first verified publication was push-triggered; scheduled execution has not yet been observed.

Public activation passed at 17:16 AEDT on 7 November 2026 (`2026-11-07T06:16:13Z`). [Actions run 42346099479](https://github.com/Ericthegoatskr/melbourne-daily/actions/runs/42346099479) built and deployed commit `08b7babccca1414978588ddc6f8cee1ad602dd2a`, including successful collection and 223 tests. Anonymous homepage and JSON requests returned HTTP 200. The snapshot was fetched at `06:14:31.894Z` and contained 93 stations: 28 categories, 27 PM2.5 readings and 15 PM10 readings, with all non-null observations within three hours.

The public browser showed Melbourne CBD as Good, PM2.5 4.8 µg/m³ and PM10 Unavailable. Switching to Footscray showed Good, PM2.5 0.0 and PM10 17.7 µg/m³, for the hour ending 16:00 AEDT. The published JSON passed the strict field allowlist. Public HTML, JavaScript, CSS and JSON contained neither the service credential bytes nor credential/header names. The browser bundle contained the public JSON URL and no private-backend origin; the backend still returned HTTP 401 anonymously. Missing readings and measured zero remain distinct.

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

This earlier check verified the private EPA backend; the public snapshot activation and subsequent private PTV verification are recorded above.

## Completed production checks

- [x] Obtain owner authorisation and configure the Sites service-access credential as the `EPA_BACKEND_TOKEN` Actions Secret in `Ericthegoatskr/melbourne-daily`.
- [x] Configure `EPA_API_KEY` as a backend Secret and confirm the `X-API-Key` authentication header.
- [x] Configure authorised PTV runtime credentials on the existing owner-private backend.
- [x] Fetch actual train and tram responses, including GTFS-to-PTV stop mapping, estimated/scheduled departures and train-associated disruptions.
- [x] Verify the dedicated transport-only host privately with its own PTV Secrets; train/tram return HTTP 200 and health/EPA return HTTP 404.
- [x] Redeploy both backends with the GTFS route-filter correction and verify route/direction responses.
- [x] Verify the production interface represents broader PTV stop boards and distinguishes actual live estimates from scheduled times.
- [x] Fetch an actual EPA response and verify coordinates, interval boundaries, units, quality fields, missing sensors and provider categories against AirWatch.
- [x] Set `VITE_EPA_DATA_URL` to the public snapshot URL, keep `VITE_DATA_API_URL` unset and publish through the Pages workflow.
- [x] Verify the deployed JSON contains only approved station fields, no credentials and fresh observation timestamps; check normal, missing and measured-zero values in the public browser.
- [x] Record the successful Actions run and deployed frontend revision; preserve the owner-private backend.
- [x] Obtain owner permission for the dedicated transport host's public audience and homepage activation.
- [x] Verify anonymous access and CORS for the exact Pages origin, method restrictions, isolated routes and frontend parsing.
- [x] Deploy Pages with the authorised transport URL and verify live data, route/direction selection, service updates and refresh in the production browser on mobile and desktop.
- [x] Verify exact two-minute expiry with recorded live responses; cover cancellation, expiry and failure handling in tests.

Optional diagnostics: compare a simultaneous official-website departure board and capture a live cancellation when one is available. These observations were not part of the completed live check and are not required release gates.

The owner completed EPA registration and secret entry directly in the provider portal and Sites settings. No key values belong in this repository, frontend assets or verification records.
