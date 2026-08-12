import sqlite3
import os

file_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

if not os.path.exists(file_path):
    print(f"File not found: {file_path}")
    exit(1)

# Check first 16 bytes for SQLite signature
with open(file_path, "rb") as f:
    header = f.read(16)
    print(f"Header: {header.hex(' ')}")
    if header.startswith(b"SQLite format 3\x00"):
        print("Format: SQLite")
    else:
        print("Format: Unknown/Binary")

# If SQLite, list tables and schema
try:
    conn = sqlite3.connect(file_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"Tables: {[t[0] for t in tables]}")
    for table_name in [t[0] for t in tables]:
        print(f"\n--- Schema for table: {table_name} ---")
        cursor.execute(f"PRAGMA table_info({table_name});")
        columns = cursor.fetchall()
        for col in columns:
            print(col)
        
        # Đặc biệt kiểm tra bảng metadata nếu có
        if table_name == 'metadata':
             cursor.execute("SELECT key, length(value) FROM metadata;")
             metadata_keys = cursor.fetchall()
             print(f"Metadata keys: {metadata_keys}")

        # Sample data
        try:
            cursor.execute(f"SELECT * FROM {table_name} LIMIT 3;")
            rows = cursor.fetchall()
            print(f"Sample data ({table_name}): {rows}")
        except Exception as e:
            print(f"Could not read data from {table_name}: {e}")
            
    conn.close()
except Exception as e:
    print(f"Error inspecting SQLite: {e}")
