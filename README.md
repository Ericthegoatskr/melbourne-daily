# Melbourne Daily

An English-language dashboard for everyday Melbourne: weather, UV, parking, regional air estimates and public transport in one place.

[Dashboard](https://ericthegoatskr.github.io/melbourne-daily/) · [Weather & UV dashboard](https://ericthegoatskr.github.io/melbourne-daily/weather.html) · [EPA air-quality dashboard](https://ericthegoatskr.github.io/melbourne-daily/air.html) · [PTV transport dashboard](https://ericthegoatskr.github.io/melbourne-daily/transport.html) · [Full parking dashboard](https://ericthegoatskr.github.io/melbourne-parking-dashboard/) · [Data sources](docs/data-sources.md) · [Release checklist](docs/remaining-scope.md)

GitHub Pages serves the revision from the latest successful deployment. **EPA station observations are live on the public homepage** through a validated JSON snapshot, with provider credentials kept out of the browser. **PTV departures and service updates are live on the homepage and transport page**, using a separate public read service configured through `VITE_TRANSIT_API_URL`; provider credentials remain runtime Secrets.

## Dashboard collection style

The homepage uses the collection's navy frame with destination-themed summary cards and dashboard entry surfaces: sunset for weather/UV, walnut/amber for parking, forest/mint for air quality, and indigo/iris for transport. It includes an interactive hourly weather chart, keyboard and touch forecast selection, weather illustrations, finite entrance animations and feedback when readings change. Reduced-motion preferences disable animation. Summary cards preserve the same source times and expiry rules as their detailed panels.

The [Weather & UV dashboard](https://ericthegoatskr.github.io/melbourne-daily/weather.html) gives weather its own destination, linked from the homepage weather card. It shares the suburb preference, forecast interaction, weather artwork and reading-change animation with the homepage. Its dedicated layout adds current-weather metric tiles, an hourly model UV chart and a sunrise/sunset panel. Observed station UV stays separate from forecast UV, and expired readings remain hidden.

The [EPA air-quality dashboard](https://ericthegoatskr.github.io/melbourne-daily/air.html) is linked from the homepage air card. It adds a dedicated view of the provider's category and hourly PM2.5 / PM10 measurements, plus a searchable list of reporting stations within 100 km of the selected suburb. The nearest reporting station is selected by default; selecting another station changes the readings, and “Use nearest station” restores the default. If the selected station no longer has recent observations, the page explains the fallback to the nearest reporting station. Regional model estimates remain in a separate panel.

The [PTV transport dashboard](https://ericthegoatskr.github.io/melbourne-daily/transport.html) shares the homepage's train, tram and bus stop search and saved selections. Its dedicated workspace separates stop selection, departures and service updates. Its enabled PTV connection supplies live estimates where available, scheduled services and associated service updates. Train boards cover all station platforms; tram and bus boards can include both directions, and bus bay selections can resolve to an interchange-wide PTV board. Use route/direction filters and confirm the actual platform, bus bay or side of the road for the chosen service. Official transport links remain available, and the decorative tram illustration does not represent a live service or route.

The homepage and transport page also share a nearby-stop finder. **Find a destination** searches Greater Melbourne addresses and landmarks through public Vicmap services after submission, with City of Melbourne data retained for central-city results. Include the suburb, for example **8 Arnold Street Box Hill**. The 24 bundled landmark choices also work without a search request. Search is filtered to Melbourne's 31 metropolitan council areas; simplified boundaries make results near the edges approximate. **Use my current location** remains available as a separate, one-time browser location request. Either chosen centre is matched against the local stop directory. Choose All, Trains, Trams or Buses and a 1, 2 or 5 km radius (2 km by default); up to 12 results appear in distance order. Train platforms are grouped into nearby station results, while opposite-side tram and bus boarding points remain separate. Distances are approximate straight-line distances to mapped stop points, not walking routes or station entrances. Choosing a stop opens the existing departure board; changing the search centre or filters never chooses a stop automatically. **Show stop map** optionally loads a street map with the destination, search radius and numbered T/R/B markers for trains, trams and buses matching the distance list. Marker selection updates the board without pulling the user away from the map; its **View departures & walking directions** action opens the selected-stop panel. A valid destination can have no matching stop within the selected radius; try another mode or a wider radius. Regional rail, coaches and SkyBus remain outside this directory. See [nearby matching and checks](docs/transit-directory.md#nearby-stop-matching).

After choosing a stop through nearby results, name search or a saved favourite, open **Google Maps** or **Apple Maps** for walking directions. Both links use the selected stop's public coordinates and work even when its live PTV board is unavailable. They leave the starting point to the maps provider and never include the device location or a key. The walking destination stays the selected mapped platform or boarding point, even when PTV returns a wider station/interchange board. Confirm the route, direction and boarding bay or side of the street before walking; a map point does not establish a step-free route. See [walking directions](docs/transit-directory.md#walking-directions).

The reusable theme is in `src/styles/tokens.css`; components and interaction rules are documented in the [visual system guide](docs/design-system.md). The homepage, weather, air-quality and transport pages and separate Parking Dashboard use the same collection style. Dedicated layout rules are scoped in `src/WeatherDashboard.css`, `src/AirDashboard.css` and `src/TransportDashboard.css`.

Each destination has its own featured palette: **Home — Navy & coral**, **Parking — Walnut & amber**, **Weather & UV — Sunset glow**, **Air quality — Forest & mint**, and **Transport — Indigo & iris**. Use **Colour theme** in the sidebar/mobile menu to restore Original light. That featured/light preference persists across the five dashboards; each page retains its own identity when featured colours are enabled.

Shared palette roles are in `src/styles/palette-tokens.css` and the navigation frame is in `src/styles/navy-theme.css`. Each HTML entry declares `data-page` and applies the saved preference before paint. UV risk, EPA categories and parking availability retain their semantic colours and text labels.

Homepage `data-entry` attributes reuse those same destination palette roles. The featured treatment follows the shared Colour theme preference; Original light remains available. Summary cards keep their existing page-section anchors, dashboard links keep their destinations, and provider links retain their source attribution and opening behaviour.

Every dashboard has the same series navigation: Home, Parking, Weather & UV, Air quality and Transport. Desktop sidebars separate those page destinations from the current page's section anchors. On mobile, a fixed five-item bottom bar provides direct switching, with space for the device safe area and the page footer. The bottom bar hides while the navigation drawer is open; the drawer traps keyboard focus, closes with Escape and restores focus to its menu button. The current dashboard is identified with `aria-current="page"`.

## Available without credentials

- A shared suburb selector, modeled current weather, a 24-hour forecast and a three-day outlook.
- ARPANSA's observed Melbourne UV index, separate from modeled daily maximum UV.
- A dedicated weather page with hourly model UV, sunrise, sunset and elapsed daylight based on the selected suburb's forecast.
- City of Melbourne parking sensor totals and street summaries, with access to the existing parking map.
- CAMS Global PM2.5 and PM10 estimates, labeled as regional model values rather than EPA observations.
- Metro train, tram and public bus stop search using the official GTFS directory. Save up to six stop selections in the current browser, restore them on the next visit and remove them individually.
- Nearby train stations, tram stops and bus boarding points around a chosen destination, bundled landmark or one-time location, with distance matching, mode/radius filters and an optional linked map.
- Google Maps and Apple Maps walking directions for the selected train, tram or bus boarding point, using its public mapped destination.
- Official departures, journey planning, network status, tram changes, EPA AirWatch and road-traffic links.
- Independent loading, retry, delayed and unavailable states, source timestamps, mobile navigation and keyboard-accessible controls.

The 9 November 2026 directory contains 21,135 boarding-point records: 541 train, 1,624 tram and 18,970 bus records. Bus points come from the Myki Bus and Regional Bus GTFS archives, filtered to Melbourne’s 31 metropolitan council areas. Individual platforms and opposite-side tram/bus stops retain their own identities. It is a location directory, not a live timetable. A weekly update workflow refreshes it from the official source; stop counts can change.

## EPA observations and transport status

The transit board supports route/direction selection, separate direction favourites, up to five departures, live estimates versus scheduled times, metropolitan-train cancellations and service updates. PTV does not promise tram or bus cancellation coverage. Bus predictions are shown only where supplied; otherwise the board explicitly shows scheduled times. Dedicated Night Bus services use a separate PTV route type and are not included in the regular-bus board. Direction choices come from an authorised PTV response; without that response, a local favourite keeps the stop with all directions.

A separate transport-only Worker serves public data: it exposes only `/api/transit/departures`, including associated service updates, and accepts PTV runtime secrets. `VITE_TRANSIT_API_URL` independently selects its public origin. Requests send no credentials, refresh every 30 seconds and hide results after two minutes without a successful lookup. The endpoint is `https://melbourne-transit-api-eric.boundlessforge.chatgpt.site`. Anonymous train/tram requests and route/direction filtering passed on 9 November 2026. The existing EPA backend remains private.

The EPA panel supports the nearest eligible monitoring station within 100 km of the chosen suburb, station distance, the provider's category, available hourly PM2.5/PM10 readings and each reading's timestamp. The dedicated air-quality page uses the same eligibility rules for its station list and manual selection. Each field becomes delayed after 90 minutes and is hidden after 180 minutes independently of the other fields. A newer complete snapshot can withdraw a previous category or measurement. Model estimates remain a separate source. Missing or stale observations never become a “Good” category, and a measured zero stays zero.

The EPA subscription key stays in Sites as a Secret. GitHub Actions uses a separately authorised `EPA_BACKEND_TOKEN` Secret to collect validated station data from the owner-private backend and publish the [public JSON snapshot](https://ericthegoatskr.github.io/melbourne-daily/data/epa-observations.json). At 17:16 AEDT on 7 November 2026, anonymous page and snapshot requests succeeded, and the public browser displayed current EPA categories and pollutant readings. `VITE_EPA_DATA_URL` points to the snapshot; `VITE_DATA_API_URL` remains unset. PTV uses its separate public transport origin; the private service-access token is never included in frontend requests. See the [backend verification record](docs/backend.md).

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

For transport-page changes, check train/tram/bus search, saved-stop restoration, directory failure/retry, mobile navigation and official links. Without a configured connection, both live panels must stay awaiting activation and make no transit API request. With local test fixtures, check selected-stop changes, live versus scheduled departures, service-update details and the two-minute expiry of both panels. Test fixtures must not be published. PTV credentials remain backend secrets; public frontend configuration contains only the transport service origin.

For nearby-stop changes, check the homepage and transport page at desktop and narrow mobile sizes, including keyboard use. Test an accurate location, each mode/radius filter, train-platform grouping, separate tram and bus boarding points and no nearby coverage. Check denial, unavailable location, timeout, unsupported/insecure contexts, accuracy worse than 1 km and expiry after ten minutes. Cancel or clear during a request, refresh again and navigate away to check that late callbacks cannot restore cleared or obsolete results. A location failure or clear must preserve the selected board, favourites and text search. Inspect the page URL, browser storage and PTV requests: device coordinates must stay out of all three. The optional map shares its viewed area with the tile provider only after opening. Only explicitly choosing a result may change the board's stop/mode and existing route/direction request. The [directory guide](docs/transit-directory.md#nearby-stop-manual-qa) has the detailed checks.

For destinations and maps, test submitted suburban addresses and landmarks, bundled choices, partial/failed results, pending-search cancellation and device-location races. Check the Greater Melbourne boundary, suburb-qualified labels, out-of-area result rejection, numbered list/marker identity, explicit map loading, keyboard selection and mobile scrolling. Destination changes must preserve the board until a stop is chosen. See [destination and map QA](docs/transit-directory.md#destination-and-map-manual-qa).

For walking directions, check both page entries and selection paths. Links must update to the selected stop, request walking mode, omit the origin and credentials, and remain available when PTV data fails. Check keyboard focus, new-tab disclosure and touch targets of at least 44 px on narrow screens. Opening a map must preserve the dashboard selection and board.

## GitHub Pages and directory updates

The repository is `Ericthegoatskr/melbourne-daily`, with Vite's base path set to `/melbourne-daily/`. Its multi-page build emits `index.html`, `weather.html`, `air.html` and `transport.html`. Pages uses **GitHub Actions** as its build and deployment source. [pages.yml](.github/workflows/pages.yml) verifies the project before deploying `dist/`.

[refresh-transit-stops.yml](.github/workflows/refresh-transit-stops.yml) runs weekly on Monday morning in Melbourne and can be started manually from Actions. It collects and validates the Metro train, tram and public bus directory, commits only `public/data/transport-stops.json` when the source or records change, then explicitly dispatches the Pages workflow. GitHub does not trigger a push workflow from a normal `GITHUB_TOKEN` push, so this dispatch is necessary. See [GitHub's workflow-trigger documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Scheduled runs are best effort and can be delayed or disabled for an inactive public repository. A failed collection preserves the last committed directory. Check both the refresh run and the subsequent Pages deployment; a successful commit alone does not publish the update. See [directory maintenance](docs/transit-directory.md).

Live public feeds are requested in the browser. The EPA snapshot workflow is configured on a separate 15-minute schedule, with the same best-effort scheduling limits. The weekly stop job maintains metadata and does not collect minute-by-minute transit predictions.

## Project layout

```text
src/App.tsx                    Dashboard and navigation
src/WeatherApp.tsx             Dedicated weather/UV page and independent feed state
src/WeatherDashboard.css       Scoped weather-page layout and finite motion
src/AirApp.tsx                 Dedicated EPA page, station selection and model state
src/AirDashboard.css           Scoped air-quality layout and finite motion
src/TransportApp.tsx           Dedicated transport page and live departure status
src/TransportDashboard.css     Scoped transport-page layout and finite motion
src/components/Forecast.tsx    Shared hourly chart and three-day forecast
src/components/WeatherUVPanel.tsx Observed UV, model UV chart and daylight panel
src/components/AirReadings.tsx EPA category, pollutant and regional-model cards
src/styles/tokens.css          Collection colour, surface and motion tokens
src/components/CommutePanel.tsx Shared stop search, favourites, departures and updates
src/components/NearbyStops.tsx Shared destination/location centre, nearby-stop results and selection
src/components/TransitDestinationSearch.tsx Submitted place search and bundled landmarks
src/components/DeferredTransitStopMap.tsx Optional linked stop map, loaded on demand
src/components/CollectionNav.tsx Shared series links and mobile page switching
src/lib/useNavigationDrawer.ts Shared drawer focus, scroll lock and breakpoint cleanup
src/components/EpaPanel.tsx     Nearby station observations and unavailable state
src/lib/                       Feed validation, location matching and freshness
shared/                        Explicit frontend/backend data contracts
server/                        Canonical PTV, EPA and API gateway source
scripts/build-api.mjs           Build the API worker from this repository
scripts/build-transit-api.mjs   Build the separate transport-only API worker
scripts/update-transit-stops.py Collect the public GTFS stop directory
public/data/transport-stops.json Published train/tram/bus boarding-point directory
public/data/zone-crosswalk.json Parking zone-to-street mapping
docs/                          Source register, deployment and acceptance records
```

The sibling `melbourne-daily-api` directory is generated Sites hosting scaffolding. Edit backend behavior in this repository's `server/` and `shared/` files, then rebuild the hosting artifact. It is not a second canonical implementation.

## Data and privacy

Suburb selection, saved stops/directions and pinned shortcuts stay in this browser's local storage. There is no account system or cross-device sync. Public feeds are requested from their providers. For EPA, the browser downloads public station data and handles nearest-station matching, searching and manual selection locally, sending no location query or credential to the private backend. The EPA provider key stays in Sites; the separate service-access credential is stored only as an Actions Secret. The dedicated air-quality page uses this same private-backend → Actions collector → validated public snapshot path. The transport connection sends the selected stop, mode and optional route/direction IDs to its public read endpoint; it sends no provider key or private service-access credential.

Device location is separate from the saved suburb and stop preferences. The nearby-stop finder calls `getCurrentPosition` only after a user action; it does not track movement with `watchPosition`. Coordinates, reported accuracy and capture time stay in page memory and are not added to the page URL, browser storage or PTV requests. The optional map loads only after **Show stop map**; OpenStreetMap tile requests reveal the viewed area to its tile provider, as disclosed before loading. The finder shows the accuracy and capture time, rejects fixes with accuracy worse than 1,000 m, and hides results once the fix is ten minutes old until the user refreshes it. Clearing the location removes nearby results without changing the selected departure board or saved stops. Selecting a nearby result passes its original GTFS stop identity into the same public PTV board flow; device coordinates are not sent to that service. PTV keys remain backend Secrets, and the EPA backend remains private.

Submitted destination queries go directly to Victorian Government Vicmap services, including Esri-hosted landmark data, and City of Melbourne open data. These public services require no application API key. Typing and choosing a bundled landmark make no destination-service request; device coordinates are not included in destination queries. Destination selection is temporary page state; starting location discovery clears it and abandons pending searches. The Leaflet map loads on demand with OpenStreetMap attribution, without an additional key. Maps and destination search do not change either backend or expose PTV/EPA credentials. Destination points and landmark centroids are reference locations, not verified entrances.

Walking directions remain ordinary external HTTPS links with no new API credential. Only the selected stop's public destination is included. Google Maps or Apple Maps handles the route, starting point and any location permission in its own website or app after the link is opened.

Open-Meteo's free API is for non-commercial use. Data credit includes Open-Meteo, CAMS / Copernicus Atmosphere Monitoring Service and City of Melbourne. Transport data is licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence. **UV observations courtesy of ARPANSA.** Read the [ARPANSA UV data disclaimer](https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information#Disclaimer).

ARPANSA asks developers to notify it of applications using the UV feed. The maintainer should send the deployed application URL to `uv.index@arpansa.gov.au`; this development workflow has not sent that notification. Review provider terms before adding advertising or commercial features. See the [source register](docs/data-sources.md).

This is an independent project, unaffiliated with the data providers. Sensor availability does not establish parking permission; check the signs at the bay.
