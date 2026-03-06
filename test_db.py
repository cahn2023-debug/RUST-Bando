import sqlite3
import json

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4_Python_co thu vien\122.pmp"
try:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    print("--- TABLES ---")
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cur.fetchall()
    print([t[0] for t in tables])
    
    for tbl in ['tasks', 'files', 'notes', 'project_folders', 'personnel']:
        if (tbl,) in tables:
            print(f"\n--- {tbl.upper()} SCHEMA ---")
            cur.execute(f"PRAGMA table_info({tbl})")
            print(cur.fetchall())
            
            print(f"\n--- {tbl.upper()} DATA SAMPLE ---")
            cur.execute(f"SELECT * FROM {tbl} LIMIT 5")
            for r in cur.fetchall():
                print(r)
            
            cur.execute(f"SELECT COUNT(*) FROM {tbl}")
            count = cur.fetchone()[0]
            print(f"Total Rows: {count}")
            
    conn.close()
except Exception as e:
    print(f"Error: {e}")
