import sqlite3
import sys
import os

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

try:
    if not os.path.exists(db_path):
        print(f"Error: File not found at {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"Checking DB: {db_path}")
    
    # Check tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [t[0] for t in cursor.fetchall()]
    print(f"Tables found: {tables}")
    
    # Check counts
    for table in ['event_store', 'features', 'v1_design_events', 'v1_features', 'projects', 'tasks']:
        if table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM \"{table}\"")
            count = cursor.fetchone()[0]
            print(f"Table '{table}': {count} rows")
        else:
            print(f"Table '{table}': NOT FOUND")
            
    conn.close()
except Exception as e:
    print(f"Error: {e}")
