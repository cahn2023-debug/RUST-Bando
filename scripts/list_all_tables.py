import sqlite3
import os

def list_tables(db_path):
    print(f"\n--- Tables in {db_path} ---")
    if not os.path.exists(db_path):
        print("File not found.")
        return
        
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        for t in tables:
            print(f"Table: {t[0]}")
            cursor.execute(f"SELECT count(*) FROM {t[0]}")
            count = cursor.fetchone()[0]
            print(f"  Count: {count}")
            # Show first row columns
            cursor.execute(f"PRAGMA table_info({t[0]})")
            cols = [c[1] for c in cursor.fetchall()]
            print(f"  Cols: {cols}")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_tables('sqlite.db')
    list_tables('Du_an_165.pmp')
