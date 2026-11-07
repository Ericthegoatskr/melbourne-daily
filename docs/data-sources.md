# Data sources and coverage

Reviewed on 7 November 2026, in the Australia/Melbourne time zone. Melbourne Daily serves its frontend on GitHub Pages. Public feeds are requested directly from the browser; the bundled GTFS directory supports stop search without credentials. The separate owner-private backend has `EPA_API_KEY` configured as a Secret and has passed live verification for EPA categories and hourly PM2.5/PM10 readings. EPA snapshot publication through Pages awaits authorisation for an Actions service-access Secret; PTV credentials remain pending. No API credentials are bundled. Application polling intervals below are product settings, not provider guarantees.

## Current release and connection status

| Module           | Content                                                            | Coverage                                                         | Provider cadence / application polling                                                       |
| ---------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Weather          | Modeled current conditions, 24-hour forecast and three-day outlook | Forecast grid for the selected Melbourne suburb                  | Depends on the upstream model / every 15 minutes                                             |
| UV               | Observed UV index and separate modeled daily maximum               | ARPANSA Melbourne station; forecast grid for the selected suburb | Observations approximately every minute / every minute                                       |
| Parking          | Reporting sensor counts, available bays and street summaries       | Sensor-equipped City of Melbourne bays                           | Approximately two minutes in the original parking project's measurements / every two minutes |
| Modeled air      | PM2.5 and PM10 estimates                                           | CAMS Global grid, approximately 45 km                            | Model updates every 12 hours; native three-hourly output / every 30 minutes                  |
| Stop search and favourites | Official static train/tram boarding points; local saved selections | Greater Melbourne bounding box described below | Provider normally weekly/as needed; directory refresh scheduled weekly |
| EPA observations | Live private-backend readings verified; Pages snapshot publication pending | Nearest eligible EPA station within 100 km of the selected suburb | Provider hourly; prepared snapshot schedule and client polling every 15 minutes, backend cache five minutes |
| PTV departures | Board, directions, cancellations and alerts implemented; live feed awaits credentials and public backend | Selected Metro train or tram stop | Live estimates when supplied; intended client polling 30 seconds and backend cache 25 seconds |

The air estimates are not EPA observations. Until their data paths are activated, the site preserves stop search/favourites and shows unavailable states with official alternatives for PTV and EPA. EPA will read a public Pages snapshot while its backend stays private; deployment and fixture tests alone do not prove an active public feed.

## Weather and UV forecasts: Open-Meteo

