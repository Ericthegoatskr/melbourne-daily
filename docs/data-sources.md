# Data sources and coverage

Verified on 7 November 2026, in the Australia/Melbourne time zone. Melbourne Daily is a static GitHub Pages application. The browser requests public feeds directly; no API credentials are bundled. Application polling intervals below are product settings, not provider guarantees.

## Version 1

| Module           | Content                                                            | Coverage                                                         | Provider cadence / application polling                                                       |
| ---------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Weather          | Modeled current conditions, 24-hour forecast and three-day outlook | Forecast grid for the selected Melbourne suburb                  | Depends on the upstream model / every 15 minutes                                             |
| UV               | Observed UV index and separate modeled daily maximum               | ARPANSA Melbourne station; forecast grid for the selected suburb | Observations approximately every minute / every minute                                       |
| Parking          | Reporting sensor counts, available bays and street summaries       | Sensor-equipped City of Melbourne bays                           | Approximately two minutes in the original parking project's measurements / every two minutes |
| Modeled air      | PM2.5 and PM10 estimates                                           | CAMS Global grid, approximately 45 km                            | Model updates every 12 hours; native three-hourly output / every 30 minutes                  |
| EPA observations | Links to official measurements and guidance                        | EPA monitoring sites across Victoria                             | Hourly observations; regional forecasts at 5 pm for the next 24 hours                        |
| Public transport | Official departures, journey planning and service-update links     | Victorian public transport                                       | No live arrival or service-status feed is embedded in this version                           |

The air estimates are not EPA observations. Transport shortcuts open the official service rather than claiming that this application has retrieved its live operating status.

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

## EPA observations: authenticated integration remains separate

Sources: [EPA AirWatch](https://www.epa.vic.gov.au/check-air-and-water-quality), [developer portal](https://portal.api.epa.vic.gov.au/) and [air quality categories](https://www.epa.vic.gov.au/air-quality-categories).

EPA's developer portal requires registration, a product subscription and an API key. It lists a default rate limit of five requests per second. This project has no EPA subscription key, so authenticated payloads, CORS and individual pollutant fields have not been validated. The public AirWatch website is available through links in the application.

EPA reports hourly measurements and five categories: Good, Fair, Poor, Very Poor and Extremely Poor. Its regional forecast updates daily at 5 pm for the following 24 hours. Monitoring coverage and equipment availability differ by site and pollutant. Missing or stalled readings must remain unavailable, not be interpreted as Good.

A future integration needs authorised credentials and a backend that protects them. Validate each observation time and quality flag before displaying a station value. GitHub Pages does not provide secret storage for browser code: do not put API keys in `VITE_*` variables or public JavaScript.

## Transport: official destinations and future realtime integration

Verified official destinations:

- [Departure information](https://transport.vic.gov.au/departures)
- [Journey Planner](https://transport.vic.gov.au/journey)
- [PTV Network Status](https://networkstatus.ptv.vic.gov.au/)
- [Disruptions and planned works](https://transport.vic.gov.au/disruptions/disruptions-information)
- [Yarra Trams service changes](https://yarratrams.com.au/service-changes)
- [VicTraffic road information](https://traffic.transport.vic.gov.au/)

[GTFS Schedule](https://opendata.transport.vic.gov.au/dataset/gtfs-schedule) provides public static timetables for Victorian trains, trams and buses. It normally updates weekly or as needed and covers a rolling 30 days. Scheduled departures are not estimated arrivals.

[GTFS Realtime](https://opendata.transport.vic.gov.au/dataset/gtfs-realtime) requires a key. Its catalogue specifies a `KeyID` header and 24 calls per 60 seconds for each of Metro Train, Tram and Bus. Tram data refreshes every 60 seconds; train and bus data are described as near realtime. An unauthenticated Trip Updates request returned 401 during development. Some downloadable OpenAPI documents describe a different authentication header; validate this using an authorised key rather than assuming it is interchangeable with PTV Timetable API credentials.

Future arrivals require a correct GTFS-RT/static-GTFS join, service-day handling, cancellations and explicit fallback to scheduled information. Missing realtime data does not mean a service is on time. Transport Victoria's [realtime information guide](https://transport.vic.gov.au/help-and-support/other-public-transport-help/real-time-information-in-journey-planner) also distinguishes live and timetable-only services.

## Freshness and failure behavior

1. Preserve observation/valid time separately from retrieval time. Format display times in the Melbourne time zone.
2. Load, refresh and report failures independently for each feed.
3. Never substitute demo numbers for unavailable live data. Keep official destinations accessible.
4. Recalculate freshness as time passes and when a background tab becomes visible. Reject older responses that would replace a newer accepted result.
5. Hide expired values: weather after 90 minutes, UV and parking after 15 minutes, and modeled air after three hours. These are product limits, not provider guarantees.
6. GitHub Actions builds and deploys the application. Browser HTTPS requests fetch data; scheduled deployment jobs are not used as a minute-by-minute data collector.
