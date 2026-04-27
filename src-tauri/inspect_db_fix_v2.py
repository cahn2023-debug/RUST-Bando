import sqlite3
import json
import os

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

def inspect():
    if not os.path.exists(db_path):
        print(f"File not found at {db_path}")
        return
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- Projects (projects table) ---")
    cursor.execute("SELECT id, name FROM projects")
    rows = cursor.fetchall()
    for r in rows:
        print(r)
    if not rows:
        print("Empty projects table!")
        
    print("\n--- Event Store Counts per Project ID ---")
    cursor.execute("SELECT project_id, COUNT(*) FROM event_store GROUP BY project_id")
    for r in cursor.fetchall():
        print(r)
        
    print("\n--- PMP Metadata (pmp_metadata table) ---")
    try:
        cursor.execute("SELECT project_id FROM pmp_metadata")
        print(cursor.fetchall())
    except Exception as e:
        print(f"pmp_metadata Error: {e}")
        
    print("\n--- Features Count ---")
    cursor.execute("SELECT COUNT(*) FROM features")
    print(cursor.fetchone())

    print("\n--- Project Settings ---")
    try:
        cursor.execute("SELECT project_id, key, value FROM project_settings")
        for r in cursor.fetchall():
            print(f"ID: {r[0]}, Key: {r[1]}, Val: {r[2][:50]}")
    except:
        print("No project_settings table")

    conn.close()

if __name__ == "__main__":
    inspect()
