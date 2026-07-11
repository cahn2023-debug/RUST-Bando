import sqlite3
import os

def inspect_events():
    db_path = 'project_v4.pmp'
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(event_store);")
        columns = cursor.fetchall()
        print(f"Schema: {columns}")
        
        cursor.execute("SELECT * FROM event_store LIMIT 5")
        rows = cursor.fetchall()
        for row in rows:
            print(f"Row: {row}")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_events()
