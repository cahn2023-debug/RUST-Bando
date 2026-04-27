import sqlite3
import os

db_path = r"J:\My Drive\-----TRIEN KHAI -----\Duan_Camera_LamDong.pmp"

if not os.path.exists(db_path):
    print(f"Error: Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- PROJECTS TABLE (ALL ROWS) ---")
cursor.execute("SELECT id, name, contract_number, investor, contractor, signed_date, duration, end_date FROM projects")
rows = cursor.fetchall()
for row in rows:
    print(f"ID: {row[0]}, Name: {row[1]}")
    print(f"  Contract: {row[2]}")
    print(f"  Investor: {row[3]}")
    print(f"  Contractor: {row[4]}")
    print(f"  Signed Date: {row[5]}")
    print(f"  Duration: {row[6]}")
    print(f"  End Date: {row[7]}")
    print("-" * 20)

cursor.execute("SELECT COUNT(*) FROM files")
file_count = cursor.fetchone()[0]
print(f"Total files in DB: {file_count}")

cursor.execute("SELECT id, filename, metadata_json FROM files WHERE metadata_json IS NOT NULL AND metadata_json != '{}' LIMIT 20")
files = cursor.fetchall()
for f in files:
    print(f"File ID: {f[0]}, Name: {f[1]}")

conn.close()
