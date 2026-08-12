import sqlite3
import json
import os

db_path = "TOOL/database/1213.pmp"

if not os.path.exists(db_path):
    print(f"Database {db_path} not found.")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. List Tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print(f"Tables in {db_path}:")
for table in tables:
    # Get row count
    cursor.execute(f"SELECT COUNT(*) FROM {table}")
    count = cursor.fetchone()[0]
    print(f"  - {table} ({count} rows)")

# 2. Schema of design_events and features
for table in ["design_events", "features", "work_items"]:
    if table in tables:
        print(f"\n--- Schema of {table} ---")
        cursor.execute(f"PRAGMA table_info({table})")
        for col in cursor.fetchall():
            print(f"  {col[1]} ({col[2]})")

# 3. Last Move Event
if "design_events" in tables:
    print("\n--- Last 5 Design Events ---")
    cursor.execute("SELECT event_type, payload_json FROM design_events ORDER BY rowid DESC LIMIT 5")
    for row in cursor.fetchall():
        print(f"  Type: {row[0]}")
        try:
            payload = json.loads(row[1])
            if row[0] == "FeatureUpdated":
                print(f"    ID: {payload.get('payload', {}).get('id')}")
                print(f"    Coords: {payload.get('payload', {}).get('coordinates')}")
            else:
                print(f"    Payload: {row[1][:100]}...")
        except:
             print(f"    Raw Payload: {row[1][:100]}...")

conn.close()
