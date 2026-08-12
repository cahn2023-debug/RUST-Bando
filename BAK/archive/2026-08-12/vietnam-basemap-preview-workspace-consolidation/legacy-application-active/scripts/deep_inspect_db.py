import sqlite3
import os
import json

def deep_inspect(db_path):
    print(f"\n===== DEEP INSPECT: {db_path} =====")
    if not os.path.exists(db_path):
        print("File not found.")
        return
        
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 1. Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [t[0] for t in cursor.fetchall()]
        print(f"Tables: {', '.join(tables)}")
        
        for table in tables:
            cursor.execute(f"SELECT count(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"\nTable '{table}' has {count} rows.")
            
            # If it's feature_groups or features or events, show some data
            if table in ['feature_groups', 'design_events', 'design_snapshots']:
                cursor.execute(f"SELECT * FROM {table} LIMIT 5")
                rows = cursor.fetchall()
                print(f"Sample data from {table}:")
                for r in rows:
                    print(f"  {str(r)[:500]}")
        
        # 2. Specifically look for Polylines/LineStrings in ANY table's JSON
        print("\n--- Searching for 'polyline' or 'linestring' in all columns ---")
        for table in tables:
            cursor.execute(f"PRAGMA table_info({table})")
            cols = [c[1] for c in cursor.fetchall()]
            for col in cols:
                try:
                    query = f"SELECT {col} FROM {table} WHERE {col} LIKE '%polyline%' OR {col} LIKE '%linestring%'"
                    cursor.execute(query)
                    res = cursor.fetchone()
                    if res:
                        print(f"Found match in {table}.{col}!")
                        print(f"Value sample: {str(res[0])[:300]}")
                except: continue
                
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    deep_inspect('Du_an_165.pmp')
