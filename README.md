# Melbourne Daily

An English-language dashboard for everyday Melbourne: weather, UV, parking, regional air estimates and public transport in one place.

[Dashboard](https://ericthegoatskr.github.io/melbourne-daily/) · [Weather & UV dashboard](https://ericthegoatskr.github.io/melbourne-daily/weather.html) · [EPA air-quality dashboard](https://ericthegoatskr.github.io/melbourne-daily/air.html) · [PTV transport dashboard](https://ericthegoatskr.github.io/melbourne-daily/transport.html) · [Full parking dashboard](https://ericthegoatskr.github.io/melbourne-parking-dashboard/) · [Data sources](docs/data-sources.md) · [Release checklist](docs/remaining-scope.md)

GitHub Pages serves the revision from the latest successful deployment. **EPA station observations are live on the public homepage** through a validated JSON snapshot, with provider credentials kept out of the browser. PTV departures are implemented but remain unavailable until their credentials are configured.

## Dashboard collection style

The homepage uses a shared white-and-orange visual system with lavender, mint and peach summary cards. It includes an interactive hourly weather chart, keyboard and touch forecast selection, weather illustrations, finite entrance animations and feedback when readings change. Reduced-motion preferences disable animation. Summary cards preserve the same source times and expiry rules as their detailed panels.

The [Weather & UV dashboard](https://ericthegoatskr.github.io/melbourne-daily/weather.html) gives weather its own destination, linked from the homepage weather card. It shares the suburb preference, forecast interaction, weather artwork and reading-change animation with the homepage. Its dedicated layout adds current-weather metric tiles, an hourly model UV chart and a sunrise/sunset panel. Observed station UV stays separate from forecast UV, and expired readings remain hidden.

The [EPA air-quality dashboard](https://ericthegoatskr.github.io/melbourne-daily/air.html) is linked from the homepage air card. It adds a dedicated view of the provider's category and hourly PM2.5 / PM10 measurements, plus a searchable list of reporting stations within 100 km of the selected suburb. The nearest reporting station is selected by default; selecting another station changes the readings, and “Use nearest station” restores the default. If the selected station no longer has recent observations, the page explains the fallback to the nearest reporting station. Regional model estimates remain in a separate panel.

The [PTV transport dashboard](https://ericthegoatskr.github.io/melbourne-daily/transport.html) shares the homepage's train/tram stop search and saved selections. Its dedicated workspace separates stop selection, departures and service updates. Stop search and local favourites work now; live departures and service updates clearly show “Awaiting activation” until the PTV connection is enabled. Official transport links remain available, and the decorative tram illustration does not represent a live service or route.

The reusable theme is in `src/styles/tokens.css`; components and interaction rules are documented in the [visual system guide](docs/design-system.md). The homepage, weather, air-quality and transport pages and separate Parking Dashboard use the same collection style. Dedicated layout rules are scoped in `src/WeatherDashboard.css`, `src/AirDashboard.css` and `src/TransportDashboard.css`.

Navy (`#14213D`), cream (`#F4EDE0`) and coral (`#FF6B5B`) are the default palette. Use **Colour theme** in the sidebar/mobile menu to compare the original light style. The choice persists across all five dashboards on this browser. The shared override is `src/styles/navy-theme.css`; data-state colours and all existing functions remain independent of this preference.

The Weather & UV destination uses a dedicated **Sunset glow** palette with deep plum, berry, warm gold and orange. Its theme switch still restores Original light; the other destinations retain their navy palette. UV category badges and the risk scale are not recoloured by the theme.

Every dashboard has the same series navigation: Home, Parking, Weather & UV, Air quality and Transport. Desktop sidebars separate those page destinations from the current page's section anchors. On mobile, a fixed five-item bottom bar provides direct switching, with space for the device safe area and the page footer. The bottom bar hides while the navigation drawer is open; the drawer traps keyboard focus, closes with Escape and restores focus to its menu button. The current dashboard is identified with `aria-current="page"`.

## Available without credentials

- A shared suburb selector, modeled current weather, a 24-hour forecast and a three-day outlook.
- ARPANSA's observed Melbourne UV index, separate from modeled daily maximum UV.
- A dedicated weather page with hourly model UV, sunrise, sunset and elapsed daylight based on the selected suburb's forecast.
- City of Melbourne parking sensor totals and street summaries, with access to the existing parking map.
- CAMS Global PM2.5 and PM10 estimates, labeled as regional model values rather than EPA observations.
- Metro train and tram stop search using the official GTFS directory. Save up to six stop selections in the current browser, restore them on the next visit and remove them individually.
- Official departures, journey planning, network status, tram changes, EPA AirWatch and road-traffic links.
- Independent loading, retry, delayed and unavailable states, source timestamps, mobile navigation and keyboard-accessible controls.

The initial directory contains 2,165 boarding-point records, including individual platforms and opposite-side tram stops. It is a location directory, not a live timetable. A weekly update workflow refreshes it from the official source; stop counts can change.

## EPA observations and transport status

The transit board supports route/direction selection, separate direction favourites, up to five departures, live estimates versus scheduled times, metropolitan-train cancellations and service updates. PTV does not promise tram cancellation status. Direction choices come from an authorised PTV response; without that response, a local favourite keeps the stop with all directions.

A separate transport-only Worker is prepared for public access: it exposes only `/api/transit/departures`, including associated service updates, and accepts PTV runtime secrets. `VITE_TRANSIT_API_URL` independently selects its public origin. Requests send no credentials, refresh every 30 seconds and hide results after two minutes without a successful lookup. The endpoint is not yet activated: PTV credentials and authorised live validation are still required. The existing EPA backend remains private.

The EPA panel supports the nearest eligible monitoring station within 100 km of the chosen suburb, station distance, the provider's category, available hourly PM2.5/PM10 readings and each reading's timestamp. The dedicated air-quality page uses the same eligibility rules for its station list and manual selection. Each field becomes delayed after 90 minutes and is hidden after 180 minutes independently of the other fields. A newer complete snapshot can withdraw a previous category or measurement. Model estimates remain a separate source. Missing or stale observations never become a “Good” category, and a measured zero stays zero.

The EPA subscription key stays in Sites as a Secret. GitHub Actions uses a separately authorised `EPA_BACKEND_TOKEN` Secret to collect validated station data from the owner-private backend and publish the [public JSON snapshot](https://ericthegoatskr.github.io/melbourne-daily/data/epa-observations.json). At 17:16 AEDT on 7 November 2026, anonymous page and snapshot requests succeeded, and the public browser displayed current EPA categories and pollutant readings. `VITE_EPA_DATA_URL` points to the snapshot; `VITE_DATA_API_URL` remains unset, keeping unconfigured PTV polling off. See the [backend verification record](docs/backend.md).

## Run locally

Use Node.js 22.23.x and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, including `/melbourne-daily/`. No environment variables are required for the public feeds and local stop directory.

The dedicated weather, air-quality and transport pages are at `/melbourne-daily/weather.html`, `/melbourne-daily/air.html` and `/melbourne-daily/transport.html` on the same local server. EPA observations use the existing public-snapshot configuration described above; no provider key belongs in local browser configuration. The transport page needs no credentials for its stop directory or local favourites.

```sh
npm run verify
npm run preview
```

Verification runs the tests, TypeScript checking and production builds. Preview serves the frontend production bundle.

For collection-navigation changes, test all five destinations from each page, current-page highlighting, same-tab navigation and browser Back. Check desktop and narrow mobile layouts, drawer keyboard focus, Escape, scroll locking and resizing back to desktop. Confirm the mobile bar does not cover content, parking-map controls or the footer. The Daily and Parking repositories carry the same navigation contract; update and deploy both when changing it.

For weather-page changes, also inspect desktop and narrow mobile layouts in the production preview. Check suburb switching, hourly/daily forecast controls, keyboard hour selection, mobile navigation, independent weather/UV failures and expiry. Verify that a valid observed UV of zero remains visible, while missing hourly UV stays unavailable.

For air-quality changes, check desktop and narrow mobile layouts, station search and selection, “Use nearest station”, and the fallback when a selected station stops reporting. Exercise partial missing fields, valid zero readings, delayed and expired observations, and a newer snapshot withdrawing a previously displayed category or measurement. EPA and regional-model failures must remain independent. Confirm the published frontend reads the public snapshot and contains no provider key or private-backend access token.

For transport-page changes, check train/tram search, saved-stop restoration, directory failure/retry, mobile navigation and official links. Without a configured connection, both live panels must stay awaiting activation and make no transit API request. With local test fixtures, check selected-stop changes, live versus scheduled departures, service-update details and the two-minute expiry of both panels. Test fixtures must not be published. PTV credentials remain backend secrets; public frontend configuration contains only the transport service origin.

## GitHub Pages and directory updates

The repository is `Ericthegoatskr/melbourne-daily`, with Vite's base path set to `/melbourne-daily/`. Its multi-page build emits `index.html`, `weather.html`, `air.html` and `transport.html`. Pages uses **GitHub Actions** as its build and deployment source. [pages.yml](.github/workflows/pages.yml) verifies the project before deploying `dist/`.

[refresh-transit-stops.yml](.github/workflows/refresh-transit-stops.yml) runs weekly on Monday morning in Melbourne and can be started manually from Actions. It collects and validates the Metro train/tram directory, commits only `public/data/transport-stops.json` when the source or records change, then explicitly dispatches the Pages workflow. GitHub does not trigger a push workflow from a normal `GITHUB_TOKEN` push, so this dispatch is necessary. See [GitHub's workflow-trigger documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Scheduled runs are best effort and can be delayed or disabled for an inactive public repository. A failed collection preserves the last committed directory. Check both the refresh run and the subsequent Pages deployment; a successful commit alone does not publish the update. See [directory maintenance](docs/transit-directory.md).

Live public feeds are requested in the browser. The EPA snapshot workflow is configured on a separate 15-minute schedule, with the same best-effort scheduling limits. The weekly stop job maintains metadata and does not collect minute-by-minute transit predictions.

## Project layout

```text
src/App.tsx                    Dashboard and navigation
src/WeatherApp.tsx             Dedicated weather/UV page and independent feed state
src/WeatherDashboard.css       Scoped weather-page layout and finite motion
src/AirApp.tsx                 Dedicated EPA page, station selection and model state
src/AirDashboard.css           Scoped air-quality layout and finite motion
src/TransportApp.tsx           Dedicated transport page and pending-live status
src/TransportDashboard.css     Scoped transport-page layout and finite motion
src/components/Forecast.tsx    Shared hourly chart and three-day forecast
src/components/WeatherUVPanel.tsx Observed UV, model UV chart and daylight panel
src/components/AirReadings.tsx EPA category, pollutant and regional-model cards
src/styles/tokens.css          Collection colour, surface and motion tokens
src/components/CommutePanel.tsx Shared stop search, favourites, departures and updates
src/components/CollectionNav.tsx Shared series links and mobile page switching
src/lib/useNavigationDrawer.ts Shared drawer focus, scroll lock and breakpoint cleanup
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

Suburb selection, saved stops/directions and pinned shortcuts stay in this browser's local storage. There is no account system or cross-device sync. Public feeds are requested from their providers. For EPA, the browser downloads public station data and handles nearest-station matching, searching and manual selection locally, sending no location query or credential to the private backend. The EPA provider key stays in Sites; the separate service-access credential is stored only as an Actions Secret. The dedicated air-quality page uses this same private-backend → Actions collector → validated public snapshot path. A future transport connection would send selected stop queries to its backend.

Open-Meteo's free API is for non-commercial use. Data credit includes Open-Meteo, CAMS / Copernicus Atmosphere Monitoring Service and City of Melbourne. Transport data is licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence. **UV observations courtesy of ARPANSA.** Read the [ARPANSA UV data disclaimer](https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information#Disclaimer).

ARPANSA asks developers to notify it of applications using the UV feed. The maintainer should send the deployed application URL to `uv.index@arpansa.gov.au`; this development workflow has not sent that notification. Review provider terms before adding advertising or commercial features. See the [source register](docs/data-sources.md).

This is an independent project, unaffiliated with the data providers. Sensor availability does not establish parking permission; check the signs at the bay.
