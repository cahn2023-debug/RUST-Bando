import sqlite3
import os

db_path = "1213.pmp"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

def get_schema(table_name):
    print(f"\n--- {table_name} SCHEMA ---")
    cursor.execute(f"PRAGMA table_info({table_name})")
    for col in cursor.fetchall():
        print(f"Index: {col[0]}, Name: {col[1]}, Type: {col[2]}, NotNull: {col[3]}, Default: {col[4]}, PK: {col[5]}")

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cursor.fetchall()]
print(f"Tables in {db_path}: {', '.join(tables)}")

for table in ["projects", "contracts", "files", "content_items", "content_types", "content_fields"]:
    if table in tables:
        get_schema(table)
    else:
        print(f"\nTable '{table}' DOES NOT EXIST.")

conn.close()
