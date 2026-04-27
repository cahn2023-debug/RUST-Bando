import sqlite3
import os

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\1213.pmp"
# Use URI to open in read-only mode to avoid locking issues
db_uri = f"file:{db_path}?mode=ro"

try:
    conn = sqlite3.connect(db_uri, uri=True)
    cursor = conn.cursor()
    
    print(f"Checking tables in {db_path}...")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cursor.fetchall()]
    
    for table in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"{table}: {count} rows")
        except Exception as e:
            print(f"{table}: Error - {e}")
            
    conn.close()
except Exception as e:
    print(f"Global Error: {e}")