The [Weather Forecast API](https://open-meteo.com/en/docs) provides `/v1/forecast` with Best Match model selection. Its current conditions are modeled values, not BOM station observations. Melbourne uses the applicable global models; the returned grid location can differ from the requested coordinates.

The application requests Unix timestamps and formats them in `Australia/Melbourne`, including daylight saving changes. `current.time` is a valid time and `fetchedAt` is a retrieval time. `generationtime_ms` measures server computation and is not a forecast publication timestamp. Hourly output does not imply that the model is rerun hourly; ECMWF IFS, for example, updates every six hours.

Open-Meteo lists BOM ACCESS Global as discontinued since 26 June 2025. This project does not use `/v1/bom` or describe its general forecasts as BOM observations. Public requests for Melbourne CBD and several suburbs succeeded during development.

The free service is restricted to non-commercial use and has request limits. Advertising, subscriptions or other commercial use require a review of the service plan. Credit Open-Meteo and the applicable data providers. See the [terms](https://open-meteo.com/en/terms) and [pricing and request limits](https://open-meteo.com/en/pricing).

## Observed UV: ARPANSA

Sources: [developer information](https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information), [XML feed](https://uvdata.arpansa.gov.au/xml/uvvalues.xml), [UV data disclaimer](https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information#Disclaimer).

The adapter reads the Melbourne / `mel` station and validates its status, value and time. Zero is a valid nighttime measurement; missing data must not become zero. XML may contain a UTF-8 BOM. During verification, the feed's local-time text differed from its UTC time converted to Melbourne time, so the adapter uses `utcdatetime` explicitly as UTC.

The feed updates approximately once a minute. A successful download must not make an old observation appear fresh. The application displays `UV observations courtesy of ARPANSA` and links to the source disclaimer.

ARPANSA asks developers to notify `uv.index@arpansa.gov.au` of the application and its URL. **That notification has not been sent by this development workflow.** The maintainer should send it with the deployed URL. Association with commercial advertising or promotion of goods or services requires prior written authorisation from ARPANSA.

## Parking: City of Melbourne

Sources: [parking sensor dataset](https://data.melbourne.vic.gov.au/explore/dataset/on-street-parking-bay-sensors/information/) and the existing [Melbourne Parking Dashboard](https://github.com/Ericthegoatskr/melbourne-parking-dashboard).

The feed can retain historical sensors. Counting every `Unoccupied` record would overstate current availability. The adapter preserves the original project's trust rules: reject implausible future times, require sufficient feed size and reporting coverage, and count individual sensors only when they reported within 30 minutes of the feed's newest report. Feed freshness uses `lastupdated`, not the time of the last occupancy change in `status_timestamp`.

The bundled zone crosswalk supplies street names. Unmapped zones remain outside street recommendations. The summary covers sensor-equipped City of Melbourne bays, not all parking in Greater Melbourne. An available sensor reading does not establish parking eligibility, fees or time limits; users must check signs at the location.

The City notes that network relay failures can delay updates. Credit City of Melbourne under CC BY 4.0. The original project's approximately two-minute measurements are not a service-level guarantee.

## Modeled air: CAMS / Open-Meteo

The [Air Quality API](https://open-meteo.com/en/docs/air-quality-api) adapter fixes `domains=cams_global` and requests PM2.5 and PM10 in μg/m³. A live Melbourne CBD request returned HTTP 200 and `Access-Control-Allow-Origin: *` when sent with the GitHub Pages origin. Its returned grid was approximately -37.8, 145.0.

CAMS Global has approximately 45 km spatial resolution, native three-hourly data and a 12-hour model update cycle. Nearby suburbs can share a grid cell. `modelTime` is the estimate's valid time, not the model run's publication time. The UI identifies these values as regional model estimates, not EPA station measurements.

No EPA category or US/European AQI is calculated from these values. Missing concentrations, changed units and invalid or stale valid times cause the adapter to reject the response. Credit both CAMS / Copernicus Atmosphere Monitoring Service and Open-Meteo. The free API's non-commercial and request-volume conditions also apply here.

## EPA observations: private backend verified, public activation pending

Sources: [EPA AirWatch](https://www.epa.vic.gov.au/check-air-and-water-quality), [developer portal](https://portal.api.epa.vic.gov.au/) and [air quality categories](https://www.epa.vic.gov.au/air-quality-categories).

EPA's developer portal requires registration, a product subscription and an API key. It lists a default rate limit of five requests per second. The owner has an active Environment Monitoring subscription and has configured `EPA_API_KEY` as a Sites Secret. The current EPA endpoint confirms `X-API-Key` in its authentication challenge, and the redeployed private backend successfully retrieves authorised responses. The adapter is based on the official schema linked from [DataVic](https://discover.data.vic.gov.au/dataset/environment-monitoring-api), with tests for the documented contract and observed production differences. At 16:32 AEDT on 7 November 2026, a backend request returned 93 stations: 28 had current categories, 27 had PM2.5 and 15 had PM10. An Alphington sample matched the official website's category, observation time and rounded concentrations; see the [verification record](backend.md#private-epa-verification-7-november-2026). The prepared collector and local browser preview also work, but the public snapshot has not been published. Its remaining gates are authorising `EPA_BACKEND_TOKEN` in Actions, setting `VITE_EPA_DATA_URL`, publishing and checking the production page. AirWatch remains available through links in the application.

EPA reports hourly measurements and five categories: Good, Fair, Poor, Very Poor and Extremely Poor. Its regional forecast updates daily at 5 pm for the following 24 hours. Monitoring coverage and equipment availability differ by site and pollutant. Missing or stalled readings must remain unavailable, not be interpreted as Good.

The backend calls the official `/environmentMonitoring/v1/sites/parameters?environmentalSegment=air` endpoint. Its validation requires supported hourly intervals, recognised concentration units, positive sample counts and a provider confidence value of at least 75. That cutoff is this application's quality rule, not an EPA health threshold. Authenticated production data uses numeric strings for the record count, sample count and confidence, and confidence can exceed 100; it must not be treated as a probability bounded by 100. Missing, conflicting, older than three hours, future-dated or unsupported readings remain unavailable. EPA's own category is preserved only when a valid supplied category is present; it is never calculated from CAMS concentrations.

The frontend expires fields independently, then chooses the nearest station with at least one usable field within 100 km of the selected suburb. The displayed category and pollutants belong to that station; missing pollutants are not silently borrowed from another station. Station distance describes the monitoring location, not the precision of an inferred reading at the user's suburb. Source timestamps represent the end of each one-hour observation interval, separately from backend retrieval time.

The EPA provider key stays in Sites. The prepared collector would use a separate Actions Secret to reach that private backend and publish only validated station fields. The browser reads the public JSON snapshot and chooses a station locally, without sending coordinates or credentials to Sites. Do not put API keys in `VITE_*` variables or public JavaScript. See [backend configuration and live-access gates](backend.md).

## Transport: public directory and credential-gated PTV board

Verified official destinations:

- [Departure information](https://transport.vic.gov.au/departures)
- [Journey Planner](https://transport.vic.gov.au/journey)
- [PTV Network Status](https://networkstatus.ptv.vic.gov.au/)
- [Disruptions and planned works](https://transport.vic.gov.au/disruptions/disruptions-information)
- [Yarra Trams service changes](https://yarratrams.com.au/service-changes)
- [VicTraffic road information](https://traffic.transport.vic.gov.au/)

[GTFS Schedule](https://opendata.transport.vic.gov.au/dataset/gtfs-schedule) provides public static timetables for Victorian trains, trams and buses. It normally updates weekly or as needed and covers a rolling 30 days. The published directory uses serving Metro train/tram stops within latitude -38.6 to -37.3 and longitude 144.3 to 145.7. It retains distinct platforms, tram boarding points and named rail-replacement boarding points. The initial 2,165 records are not a count of named stations. They enable local search and up to six saved stop selections without a key, but supply no departures or realtime status.

The [weekly refresh workflow](../.github/workflows/refresh-transit-stops.yml) uses the official archive's Last-Modified time and publishes only the compact validated directory. It explicitly dispatches Pages after a changed-data commit. Scheduled collection can be delayed; the source timestamp and successful deployment determine the actual snapshot age. See [directory maintenance](transit-directory.md).

The implemented live board uses [PTV Timetable API v3](https://www.vic.gov.au/public-transport-timetable-api), whose [official Swagger contract](https://timetableapi.ptv.vic.gov.au/swagger/docs/v3) documents signed requests and `gtfs=true` for GTFS stop IDs. Saved selections preserve their identifier scheme; PTV route/direction IDs are not assumed to equal GTFS route/direction IDs. The UI displays up to five upcoming services, distinct scheduled/estimated/cancelled states, and relevant active service alerts. Route/direction-specific favourites become selectable when that authenticated response is available.

PTV `checkedAt` records when the backend completed its lookup; it is not an upstream observation timestamp. The UI labels it “Checked”, polls every 30 seconds and hides the board and associated alerts after 120 seconds without a successful refresh. A missing live prediction is displayed as scheduled, not “on time”. Public upstream documentation and fixtures have been checked, but actual authenticated train/tram responses and production GTFS-to-PTV identity matching still need this project's credentials.

[GTFS Realtime](https://opendata.transport.vic.gov.au/dataset/gtfs-realtime) is an alternative integration, not the live backend implemented here. It requires a separate key. Its catalogue specifies a `KeyID` header and 24 calls per 60 seconds for each of Metro Train, Tram and Bus. Tram data refreshes every 60 seconds; train and bus data are described as near realtime. An unauthenticated Trip Updates request returned 401 during development. Some downloadable OpenAPI documents describe a different authentication header; these credentials must not be assumed interchangeable with PTV Timetable API credentials.

If a future version changes to GTFS Realtime, it must join the correct static trips/service days, including times past midnight, and preserve cancellations and scheduled fallbacks. Transport Victoria's [realtime information guide](https://transport.vic.gov.au/help-and-support/other-public-transport-help/real-time-information-in-journey-planner) also distinguishes live and timetable-only services. Transport attribution is “Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence.”

## Freshness and failure behavior

1. Preserve observation/valid time separately from retrieval time. Format display times in the Melbourne time zone.
2. Load, refresh and report failures independently for each feed.
3. Never substitute demo numbers for unavailable live data. Keep official destinations accessible.
4. Recalculate freshness as time passes and when a background tab becomes visible. Reject older responses that would replace a newer accepted result.
5. Hide expired values: weather after 90 minutes, UV and parking after 15 minutes, modeled air and individual EPA observations after three hours, and the PTV board after two minutes. These are product limits, not provider guarantees. The last two integrations still await live activation.
6. GitHub Actions builds/deploys the application and maintains the weekly stop directory. The prepared EPA snapshot job would publish on a best-effort 15-minute schedule, preserving original observation times; it does not provide minute-by-minute transit data.
