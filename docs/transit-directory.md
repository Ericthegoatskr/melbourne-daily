# Public transit directory maintenance

The stop search works from `public/data/transport-stops.json` without a transport API key. Its source is the official [DTP GTFS Schedule dataset](https://opendata.transport.vic.gov.au/dataset/gtfs-schedule), under CC BY 4.0. This directory supplies stop identity and location only. Departures, route/direction choices and disruptions require the separate PTV integration.

## Scope and identity

The collector reads the Metro train (`2/google_transit.zip`) and tram (`3/google_transit.zip`) archives. It includes stops referenced by `stop_times.txt` within latitude -38.6 to -37.3 and longitude 144.3 to 145.7. This is an explicit Greater Melbourne bounding box, not a promise of all Victorian services. Buses, regional rail, parent-only station records and pathway-only records are not included.

Train platforms use the supplied `platform_code`. Rail-replacement boarding points are retained under the rail network and named accordingly. Opposite-side tram stops can share a name, so their distinct IDs and coordinates are preserved. The initial verified snapshot has 541 train records, including 47 replacement-bus boarding points, and 1,624 tram records. These are not counts of distinct station names.

Every record uses `idScheme: "gtfs"`; a numeric GTFS ID is not assumed to be a PTV stop ID. The PTV adapter uses the documented `gtfs=true` departures option and preserves upstream stop identity separately. Route and direction identifiers come from PTV, not from the static GTFS directory.

## Nearby-stop matching

The homepage and transport page use the same `NearbyStops` widget with this directory. A selected destination, bundled landmark or one-time device location supplies the search centre. **Use my current location** still requests a single browser location fix after an explicit user action. Matching runs locally with the Haversine formula, orders results by straight-line distance and shows at most 12 results. The radius is 2 km by default, with 1, 2 and 5 km choices; the mode filter offers All, Trains and Trams. Changing these filters reuses a valid fix and does not request another location.

For nearby results, train platforms with the same station base name are grouped only within 500 m proximity. A station result uses the nearest mapped point in its group for distance and retains that point's original GTFS stop object when selected. Grouping does not invent a new station ID or replace the directory records. Opposite-side tram boarding points remain distinct results with their own IDs and coordinates. Rail-replacement bus boarding points are excluded from nearby results but remain available in text search.

Distances describe approximate straight-line separation from the chosen centre to a mapped stop point. They do not identify a station entrance, a walkable path, travel time or a step-free route. The location's reported accuracy and capture time remain visible so that users can assess the estimate. A fix with accuracy worse than 1,000 m is rejected. After ten minutes, a device fix expires and its nearby results and map are hidden until a manual location refresh. Chosen destinations do not expire with the device-location clock.

Choosing a result is a separate action. It supplies the original stop identity and mode to the existing departure-board flow, including its route/direction filters and service updates. Finding or filtering nearby stops never selects a board automatically. Location errors, cancellation, expiry and clearing nearby results preserve the selected board, saved favourites and text search. Directory failures retain the existing directory retry path, while location failures explain the problem and keep text search available.

### Location lifecycle and privacy

The widget uses one `getCurrentPosition` request, not `watchPosition`. The browser request has a 15-second timeout and an application timeout completes the pending state after 20 seconds if the browser does not respond. Denied permission, unavailable location, timeout, unsupported geolocation and an insecure context have actionable fallback text. Cancellation, a later request, clearing and unmounting invalidate obsolete callbacks so that a late success cannot restore old results. Refreshing an expired fix always requires another user action.

Device coordinates, accuracy and capture time are ephemeral page state. They are not written to local or session storage, added to the page URL, or sent to PTV. Optional map loading requests OpenStreetMap tiles for the viewed area; that area is therefore shared with the tile provider, as explained before the map is enabled. Matching needs only the already-public GTFS directory. Explicit stop selection sends the same stop/mode and applicable route/direction identifiers used by the existing public PTV read endpoint; it never sends device coordinates. PTV credentials remain backend Secrets. Nearby matching does not alter the private EPA backend or its public snapshot path.

### Nearby-stop manual QA

Use local geolocation overrides or mocks for reproducible cases; do not publish fixture departures or add a production coordinate override.

- On both page entries, test desktop and narrow mobile layouts, touch targets, keyboard controls, visible focus and status announcements. Confirm a page load, filter change or ordinary text search does not request location permission.
- Supply an accurate fix near known train and tram stops. Check distance ordering, the 12-result limit, all mode/radius combinations and reuse of the same capture time while filtering. Confirm train platforms group by base name within 500 m, a grouped choice retains the nearest mapped point's GTFS identity, and opposite-side tram stops remain distinct. Check that replacement-bus points are absent nearby but still searchable by text.
- Choose a nearby stop and verify the existing train/tram board, route/direction filters, departures and service updates. Finding or filtering nearby stops must not change an already-selected board. Favourites and text search must continue to work.
- Exercise permission denial, unavailable location, the browser's 15-second timeout, the 20-second application timeout, unsupported geolocation and an insecure context. Check usable text-search fallback, retry where appropriate and no indefinite pending state. An accuracy value over 1,000 m must not produce nearby results.
- Exercise cancel/clear while pending, a second request after cancellation and navigation away before a callback. Deliver the old callback late and confirm it cannot restore results or overwrite a newer fix. Clearing or failing a request must preserve the selected board and saved selections.
- Advance the clock beyond ten minutes from capture. Results must disappear and explain that a manual refresh is required; returning to a hidden tab must not reveal an expired list. A fresh fix restores results only after another explicit request.
- Use a valid fix outside directory coverage and a small radius with no matching mode. Show a useful empty state with radius/mode choices and text search, without inventing a nearest result beyond the radius.
- Inspect the page URL, local/session storage and PTV requests before and after locating, filtering, clearing and selecting. No device coordinates may appear there. Optional OpenStreetMap tile requests reveal the viewed area only after the user opens the map. Locating alone must not start a PTV board lookup or change an existing board; explicit selection uses only the established stop/mode and route/direction request fields. Confirm no provider key or private-backend credential appears in the browser.

## Destination search and linked map

**Find a destination** submits a name or address to the City of Melbourne [street-address](https://data.melbourne.vic.gov.au/explore/dataset/street-addresses/) and [landmark](https://data.melbourne.vic.gov.au/explore/dataset/landmarks-and-places-of-interest-including-schools-theatres-health-services-spor/) datasets. Coverage is the City of Melbourne municipality, not every Greater Melbourne address. Users choose a result explicitly before the nearby centre changes. The bundled landmark picker uses verified public points locally and remains available when online search fails. Partial results are labelled; invalid points are rejected and pending requests are abandoned after input changes, another search, landmark selection or a reset.

Choosing a destination cancels an outstanding device-location request; late callbacks cannot replace the selected place. Starting a new device-location request clears the chosen destination and pending destination search. Clearing either centre preserves the selected stop, saved favourites, departures, service updates and walking links. No destination or location change selects a stop automatically.

**Show stop map** explicitly loads Leaflet and OpenStreetMap tiles. The map shows the chosen centre, search-radius circle and numbered stop markers that correspond to the same distance-ordered list; train/tram labels supplement colour. Selecting a marker updates the selected stop and existing board while keeping the map in view; **View departures & walking directions** moves to the selected-stop panel. Selecting from the list highlights the matching marker. The map does not invent walking routes, vehicle locations or arrival estimates.

Tile requests reveal the viewed area to OpenStreetMap's tile provider. Exact device coordinates are not put in the page URL or PTV request, and no extra location request is needed to display the map. Keep OpenStreetMap attribution visible, use the [standard tile usage policy](https://operations.osmfoundation.org/policies/tiles/), and retain the complete list when the map or tiles are unavailable. Hide/unmount the map to stop its additional loading; do not prefetch or add offline tile downloads.

### Destination and map manual QA

- On both page entries, select a bundled landmark without network search, submit an address/name, choose a returned result, and confirm the named centre and distances update. Typing alone must not request geocoding; submitted searches must disclose the City of Melbourne scope and destination-query recipient.
- Check empty, partial and failed searches, retry, invalid coordinates, changing input during a request and an older response arriving after a newer choice. Pending location callbacks must not overwrite a destination; switching to device location must abandon pending destination search.
- Confirm changing/clearing a centre or mode/radius keeps the existing live board and favourites. Selecting a list result or marker must use that original GTFS stop identity for departures, service updates and walking destinations.
- No map code or tiles should load before **Show stop map**. Check destination/radius, numbered list/marker agreement, selected highlighting, map popup **View departures & walking directions**, keyboard access, zoom/reset, phone rotation and 44 px controls. Routine feed or clock updates must not reset a manually panned view. Test reduced motion and mobile page scrolling around the map.
- Check map import/init failure and tile failure: explain the issue and preserve the list and stop selection. Hide and reopen cleanly. Device-fix expiry removes its map; destination-based discovery must not expire after ten minutes.
- Inspect application URLs/storage/PTV queries for device coordinates or credentials. Submitted destination text goes only to the disclosed City source; optional tile requests share the viewed area. Provider keys stay in backend Secrets, and the EPA snapshot path remains unchanged.

## Walking directions

The shared selected-stop panel on the homepage and transport page offers Google Maps and Apple Maps walking directions. A stop chosen through nearby matching, name search or saved favourites uses the same links. They depend on the selected stop's validated public coordinates, not a successful departure response, so a restored selection remains navigable when PTV is unavailable.

Links are constructed locally as HTTPS URLs with the stop as the destination and walking as the travel mode. They omit the origin, device coordinates and credentials. Opening a link is an explicit user action in a new tab or the provider's app; the provider handles the starting point, route and any subsequent location permission. These external walking links require no additional API key or backend change; the optional embedded map is a separate feature.

The destination is the directory's mapped platform or boarding point, including the nearest representative point for grouped train stations. It is not a verified station entrance or accessible route. Users should check the entrance, boarding direction and side of the street in the map before walking to a stop.

### Walking-directions manual QA

- On the homepage and transport page, confirm directions are absent before a selection and appear after nearby, name-search or saved-stop selection. Switch between train and tram stops and verify both destinations update to the new stop's exact coordinates.
- Inspect both HTTPS links for walking mode and no explicit origin, device coordinates or credentials. Invalid coordinates must not produce a navigation link. A restored valid stop must retain directions with the PTV connection unconfigured or its response unavailable.
- Check new-tab disclosure, keyboard activation and visible focus. On narrow screens, keep the links readable, at least 44 px high and free of horizontal overflow. Opening a map must retain the dashboard's selected stop, filters and live board.
- Verify the map provider receives the intended public destination and walking mode. Do not grant device-location access merely to test the links; use the provider's route preview or inspect its destination and mode controls.

## Collector

Run with Python 3.9 or later; only the standard library is required:

```sh
python3 scripts/update-transit-stops.py --inspect
python3 scripts/update-transit-stops.py
```

`--inspect` validates the upstream without changing the published file. `--output /tmp/transport-stops.json` writes a trial snapshot elsewhere. An optional `--cache-dir /tmp/melbourne-daily-gtfs` keeps downloaded nested archives outside the repository for local checks. The normal run uses a temporary directory and removes it on completion.

The collector resolves the archive from the official catalogue, requires HTTP Range responses, and aborts if the remote archive changes during collection. It reads only the two relevant nested archives, about 47.7 MB in the initial verification, rather than the full 243.6 MB archive. It rejects nonnumeric/out-of-range IDs, duplicates, invalid coordinates, missing names and implausibly small mode directories before an atomic output replacement.

`sourceUpdatedAt` is the upstream HTTP Last-Modified time; `generatedAt` is when the published snapshot was built. Rechecking an identical source and stop list preserves the existing file, including `generatedAt`, so a collection does not create a timestamp-only commit. Raw GTFS ZIPs are never committed.

## Weekly workflow

[The refresh workflow](../.github/workflows/refresh-transit-stops.yml) runs at 18:23 UTC on Sundays, corresponding to Monday 04:23 AEST / 05:23 AEDT. It also supports `workflow_dispatch` on `main`. Concurrent refreshes are queued rather than cancelling a running update.

After collection, the job commits only the directory JSON as `github-actions[bot]`, pushes normally to `main`, and uses `gh workflow run pages.yml --ref main` to request the verified Pages deployment. It needs `contents: write` for that scoped commit and `actions: write` for the dispatch. It does not use a personal access token. Repository rules must permit the workflow's normal push; it never forces an update or bypasses branch protection.

The explicit dispatch matters because a push authenticated with `GITHUB_TOKEN` does not ordinarily start another push workflow; `workflow_dispatch` is supported. See [GitHub's trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

If collection fails, the job stops before a commit. If a concurrent repository change or branch rule rejects the push, inspect the failure and rerun after resolving it. If the commit succeeds but dispatch or deployment fails, manually run **Verify and deploy Pages** on `main`; the committed snapshot does not need to be regenerated.

GitHub's scheduled workflows can be delayed and can be disabled after public-repository inactivity. Monitor the [Actions runs](https://github.com/Ericthegoatskr/melbourne-daily/actions), and use the manual refresh when needed. The schedule is a maintenance target rather than a freshness guarantee. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
