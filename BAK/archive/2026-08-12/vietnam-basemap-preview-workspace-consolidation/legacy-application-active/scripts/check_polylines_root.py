import sqlite3
import json
import os

def check_db(db_path):
    print(f"\n--- Checking {db_path} ---")
    if not os.path.exists(db_path):
        print("File not found.")
        return
        
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Search in design_events
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='design_events'")
        if cursor.fetchone():
            cursor.execute("SELECT event_id, payload_json FROM design_events WHERE is_undone = 0")
            rows = cursor.fetchall()
            for event_id, payload_json in rows:
                try:
                    payload = json.loads(payload_json)
                    event_payload = payload.get('payload', payload)
                    geom_type = str(event_payload.get('geom_type', '')).lower()
                    if 'line' in geom_type or 'poly' in geom_type:
                        print(f"  [EVENT] ID={event_payload.get('id')}, Name={event_payload.get('name')}, Type={geom_type}")
                        coords = event_payload.get('coordinates')
                        print(f"  Coords Sample: {str(coords)[:100]}")
                except: continue

        # Search in design_snapshots
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='design_snapshots'")
        if cursor.fetchone():
            cursor.execute("SELECT state_json FROM design_snapshots")
            rows = cursor.fetchall()
            for row in rows:
                try:
                    state = json.loads(row[0])
                    features = state.get('features', {})
                    for fid, f in features.items():
                        geom_type = str(f.get('geom_type', '')).lower()
                        if 'line' in geom_type or 'poly' in geom_type:
                            print(f"  [SNAPSHOT] ID={fid}, Name={f.get('name')}, Type={geom_type}")
                            coords = f.get('coordinates')
                            print(f"  Coords Sample: {str(coords)[:100]}")
                except: continue
        
        conn.close()
    except Exception as e:
        print(f"Error checking {db_path}: {e}")

if __name__ == "__main__":
    check_db('sqlite.db')
    check_db('Du_an_165.pmp')
