#!/usr/bin/env python3
"""Build the public Metro train/tram stop directory from DTP's GTFS archive.

The weekly GitHub Actions workflow runs this command; it can also run manually:
  python3 scripts/update-transit-stops.py

Only the Metro train and tram nested archives are downloaded, via HTTP Range.
Raw GTFS files live in a temporary directory and are never written to the repo.
Optional --cache-dir /private/tmp/melbourne-daily-gtfs keeps a source-versioned
download cache between local investigations. --inspect validates without writing.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import email.utils
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.request
import zipfile


CATALOGUE_URL = "https://opendata.transport.vic.gov.au/api/3/action/package_show?id=gtfs-schedule"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "public/data/transport-stops.json"
MODES = {"2/google_transit.zip": "train", "3/google_transit.zip": "tram"}
USER_AGENT = "MelbourneDailyDataCollector/1.0 (+https://github.com/Ericthegoatskr/melbourne-daily)"
MAX_RANGE_BYTES = 100 * 1024 * 1024


def request(url: str, headers: dict[str, str] | None = None):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})}),
        timeout=60,
    )


class RemoteZip(io.RawIOBase):
    """Seekable reader that refuses full-body responses and changing source files."""

    def __init__(self, url: str):
        self.url = url
        self.position = 0
        with request(url, {"Range": "bytes=0-0"}) as response:
            if response.status != 206:
                raise ValueError("The source does not support HTTP Range; no full archive was downloaded")
            content_range = response.headers.get("Content-Range", "")
            match = re.fullmatch(r"bytes 0-0/(\d+)", content_range)
            if not match:
                raise ValueError("Invalid source Content-Range")
            self.length = int(match[1])
            self.etag = response.headers.get("ETag")
            self.modified = response.headers.get("Last-Modified")
            if not self.modified:
                raise ValueError("The source has no Last-Modified timestamp")
            self.source_updated_at = email.utils.parsedate_to_datetime(self.modified).astimezone(dt.timezone.utc)
            response.read(1)

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.position

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        base = 0 if whence == io.SEEK_SET else self.position if whence == io.SEEK_CUR else self.length
        position = base + offset
        if position < 0:
            raise ValueError("Negative seek in GTFS archive")
        self.position = position
        return position

    def read(self, size: int = -1) -> bytes:
        remaining = max(0, self.length - self.position)
        size = remaining if size < 0 else min(size, remaining)
        if size == 0:
            return b""
        if size > MAX_RANGE_BYTES:
            raise ValueError("Requested GTFS segment exceeds the download safety limit")
        start = self.position
        end = start + size - 1
        headers = {"Range": f"bytes={start}-{end}"}
        if self.etag and not self.etag.startswith("W/"):
            headers["If-Match"] = self.etag
        with request(self.url, headers) as response:
            if response.status != 206:
                raise ValueError("The source stopped honoring Range; aborting without a full download")
            if response.headers.get("Content-Range") != f"bytes {start}-{end}/{self.length}":
                raise ValueError("Source archive range/length changed while reading")
            if response.headers.get("Last-Modified") != self.modified:
                raise ValueError("Source archive changed while reading; rerun the collector")
            if self.etag and response.headers.get("ETag") != self.etag:
                raise ValueError("Source archive ETag changed while reading")
            data = response.read(size + 1)
            if len(data) != size:
                raise ValueError("Incomplete GTFS archive segment")
        self.position += len(data)
        return data


def gtfs_rows(archive: zipfile.ZipFile, name: str):
    with archive.open(name) as file:
        with io.TextIOWrapper(file, encoding="utf-8-sig", newline="") as text:
            yield from csv.DictReader(text)


def build_stops(path: Path, mode: str) -> tuple[list[dict], dict]:
    with zipfile.ZipFile(path) as archive:
        # Parent stations, entrances and pathways that never receive a trip are
        # deliberately not selectable boarding stops.
        serving_ids = {row["stop_id"] for row in gtfs_rows(archive, "stop_times.txt")}
        stops = []
        seen = set()
        non_numeric = []
        replacement_count = 0
        for row in gtfs_rows(archive, "stops.txt"):
            raw_id = row.get("stop_id", "")
            if raw_id not in serving_ids:
                continue
            try:
                latitude, longitude = float(row["stop_lat"]), float(row["stop_lon"])
            except (KeyError, ValueError, TypeError) as error:
                raise ValueError(f"Invalid coordinates for serving stop {raw_id}") from error
            if not math.isfinite(latitude) or not math.isfinite(longitude):
                raise ValueError(f"Non-finite coordinates for serving stop {raw_id}")
            if not (-38.6 <= latitude <= -37.3 and 144.3 <= longitude <= 145.7):
                continue
            if not re.fullmatch(r"\d+", raw_id) or not 0 <= int(raw_id) <= 2_147_483_647:
                non_numeric.append(raw_id)
                continue
            stop_id = int(raw_id)
            if stop_id in seen:
                raise ValueError(f"Duplicate {mode} stop identifier {stop_id}")
            seen.add(stop_id)
            name = row.get("stop_name", "").strip()
            if not name:
                raise ValueError(f"Missing name for {mode} stop {stop_id}")
            platform = row.get("platform_code", "").strip()
            replacement = platform.casefold() == "r-bus" or "replacement" in platform.casefold() or "replacement bus" in name.casefold()
            if replacement:
                replacement_count += 1
                if "replacement" not in name.lower():
                    name += " (rail replacement bus)"
            elif platform and "platform" not in name.casefold():
                name += f" · Platform {platform}"
            stops.append({
                "id": stop_id,
                "name": name,
                "suburb": "",
                "mode": mode,
                "latitude": latitude,
                "longitude": longitude,
                "idScheme": "gtfs",
            })
        if non_numeric:
            raise ValueError(f"PTV's integer stop contract cannot represent these {mode} GTFS IDs: {non_numeric[:12]}")
        if len(stops) < 100:
            raise ValueError(f"Implausibly small {mode} directory: {len(stops)} stops")
        stops.sort(key=lambda stop: (stop["name"].casefold(), stop["id"]))
        return stops, {"mode": mode, "servingIds": len(serving_ids), "includedStops": len(stops), "replacementStops": replacement_count}


def collect(cache_dir: Path, inspect_only: bool, output: Path) -> None:
    with request(CATALOGUE_URL) as response:
        envelope = json.load(response)
    if envelope.get("success") is not True:
        raise ValueError("GTFS catalogue lookup did not succeed")
    resources = envelope["result"]["resources"]
    candidates = [resource for resource in resources if resource.get("url", "").endswith("/gtfs.zip")]
    if len(candidates) != 1:
        raise ValueError("The official GTFS archive resource is ambiguous or missing")
    source_url = candidates[0]["url"]
    if not source_url.startswith("https://opendata.transport.vic.gov.au/"):
        raise ValueError("Unexpected GTFS source host")
    remote = RemoteZip(source_url)
    version = hashlib.sha256(f"{source_url}|{remote.modified}|{remote.etag}|{remote.length}".encode()).hexdigest()[:20]
    cache_dir.mkdir(parents=True, exist_ok=True)
    result = []
    with zipfile.ZipFile(remote) as outer:
        for member, mode in MODES.items():
            info = outer.getinfo(member)
            if info.file_size > MAX_RANGE_BYTES or info.compress_size > MAX_RANGE_BYTES:
                raise ValueError(f"Unexpectedly large nested archive: {member}")
            cached = cache_dir / f"{version}-{mode}.zip"
            if not cached.exists():
                print(f"Downloading {member}: {info.compress_size:,} compressed bytes", flush=True)
                data = outer.read(member)  # zipfile verifies the outer entry CRC.
                pending = cached.with_suffix(".tmp")
                pending.write_bytes(data)
                pending.replace(cached)
            if cached.stat().st_size != info.file_size:
                raise ValueError(f"Cached {mode} archive has an invalid length")
            stops, statistics = build_stops(cached, mode)
            result.extend(stops)
            print(json.dumps(statistics), flush=True)
    payload = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourceUpdatedAt": remote.source_updated_at.isoformat().replace("+00:00", "Z"),
        "sourceUrl": source_url,
        "stops": result,
    }
    encoded = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    print(json.dumps({"sourceUpdatedAt": payload["sourceUpdatedAt"], "stops": len(result), "bytes": len(encoded), "inspectOnly": inspect_only}), flush=True)
    if not inspect_only:
        # A repeated check of the same source must not create a timestamp-only
        # bot commit. generatedAt remains the time this snapshot was produced.
        if output.is_file():
            try:
                previous = json.loads(output.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                previous = None
            if isinstance(previous, dict) and all(
                previous.get(key) == payload[key]
                for key in ("sourceUpdatedAt", "sourceUrl", "stops")
            ):
                print("Stop directory is unchanged; preserving the existing snapshot", flush=True)
                return
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as file:
            file.write(encoded)
            pending_path = Path(file.name)
        try:
            pending_path.chmod(0o644)
            os.replace(pending_path, output)
        finally:
            pending_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args()
    if args.cache_dir:
        collect(args.cache_dir, args.inspect, args.output)
    else:
        with tempfile.TemporaryDirectory(prefix="melbourne-daily-gtfs-") as temporary:
            collect(Path(temporary), args.inspect, args.output)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print(f"Transit stop update failed: {error}", file=sys.stderr)
        sys.exit(1)
