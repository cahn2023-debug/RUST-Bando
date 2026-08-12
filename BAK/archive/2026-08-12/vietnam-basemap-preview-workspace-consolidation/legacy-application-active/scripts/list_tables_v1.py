import sqlite3
import os

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

if not os.path.exists(db_path):
    print(f"File not found: {db_path}")
else:
    print(f"\n--- Checking DB: {db_path} ---")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print(f"Tables: {[t[0] for t in tables]}")
        
        # Check all tables starting with 'design' or 'feature' or 'map'
        for t in [t[0] for t in tables]:
            if 'design' in t.lower() or 'feature' in t.lower() or 'map' in t.lower() or 'layer' in t.lower():
                cursor.execute(f"PRAGMA table_info({t});")
                info = cursor.fetchall()
                print(f"Schema of {t}: {[i[1] for i in info]}")
                
        # Also check for 'items' or 'objects'
        if 'items' in [t[0] for t in tables]:
            cursor.execute("PRAGMA table_info(items);")
            print(f"Schema of items: {[i[1] for i in cursor.fetchall()]}")

        conn.close()
    except Exception as e:
        print(f"Error checking {db_path}: {e}")
