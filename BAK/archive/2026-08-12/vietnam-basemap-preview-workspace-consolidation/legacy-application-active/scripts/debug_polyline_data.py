import sqlite3
import json

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\Du_an_165.pmp"

def debug_polylines():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT state_json FROM design_snapshots LIMIT 1")
        row = cursor.fetchone()
        
        if not row:
            print("No design snapshot found.")
            return

        state = json.loads(row[0])
        features = state.get('features', {})
        
        polylines = []
        for fid, f in features.items():
            gtype = str(f.get('geom_type', '')).lower()
            if gtype in ['polyline', 'linestring', 'path', 'multilinestring']:
                polylines.append(f)
            elif not gtype or gtype == 'none':
                # Check coordinates to see if it's a line
                coords = f.get('coordinates')
                if isinstance(coords, list) and len(coords) > 1 and isinstance(coords[0], list):
                    polylines.append(f)
                elif isinstance(coords, str) and coords.startswith('[['):
                    polylines.append(f)

        print(f"Found {len(polylines)} potential polylines.")
        
        for f in polylines[:10]:
            print(f"\nID: {f.get('id')}, Name: {f.get('name')}")
            print(f"Original Geom Type: '{f.get('geom_type')}'")
            print(f"Coordinates Type: {type(f.get('coordinates'))}")
            coords = f.get('coordinates')
            if isinstance(coords, str):
                print(f"Raw Coords (first 100 chars): {coords[:100]}")
            elif isinstance(coords, list):
                print(f"Coords Sample: {coords[:2]}")
            
            # Check metadata for color/size
            print(f"Metadata keys: {list(f.get('metadata', {}).keys())}")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_polylines()
