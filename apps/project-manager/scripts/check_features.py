import sqlite3
import os

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165_fix.pmp"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- PROJECTS ---")
cursor.execute("SELECT id, name FROM projects")
for r in cursor.fetchall():
    print(f"ID: {r[0]}, Name: {r[1]}")

print("\n--- EVENT_STORE STATS ---")
cursor.execute("SELECT project_id, COUNT(*) FROM event_store GROUP BY project_id")
for r in cursor.fetchall():
    print(f"ProjectID: {r[0]}, Count: {r[1]}")

print("\n--- FEATURES STATS ---")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='features'")
if cursor.fetchone():
    cursor.execute("SELECT project_id, COUNT(*) FROM features GROUP BY project_id")
    rows = cursor.fetchall()
    if not rows:
        print("Features table IS EMPTY!")
    for r in rows:
        print(f"ProjectID: {r[0]}, Count: {r[1]}")
else:
    print("Features table DOES NOT EXIST!")

print("\n--- DESIGN_EVENTS IN PROJECTS? ---")
cursor.execute("SELECT DISTINCT project_id FROM design_events")
for r in cursor.fetchall():
    print(f"DesignEvents ProjectID: {r[0]}")

conn.close()
