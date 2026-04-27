import sqlite3
import json
import sys

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\Du_an_165.pmp"

def check_features():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Lấy state_json từ design_snapshots
        cursor.execute("SELECT state_json FROM design_snapshots LIMIT 1")
        row = cursor.fetchone()
        
        if not row:
            print("No design snapshot found.")
            return

        state = json.loads(row[0])
        features = state.get('features', {})
        
        print(f"Total features: {len(features)}")
        
        # Tìm feature có name "1" hoặc id "1"
        found = []
        for fid, f in features.items():
            if f.get('name') == '1' or fid == '1':
                found.append(f)
        
        if not found:
            print("Feature '1' not found in state_json.")
            # Show some sample features to understand format
            sample_ids = list(features.keys())[:5]
            for sid in sample_ids:
                f = features[sid]
                print(f"Sample - ID: {sid}, Name: {f.get('name')}, Type: {f.get('geom_type')}")
            return

        for f in found:
            print(f"\n--- Feature ID: {f.get('id')} ---")
            print(f"Name: {f.get('name')}")
            print(f"Geom Type: {f.get('geom_type')}")
            coords = f.get('coordinates')
            print(f"Coordinates Type: {type(coords)}")
            if isinstance(coords, str):
                try:
                    parsed_coords = json.loads(coords)
                    print(f"Parsed Coordinates Length: {len(parsed_coords)}")
                    print(f"First 2 points: {parsed_coords[:2]}")
                except:
                    print(f"Failed to parse coordinates string: {coords[:100]}...")
            elif isinstance(coords, list):
                print(f"Coordinates Length: {len(coords)}")
                print(f"First 2 points: {coords[:2]}")
            
            print(f"Metadata: {f.get('metadata')}")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_features()
