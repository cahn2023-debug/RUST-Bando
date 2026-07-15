import sqlite3
import json
import os

# List of potential DBs to migrate
db_candidates = [
    r"d:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp",
    r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\sqlite.db"
]

def migrate_db(db_path):
    if not os.path.exists(db_path):
        print(f"❌ File not found: {db_path}")
        return

    print(f"🚀 Starting Python migration for: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Check if V2
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='pmp_metadata'")
    if cursor.fetchone():
        print("✅ Database is already V2.")
        return

    # 2. Rename tables
    tables = ["features", "regions", "layers", "world_state", "project_info"]
    for t in tables:
        cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{t}'")
        if cursor.fetchone():
            print(f"   - Renaming {t} to v1_{t}")
            cursor.execute(f"ALTER TABLE {t} RENAME TO v1_{t}")

    # 3. Create V2 infrastructure
    print("   - Creating V2 infrastructure...")
    cursor.executescript("""
        CREATE TABLE pmp_metadata (key TEXT PRIMARY KEY, value TEXT);
        INSERT INTO pmp_metadata (key, value) VALUES ('version', '5.2.0');
        
        CREATE TABLE event_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            aggregate_id TEXT NOT NULL,
            aggregate_type TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            metadata_json TEXT,
            version INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE features (
            id TEXT PRIMARY KEY,
            layer_id TEXT NOT NULL,
            type TEXT NOT NULL,
            geometry_json TEXT NOT NULL,
            properties_json TEXT NOT NULL,
            metadata_json TEXT,
            version INTEGER NOT NULL
        );

        CREATE TABLE layers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            visible INTEGER DEFAULT 1,
            locked INTEGER DEFAULT 0,
            opacity REAL DEFAULT 1.0,
            metadata_json TEXT,
            version INTEGER NOT NULL
        );
    """)

    # 4. Migrate Features
    # Try v1_features first, then features
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='v1_features'")
    src_table = "v1_features" if cursor.fetchone() else "features"
    
    print(f"   - Detecting source features from {src_table}...")
    cursor.execute(f"SELECT id, layer_id, geometry_json, properties_json, geom_type FROM {src_table}")
    rows = cursor.fetchall()
    count = 0
    for row in rows:
        fid, lid, geom, props, gtype = row
        payload = {
            "id": fid,
            "layer_id": lid,
            "geom_type": gtype,
            "geometry": json.loads(geom),
            "properties": json.loads(props)
        }
        
        # Insert into event_store
        cursor.execute(
            "INSERT INTO event_store (aggregate_id, aggregate_type, event_type, payload_json, version) VALUES (?, ?, ?, ?, ?)",
            (fid, "Feature", "FeatureCreated", json.dumps(payload), 1)
        )
        
        # Insert into projection
        cursor.execute(
            "INSERT INTO features (id, layer_id, type, geometry_json, properties_json, version) VALUES (?, ?, ?, ?, ?, ?)",
            (fid, lid, gtype, geom, props, 1)
        )
        count += 1
    
    print(f"   - Migrated {count} features (Camera, Intersections, etc.)")
    
    # Final Polish: Rename generic layers if they look like Camera layers
    cursor.execute("UPDATE layers SET name = 'Camera & Nút giao' WHERE name = 'Lớp dữ liệu' AND id IN (SELECT layer_id FROM features WHERE geom_type = 'Point') LIMIT 1")
    
    conn.commit()
    conn.close()
    print(f"✅ Migration for {os.path.basename(db_path)} completed successfully!")

if __name__ == "__main__":
    for db in db_candidates:
        if os.path.exists(db):
            print(f"\n🔍 Inspecting {db}...")
            migrate_db(db)
            
            # Simple inspection
            conn = sqlite3.connect(db)
            c = conn.cursor()
            
            # Print schema for layers
            print("--- Layers Schema ---")
            c.execute("PRAGMA table_info(layers)")
            cols = [r[1] for r in c.fetchall()]
            print(f"Columns: {', '.join(cols)}")

            print("--- Layers Data ---")
            query = f"SELECT {', '.join(cols[:4])} FROM layers" # Select first 4 columns safely
            c.execute(query)
            for r in c.fetchall():
                print(f"Layer: {r}")
            
            print("--- Feature Counts ---")
            c.execute("PRAGMA table_info(features)")
            f_cols = [r[1] for r in c.fetchall()]
            type_col = "geom_type" if "geom_type" in f_cols else "type"
            c.execute(f"SELECT {type_col}, count(*) FROM features GROUP BY {type_col}")
            for r in c.fetchall():
                print(f"Type: {r[0]} - Count: {r[1]}")
            conn.close()
