import sqlite3
import json
import os

db_path = r"J:\My Drive\-----TRIEN KHAI -----\Duan_Camera_LamDong.pmp"

if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
    # Try case insensitive or partial
    print("Available files in parent dir:")
    try:
        parent = os.path.dirname(db_path)
        if os.path.exists(parent):
            print(os.listdir(parent))
    except PermissionError as pe:
        print(f"Permission denied accessing directory: {pe}")
    except Exception as e:
        print(f"Error listing directory: {e}")
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

conn.close()
