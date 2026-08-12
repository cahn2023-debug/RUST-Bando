import sqlite3
import json
import uuid
import random

db_path = "d:/Code Antinigaty/Phan mem quan ly file V4/RUST/Du_an_165.pmp"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get project_id
cursor.execute("SELECT id FROM projects LIMIT 1")
row = cursor.fetchone()
if not row:
    project_id = "test_project"
    cursor.execute("INSERT INTO projects (id, name, root_path) VALUES (?, ?, ?)", (project_id, "Test Project", "C:/"))
else:
    project_id = row[0]

# Generate 10,000 features
num_features = 10000
center_lng = 105.83
center_lat = 21.02
spread = 0.5 # ~50km

print(f"Generating {num_features} features for project {project_id}...")

features_to_insert = []
events_to_insert = []

for i in range(num_features):
    f_id = str(uuid.uuid4())
    lng = center_lng + (random.random() - 0.5) * spread
    lat = center_lat + (random.random() - 0.5) * spread
    
    geom = {"type": "Point", "coordinates": [lng, lat]}
    geom_json = json.dumps(geom)
    
    # Feature Created event
    event_id = str(uuid.uuid4())
    payload = {
        "id": f_id,
        "name": f"Perf Feature {i}",
        "geom_type": "Point",
        "geometry_json": geom_json,
        "properties_json": "{}"
    }
    
    features_to_insert.append((
        f_id, project_id, f"Perf Feature {i}", "Point", geom_json,
        lng, lat, lng, lat, "{}"
    ))
    
    events_to_insert.append((
        event_id, project_id, "FeatureCreated", json.dumps(payload)
    ))

# Using transaction for speed
cursor.execute("BEGIN TRANSACTION")
try:
    cursor.executemany(
        "INSERT INTO features (id, project_id, name, geom_type, geometry_json, min_x, min_y, max_x, max_y, properties_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
        features_to_insert
    )
    cursor.executemany(
        "INSERT INTO design_events (event_id, project_id, event_type, payload_json) VALUES (?,?,?,?)",
        events_to_insert
    )
    conn.commit()
    print("Successfully inserted 10,000 features.")
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")

conn.close()
