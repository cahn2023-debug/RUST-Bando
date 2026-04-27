import sqlite3
import os

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\src-tauri\project_v4.pmp"

def list_tables():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [t[0] for t in cursor.fetchall()]
    print(f"Total tables: {len(tables)}")
    
    # Check v1 tables
    v1_tables = [t for t in tables if t.startswith("v1_")]
    print(f"Legacy V1 tables: {v1_tables}")
    for t in v1_tables:
        cursor.execute(f"SELECT COUNT(*) FROM \"{t}\"")
        print(f"  - {t}: {cursor.fetchone()[0]} rows")
        
    # Check core V2 tables
    v2_tables = ["event_store", "design_events", "projects", "features", "layers"]
    print(f"Core V2 tables:")
    for t in v2_tables:
        if t in tables:
            cursor.execute(f"SELECT COUNT(*) FROM \"{t}\"")
            print(f"  - {t}: {cursor.fetchone()[0]} rows")
        else:
            print(f"  - {t}: MISSING")
            
    # Sample from event_store if it exists
    if "event_store" in tables:
        cursor.execute("SELECT event_type, project_id, COUNT(*) FROM event_store GROUP BY event_type, project_id LIMIT 10")
        print("\nEvent Store Samples (Grouped):")
        for r in cursor.fetchall():
            print(f"  - Type: {r[0]}, ProjectID: {r[1]}, Count: {r[2]}")
            
    conn.close()

if __name__ == "__main__":
    list_tables()
