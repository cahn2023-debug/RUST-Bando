import sqlite3
import os

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

def check_events():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM design_events")
        print(f"Total events: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT event_type, COUNT(*) FROM design_events GROUP BY event_type")
        for row in cursor.fetchall():
            print(f"Event: {row[0]}, Count: {row[1]}")
            
        cursor.execute("SELECT payload_json FROM design_events WHERE event_type='FeatureCreated' LIMIT 5")
        for row in cursor.fetchall():
            print(f"Payload: {row[0][:200]}...")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_events()
