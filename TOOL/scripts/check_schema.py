import sqlite3
import os

db_path = r"J:\My Drive\-----TRIEN KHAI -----\Duan_Camera_LamDong.pmp"

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- PROJECTS TABLE SCHEMA ---")
cursor.execute("PRAGMA table_info(projects)")
columns = cursor.fetchall()
for col in columns:
    print(f"Index: {col[0]}, Name: {col[1]}, Type: {col[2]}")

print("\n--- SAMPLE ROW DATA ---")
cursor.execute("SELECT * FROM projects LIMIT 1")
row = cursor.fetchone()
if row:
    for i, val in enumerate(row):
        print(f"Col {i} ({columns[i][1]}): {val}")

conn.close()
