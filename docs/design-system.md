# Melbourne dashboard visual system

The entrance homepage defines the shared visual style for the Melbourne dashboard collection. The [Weather & UV dashboard](https://ericthegoatskr.github.io/melbourne-daily/weather.html) and [EPA air-quality dashboard](https://ericthegoatskr.github.io/melbourne-daily/air.html) are dedicated pages in the same application, linked from their homepage cards. Parking Explorer remains a separate application with the same palette and motion language.

## Visual language

Use warm white surfaces, dark ink, orange actions, and small lavender, mint and peach accents. Pastel backgrounds identify sections, not measurements: source-provided EPA categories and the UV scale retain their own meaning. Rounded cards, fine borders and shallow shadows separate information without sacrificing contrast. Keep Australian English, Melbourne time and existing source attribution.

Theme variables are defined in `src/styles/tokens.css` and consumed by `src/styles.css`. Weather-page layout rules live in `src/WeatherDashboard.css`, scoped to `.weather-dashboard` and `wx-` classes so they do not change the homepage. Air-quality layout rules live in `src/AirDashboard.css`, scoped to `.air-dashboard` and `aq-` classes. The weather page reuses `Forecast`, `WeatherScene`, `ValueChange` and the existing feed adapters; the air-quality page reuses the EPA contract, per-field expiry and regional-model adapter. A later dashboard can reuse these tokens without inheriting the entrance page's layout. Keep data adapters independent of presentation.

## Interaction and motion

- Summary cards link to the corresponding section and share the same freshness checks as the detailed card. A missing or expired reading remains unavailable.
- `Forecast` renders actual hourly temperature and rain probabilities on separately labelled axes. Its pointer, touch, keyboard slider and hourly buttons select the same reading. The three-day view retains local calendar dates.
- `WeatherScene` is a decorative SVG illustration derived from the weather code and day/night flag. The text weather description remains the accessible description.
- `ValueChange` fades and moves the real reading when it changes. It never counts through invented intermediate measurements.
- The dedicated weather page keeps station UV and model UV visibly separate. Its hourly UV chart uses actual model values; zero has a baseline mark and missing readings have dashed marks. It never turns a missing value into zero.
- The daylight arc uses the selected suburb's sunrise and sunset for today's Melbourne calendar date. It represents elapsed daylight, not the sun's position in the sky, and carries a text description alongside the diagram.
- The air-quality page shows the official EPA category without deriving a replacement from pollutant values. PM2.5 and PM10 retain their units, one-hour averaging period and individual observation times. Missing fields remain unavailable; a valid measurement of zero remains visible.
- Nearby EPA stations are ordered by distance within 100 km. The nearest reporting station is the default. Search filters the list without changing the selected readings; manual selection updates the cards. If a selected station stops reporting, explain the fallback to the nearest eligible station. “Use nearest station” restores automatic selection.
- EPA observations and regional CAMS / Open-Meteo estimates stay in separate cards with separate source status. Decorative artwork and pastel card backgrounds do not imply air quality, an AQI value or a trend absent from the source.
- Entrance and chart animations are finite; hover transitions are short. `prefers-reduced-motion: reduce` removes animation and smooth scrolling. Loading indicators run only while requests are pending.

Keep controls keyboard accessible, retain visible focus indicators, and let the mobile navigation close with Escape and restore focus. Horizontal scrolling belongs inside the hourly strip, never the whole page. Avoid autoplay decorative loops, fake performance percentages and ornamental controls without an action.

## Scope and verification

The redesign changes presentation, forecast interaction and EPA station browsing. EPA collection, backend secrets, PTV readiness, source timestamps, expiry rules and location-specific request cancellation remain in their existing modules. PTV live data stays unavailable until authorised credentials and production verification are complete.

`weather.html` is a separate Vite entry with weather and UV requests only. It shares the homepage's stored suburb choice. Weather refreshes every 15 minutes, becomes delayed after 30 minutes and expires after 90; station UV refreshes every minute, becomes delayed after 5 minutes and expires after 15. Expired weather also removes weather-derived UV forecasts and daylight values. A failure in either source must not suppress valid data from the other.

`air.html` is a separate Vite entry that requests EPA snapshots and the regional air model only, sharing the same stored suburb choice. Each EPA field becomes delayed after 90 minutes and expires after 180 minutes independently. The station list excludes sites with no recent field and preserves complete-snapshot withdrawals. The model also becomes delayed after 90 minutes and expires after 180 minutes. Neither source supplies a substitute for a missing value from the other.

The EPA provider key remains a backend Secret. GitHub Actions uses its separate `EPA_BACKEND_TOKEN` Secret to collect and validate data from the owner-private backend, then publishes the snapshot consumed by the browser. The new page preserves that boundary and does not change backend access or expose either credential.

Run `npm run verify`, then inspect all page entries in the production build at desktop and narrow mobile sizes with actual data. Check hourly/daily switching, keyboard forecast selection, suburb switching, mobile navigation, source failures and expiry. For the weather page, also check valid observed UV zero, missing model UV, Melbourne-midnight rollover and the sunrise/sunset diagram. For the air-quality page, check station search, manual selection and nearest-station reset, selected-station fallback, partial missing fields, valid zero, per-field expiry and withdrawal by a newer snapshot. Confirm the public build contains no provider key or backend access credential. Production publication continues through the existing GitHub Pages workflow; do not move any provider secret into browser configuration for a visual change.
