import sqlite3
import json
import sys

db_path = "Du_an_165.pmp"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("Peeking at feature events...")
cursor.execute("SELECT payload_json FROM event_store WHERE entity_type='feature' LIMIT 5")
rows = cursor.fetchall()
for i, row in enumerate(rows):
    payload = json.loads(row[0])
    print(f"\nFeature {i+1}:")
    # In V2, FeatureCreated payload usually has geometry
    geom = payload.get("data", {}).get("geometry")
    print(json.dumps(geom, indent=2))

conn.close()
