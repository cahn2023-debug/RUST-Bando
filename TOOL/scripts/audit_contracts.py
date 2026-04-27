import sqlite3
import json
import os

# Use the large DB from parent directory
db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\1213.pmp"

if not os.path.exists(db_path):
    print(f"Error: {db_path} not found.")
    exit(1)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print(f"=== AUDIT REPORT FOR: {db_path} ===\n")

# 1. Check Projects Table
print("--- PROJECTS TABLE ---")
try:
    cursor.execute("SELECT id, name, contract_number, investor, contractor, signed_date, duration, root_path FROM projects")
    rows = cursor.fetchall()
    if not rows:
        print("No projects found.")
    for row in rows:
        print(f"ID: {row['id']} | Name: {row['name']}")
        print(f"  Root Path: {row['root_path']}")
        print(f"  Contract #: {row['contract_number'] or 'EMPTY'}")
        print(f"  Investor:   {row['investor'] or 'EMPTY'}")
        print(f"  Contractor: {row['contractor'] or 'EMPTY'}")
        print("-" * 30)
except Exception as e:
    print(f"Error checking projects: {e}")

# 2. Check Contracts Table
print("\n--- CONTRACTS TABLE ---")
try:
    cursor.execute("SELECT * FROM contracts LIMIT 5")
    rows = cursor.fetchall()
    if not rows:
        print("No contract records found.")
    for row in rows:
        print(f"ID: {row['id']} | Name: {row['name']}")
        print(f"  No: {row['contract_number']} | Vendor: {row['vendor']}")
        print("-" * 30)
except Exception as e:
    print(f"Error checking contracts: {e}")

# 3. Check Files with Metadata
print("\n--- ANALYZED FILES (METADATA) ---")
try:
    cursor.execute("SELECT path, metadata_json FROM files WHERE metadata_json IS NOT NULL LIMIT 5")
    rows = cursor.fetchall()
    if not rows:
        print("No files with metadata found in files table.")
    for row in rows:
        print(f"Path: {row['path']}")
        print(f"  Metadata (preview): {row['metadata_json'][:200]}...")
        print("-" * 30)
except Exception as e:
    print(f"Error checking files: {e}")

conn.close()
