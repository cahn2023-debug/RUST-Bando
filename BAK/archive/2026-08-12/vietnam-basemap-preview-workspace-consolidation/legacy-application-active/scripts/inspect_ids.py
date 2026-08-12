import sqlite3
import os

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- SCHEMA EVENT_STORE ---")
cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='event_store'")
print(cursor.fetchone()[0])

print("\n--- PROJECTS ---")
cursor.execute("SELECT id, name FROM projects")
projects = cursor.fetchall()
for p in projects:
    print(f"Project: ID={p[0]}, Name={p[1]}")

print("\n--- EVENT STORE (DISTINCT PROJECT_IDs) ---")
cursor.execute("SELECT DISTINCT project_id, COUNT(*) FROM event_store GROUP BY project_id")
evt_projects = cursor.fetchall()
for ep in evt_projects:
    print(f"EventStore ProjectID: {ep[0]} (Count: {ep[1]})")

print("\n--- V1 PROJECTS ---")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='v1_projects'")
if cursor.fetchone():
    cursor.execute("SELECT id, name FROM v1_projects")
    v1_projects = cursor.fetchall()
    for vp in v1_projects:
        print(f"V1 Project: ID={vp[0]}, Name={vp[1]}")
else:
    print("v1_projects not found")

    # Check features table
    print("\n--- FEATURES ---")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='features'")
    if cursor.fetchone():
        cursor.execute("SELECT COUNT(*) FROM features")
        print(f"Total Features: {cursor.fetchone()[0]}")
        cursor.execute("SELECT project_id, COUNT(*) FROM features GROUP BY project_id")
        for f in cursor.fetchall():
            print(f"Features ProjectID: {f[0]} (Count: {f[1]})")
    else:
        print("features table not found")

    conn.close()

