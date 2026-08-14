import sqlite3
import json
import os

def check_pmp_db():
    db_path = 'Du_an_165.pmp'
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found.")
        return
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"--- Checking {db_path} ---")
    
    # Check tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [t[0] for t in cursor.fetchall()]
    print(f"Tables: {tables}")
    
    # Check features table (if exists)
    if 'features' in tables:
        print("\n[features table]")
        cursor.execute("SELECT id, name, geom_type, coordinates FROM features WHERE LOWER(geom_type) LIKE '%poly%' OR LOWER(geom_type) LIKE '%line%'")
        rows = cursor.fetchall()
        for row in rows:
            print(f"ID: {row[0]}, Name: {row[1]}, Type: {row[2]}")
            print(f"  Coords: {row[3][:200]}...")
            
    # Check design_events table
    if 'design_events' in tables:
        print("\n[design_events table]")
        cursor.execute("SELECT event_id, event_type, payload_json FROM design_events WHERE is_undone = 0")
        rows = cursor.fetchall()
        for row in rows:
            try:
                payload = json.loads(row[2])
                # Check for feature creation/update events
                # Payload might be nested
                data = payload.get('payload', payload)
                if isinstance(data, dict):
                    geom_type = str(data.get('geom_type', '')).lower()
                    if 'poly' in geom_type or 'line' in geom_type:
                        print(f"Event: {row[1]}, ID: {data.get('id')}, Name: {data.get('name')}")
                        print(f"  Coords: {str(data.get('coordinates'))[:200]}...")
            except:
                continue
                
    conn.close()

if __name__ == "__main__":
    check_pmp_db()
