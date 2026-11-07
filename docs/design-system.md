# Melbourne dashboard visual system

The entrance homepage defines the first shared visual style for the Melbourne dashboard collection. The Parking Explorer remains a separate application; its existing destination is preserved.

## Visual language

Use warm white surfaces, dark ink, orange actions, and small lavender, mint and peach accents. Pastel backgrounds identify sections, not measurements: source-provided EPA categories and the UV scale retain their own meaning. Rounded cards, fine borders and shallow shadows separate information without sacrificing contrast. Keep Australian English, Melbourne time and existing source attribution.

Theme variables are defined in `src/styles/tokens.css` and consumed by `src/styles.css`. A later dashboard can reuse these tokens without inheriting the entrance page's layout. Keep data adapters independent of presentation.

## Interaction and motion

- Summary cards link to the corresponding section and share the same freshness checks as the detailed card. A missing or expired reading remains unavailable.
- `Forecast` renders actual hourly temperature and rain probabilities on separately labelled axes. Its pointer, touch, keyboard slider and hourly buttons select the same reading. The three-day view retains local calendar dates.
- `WeatherScene` is a decorative SVG illustration derived from the weather code and day/night flag. The text weather description remains the accessible description.
- `ValueChange` fades and moves the real reading when it changes. It never counts through invented intermediate measurements.
- Entrance and chart animations are finite; hover transitions are short. `prefers-reduced-motion: reduce` removes animation and smooth scrolling. Loading indicators run only while requests are pending.

Keep controls keyboard accessible, retain visible focus indicators, and let the mobile navigation close with Escape and restore focus. Horizontal scrolling belongs inside the hourly strip, never the whole page. Avoid autoplay decorative loops, fake performance percentages and ornamental controls without an action.

## Scope and verification

The redesign changes presentation and forecast interaction. EPA collection, backend secrets, PTV readiness, source timestamps, expiry rules and location-specific request cancellation remain in their existing modules. PTV live data stays unavailable until authorised credentials and production verification are complete.

Run `npm run verify`, then inspect desktop and narrow mobile layouts with actual data. Check hourly/daily switching, keyboard forecast selection, suburb switching, mobile navigation, source failures and expiry. Production publication continues through the existing GitHub Pages workflow; do not move any provider secret into browser configuration for a visual change.
