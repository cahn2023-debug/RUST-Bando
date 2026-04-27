import sqlite3
import json
import os

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"
winner_id = "d9d7986b-c630-4e9d-a9ff-ed5309164c0f"

def cleanup_and_fix():
    try:
        # Connect to DB
        conn = sqlite3.connect(db_path, timeout=30)
        cursor = conn.cursor()
        
        print("--- DISABLING FOREIGN KEYS TEMPORARILY ---")
        cursor.execute("PRAGMA foreign_keys = OFF;")
        
        # 1. Update ALL tables to use the Winner ID
        tables_to_sync = ['event_store', 'features', 'pmp_metadata']
        for table in tables_to_sync:
            try:
                cursor.execute(f"UPDATE {table} SET project_id = ?", (winner_id,))
                print(f"Updated {table} to project_id={winner_id}")
            except:
                pass

        # 2. Delete ALL other project rows
        cursor.execute("DELETE FROM projects WHERE id != ?", (winner_id,))
        print(f"Purged redundant project rows. Remaining: {cursor.rowcount + 1}")
        
        # 3. Ensure ONE entry in pmp_metadata
        cursor.execute("DELETE FROM pmp_metadata")
        cursor.execute("INSERT INTO pmp_metadata (project_id) VALUES (?)", (winner_id,))
        
        # 4. Re-enable FK
        cursor.execute("PRAGMA foreign_keys = ON;")
        
        conn.commit()
        print("\n--- DATABASE ALIGNMENT COMPLETED ---")
        
        # 5. REBUILD FEATURES FROM EVENT STORE (Simulation)
        print("\n--- REBUILDING FEATURES FROM EVENT_STORE ---")
        cursor.execute("SELECT entity_id, event_type, payload_json FROM event_store WHERE project_id = ? ORDER BY global_seq ASC", (winner_id,))
        events = cursor.fetchall()
        
        feature_state = {} # id -> data
        
        for eid, etype, payload_raw in events:
            try:
                payload = json.loads(payload_raw)
                if etype == "FeatureCreated":
                    feature_state[eid] = {
                        'id': eid,
                        'name': payload.get('name', 'Unnamed'),
                        'geom_type': payload.get('geom_type', 'Point'),
                        'geometry_json': json.dumps(payload.get('geometry', {})),
                        'properties_json': json.dumps(payload.get('properties', {})),
                        'layer_id': payload.get('layer_id', 'default')
                    }
                elif etype == "FeatureGeometryUpdated":
                    if eid in feature_state:
                        feature_state[eid]['geometry_json'] = json.dumps(payload.get('geometry', {}))
                elif etype == "FeaturePropertiesUpdated":
                    if eid in feature_state:
                        feature_state[eid]['properties_json'] = json.dumps(payload.get('properties', {}))
                elif etype == "FeatureDeleted":
                    if eid in feature_state:
                        del feature_state[eid]
            except:
                continue

        print(f"Extracted {len(feature_state)} active features.")
        
        # Insert into features table
        cursor.execute("DELETE FROM features")
        for fid, f in feature_state.items():
            cursor.execute("""
                INSERT INTO features (id, project_id, name, geom_type, geometry_json, properties_json, layer_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (f['id'], winner_id, f['name'], f['geom_type'], f['geometry_json'], f['properties_json'], f['layer_id']))
            
        conn.commit()
        print(f"Re-inserted {len(feature_state)} features into database.")
        conn.close()
        
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")

if __name__ == "__main__":
    cleanup_and_fix()
