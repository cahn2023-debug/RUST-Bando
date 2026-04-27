import sqlite3
import os
import sys

def check_db(db_path):
    if not os.path.exists(db_path):
        print(f"File not found: {db_path}")
        return

    print(f"Analyzing: {db_path}")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"Tables found: {tables}")
        
        if 'projects' in tables:
            print("\n--- PROJECTS TABLE ---")
            cursor.execute("PRAGMA table_info(projects);")
            columns = [row[1] for row in cursor.fetchall()]
            print(f"Columns: {columns}")
            
            cursor.execute("SELECT * FROM projects LIMIT 5;")
            rows = cursor.fetchall()
            for row in rows:
                print(row)
        
        if 'pmp_metadata' in tables:
            print("\n--- PMP_METADATA TABLE ---")
            cursor.execute("SELECT * FROM pmp_metadata;")
            print(cursor.fetchall())

        if 'event_store' in tables:
            cursor.execute("SELECT COUNT(*) FROM event_store;")
            count = cursor.fetchone()[0]
            print(f"\n--- EVENT_STORE COUNT: {count} ---")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    path = "d:/Code Antinigaty/Phan mem quan ly file V4/RUST/TOOL/database/1213.pmp"
    if len(sys.argv) > 1:
        path = sys.argv[1]
    check_db(path)
