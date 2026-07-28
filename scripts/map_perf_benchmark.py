import argparse
import json
import math
import sqlite3
import statistics
import tempfile
import time
from pathlib import Path


DEFAULT_BOUNDS = (105.55, 20.78, 106.12, 21.25)


def tile_bounds(z: int, x: int, y: int):
    def x_to_lon(tile_x: int):
        return tile_x / (2**z) * 360.0 - 180.0

    def y_to_lat(tile_y: int):
        n = math.pi - 2.0 * math.pi * tile_y / (2**z)
        return math.degrees(math.atan(math.sinh(n)))

    return (x_to_lon(x), y_to_lat(y + 1), x_to_lon(x + 1), y_to_lat(y))


def lon_to_tile_x(lon: float, z: int):
    return int(math.floor((lon + 180.0) / 360.0 * (2**z)))


def lat_to_tile_y(lat: float, z: int):
    lat = math.radians(max(-85.05112878, min(85.05112878, lat)))
    return int(math.floor((1.0 - math.log(math.tan(lat) + 1.0 / math.cos(lat)) / math.pi) / 2.0 * (2**z)))


def create_fixture(path: Path, feature_count: int):
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(
        """
        CREATE TABLE projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT NOT NULL);
        CREATE TABLE layers(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL);
        CREATE TABLE features(
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            layer_id TEXT NOT NULL,
            group_id TEXT,
            name TEXT NOT NULL,
            geom_type TEXT NOT NULL,
            coordinates_json TEXT,
            properties_json TEXT NOT NULL DEFAULT '{}',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            bbox_json TEXT,
            bbox_min_x REAL,
            bbox_min_y REAL,
            bbox_max_x REAL,
            bbox_max_y REAL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_features_project ON features(project_id);
        CREATE INDEX idx_features_project_bbox ON features(project_id, bbox_min_x, bbox_max_x, bbox_min_y, bbox_max_y);
        CREATE VIRTUAL TABLE feature_rtree USING rtree(rowid, min_x, max_x, min_y, max_y);
        CREATE TABLE map_tile_cache(
            project_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            z INTEGER NOT NULL,
            x INTEGER NOT NULL,
            y INTEGER NOT NULL,
            tile_mvt BLOB NOT NULL,
            feature_count INTEGER NOT NULL DEFAULT 0,
            min_x REAL NOT NULL,
            min_y REAL NOT NULL,
            max_x REAL NOT NULL,
            max_y REAL NOT NULL,
            generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(project_id, revision, z, x, y)
        );
        CREATE INDEX idx_map_tile_cache_bounds
            ON map_tile_cache(project_id, revision, min_x, max_x, min_y, max_y);
        """
    )
    project_id = "perf-project"
    conn.execute("INSERT INTO projects(id, name, title) VALUES(?, ?, ?)", (project_id, "Perf", "Perf"))
    conn.execute("INSERT INTO layers(id, project_id, name) VALUES(?, ?, ?)", ("layer-1", project_id, "Layer"))

    west, south, east, north = DEFAULT_BOUNDS
    batch = []
    rtree = []
    for i in range(feature_count):
        # Deterministic grid, spread enough to exercise viewport and tile queries.
        gx = i % 1000
        gy = (i // 1000) % 1000
        lon = west + (east - west) * ((gx + 0.5) / 1000.0)
        lat = south + (north - south) * ((gy + 0.5) / 1000.0)
        fid = f"feature-{i:07d}"
        batch.append(
            (
                fid,
                project_id,
                "layer-1",
                f"Feature {i}",
                "Point",
                json.dumps([lon, lat]),
                "{}",
                "{}",
                json.dumps([lon, lat, lon, lat]),
                lon,
                lat,
                lon,
                lat,
            )
        )
    with conn:
        conn.executemany(
            """
            INSERT INTO features(
                id, project_id, layer_id, name, geom_type, coordinates_json,
                properties_json, metadata_json, bbox_json,
                bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            batch,
        )
        rows = conn.execute("SELECT rowid, bbox_min_x, bbox_max_x, bbox_min_y, bbox_max_y FROM features").fetchall()
        rtree.extend(rows)
        conn.executemany("INSERT INTO feature_rtree(rowid, min_x, max_x, min_y, max_y) VALUES (?, ?, ?, ?, ?)", rtree)
    return project_id


def timed_ms(fn):
    start = time.perf_counter()
    value = fn()
    return (time.perf_counter() - start) * 1000.0, value


def run_queries(conn: sqlite3.Connection, project_id: str):
    bounds = DEFAULT_BOUNDS
    viewport_sql = """
        SELECT f.id, f.coordinates_json
        FROM feature_rtree r
        CROSS JOIN features f ON f.rowid = r.rowid
        WHERE f.project_id = ?
          AND r.max_x >= ? AND r.min_x <= ?
          AND r.max_y >= ? AND r.min_y <= ?
        LIMIT 10000
    """
    count_sql = """
        SELECT COUNT(*)
        FROM feature_rtree r
        CROSS JOIN features f ON f.rowid = r.rowid
        WHERE f.project_id = ?
          AND r.max_x >= ? AND r.min_x <= ?
          AND r.max_y >= ? AND r.min_y <= ?
    """
    timings = []
    for _ in range(15):
        elapsed, rows = timed_ms(
            lambda: conn.execute(
                viewport_sql,
                (project_id, bounds[0], bounds[2], bounds[1], bounds[3]),
            ).fetchall()
        )
        timings.append(elapsed)
    count_ms, total = timed_ms(
        lambda: conn.execute(count_sql, (project_id, bounds[0], bounds[2], bounds[1], bounds[3])).fetchone()[0]
    )

    z = 14
    sample_lon = bounds[0] + (bounds[2] - bounds[0]) * 0.0005
    sample_lat = bounds[1] + (bounds[3] - bounds[1]) * 0.0005
    x = lon_to_tile_x(sample_lon, z)
    y = lat_to_tile_y(sample_lat, z)
    tb = tile_bounds(z, x, y)
    tile_ms, tile_rows = timed_ms(
        lambda: conn.execute(
            viewport_sql,
            (project_id, tb[0], tb[2], tb[1], tb[3]),
        ).fetchall()
    )
    invalidate_ms, deleted = timed_ms(
        lambda: conn.execute(
            """
            DELETE FROM map_tile_cache
            WHERE project_id = ? AND max_x >= ? AND min_x <= ? AND max_y >= ? AND min_y <= ?
            """,
            (project_id, tb[0], tb[2], tb[1], tb[3]),
        ).rowcount
    )

    return {
        "viewport_p50_ms": statistics.median(timings),
        "viewport_p95_ms": sorted(timings)[int(len(timings) * 0.95) - 1],
        "count_ms": count_ms,
        "tile_query_ms": tile_ms,
        "invalidate_ms": invalidate_ms,
        "viewport_rows": len(rows),
        "tile_rows": len(tile_rows),
        "total_in_bounds": total,
        "deleted_tiles": deleted,
    }


def load_budget(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def assert_budget(results, budget):
    failures = []
    for item in results["fixtures"]:
        size_budget = budget["sizes"].get(str(item["feature_count"]), budget["default"])
        for metric, max_value in size_budget.items():
            actual = item.get(metric)
            if actual is not None and actual > max_value:
                failures.append(f"{item['feature_count']} {metric}: {actual:.2f} > {max_value:.2f}")
    if failures:
        raise SystemExit("Performance budget failed:\n" + "\n".join(failures))


def main():
    parser = argparse.ArgumentParser(description="Map performance fixture and budget benchmark")
    parser.add_argument("--sizes", nargs="+", type=int, default=[10_000, 100_000, 500_000])
    parser.add_argument("--budget", type=Path, default=Path("perf/map_performance_budget.json"))
    parser.add_argument("--output", type=Path, default=Path("target/map_perf_results.json"))
    parser.add_argument("--fixture-dir", type=Path)
    args = parser.parse_args()

    fixture_root = args.fixture_dir or Path(tempfile.mkdtemp(prefix="pmp-map-perf-"))
    fixture_root.mkdir(parents=True, exist_ok=True)
    results = {"fixtures": []}
    for size in args.sizes:
        db_path = fixture_root / f"map_perf_{size}.pmp"
        elapsed_create, project_id = timed_ms(lambda: create_fixture(db_path, size))
        conn = sqlite3.connect(db_path)
        metrics = run_queries(conn, project_id)
        conn.close()
        results["fixtures"].append(
            {
                "feature_count": size,
                "fixture_path": str(db_path),
                "fixture_create_ms": elapsed_create,
                **metrics,
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2), encoding="utf-8")
    assert_budget(results, load_budget(args.budget))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
