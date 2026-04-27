import sqlite3
import json

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

def inspect():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("\n=== PROJECTS TABLE ===")
        cursor.execute("SELECT id, name FROM projects")
        projects = cursor.fetchall()
        for p in projects:
            print(f"ID: {p[0]}, Name: {p[1]}")
            
        print("\n=== PMP METADATA ===")
        cursor.execute("SELECT * FROM pmp_metadata")
        meta_cols = [description[0] for description in cursor.description]
        meta_data = cursor.fetchone()
        if meta_data:
            print(dict(zip(meta_cols, meta_data)))
        
        print("\n=== EVENT STORE STATS ===")
        cursor.execute("SELECT project_id, COUNT(*) FROM event_store GROUP BY project_id")
        events = cursor.fetchall()
        for e in events:
            print(f"Project ID: {e[0]}, Event Count: {e[1]}")
            
        print("\n=== FEATURES STATS ===")
        cursor.execute("SELECT project_id, COUNT(*) FROM features GROUP BY project_id")
        features = cursor.fetchall()
        for f in features:
            print(f"Project ID: {f[0]}, Feature Count: {f[1]}")

        # Check if winner exists in projects but has no features
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect()
