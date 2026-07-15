import sqlite3
import json
import os

# SOURCES
GIS_DB = r"D:\Code Antinigaty\Phan mem quan ly file V4\RUST\sqlite.db"
FILE_DB = r"D:\Code Antinigaty\Phan mem quan ly file V4\RUST\src-tauri\project_v4.pmp"
# TARGET
TARGET_DB = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

PROJECT_ID = "d9d7986b-c630-4e9d-a9ff-ed5309164c0f"

def merge():
    print(f"Merging {GIS_DB} and {FILE_DB} into {TARGET_DB}...")
    
    if not os.path.exists(TARGET_DB):
        print("ERROR: Target DB not found")
        return

    target_conn = sqlite3.connect(TARGET_DB)
    target_cursor = target_conn.cursor()

    # Clear target for fresh start
    target_cursor.execute("DELETE FROM event_store")
    tables_to_clear = ['layers', 'features', 'files', 'tags', 'file_tags', 'tasks', 'personnel', 'contracts']
    for t in tables_to_clear:
        try: target_cursor.execute(f"DELETE FROM {t}")
        except: pass

    # 1. Import from FILE_DB
    print("Importing File events...")
    file_conn = sqlite3.connect(FILE_DB)
    events = file_conn.execute("SELECT id, type, project_id, payload_json, created_at FROM event_store").fetchall()
    target_cursor.executemany("INSERT OR IGNORE INTO event_store (id, type, project_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)", events)
    file_conn.close()

    # 2. Import from GIS_DB
    print("Importing GIS events...")
    gis_conn = sqlite3.connect(GIS_DB)
    events = gis_conn.execute("SELECT id, type, project_id, payload_json, created_at FROM event_store").fetchall()
    target_cursor.executemany("INSERT OR IGNORE INTO event_store (id, type, project_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)", events)
    gis_conn.close()

    target_conn.commit()
    
    final_count = target_cursor.execute("SELECT COUNT(*) FROM event_store").fetchone()[0]
    print(f"Merge complete! Total events in target: {final_count}")
    target_conn.close()

if __name__ == "__main__":
    merge()
