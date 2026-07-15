import sqlite3
import json
import uuid
import datetime

# SCHEMA SQL from schema.rs
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pmp_metadata (
    project_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    last_global_seq INTEGER NOT NULL DEFAULT 0,
    features_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_id_aliases (
    entity_type TEXT NOT NULL,
    scope_id TEXT NOT NULL DEFAULT '',
    legacy_id INTEGER NOT NULL,
    uuid TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (entity_type, legacy_id)
);

CREATE TABLE IF NOT EXISTS event_store (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    metadata_json TEXT,
    global_seq INTEGER,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS entity_index (
    entity_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    search_vector TEXT,
    tags TEXT,
    metadata_json TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    layer_id TEXT,
    group_id TEXT,
    name TEXT NOT NULL,
    geom_type TEXT NOT NULL,
    geometry_json TEXT NOT NULL,
    geometry_wkb BLOB,
    min_x REAL,
    min_y REAL,
    max_x REAL,
    max_y REAL,
    is_visible BOOLEAN DEFAULT 1,
    note TEXT DEFAULT '',
    properties_json TEXT DEFAULT '{}',
    metadata_json TEXT DEFAULT '{}',
    style_id TEXT,
    task_id TEXT,
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS layers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    region_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    is_visible BOOLEAN DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    metadata_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO pmp_metadata (project_id, device_id) VALUES ('d9d7986b-c630-4e9d-a9ff-ed5309164c0f', 'SIMULATED_DEVICE');
"""

def migrate():
    db_path = "Du_an_165.pmp"
    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Step 1: Rename legacy tables
    legacy_tables = ["features", "layers", "feature_groups", "tasks", "files", "materials", "contracts"]
    for table in legacy_tables:
        try:
            cursor.execute(f"ALTER TABLE {table} RENAME TO v1_{table}")
            print(f"Renamed {table} to v1_{table}")
        except sqlite3.OperationalError as e:
            print(f"Skip renaming {table}: {e}")

    # Step 2: Apply V2 schema
    print("Applying V2 schema...")
    cursor.executescript(SCHEMA_SQL)

    # Step 3: Migrate Layers
    print("Migrating layers...")
    cursor.execute("SELECT id, name, description, is_visible, order_index FROM v1_layers")
    layers = cursor.fetchall()
    layer_map = {} # legacy_id -> uuid
    for row in layers:
        l_id, name, desc, vis, idx = row
        new_uuid = str(uuid.uuid4())
        layer_map[l_id] = new_uuid
        
        cursor.execute(
            "INSERT INTO layers (id, project_id, name, description, is_visible, order_index) VALUES (?, ?, ?, ?, ?, ?)",
            (new_uuid, 'd9d7986b-c630-4e9d-a9ff-ed5309164c0f', name, desc, vis, idx)
        )
        # Add to event_store
        cursor.execute(
            "INSERT INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), 'd9d7986b-c630-4e9d-a9ff-ed5309164c0f', 'Layer', new_uuid, 'LayerCreated', json.dumps({"id": new_uuid, "name": name}))
        )

    # Step 4: Migrate Features
    print("Migrating features...")
    cursor.execute("SELECT id, layer_id, name, geom_type, geometry_json, metadata_json FROM v1_features")
    features = cursor.fetchall()
    for row in features:
        f_id, l_id, name, gtype, gjson, meta = row
        new_uuid = str(uuid.uuid4())
        new_layer_uuid = layer_map.get(l_id)
        
        cursor.execute(
            "INSERT INTO features (id, project_id, layer_id, name, geom_type, geometry_json, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (new_uuid, 'd9d7986b-c630-4e9d-a9ff-ed5309164c0f', new_layer_uuid, name, gtype, gjson, meta)
        )
        
        # Add to event_store
        cursor.execute(
            "INSERT INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), 'd9d7986b-c630-4e9d-a9ff-ed5309164c0f', 'Feature', new_uuid, 'FeatureCreated', json.dumps({"id": new_uuid, "name": name, "geometry": gjson}))
        )
        
        # Entity Index
        cursor.execute(
            "INSERT INTO entity_index (entity_id, entity_type, project_id, name) VALUES (?, ?, ?, ?)",
            (new_uuid, 'Feature', 'd9d7986b-c630-4e9d-a9ff-ed5309164c0f', name)
        )

    conn.commit()
    print("Migration simulation complete.")
    
    # Verify
    cursor.execute("SELECT COUNT(*) FROM event_store")
    print(f"Events in Store: {cursor.fetchone()[0]}")
    cursor.execute("SELECT COUNT(*) FROM features")
    print(f"Features in V2: {cursor.fetchone()[0]}")
    cursor.execute("SELECT COUNT(*) FROM layers")
    print(f"Layers in V2: {cursor.fetchone()[0]}")
    
    conn.close()

if __name__ == "__main__":
    migrate()
