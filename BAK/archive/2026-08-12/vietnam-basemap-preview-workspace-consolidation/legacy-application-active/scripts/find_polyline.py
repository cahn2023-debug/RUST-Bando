import sqlite3
import json

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

def find_polyline_event():
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Search for FeatureCreated events where name in payload is '1'
        cursor.execute("SELECT payload_json FROM design_events WHERE event_type='FeatureCreated'")
        for row in cursor.fetchall():
            try:
                payload = json.loads(row[0])
                f_data = payload.get('payload', {})
                if f_data.get('name') == '1':
                    print(json.dumps(f_data, indent=2, ensure_ascii=False))
                    # Break if it's the one we want (Polyline)
                    if f_data.get('geom_type') in ['LineString', 'POLYLINE', 'polyline', 'linestring']:
                        print("Found polyline event!")
                        break
            except json.JSONDecodeError as je:
                print(f"Failed to parse JSON: {je}")
            except KeyError as ke:
                print(f"Missing key in payload: {ke}")

    except sqlite3.Error as se:
        print(f"Database error: {se}")
    except Exception as e:
        print(f"Unexpected error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    find_polyline_event()
