import sqlite3
import json
import uuid
import os
from datetime import datetime

# CONFIRMED PATHS
V1_DB = r"D:\Code Antinigaty\Phan mem quan ly file V4\MICROSOFT C\bin\Debug\net6.0-windows\offline_pm.db"
V2_DB = r"D:\Code Antinigaty\Phan mem quan ly file V4\RUST\src-tauri\project_v4.pmp"

PROJECT_ID = "d9d7986b-c630-4e9d-a9ff-ed5309164c0f"

def get_now():
    return datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

def sync():
    print(f"Source V1: {V1_DB}")
    print(f"Target V2: {V2_DB}")

    v1_conn = sqlite3.connect(V1_DB)
    v2_conn = sqlite3.connect(V2_DB)
    v1_cursor = v1_conn.cursor()
    v2_cursor = v2_conn.cursor()

    # 0. Check tables in V1
    v1_cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    v1_tables = [r[0] for r in v1_cursor.fetchall()]
    print(f"Available tables in V1: {v1_tables}")

    # Helper for case-insensitive table check
    def get_table_name(target):
        for t in v1_tables:
            if t.lower() == target.lower(): return t
        return None

    # 1. Map Layers
    layers_table = get_table_name("Layers")
    if not layers_table:
        print("ERROR: Could not find 'Layers' table in V1")
        return
    
    print(f"Syncing Layers from {layers_table}...")
    layer_map = {} # v1_id -> v2_uuid
    v1_cursor.execute(f"SELECT Id, Name FROM {layers_table}")
    v1_layers = v1_cursor.fetchall()
    
    for l_id, name in v1_layers:
        v2_cursor.execute("SELECT id FROM layers WHERE name = ?", (name,))
        row = v2_cursor.fetchone()
        if row:
            layer_uuid = row[0]
            print(f"  Layer '{name}' already exists.")
        else:
            layer_uuid = str(uuid.uuid4())
            now = get_now()
            v2_cursor.execute("INSERT INTO layers (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                             (layer_uuid, PROJECT_ID, name, f"Migrated from V1: {name}", now, now))
            
            payload = {"type": "LayerCreated", "project_id": PROJECT_ID, "layer": {"id": layer_uuid, "project_id": PROJECT_ID, "name": name, "created_at": now, "updated_at": now}}
            v2_cursor.execute("INSERT INTO event_store (id, type, project_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                             (str(uuid.uuid4()), "LayerCreated", PROJECT_ID, json.dumps(payload), now))
            print(f"  Created Layer '{name}' -> {layer_uuid}")
        
        layer_map[l_id] = layer_uuid

    # 2. Sync Features
    feature_configs = [
        {"v1_table": "Points", "geom": "Point", "has_coords": True},
        {"v1_table": "Cameras", "geom": "Point", "has_coords": True},
        {"v1_table": "Intersections", "geom": "Point", "has_coords": True},
        {"v1_table": "Lines", "geom": "LineString", "has_coords": False}
    ]

    total_count = 0
    for config in feature_configs:
        v1_table_name = get_table_name(config["v1_table"])
        if not v1_table_name:
            print(f"Skipping {config['v1_table']} (not found in V1)")
            continue

        print(f"Syncing {v1_table_name}...")
        v1_cursor.execute(f"SELECT * FROM {v1_table_name}")
        cols = [c[0] for c in v1_cursor.description]
        
        for row in v1_cursor.fetchall():
            d = dict(zip(cols, row))
            # Handle case-insensitive columns
            name = next((v for k,v in d.items() if k.lower() == 'name'), f"{config['v1_table']} {d.get('Id') or d.get('id')}")
            l_v1_id = next((v for k,v in d.items() if k.lower() == 'layerid'), None)
            l_uuid = layer_map.get(l_v1_id)
            
            v2_cursor.execute("SELECT id FROM features WHERE name = ? AND geom_type = ?", (name, config["geom"]))
            if v2_cursor.fetchone(): continue

            f_uuid = str(uuid.uuid4())
            now = get_now()
            
            if config["has_coords"]:
                lat = next((v for k,v in d.items() if k.lower() == 'latitude'), 0)
                lon = next((v for k,v in d.items() if k.lower() == 'longitude'), 0)
                geometry = {"type": "Point", "coordinates": [lon, lat]}
            else:
                try:
                    c_json = next((v for k,v in d.items() if k.lower() in ['coordinatesjson', 'geometryjson']), None)
                    if not c_json: continue
                    coords_v1 = json.loads(c_json)
                    geometry = {"type": "LineString", "coordinates": [[c[1], c[0]] for c in coords_v1]}
                except: continue

            geom_json = json.dumps(geometry)
            props_json = next((v for k,v in d.items() if k.lower() == 'metadata'), "{}")
            
            v2_cursor.execute("""INSERT INTO features (id, project_id, name, geom_type, geometry_json, properties_json, layer_id, created_at, updated_at, is_visible)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""", (f_uuid, PROJECT_ID, name, config["geom"], geom_json, props_json, l_uuid, now, now))
            
            payload = {"type": "FeatureCreated", "project_id": PROJECT_ID, "feature": {"id": f_uuid, "project_id": PROJECT_ID, "name": name, "geom_type": config["geom"], "geometry_json": geom_json, "properties_json": props_json, "layer_id": l_uuid, "created_at": now, "updated_at": now}}
            v2_cursor.execute("INSERT INTO event_store (id, type, project_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                             (str(uuid.uuid4()), "FeatureCreated", PROJECT_ID, json.dumps(payload), now))
            total_count += 1

    v2_conn.commit()
    v1_conn.close()
    v2_conn.close()
    print(f"Sync complete! Migrated {total_count} features.")

if __name__ == "__main__":
    sync()
