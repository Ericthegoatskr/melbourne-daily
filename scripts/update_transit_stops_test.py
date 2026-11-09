"""Regression checks for the public GTFS directory (no network or credentials)."""

import csv
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import zipfile


SPEC = importlib.util.spec_from_file_location("collector", Path(__file__).with_name("update-transit-stops.py"))
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


def fixture_stop(identifier, name="Wellington Rd / Monash University", lat=-37.915, lon=145.13, platform=""):
    return {"stop_id": str(identifier), "stop_name": name, "stop_lat": lat, "stop_lon": lon, "platform_code": platform}


class StopDirectoryTests(unittest.TestCase):
    def build(self, stops, times, mode="bus"):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "fixture.zip"
            with zipfile.ZipFile(path, "w") as archive:
                for filename, rows in (("stops.txt", stops), ("stop_times.txt", times)):
                    output = io.StringIO(newline="")
                    writer = csv.DictWriter(output, fieldnames=list(rows[0]))
                    writer.writeheader()
                    writer.writerows(rows)
                    archive.writestr(filename, output.getvalue())
            return collector.build_stops(path, mode)

    def test_uses_same_metropolitan_boundary_including_outer_suburbs(self):
        polygons = collector.metro_polygons()
        for lat, lon in ((-37.814095, 145.118685), (-37.920722, 145.123074),
                         (-37.897916, 144.670811), (-38.143, 145.122),
                         (-37.579, 144.729), (-37.754, 145.69), (-37.75, 145.8)):
            self.assertTrue(collector.in_metro(lat, lon, polygons), (lat, lon))
        for lat, lon in ((-38.1499, 144.3617), (-37.5622, 143.8503), (-37.675, 144.438)):
            self.assertFalse(collector.in_metro(lat, lon, polygons), (lat, lon))

    def test_polygon_holes_are_excluded(self):
        shell = [[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]
        hole = [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]
        polygons = [([shell, hole], 0, 5, 0, 5)]
        self.assertTrue(collector.in_metro(3, 3, polygons))
        self.assertFalse(collector.in_metro(1.5, 1.5, polygons))

    def test_bus_stops_require_boarding_service_and_metro_coverage(self):
        stops = [fixture_stop(10), fixture_stop(11, "Geelong", -38.1499, 144.3617),
                 fixture_stop(12, "Unused entrance"), fixture_stop(13, "Drop-off only"),
                 fixture_stop(14, "Some pickup trips"), fixture_stop(15, "Eastern Yarra Ranges", -37.75, 145.8)]
        times = [{"stop_id": str(i), "pickup_type": "1" if i in (13, 14) else "0"} for i in (10, 11, 13, 14, 15)]
        times.append({"stop_id": "14", "pickup_type": ""})
        result, stats = self.build(stops, times)
        self.assertEqual({stop["id"] for stop in result}, {10, 14, 15})
        self.assertTrue(all(stop["mode"] == "bus" and stop["idScheme"] == "gtfs" for stop in result))
        self.assertEqual(stats["includedStops"], 3)

    def test_train_platforms_and_replacement_stops_are_preserved(self):
        stops = [fixture_stop(10, "Example Station", platform="2"),
                 fixture_stop(11, "Example Station", platform="R-Bus"),
                 fixture_stop(12, "Existing coverage", -38.1499, 144.3617)]
        result, stats = self.build(stops, [{"stop_id": str(i), "pickup_type": "1"} for i in (10, 11, 12)], "train")
        self.assertEqual(len(result), 3)
        self.assertIn("Example Station · Platform 2", [stop["name"] for stop in result])
        self.assertIn("Example Station (rail replacement bus)", [stop["name"] for stop in result])
        self.assertEqual(stats["replacementStops"], 1)

    def test_bus_bays_keep_rider_facing_label(self):
        stops, _ = self.build([fixture_stop(10, "Box Hill Bus Station/Station St", platform="Bay 3")],
                              [{"stop_id": "10", "pickup_type": "0"}])
        self.assertEqual(stops[0]["name"], "Box Hill Bus Station/Station St · Bay 3")

    def test_unrepresentable_bus_id_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "integer stop contract"):
            self.build([fixture_stop("bus-a")], [{"stop_id": "bus-a", "pickup_type": "0"}])

    def test_duplicate_id_within_archive_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate bus stop"):
            self.build([fixture_stop(10), fixture_stop(10)], [{"stop_id": "10", "pickup_type": "0"}])

    def test_shared_bus_poles_are_deduplicated_but_modes_remain_distinct(self):
        result, _ = self.build([fixture_stop(10)], [{"stop_id": "10", "pickup_type": "0"}])
        train = {**result[0], "mode": "train"}
        merged = collector.merge_stops([result, result, [train]])
        self.assertEqual(len(merged), 2)
        self.assertEqual([stop["mode"] for stop in merged], ["train", "bus"])

    def test_conflicting_coordinates_for_shared_id_fail_closed(self):
        result, _ = self.build([fixture_stop(10)], [{"stop_id": "10", "pickup_type": "0"}])
        changed = {**result[0], "latitude": -37.99}
        with self.assertRaisesRegex(ValueError, "Conflicting bus stop identifier"):
            collector.merge_stops([result, [changed]])


if __name__ == "__main__":
    unittest.main()
