# Public transit directory maintenance

The stop search works from `public/data/transport-stops.json` without a transport API key. Its source is the official [DTP GTFS Schedule dataset](https://opendata.transport.vic.gov.au/dataset/gtfs-schedule), under CC BY 4.0. This directory supplies stop identity and location only. Departures, route/direction choices and disruptions require the separate PTV integration.

## Scope and identity

The collector reads the Metro train (`2/google_transit.zip`) and tram (`3/google_transit.zip`) archives. It includes stops referenced by `stop_times.txt` within latitude -38.6 to -37.3 and longitude 144.3 to 145.7. This is an explicit Greater Melbourne bounding box, not a promise of all Victorian services. Buses, regional rail, parent-only station records and pathway-only records are not included.

Train platforms use the supplied `platform_code`. Rail-replacement boarding points are retained under the rail network and named accordingly. Opposite-side tram stops can share a name, so their distinct IDs and coordinates are preserved. The initial verified snapshot has 541 train records, including 47 replacement-bus boarding points, and 1,624 tram records. These are not counts of distinct station names.

Every record uses `idScheme: "gtfs"`; a numeric GTFS ID is not assumed to be a PTV stop ID. The PTV adapter uses the documented `gtfs=true` departures option and preserves upstream stop identity separately. Route and direction identifiers come from PTV, not from the static GTFS directory.

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
