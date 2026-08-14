import sqlite3
import sys
import json

def inspect_db(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 1. List all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [t[0] for t in cursor.fetchall()]
        
        print(f"--- Database Inspection: {db_path} ---")
        
        # 2. Inspect pmp_metadata
        if 'pmp_metadata' in tables:
            print("\n[pmp_metadata]")
            cursor.execute("SELECT * FROM pmp_metadata")
            cols = [d[0] for d in cursor.description]
            for row in cursor.fetchall():
                print(dict(zip(cols, row)))

        # 3. Inspect Schema & Samples for critical tables
        critical_tables = ['v1_design_events', 'event_store', 'design_events', 'projects']
        for table in critical_tables:
            if table in tables:
                print(f"\n[{table} SCHEMA]")
                cursor.execute(f"PRAGMA table_info({table})")
                for col in cursor.fetchall():
                    print(col)
                
                print(f"[{table} SAMPLE (1 row)]")
                cursor.execute(f"SELECT * FROM {table} LIMIT 1")
                row = cursor.fetchone()
                if row:
                    cols = [d[0] for d in cursor.description]
                    sample = dict(zip(cols, row))
                    # Truncate long strings for display
                    for k, v in sample.items():
                        if isinstance(v, str) and len(v) > 200:
                            sample[k] = v[:200] + "..."
                    print(sample)

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_db(sys.argv[1])
