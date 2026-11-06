# Melbourne Daily

An English-language dashboard for everyday Melbourne: weather, UV, street parking, regional air estimates and official transport links in one place.

[GitHub Pages target](https://ericthegoatskr.github.io/melbourne-daily/) · [Existing parking dashboard](https://ericthegoatskr.github.io/melbourne-parking-dashboard/) · [Data sources and limitations](docs/data-sources.md)

The application is deployed to the Pages URL by the repository's deployment workflow. A successful deployment run is required before that URL serves the current version.

## What is included

- Suburb selection with modeled current weather, a 24-hour forecast and a three-day outlook.
- ARPANSA's observed Melbourne UV index, kept separate from the daily UV forecast.
- City of Melbourne parking sensor totals and street summaries, with a link to the existing full parking map.
- CAMS Global PM2.5 and PM10 regional estimates, clearly distinguished from EPA station observations.
- Official departures, journey planning, network status, tram changes and road-traffic shortcuts. Favourite shortcuts are saved in the browser.
- Independent loading, retry, delayed and unavailable states, source timestamps, mobile navigation and keyboard-accessible controls.

Public transport arrivals and EPA station readings are available through the official links. Version 1 does not embed either authenticated API. Air estimates use an approximately 45 km model grid and are not a street-level reading or an EPA air-quality category.

## Run locally

Use Node.js 22.23.x, which was used for development and verification, and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, including the `/melbourne-daily/` path. No API keys or environment variables are needed for the included public feeds.

```sh
npm run verify
```

Verification runs Vitest tests, TypeScript checking and the production build. To inspect the production bundle locally:

```sh
npm run preview
```

## GitHub Pages

The repository targets `Ericthegoatskr/melbourne-daily`, with Vite's base path set to `/melbourne-daily/`. GitHub Pages should use **GitHub Actions** as its build and deployment source. The deployment workflow verifies the project, uploads `dist/` as a Pages artifact and deploys it.

For a different repository name, update `base` in `vite.config.ts` and the repository/site links before deployment. Keep the lockfile committed and use `npm ci` in CI for reproducible dependency installation. Runtime data requests happen in the browser and do not depend on scheduled Actions runs.

## Project layout

```text
src/App.tsx                 Dashboard and navigation
src/components/             Shared presentation components
src/lib/weather.ts          Weather forecast and ARPANSA UV adapters
src/lib/parking.ts          Parking validation and aggregation
src/lib/air.ts              CAMS Global air estimate adapter
src/lib/community.ts        Official transport and EPA destinations
src/lib/resource.ts         Polling, cancellation and freshness
src/lib/forecast.ts         Melbourne-local forecast dates
public/data/zone-crosswalk.json  Parking zone-to-street mapping
docs/data-sources.md         Source register and integration limits
```

## Data and privacy

Suburb selection and transport favourites are stored only in the current browser's local storage. There is no account system. The browser makes requests directly to the listed data providers; their own service terms and privacy policies apply.

Open-Meteo's free API is for non-commercial use. Data credit includes Open-Meteo, CAMS / Copernicus Atmosphere Monitoring Service, and City of Melbourne. **UV observations courtesy of ARPANSA.** Read the [ARPANSA UV data disclaimer](https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information#Disclaimer).

ARPANSA asks developers to notify it of applications using the UV feed. The maintainer should send the deployed application URL to `uv.index@arpansa.gov.au`; this development workflow has not sent that notification. Review provider terms before adding advertising or commercial features. See the [source register](docs/data-sources.md) for details.

The dashboard is an independent project and is not affiliated with the data providers. Sensor availability does not establish parking permission; check the signs at the bay.
