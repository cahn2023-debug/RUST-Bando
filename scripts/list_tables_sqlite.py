import sqlite3

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\sqlite.db"

def list_tables():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("Tables in database:")
        for t in tables:
            print(f"- {t[0]}")
            try:
                cursor.execute(f"PRAGMA table_info({t[0]})")
                cols = [c[1] for c in cursor.fetchall()]
                print(f"  Columns: {cols}")
            except sqlite3.Error as se:
                print(f"  Error getting columns: {se}")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_tables()
