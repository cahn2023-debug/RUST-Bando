import sqlite3, json, uuid, os
from datetime import datetime

V1_DB = r"D:\Code Antinigaty\Phan mem quan ly file V4\MICROSOFT C\bin\Debug\net6.0-windows\offline_pm.db"
V2_DB = r"D:\Code Antinigaty\Phan mem quan ly file V4\RUST\src-tauri\project_v4.pmp"
PROJECT_ID = "d9d7986b-c630-4e9d-a9ff-ed5309164c0f"

def sync():
    # Use URI for Read-Only
    v1_uri = f"file:{V1_DB.replace('\\', '/')}?mode=ro"
    print(f"Source V1 (URI): {v1_uri}")
    
    v1_conn = sqlite3.connect(v1_uri, uri=True)
    v2_conn = sqlite3.connect(V2_DB)
    v1_cursor = v1_conn.cursor()
    v2_cursor = v2_conn.cursor()

    v1_cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in v1_cursor.fetchall()]
    print(f"Tables in V1: {tables}")
    
    if not tables:
        print("ERROR: Still no tables found.")
        return

    # Map Layers
    layer_map = {}
    v1_cursor.execute("SELECT Id, Name FROM Layers")
    for l_id, name in v1_cursor.fetchall():
        v2_cursor.execute("SELECT id FROM layers WHERE name = ?", (name,))
        row = v2_cursor.fetchone()
        layer_uuid = row[0] if row else str(uuid.uuid4())
        if not row:
            now = datetime.utcnow().isoformat()
            v2_cursor.execute("INSERT INTO layers (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", (layer_uuid, PROJECT_ID, name, now, now))
        layer_map[l_id] = layer_uuid

    # Features
    count = 0
    for t_src, g_type in [("Points","Point"), ("Cameras","Point"), ("Intersections","Point"), ("Lines","LineString")]:
        print(f"Processing {t_src}...")
        v1_cursor.execute(f"SELECT * FROM {t_src}")
        cols = [c[0] for c in v1_cursor.description]
        for row in v1_cursor.fetchall():
            d = dict(zip(cols, row))
            name = d.get("Name") or f"{t_src} {d['Id']}"
            l_uuid = layer_map.get(d.get("LayerId"))
            
            # Simple deduplication
            v2_cursor.execute("SELECT id FROM features WHERE name = ?", (name,))
            if v2_cursor.fetchone(): continue
            
            f_uuid = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()
            
            if t_src != "Lines":
                geom = {"type":"Point", "coordinates":[d["Longitude"], d["Latitude"]]}
            else:
                coords = json.loads(d["CoordinatesJson"])
                geom = {"type":"LineString", "coordinates":[[c[1], c[0]] for c in coords]}
            
            g_json = json.dumps(geom)
            v2_cursor.execute("INSERT INTO features (id, project_id, name, geom_type, geometry_json, layer_id, created_at, updated_at, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
                             (f_uuid, PROJECT_ID, name, g_type, g_json, l_uuid, now, now))
            count += 1
            
    v2_conn.commit()
    print(f"Sync finished. {count} features added.")

if __name__ == "__main__":
    sync()
