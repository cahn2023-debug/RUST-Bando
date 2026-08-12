import sqlite3
import json
import os

def check_db():
    try:
        db_path = 'sqlite.db'
        if not os.path.exists(db_path):
            print(f"Error: {db_path} not found in {os.getcwd()}")
            return
            
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Search in design_events
        print("Searching in design_events...")
        cursor.execute("SELECT event_id, payload_json FROM design_events WHERE is_undone = 0")
        rows = cursor.fetchall()
        
        found = False
        for event_id, payload_json in rows:
            try:
                # payload_json is a string from DesignEventType
                # e.g. {"type": "FeatureCreated", "payload": {...}}
                payload = json.loads(payload_json)
                
                # Check directly or in nested payload
                event_payload = payload.get('payload', payload) 
                
                geom_type = str(event_payload.get('geom_type', '')).lower()
                if 'line' in geom_type or 'poly' in geom_type:
                    print(f"\n[EVENT] ID={event_payload.get('id')}, Name={event_payload.get('name')}, Type={geom_type}")
                    coords = event_payload.get('coordinates')
                    print(f"Coordinates Type: {type(coords)}")
                    print(f"Coordinates Sample: {str(coords)[:200]}")
                    found = True
            except Exception as e:
                # print(f"Error parsing row: {e}")
                continue
                
        # Search in design_snapshots
        print("\nSearching in design_snapshots...")
        cursor.execute("SELECT state_json FROM design_snapshots")
        rows = cursor.fetchall()
        for row in rows:
            try:
                state = json.loads(row[0])
                features = state.get('features', {})
                for fid, f in features.items():
                    geom_type = str(f.get('geom_type', '')).lower()
                    if 'line' in geom_type or 'poly' in geom_type:
                        print(f"\n[SNAPSHOT] ID={fid}, Name={f.get('name')}, Type={geom_type}")
                        coords = f.get('coordinates')
                        print(f"Coordinates Type: {type(coords)}")
                        print(f"Coordinates Sample: {str(coords)[:200]}")
                        found = True
            except:
                continue
                
        if not found:
            print("No Line/Poly features found in DB.")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_db()
