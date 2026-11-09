# Remaining feature acceptance checklist

Audit baseline: `31d986e928271506631580dc5d49c6fe4fc9206c`, updated on 9 November 2026 (Australia/Melbourne). The confirmed transport and EPA scope is deployed and verified. The owner-authorised dedicated transit API is public, and the homepage and transport page display live PTV data through the configured `VITE_TRANSIT_API_URL`. `VITE_DATA_API_URL` remains unset; the combined Sites backend remains owner-private with EPA and PTV Secrets in environment revision 4. Optional diagnostics and the conditional weather-observation scope are identified separately below.

Baseline local verification: 126 tests passed, frontend production and API bundle builds passed, train/tram search and browser-local favourites worked in a real browser, and 390 px / 1,440 px layouts had no horizontal overflow or console errors. The EPA backend release subsequently passed 202 tests and live private-backend checks. The Pages snapshot release passed 223 tests, builds and authorised collection in [Actions run 42346099479](https://github.com/Ericthegoatskr/melbourne-daily/actions/runs/42346099479) for commit `08b7babccca1414978588ddc6f8cee1ad602dd2a`. At 17:16 AEDT on 7 November 2026, anonymous page/JSON requests and production browser checks passed. On 9 November 2026, private PTV access passed at 17:53 AEDT and the dedicated public API passed anonymous route/direction and frontend-parser checks at 18:05 AEDT. GitHub commit `534c1ea7cd04c975741a332955e71fc8d669d40f` passed 314 tests across 25 suites, TypeScript checking and all four builds, then deployed successfully in [Actions run 42577153638](https://github.com/Ericthegoatskr/melbourne-daily/actions/runs/42577153638). Public transport-page and homepage browser checks passed at 18:07–18:09 AEDT.

## Already delivered in the baseline

- [x] One English-language homepage, Australian date and number formatting, Melbourne time zone and daylight-saving handling.
- [x] A shared suburb selector, persisted in the current browser.
- [x] Open-Meteo modeled current weather, a 24-hour outlook and a three-day forecast. Current modeled values are identified as estimates.
- [x] Observed ARPANSA UV for the Melbourne station, separately labeled from modeled daily maximum UV. Today and tomorrow's maximum UV are already present in the three-day forecast; a second forecast provider is not needed to satisfy that field.
- [x] City of Melbourne parking sensor summaries, trusted street recommendations and access to the existing full Parking Dashboard. Coverage and stale-data limits are visible.
- [x] CAMS regional PM2.5 and PM10 estimates, explicitly distinguished from EPA observations.
- [x] Official transport and EPA links, with browser-local pinning of transport shortcuts.
- [x] Independent requests, cancellation on location changes, source timestamps, stale-value hiding and source attribution.
- [x] Git version control and a verified GitHub Pages deployment under the requested GitHub account.

Pinning an official shortcut is not the same feature as saving a stop and direction. Linking to departures or AirWatch is not completion of an embedded live-data integration.

## Public transport: public API and Pages activation verified

- [x] Search Metro train and tram boarding points using official GTFS identifiers and coordinates; this works without a key.
- [x] Preserve platforms, modes and identifier schemes separately; route/direction selection is implemented for an authorised PTV board response.
- [x] Save/remove local favourites and restore them on revisit. Direction-specific selections are tested and become available with the PTV response.
- [x] Implement up to five departures for the selected stop/direction, including route and destination.
- [x] Distinguish live predictions, scheduled times and metropolitan-train cancellations. A missing prediction is not treated as on time; tram cancellation coverage is not promised by PTV.
- [x] Implement relevant service disruptions, validity filtering and official source links where supplied.
- [x] Preserve lookup/schedule/estimate times and handle stale boards, no upcoming service, invalid saved stops, rate limits and upstream failures.
- [x] Keep provider keys server-side, validate input, cache requests and apply per-worker burst limits. Distributed quota enforcement is not claimed.
- [x] Prepare a separately deployable transport-only read endpoint and independent `VITE_TRANSIT_API_URL` configuration. Browser requests omit credentials; the existing EPA backend stays private.
- [x] Configure PTV Secrets and verify actual authorised train/tram responses on the existing private backend, including estimated/scheduled times and train-associated disruptions.
- [x] Verify GTFS-to-PTV mapping with actual responses: train `11212`/`11213` resolve to station `1071`; tram `19497`/`19687` resolve to stop `2206`.
- [x] Configure PTV Secrets and verify the dedicated transit host privately at `https://melbourne-transit-api-eric.boundlessforge.chatgpt.site`, project `appgprj_6af16e43fb98819195767987520ce362`. Train/tram requests returned HTTP 200; health and EPA routes returned HTTP 404.
- [x] Obtain owner permission for the dedicated host's public audience and homepage activation.
- [x] Redeploy both backends with the GTFS route-filter correction and verify route/direction responses.
- [x] Verify anonymous access, exact Pages-origin CORS, method restrictions and the isolated public route surface; pass returned payloads through the frontend parser.
- [x] Build and deploy Pages with `VITE_TRANSIT_API_URL` set to the verified public transit host.
- [x] Verify the rendered homepage and transport feature, including broader PTV stop scope, route/direction selection, live/scheduled labels and expanded service updates.
- [x] Observe the 30-second refresh and verify exact two-minute expiry in the client parser with recorded live responses. Cancellation, expiry and failure handling are covered by tests.

Private verification on 9 November 2026 used environment revision 4 and successful deployment `appgdep_6af16dbecf508191a900edfe137010db` of saved version 8, source `2f1028fbe07f12fbd75d05ad4f0dac2634bc9a24`. Both train GTFS points returned the entire Flinders Street station board, with platforms 1–10 represented; both tram points returned a PTV board covering both directions. The verified UI identifies the broader station scope and applies the selected route/direction. The original combined backend and EPA service remain owner-private. See the [private PTV verification record](backend.md#private-ptv-verification-9-november-2026).

The dedicated host's initial private deployment succeeded at 17:56 AEDT with environment revision 1, source `5964cf7e7dce484e24be20be33c70d482b6d7578`, saved version `appgprj_6af16e43fb98819195767987520ce362~appgver_86bdb72553f48191a5d8fbc08a4e635c` and deployment `appgdep_6af16ea441a48191ac5927ea18c48e0b`. Further official-provider checks found that route-specific GTFS-stop requests combined with PTV route IDs returned empty boards; native PTV stop/route requests worked. The shared adapter now uses the general stop endpoint for GTFS requests, keeps `direction_id` upstream and applies the PTV route filter during parsing before the result limit. Both corrected backend deployments have succeeded.

Public API verification passed at 18:05 AEDT under transit audience revision 2. Anonymous GTFS train `11212` returned 100 departures and 22 alerts; filtering route `5` / direction `9` returned 50 departures and 5 alerts. Tram `19497`, route `721`, returned 50 departures with no alerts for each of directions `0` and `1`. All responses passed the frontend parser. CORS allowed the Pages origin and rejected a different origin with 403; `OPTIONS` returned 204, `POST` returned 405, and health/EPA paths returned 404. The original EPA backend still returned 401 anonymously. The current corrected transit deployment is `appgdep_6af170585cfc8191a7af55590a1583d1`; the combined private deployment is `appgdep_6af1707c15c881918f446db05434f92c`. See the [public API verification record](backend.md#public-ptv-api-verification-9-november-2026) for source/version identifiers.

The `workflow_dispatch` Pages release in [Actions run 42577153638](https://github.com/Ericthegoatskr/melbourne-daily/actions/runs/42577153638) built and deployed commit `534c1ea7cd04c975741a332955e71fc8d669d40f`. At 18:07–18:09 AEDT, the public transport page showed Flinders Street as an all-platforms station board; Mernda selection showed only Mernda rows with live/scheduled labels and expandable service updates containing a start date and operator link. Bourke Street Mall tram stop `19497`, route 1 toward East Coburg, showed only route 1 rows with live/scheduled labels and the explicit no-service-updates message. The homepage also showed real Flinders Street departures and alerts. Refresh advanced `checkedAt` from 18:07:35 to 18:08:06 AEDT. The 390 CSS-pixel mobile transport layout and 1,440 CSS-pixel desktop homepage had no horizontal overflow, and console error logs were empty. Screenshots were saved locally outside Git.

No cancelled service was captured during live verification. Cancellation, expiry and failure handling passed tests, and exact two-minute expiry was checked in the client parser using recorded live responses. Comparing a simultaneous official-website departure board or capturing a live cancellation remains optional diagnostic work, not a required release gate.

The [DTP realtime collection](https://opendata.transport.vic.gov.au/dataset/gtfs-realtime) and [PTV Timetable API](https://www.vic.gov.au/public-transport-timetable-api) are separate integration paths; their credentials and identifier spaces must not be assumed interchangeable. Use whichever authorised path supplies the required behavior reliably. If using GTFS-RT, join the correct static schedule and service date, including trips after midnight and times beyond 24:00.

### Bus discovery extension

The shared homepage/transport flow now includes public bus boarding points in destination search, bundled-landmark matching and one-time device-location discovery. All, Trains, Trams and Buses filters use the same distance-sorted list and 1/2/5 km radii. Opposite-side bus points retain their original identity and remain separate results; the optional map uses numbered T/R/B markers. Explicit list or marker selection opens the existing board, route/direction choices, related service updates and Google Maps/Apple Maps walking links. Train, tram, saved-stop and location-privacy behavior is retained. Live checks found that different Box Hill bus bays and Monash boarding points can resolve to a shared PTV board with multiple directions. The bus board therefore explains its broader scope and requests route/direction filtering and boarding-bay confirmation; walking links continue to target the original selected GTFS point.

The adapter accepts `mode=bus` through the existing read-only public endpoint with PTV route type 2 and `gtfs=true` for directory stops. Missing estimates stay scheduled; this release does not promise tram/bus cancellation coverage. Dedicated Night Bus departures use a separate PTV route type and are not included. Provider keys remain backend Secrets, and the EPA architecture is unchanged. Focused server tests cover bus GTFS/PTV identity, wrong-mode responses, route/direction filters, service-update association and read-only endpoint behavior. Current deployment evidence belongs in the [backend verification record](backend.md); the train/tram activation observations above remain historical.

### Public stop directory prepared during this implementation

`public/data/transport-stops.json` contains 541 Metro train boarding stops, 1,624 tram stops and 18,970 bus stops (21,135 total) from the official [GTFS Schedule dataset](https://opendata.transport.vic.gov.au/dataset/gtfs-schedule), licensed under CC BY 4.0. These are boarding-point records, not a count of distinct named stations. Only stop identifiers referenced by `stop_times.txt` and within latitude -38.6 to -37.3 / longitude 144.3 to 146.25 are included. Bus stops come from Myki Bus (folder 4) and Regional Bus (folder 6), must fall within the simplified 31-council metropolitan boundary, and must permit pickup on at least one service. Duplicate bus IDs shared by both archives are checked for matching identity and coordinates. Coaches (folder 5) and SkyBus (folder 11) are excluded. Parent stations and pathway-only records are excluded by the service join. Rail-replacement bus stops are preserved under their rail network and clearly named. Train platform labels use the supplied `platform_code`; opposite-side tram and bus boarding points can still share a name and must remain distinct selections.

The [weekly refresh workflow](../.github/workflows/refresh-transit-stops.yml) runs `python3 scripts/update-transit-stops.py`; it can also run manually. It resolves the official catalogue URL and uses HTTP Range to read only the nested Metro train, tram, Myki Bus and Regional Bus ZIPs. The bus extension adds approximately 56.7 MB and 4.5 MB of compressed archive data respectively; the full statewide archive is not downloaded. Raw ZIPs remain outside the repository; only the compact, validated directory is published. Metadata records upstream Last-Modified separately from generation time. An unchanged snapshot is not rewritten; changed data is committed alone and triggers an explicit Pages deployment dispatch. The schedule is best effort. See [directory maintenance](transit-directory.md).

Every saved directory stop must preserve `idScheme: "gtfs"`. The official [PTV v3 Swagger definition](https://timetableapi.ptv.vic.gov.au/swagger/docs/v3) documents the `gtfs=true` option on departures requests to accept a GTFS stop identifier. It does not establish that PTV route/direction identifiers equal static GTFS route/direction identifiers. API-derived selections must retain their own identifier scheme, and any response association must be validated with authorised live requests. The directory enables genuine stop search and local favourites without a key; it does not supply live departures or disruptions by itself.

## EPA station observations: public snapshot verified, backend private

- [x] Implement authoritative metadata parsing, including stable station identifiers and verified coordinate order, against the published schema.
- [x] Select an eligible station within 100 km of the chosen suburb and display its name/distance.
- [x] Display a valid provider category plus available PM2.5/PM10 at that station.
- [x] Preserve pollutant observation times, units and averaging periods; apply documented validation/quality rules and leave missing readings unavailable.
- [x] Identify station data as hourly observations and keep CAMS model estimates separate; never infer an EPA category from a different source.
- [x] Expire each observation before nearest-station selection and show an unavailable state when none qualifies.
- [x] Keep category and pollutants at one named station, displaying unavailable for a missing pollutant rather than borrowing another station's value.
- [x] Configure `EPA_API_KEY` as a Sites Secret and confirm `X-API-Key` authentication in the 7 November private release (environment revision 3); it remains configured in revision 4 after PTV activation.
- [x] Verify actual authorised payloads and deployed private-backend requests for station metadata, categories and hourly PM2.5/PM10.
- [x] Prepare and locally verify the Actions collector and public JSON client while keeping the Sites backend private.
- [x] Authorise and configure `EPA_BACKEND_TOKEN` as an Actions Secret in `Ericthegoatskr/melbourne-daily`.
- [x] Set `VITE_EPA_DATA_URL`, publish the validated JSON snapshot through Pages and verify the EPA panel in the production browser.

The owner subscribed through the [EPA developer portal](https://portal.api.epa.vic.gov.au/) and entered the provider key directly in Sites settings. The implementation uses the official schema linked through [DataVic](https://discover.data.vic.gov.au/dataset/environment-monitoring-api), validated with fixtures and observed production differences. The 16:32 AEDT private check returned 93 stations with current readings and matched Alphington against the official website. Public activation at 17:16 AEDT then verified the snapshot and rendered Melbourne CBD/Footscray values, including missing PM10 and measured-zero PM2.5. The backend still rejects anonymous access. See the [backend verification records](backend.md) for observations, security checks and deployment identifiers. Scheduled refresh is configured every 15 minutes on a best-effort basis; the first verified run was push-triggered, and readings still expire after three hours.

## Current weather observations: scope reconciliation

The accepted first phase supplies clearly labeled Open-Meteo modeled weather and ARPANSA observed UV. Station weather observations were discussed in earlier research, but no complete accepted specification establishing BOM observations as mandatory is stored in this repository. They are therefore a conditional follow-up, not a gate for finishing the confirmed transport and EPA scope. If that earlier observation option is subsequently included, the requirements below apply; the current model must not be renamed to imply BOM observation coverage.

- [ ] Establish a source with permission to publish station observations on this public site.
- [ ] Show station name, distance, observation time and available measured temperature/wind fields separately from the forecast grid.
- [ ] Select an eligible, sufficiently recent station after checking required fields. Do not pick a station solely because it is geographically closest.
- [ ] Keep forecast descriptions, precipitation probabilities and daily UV forecasts identified as forecasts; a weather observation does not automatically provide them.

### BOM anonymous FTP: technical verification and publication condition

The official [10-minute observations guide](https://www.bom.gov.au/catalogue/Observations-XML.pdf) documents `IDV60920.xml` at `ftp://ftp.bom.gov.au/anon/gen/fwo/`. A read-only probe on 7 November 2026 retrieved 310,800 bytes and 103 station entries. Olympic Park had a current UTC observation time and usable temperature, apparent temperature and wind fields. Other station entries were not equally usable: Scoresby had an old timestamp and an empty surface record, while Fawkner Beacon had current wind but no temperature.

The [anonymous product catalogue](https://www.bom.gov.au/catalogue/anon-ftp.shtml) explicitly directs publishing users to Registered User Services. The current [copyright notice](https://www.bom.gov.au/copyright) says that, absent other stated terms, personal/internal use does not permit supplying the content to others and different use needs permission. Therefore this probe establishes technical availability, not permission to republish the observations on GitHub Pages. The shorter “free/non-commercial” description on the data-feed landing page does not resolve the publication condition.

Once publication rights are established, a Python or Node collector can convert the FTP XML to a small HTTPS JSON response. The browser cannot directly consume this FTP source. Cloudflare Workers also exposes [outbound TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/), so it is inaccurate to rule out all Workers FTP implementations; an FTP client and its control/data connections would still need runtime verification rather than an ordinary `fetch()` call.

A ten-minute GitHub Actions collector is technically schedulable, but [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) warns that runs may be delayed or dropped and public-repository schedules may be disabled after 60 inactive days. Such a collector can only be a best-effort snapshot source with explicit observation time, collection time and expiry. It cannot guarantee ten-minute freshness or support minute-level transit predictions. Keep collection independent of frontend deployment when choosing a production architecture.

## Shared release checks

- [x] The selected suburb controls forecast location and EPA station selection; saved stops retain their own explicit identity. ARPANSA remains one Melbourne station and parking remains City of Melbourne coverage. Nearby transit suggestions were an audit inference, not a confirmed first-version requirement.
- [x] New interface text is English; dates and units follow Australian conventions.
- [x] Polling, cache ages and source update cadence are documented separately. Failed requests do not refresh old timestamps.
- [x] Meaningful tests cover invalid/missing fields, stale data, source regression, request changes and existing date/daylight-saving behavior.
- [x] Real-browser checks cover local train/tram search, favourite persistence, navigation and desktop/mobile widths without console errors or horizontal overflow.
- [x] Verify public EPA snapshot rendering, suburb changes, missing readings and measured zero; regression tests cover expiry and provider failures.
- [x] Verify the public PTV API, frontend parsing, route/direction filters and exact-origin CORS while preserving the private EPA backend.
- [x] Verify actual PTV data, filters, service updates and refresh in the deployed homepage and transport page; cover failure handling and cancellations with tests.
- [x] Provider credentials are absent from Git and frontend assets; frontend configuration contains only public data URLs. The activation scan checked 139 source and Pages-artifact files against the actual PTV signing key and both Sites service-access tokens and found none.
- [x] Authorise the Actions service-access Secret and verify the published EPA snapshot contains only approved station data; keep the Sites host owner-private and `VITE_DATA_API_URL` unset.
- [x] Verify the Pages deployment, snapshot path, freshness and rendered EPA data for the tested EPA revision; verify the transport Pages release and production browser with the configured public API.
- [x] Update the source register and README to distinguish no-key features, implemented adapters and remaining access/verification gates.

## Boundaries retained from the first-version plan

Accounts, cross-device sync, push notifications, a complete multimodal journey planner, live vehicle maps and long-term analytics were deferred. They are not implied by finishing the originally planned departures, service alerts and station observations. The original parking application does not need to be rebuilt to satisfy the integrated homepage requirement.
