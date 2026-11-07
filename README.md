# Melbourne Daily

An English-language dashboard for everyday Melbourne: weather, UV, parking, regional air estimates and public transport in one place.

[Dashboard](https://ericthegoatskr.github.io/melbourne-daily/) · [Full parking dashboard](https://ericthegoatskr.github.io/melbourne-parking-dashboard/) · [Data sources](docs/data-sources.md) · [Release checklist](docs/remaining-scope.md)

GitHub Pages serves the revision from the latest successful deployment. The frontend works without provider credentials. Embedded PTV departures and EPA station observations are implemented and tested, but **are not activated on the public frontend yet**. Live EPA categories and hourly PM2.5/PM10 readings have been verified through the private backend. PTV credentials remain pending.

## Available without credentials

- A shared suburb selector, modeled current weather, a 24-hour forecast and a three-day outlook.
- ARPANSA's observed Melbourne UV index, separate from modeled daily maximum UV.
- City of Melbourne parking sensor totals and street summaries, with access to the existing parking map.
- CAMS Global PM2.5 and PM10 estimates, labeled as regional model values rather than EPA observations.
- Metro train and tram stop search using the official GTFS directory. Save up to six stop selections in the current browser, restore them on the next visit and remove them individually.
- Official departures, journey planning, network status, tram changes, EPA AirWatch and road-traffic links.
- Independent loading, retry, delayed and unavailable states, source timestamps, mobile navigation and keyboard-accessible controls.

The initial directory contains 2,165 boarding-point records, including individual platforms and opposite-side tram stops. It is a location directory, not a live timetable. A weekly update workflow refreshes it from the official source; stop counts can change.

## Implemented, awaiting public activation

The transit board supports route/direction selection, separate direction favourites, up to five departures, live estimates versus scheduled times, cancellations and service updates. Direction choices come from an authorised PTV response; without that response, a local favourite keeps the stop with all directions.

The EPA panel supports the nearest eligible monitoring station within 100 km of the chosen suburb, station distance, the provider's category, available hourly PM2.5/PM10 readings and each reading's timestamp. Model estimates remain a separate source. Missing or stale observations never become a “Good” category.

The EPA subscription key is stored as a backend Secret, and its `X-API-Key` authentication header is confirmed. On 7 November 2026, the private backend returned 93 station records, including current categories and hourly pollutant readings where available; an Alphington sample matched EPA's public website. PTV still needs its own credentials. Public activation also requires an authorised change to the backend's audience and end-to-end checks. The Sites backend remains owner-private and `VITE_DATA_API_URL` remains unset, so the public site shows unavailable states and official alternatives for these feeds. See the [backend verification record and release gates](docs/backend.md).

## Run locally

Use Node.js 22.23.x and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, including `/melbourne-daily/`. No environment variables are required for the public feeds and local stop directory.

```sh
npm run verify
npm run preview
```

Verification runs the tests, TypeScript checking, the frontend production build and the backend bundle build. Preview serves the frontend production bundle.

## GitHub Pages and directory updates

The repository is `Ericthegoatskr/melbourne-daily`, with Vite's base path set to `/melbourne-daily/`. Pages uses **GitHub Actions** as its build and deployment source. [pages.yml](.github/workflows/pages.yml) verifies the project before deploying `dist/`.

[refresh-transit-stops.yml](.github/workflows/refresh-transit-stops.yml) runs weekly on Monday morning in Melbourne and can be started manually from Actions. It collects and validates the Metro train/tram directory, commits only `public/data/transport-stops.json` when the source or records change, then explicitly dispatches the Pages workflow. GitHub does not trigger a push workflow from a normal `GITHUB_TOKEN` push, so this dispatch is necessary. See [GitHub's workflow-trigger documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Scheduled runs are best effort and can be delayed or disabled for an inactive public repository. A failed collection preserves the last committed directory. Check both the refresh run and the subsequent Pages deployment; a successful commit alone does not publish the update. See [directory maintenance](docs/transit-directory.md).

Live public feeds are requested in the browser. This weekly job maintains stop metadata; it does not collect minute-by-minute transit predictions.

## Project layout

```text
src/App.tsx                    Dashboard and navigation
src/components/CommutePanel.tsx Stop search, local favourites and departure board
src/components/EpaPanel.tsx     Nearby station observations and unavailable state
src/lib/                       Feed validation, location matching and freshness
shared/                        Explicit frontend/backend data contracts
server/                        Canonical PTV, EPA and API gateway source
scripts/build-api.mjs           Build the API worker from this repository
scripts/update-transit-stops.py Collect the public GTFS stop directory
public/data/transport-stops.json Published train/tram boarding-point directory
public/data/zone-crosswalk.json Parking zone-to-street mapping
docs/                          Source register, deployment and acceptance records
```

The sibling `melbourne-daily-api` directory is generated Sites hosting scaffolding. Edit backend behavior in this repository's `server/` and `shared/` files, then rebuild the hosting artifact. It is not a second canonical implementation.

## Data and privacy

Suburb selection, saved stops/directions and pinned shortcuts stay in this browser's local storage. There is no account system or cross-device sync. Public feeds are requested from their providers. Once enabled, the backend receives transit queries and selected coordinates for EPA requests; provider keys stay server-side.

Open-Meteo's free API is for non-commercial use. Data credit includes Open-Meteo, CAMS / Copernicus Atmosphere Monitoring Service and City of Melbourne. Transport data is licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence. **UV observations courtesy of ARPANSA.** Read the [ARPANSA UV data disclaimer](https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information#Disclaimer).

ARPANSA asks developers to notify it of applications using the UV feed. The maintainer should send the deployed application URL to `uv.index@arpansa.gov.au`; this development workflow has not sent that notification. Review provider terms before adding advertising or commercial features. See the [source register](docs/data-sources.md).

This is an independent project, unaffiliated with the data providers. Sensor availability does not establish parking permission; check the signs at the bay.
