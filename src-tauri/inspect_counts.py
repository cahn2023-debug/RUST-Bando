import sqlite3
import os

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\src-tauri\project_v4.pmp"

def check():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- Projects in 'projects' table ---")
    cursor.execute("SELECT id, name FROM projects")
    for r in cursor.fetchall():
        print(f"ID: {r[0]}, Name: {r[1]}")
        
    print("\n--- Project IDs in 'event_store' ---")
    cursor.execute("SELECT project_id, COUNT(*) FROM event_store GROUP BY project_id")
    for r in cursor.fetchall():
        print(f"ProjectID: {r[0]}, Count: {r[1]}")
        
    print("\n--- Project IDs in 'design_events' ---")
    cursor.execute("SELECT project_id, COUNT(*) FROM design_events GROUP BY project_id")
    for r in cursor.fetchall():
        print(f"ProjectID: {r[0]}, Count: {r[1]}")
        
    print("\n--- Features count ---")
    cursor.execute("SELECT COUNT(*) FROM features")
    print(f"Total features: {cursor.fetchone()[0]}")
    
    conn.close()

if __name__ == "__main__":
    check()
