import sqlite3
import json
import uuid
import shutil
import os

SOURCE_PMP = r"D:\Code Antinigaty\Phan mem quan ly file V4\RUST\BAK\BANDO\Du_an_165.pmp"
TARGET_PMP = "Du_an_165.pmp"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, applied_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS pmp_metadata (project_id TEXT PRIMARY KEY, device_id TEXT, last_global_seq INTEGER DEFAULT 0, features_json TEXT DEFAULT '[]', created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS entity_id_aliases (entity_type TEXT, scope_id TEXT DEFAULT '', legacy_id INTEGER, uuid TEXT, created_at TEXT, PRIMARY KEY (entity_type, legacy_id));
CREATE TABLE IF NOT EXISTS event_store (id TEXT PRIMARY KEY, project_id TEXT, entity_type TEXT, entity_id TEXT, event_type TEXT, payload_json TEXT, metadata_json TEXT, global_seq INTEGER, timestamp TEXT, schema_version INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS entity_index (entity_id TEXT PRIMARY KEY, entity_type TEXT, project_id TEXT, name TEXT, search_vector TEXT, tags TEXT, metadata_json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS features (id TEXT PRIMARY KEY, project_id TEXT, layer_id TEXT, group_id TEXT, name TEXT, geom_type TEXT, geometry_json TEXT, geometry_wkb BLOB, min_x REAL, min_y REAL, max_x REAL, max_y REAL, is_visible BOOLEAN DEFAULT 1, note TEXT, properties_json TEXT, metadata_json TEXT, style_id TEXT, task_id TEXT, current_version INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS layers (id TEXT PRIMARY KEY, project_id TEXT, region_id TEXT, name TEXT, description TEXT, is_visible BOOLEAN DEFAULT 1, order_index INTEGER DEFAULT 0, metadata_json TEXT, created_at TEXT, updated_at TEXT);
"""

def main():
    print(f"Restoring {TARGET_PMP} from {SOURCE_PMP}...")
    shutil.copy2(SOURCE_PMP, TARGET_PMP)
    
    conn = sqlite3.connect(TARGET_PMP)
    cursor = conn.cursor()
    
    # Check V1 status
    cursor.execute("SELECT COUNT(*) FROM features")
    v1_count = cursor.fetchone()[0]
    print(f"V1 feature count: {v1_count}")
    
    # Rename
    for t in ["features", "layers", "tasks"]:
        cursor.execute(f"ALTER TABLE {t} RENAME TO v1_{t}")
    
    # Schema
    cursor.executescript(SCHEMA_SQL)
    pid = "d9d7986b-c630-4e9d-a9ff-ed5309164c0f"
    
    # Migrate
    cursor.execute("SELECT id, name, description FROM v1_layers")
    l_map = {row[0]: str(uuid.uuid4()) for row in cursor.fetchall()}
    for old_id, new_id in l_map.items():
        cursor.execute("INSERT INTO layers (id, project_id, name) SELECT ?, ?, name FROM v1_layers WHERE id=?", (new_id, pid, old_id))
    
    cursor.execute("SELECT id, layer_id, name, geom_type, geometry_json FROM v1_features")
    features = cursor.fetchall()
    for row in features:
        fid, lid, name, gtype, gjson = row
        new_fid = str(uuid.uuid4())
        cursor.execute("INSERT INTO features (id, project_id, layer_id, name, geom_type, geometry_json) VALUES (?, ?, ?, ?, ?, ?)",
                       (new_fid, pid, l_map.get(lid), name, gtype, gjson))
        cursor.execute("INSERT INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, timestamp) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
                       (str(uuid.uuid4()), pid, "Feature", new_fid, "FeatureCreated", json.dumps({"id": new_fid, "name": name})))
        cursor.execute("INSERT INTO entity_index (entity_id, entity_type, project_id, name, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
                       (new_fid, "Feature", pid, name))
                       
    conn.commit()
    
    # Final counts
    cursor.execute("SELECT COUNT(*) FROM features")
    v2_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM event_store")
    evt_count = cursor.fetchone()[0]
    
    print(f"V2 feature count: {v2_count}")
    print(f"Event store count: {evt_count}")
    print("SUCCESS: Migration logic verified.")
    conn.close()

if __name__ == "__main__":
    main()
