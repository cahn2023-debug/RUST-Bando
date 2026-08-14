import sqlite3
import json
import os

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\TOOL\database\1213.pmp"

def inspect_features():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT state_json FROM design_snapshots LIMIT 1")
        row = cursor.fetchone()
        
        if not row:
            print("No design snapshot found in 1213.pmp")
            return

        state = json.loads(row[0])
        features = state.get('features', {})
        
        print(f"Total features: {len(features)}")
        
        # Look for the selected feature in screenshot
        # Based on screenshot: Name is "1", group is "TUYẾN CÁP QUANG NGẦM 48FO"
        target_f = None
        for f in features.values():
            if f.get('name') == '1':
                target_f = f
                break
        
        if not target_f:
            print("Target feature '1' not found. Listing first 5 features:")
            for i, f in enumerate(list(features.values())[:5]):
                print(f"[{i}] ID: {f.get('id')}, Name: {f.get('name')}, Type: {f.get('geom_type')}")
            return

        print(f"\n--- FOUND FEATURE '1' ---")
        print(f"ID: {target_f.get('id')}")
        print(f"Geom Type: {target_f.get('geom_type')}")
        print(f"Group ID: {target_f.get('group_id')}")
        
        coords = target_f.get('coordinates')
        print(f"Coordinates (raw): {coords}")
        
        if isinstance(coords, str):
            try:
                parsed = json.loads(coords)
                print(f"Parsed Coordinates Length: {len(parsed)}")
                print(f"Points: {parsed}")
            except:
                print("Failed to parse coordinates string.")
        elif isinstance(coords, list):
            print(f"Coordinates Length: {len(coords)}")
            print(f"Points: {coords}")

        print(f"\nMetadata: {json.dumps(target_f.get('metadata'), indent=2, ensure_ascii=False)}")
        
        # Check group visibility
        groups = state.get('feature_groups', {})
        gid = target_f.get('group_id')
        if gid and gid in groups:
            group = groups[gid]
            print(f"\n--- Group Info ---")
            print(f"Group Name: {group.get('name')}")
            print(f"Is Visible: {group.get('is_visible')}")
            print(f"Type: {group.get('type')}")
        else:
            print(f"\nGroup {gid} not found in state.")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_features()
