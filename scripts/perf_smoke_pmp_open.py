import json
import os
import sqlite3
import time


DEFAULT_FIXTURE = r"I:\Shared drives\Du an 269 nut den con lai\28072026_PMTK_269\269 nut.pmp"
BOOTSTRAP_WARN_MS = 2500.0
VIEWPORT_WARN_MS = 2500.0


def timed(label, fn):
    started = time.perf_counter()
    result = fn()
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    print(f"{label}: {elapsed_ms:.1f}ms")
    return result, elapsed_ms


def fetch_all(cur, sql, params=()):
    return cur.execute(sql, params).fetchall()


def main():
    path = os.environ.get("PMP_PERF_FIXTURE", DEFAULT_FIXTURE)
    if not os.path.exists(path):
        raise SystemExit(f"Fixture not found: {path}")

    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    cur = con.cursor()
    project_id = cur.execute(
        "SELECT id FROM projects ORDER BY created_at ASC LIMIT 1"
    ).fetchone()[0]
    revision = cur.execute(
        "SELECT COALESCE(MAX(global_seq), 0) FROM events WHERE project_id = ?1",
        (project_id,),
    ).fetchone()[0]

    def bootstrap_shell():
        feature_count = fetch_all(
            cur,
            "SELECT COUNT(*) AS feature_count FROM features WHERE project_id = ?1",
            (project_id,),
        )[0][0]
        regions = fetch_all(
            cur,
            "SELECT id, parent_id, name, description FROM regions WHERE project_id = ?1 ORDER BY created_at, id",
            (project_id,),
        )
        layers = fetch_all(
            cur,
            "SELECT id, region_id, name, is_visible FROM layers WHERE project_id = ?1 ORDER BY created_at, id",
            (project_id,),
        )
        feature_groups = fetch_all(
            cur,
            "SELECT id, layer_id, parent_id, name, group_type, is_visible, metadata_json FROM feature_groups WHERE project_id = ?1 ORDER BY created_at, id",
            (project_id,),
        )
        bounds = fetch_all(
            cur,
            """SELECT MIN(bbox_min_y) AS south, MAX(bbox_max_y) AS north,
                      MIN(bbox_min_x) AS west, MAX(bbox_max_x) AS east
               FROM features
               WHERE project_id = ?1
                 AND bbox_min_x IS NOT NULL AND bbox_min_y IS NOT NULL
                 AND bbox_max_x IS NOT NULL AND bbox_max_y IS NOT NULL""",
            (project_id,),
        )[0]
        cached_tiles = fetch_all(
            cur,
            "SELECT COUNT(*) AS cached_tiles FROM map_tile_cache WHERE project_id = ?1 AND revision = ?2",
            (project_id, revision),
        )[0][0]
        return {
            "featureCount": feature_count,
            "regions": len(regions),
            "layers": len(layers),
            "featureGroups": len(feature_groups),
            "bounds": bounds,
            "cachedTiles": cached_tiles,
        }

    shell, shell_ms = timed("bootstrap_shell_sql", bootstrap_shell)
    south, north, west, east = shell["bounds"]

    def first_viewport():
        rows = fetch_all(
            cur,
            """SELECT f.id, f.layer_id, f.group_id, f.name, f.geom_type, f.coordinates_json,
                      f.properties_json, f.metadata_json, f.bbox_json
               FROM feature_rtree r
               CROSS JOIN features f ON f.rowid = r.rowid
               WHERE f.project_id = ?1
                 AND r.max_x >= ?2 AND r.min_x <= ?3
                 AND r.max_y >= ?4 AND r.min_y <= ?5
               ORDER BY f.created_at, f.id
               LIMIT ?6""",
            (project_id, west, east, south, north, 10000),
        )
        return rows

    viewport_rows, viewport_ms = timed("first_viewport_sql", first_viewport)
    payload = {
        "fixture": path,
        "projectId": project_id,
        "revision": revision,
        "shell": shell,
        "viewportReturned": len(viewport_rows),
        "bootstrapShellMs": round(shell_ms, 1),
        "firstViewportMs": round(viewport_ms, 1),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    if shell_ms > BOOTSTRAP_WARN_MS:
        raise SystemExit(f"bootstrap shell smoke exceeded {BOOTSTRAP_WARN_MS}ms")
    if viewport_ms > VIEWPORT_WARN_MS:
        raise SystemExit(f"first viewport smoke exceeded {VIEWPORT_WARN_MS}ms")
    if shell["featureCount"] > 0 and len(viewport_rows) == 0:
        raise SystemExit("first viewport returned no features")


if __name__ == "__main__":
    main()
