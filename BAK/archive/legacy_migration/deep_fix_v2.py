import sqlite3
import json
import os

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"
winner_id = "d9d7986b-c630-4e9d-a9ff-ed5309164c0f"

def deep_fix():
    try:
        conn = sqlite3.connect(db_path, timeout=60)
        cursor = conn.cursor()
        
        # Disable FK
        cursor.execute("PRAGMA foreign_keys = OFF;")
        
        # 1. Align project_id in ALL tables
        # List of tables likely having project_id
        potential_tables = ['projects', 'event_store', 'features', 'pmp_metadata', 'project_settings', 'layers', 'feature_groups', 'work_packages']
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = [r[0] for r in cursor.fetchall()]

        for table in potential_tables:
            if table in existing_tables:
                print(f"Aligning project_id in {table}...")
                try:
                    cursor.execute(f"UPDATE {table} SET project_id = ?", (winner_id,))
                except Exception as e:
                    print(f"  Note: {table} update failed (possibly no project_id column): {e}")

        # 2. Cleanup Projects Table - Preserve the winner ONLY
        print(f"Cleaning up 'projects' table...")
        cursor.execute("DELETE FROM projects WHERE id != ?", (winner_id,))
        
        # 3. Handle Metadata - Only UPDATE to avoid NOT NULL issues
        print("Syncing metadata...")
        cursor.execute("UPDATE pmp_metadata SET project_id = ?", (winner_id,))
        
        # 4. REBUILD FEATURES (The most important part for the Blank Map)
        print("Rebuilding features from event_store...")
        cursor.execute("SELECT entity_id, event_type, payload_json FROM event_store WHERE project_id = ? ORDER BY global_seq ASC", (winner_id,))
        events = cursor.fetchall()
        
        feature_states = {}
        
        for eid, etype, payload_raw in events:
            if etype not in ["FeatureCreated", "FeatureGeometryUpdated", "FeaturePropertiesUpdated", "FeatureDeleted"]:
                continue
            
            try:
                payload = json.loads(payload_raw)
                if etype == "FeatureCreated":
                    feature_states[eid] = {
                        'id': eid,
                        'name': payload.get('name', 'Unnamed'),
                        'geom_type': payload.get('geom_type', 'Point'),
                        'geometry_json': json.dumps(payload.get('geometry', {})),
                        'properties_json': json.dumps(payload.get('properties', {})),
                        'layer_id': payload.get('layer_id', 'default')
                    }
                elif etype == "FeatureGeometryUpdated":
                    if eid in feature_states:
                        feature_states[eid]['geometry_json'] = json.dumps(payload.get('geometry', {}))
                elif etype == "FeaturePropertiesUpdated":
                    if eid in feature_states:
                        # Merge properties if possible or just update
                        props = json.loads(feature_states[eid]['properties_json'])
                        new_props = payload.get('properties', {})
                        props.update(new_props)
                        feature_states[eid]['properties_json'] = json.dumps(props)
                elif etype == "FeatureDeleted":
                    if eid in feature_states:
                        del feature_states[eid]
            except:
                continue

        print(f"Calculated state for {len(feature_states)} features.")
        
        # Clear and Batch Insert
        cursor.execute("DELETE FROM features")
        
        insert_data = []
        for fid, f in feature_states.items():
            insert_data.append((fid, winner_id, f['name'], f['geom_type'], f['geometry_json'], f['properties_json'], f.get('layer_id', 'default')))
        
        if insert_data:
            cursor.executemany("""
                INSERT INTO features (id, project_id, name, geom_type, geometry_json, properties_json, layer_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, insert_data)
            print(f"Restored {len(insert_data)} features.")

        # Re-enable FK
        cursor.execute("PRAGMA foreign_keys = ON;")
        
        conn.commit()
        conn.close()
        print("\n=== DEEP FIX COMPLETED SUCCESSFULLY ===")
        
    except Exception as e:
        print(f"ERROR during deep fix: {e}")

if __name__ == "__main__":
    deep_fix()
