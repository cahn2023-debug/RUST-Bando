import sqlite3
import json
import os

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\DUAN_CAMERA_LAMDONG.pmp"

if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- PROJECTS TABLE ---")
cursor.execute("SELECT id, name, contract_number, investor, contractor, signed_date, duration, end_date FROM projects")
for row in cursor.fetchall():
    print(f"ID: {row[0]}, Name: {row[1]}")
    print(f"  Contract: {row[2]}")
    print(f"  Investor: {row[3]}")
    print(f"  Contractor: {row[4]}")
    print(f"  Signed Date: {row[5]}")
    print(f"  Duration: {row[6]}")
    print(f"  End Date: {row[7]}")

print("\n--- FILES TABLE (Metadata Samples) ---")
cursor.execute("SELECT path, metadata_json FROM files WHERE metadata_json IS NOT NULL LIMIT 5")
for row in cursor.fetchall():
    print(f"File: {row[0]}")
    try:
        meta = json.loads(row[1])
        print(f"  Metadata: {json.dumps(meta, indent=2, ensure_ascii=False)}")
    except:
        print(f"  Metadata (Raw): {row[1]}")

conn.close()
