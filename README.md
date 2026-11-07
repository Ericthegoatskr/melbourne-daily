# Melbourne Daily

An English-language dashboard for everyday Melbourne: weather, UV, parking, regional air estimates and public transport in one place.

[Dashboard](https://ericthegoatskr.github.io/melbourne-daily/) · [Full parking dashboard](https://ericthegoatskr.github.io/melbourne-parking-dashboard/) · [Data sources](docs/data-sources.md) · [Release checklist](docs/remaining-scope.md)

GitHub Pages serves the revision from the latest successful deployment. **EPA station observations are live on the public homepage** through a validated JSON snapshot, with provider credentials kept out of the browser. PTV departures are implemented but remain unavailable until their credentials are configured.

## Dashboard collection style

The homepage uses a shared white-and-orange visual system with lavender, mint and peach summary cards. It includes an interactive hourly weather chart, keyboard and touch forecast selection, weather illustrations, finite entrance animations and feedback when readings change. Reduced-motion preferences disable animation. Summary cards preserve the same source times and expiry rules as their detailed panels.

The reusable theme is in `src/styles/tokens.css`; components and interaction rules are documented in the [visual system guide](docs/design-system.md). This release establishes the entrance page's style. The separate Parking Dashboard remains available at its existing link.

## Available without credentials

- A shared suburb selector, modeled current weather, a 24-hour forecast and a three-day outlook.
- ARPANSA's observed Melbourne UV index, separate from modeled daily maximum UV.
- City of Melbourne parking sensor totals and street summaries, with access to the existing parking map.
- CAMS Global PM2.5 and PM10 estimates, labeled as regional model values rather than EPA observations.
- Metro train and tram stop search using the official GTFS directory. Save up to six stop selections in the current browser, restore them on the next visit and remove them individually.
- Official departures, journey planning, network status, tram changes, EPA AirWatch and road-traffic links.
- Independent loading, retry, delayed and unavailable states, source timestamps, mobile navigation and keyboard-accessible controls.

The initial directory contains 2,165 boarding-point records, including individual platforms and opposite-side tram stops. It is a location directory, not a live timetable. A weekly update workflow refreshes it from the official source; stop counts can change.

## EPA observations and transport status

The transit board supports route/direction selection, separate direction favourites, up to five departures, live estimates versus scheduled times, metropolitan-train cancellations and service updates. PTV does not promise tram cancellation status. Direction choices come from an authorised PTV response; without that response, a local favourite keeps the stop with all directions.

A separate transport-only Worker is prepared for public access: it exposes only `/api/transit/departures`, including associated service updates, and accepts PTV runtime secrets. `VITE_TRANSIT_API_URL` independently selects its public origin. Requests send no credentials, refresh every 30 seconds and hide results after two minutes without a successful lookup. The endpoint is not yet activated: PTV credentials and authorised live validation are still required. The existing EPA backend remains private.

The EPA panel supports the nearest eligible monitoring station within 100 km of the chosen suburb, station distance, the provider's category, available hourly PM2.5/PM10 readings and each reading's timestamp. Model estimates remain a separate source. Missing or stale observations never become a “Good” category.

The EPA subscription key stays in Sites as a Secret. GitHub Actions uses a separately authorised `EPA_BACKEND_TOKEN` Secret to collect validated station data from the owner-private backend and publish the [public JSON snapshot](https://ericthegoatskr.github.io/melbourne-daily/data/epa-observations.json). At 17:16 AEDT on 7 November 2026, anonymous page and snapshot requests succeeded, and the public browser displayed current EPA categories and pollutant readings. `VITE_EPA_DATA_URL` points to the snapshot; `VITE_DATA_API_URL` remains unset, keeping unconfigured PTV polling off. See the [backend verification record](docs/backend.md).

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

Verification runs the tests, TypeScript checking and production builds. Preview serves the frontend production bundle.

## GitHub Pages and directory updates

The repository is `Ericthegoatskr/melbourne-daily`, with Vite's base path set to `/melbourne-daily/`. Pages uses **GitHub Actions** as its build and deployment source. [pages.yml](.github/workflows/pages.yml) verifies the project before deploying `dist/`.

[refresh-transit-stops.yml](.github/workflows/refresh-transit-stops.yml) runs weekly on Monday morning in Melbourne and can be started manually from Actions. It collects and validates the Metro train/tram directory, commits only `public/data/transport-stops.json` when the source or records change, then explicitly dispatches the Pages workflow. GitHub does not trigger a push workflow from a normal `GITHUB_TOKEN` push, so this dispatch is necessary. See [GitHub's workflow-trigger documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Scheduled runs are best effort and can be delayed or disabled for an inactive public repository. A failed collection preserves the last committed directory. Check both the refresh run and the subsequent Pages deployment; a successful commit alone does not publish the update. See [directory maintenance](docs/transit-directory.md).

Live public feeds are requested in the browser. The EPA snapshot workflow is configured on a separate 15-minute schedule, with the same best-effort scheduling limits. The weekly stop job maintains metadata and does not collect minute-by-minute transit predictions.

## Project layout

```text
src/App.tsx                    Dashboard and navigation
src/components/CommutePanel.tsx Stop search, local favourites and departure board
src/components/EpaPanel.tsx     Nearby station observations and unavailable state
src/lib/                       Feed validation, location matching and freshness
shared/                        Explicit frontend/backend data contracts
server/                        Canonical PTV, EPA and API gateway source
scripts/build-api.mjs           Build the API worker from this repository
scripts/build-transit-api.mjs   Build the separate transport-only API worker
scripts/update-transit-stops.py Collect the public GTFS stop directory
public/data/transport-stops.json Published train/tram boarding-point directory
public/data/zone-crosswalk.json Parking zone-to-street mapping
docs/                          Source register, deployment and acceptance records
```

The sibling `melbourne-daily-api` directory is generated Sites hosting scaffolding. Edit backend behavior in this repository's `server/` and `shared/` files, then rebuild the hosting artifact. It is not a second canonical implementation.

## Data and privacy

Suburb selection, saved stops/directions and pinned shortcuts stay in this browser's local storage. There is no account system or cross-device sync. Public feeds are requested from their providers. For EPA, the browser downloads public station data and selects its nearest station locally, sending no location query or credential to the private backend. The EPA provider key stays in Sites; the separate service-access credential is stored only as an Actions Secret. A future transport connection would send selected stop queries to its backend.

Open-Meteo's free API is for non-commercial use. Data credit includes Open-Meteo, CAMS / Copernicus Atmosphere Monitoring Service and City of Melbourne. Transport data is licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence. **UV observations courtesy of ARPANSA.** Read the [ARPANSA UV data disclaimer](https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information#Disclaimer).

ARPANSA asks developers to notify it of applications using the UV feed. The maintainer should send the deployed application URL to `uv.index@arpansa.gov.au`; this development workflow has not sent that notification. Review provider terms before adding advertising or commercial features. See the [source register](docs/data-sources.md).

This is an independent project, unaffiliated with the data providers. Sensor availability does not establish parking permission; check the signs at the bay.
