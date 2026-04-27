import sqlite3
import json
import os

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

def inspect():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT state_json FROM design_snapshots LIMIT 1")
        row = cursor.fetchone()
        if not row:
            print("No snapshot.")
            return
        
        state = json.loads(row[0])
        features = state.get('features', {})
        
        # Look for name "1"
        for f in features.values():
            if f.get('name') == '1':
                print(json.dumps(f, indent=2, ensure_ascii=False))
                break
        else:
            print("Not found name '1'")
            # Print first 2 features to check structure
            keys = list(features.keys())[:2]
            for k in keys:
                print(f"Sample {k}: {json.dumps(features[k], indent=2, ensure_ascii=False)}")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect()
