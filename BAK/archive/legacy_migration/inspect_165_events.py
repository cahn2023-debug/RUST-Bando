import sqlite3
import os

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

def inspect_events():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- Event types in event_store ---")
    cursor.execute("SELECT event_type, COUNT(*) FROM event_store GROUP BY event_type")
    for r in cursor.fetchall():
        print(f" - {r[0]}: {r[1]} rows")
        
    print("\n--- Sample FeatureCreated event ---")
    cursor.execute("SELECT payload_json FROM event_store WHERE event_type = 'FeatureCreated' LIMIT 1")
    row = cursor.fetchone()
    if row:
        print(row[0])
    else:
        print("No FeatureCreated events found.")
        
    conn.close()

if __name__ == "__main__":
    inspect_events()
