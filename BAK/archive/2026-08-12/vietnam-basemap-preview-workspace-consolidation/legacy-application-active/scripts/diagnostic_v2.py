import sqlite3
import os

db_path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165.pmp"

if not os.path.exists(db_path):
    print(f"File not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

def get_count(table, p_id=None):
    try:
        if p_id:
            cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE project_id = ?", (p_id,))
        else:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
        return cursor.fetchone()[0]
    except:
        return -1

def table_exists(table):
    cursor.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cursor.fetchone()[0] == 1

print("--- PROJECTS TABLE ---")
cursor.execute("SELECT id, name, created_at FROM projects")
projects = cursor.fetchall()
for p in projects:
    p_id, name, created = p
    events = get_count("event_store", p_id)
    features = get_count("features", p_id)
    print(f"ID: {p_id} | Name: {name} | Events: {events} | Features: {features} | Created: {created}")

print("\n--- PMP_METADATA ---")
if table_exists("pmp_metadata"):
    try:
        cursor.execute("SELECT project_id, device_id, updated_at FROM pmp_metadata")
        meta = cursor.fetchone()
        if meta:
            print(f"Active Project ID in Metadata: {meta[0]}")
        else:
            print("pmp_metadata is empty")
    except Exception as e:
        print(f"Error reading pmp_metadata: {e}")
else:
    print("pmp_metadata table DOES NOT EXIST")

print("\n--- ORPHANED EVENTS IN EVENT_STORE ---")
cursor.execute("SELECT project_id, COUNT(*) FROM event_store GROUP BY project_id")
for row in cursor.fetchall():
    print(f"Project ID in store: {row[0]} | Event Count: {row[1]}")

conn.close()
