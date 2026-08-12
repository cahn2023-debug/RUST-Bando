import sqlite3

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\Du_an_165.pmp"

def list_tables():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("Tables in database:")
        for t in tables:
            print(f"- {t[0]}")
            # Get count and sample columns
            try:
                cursor.execute(f"SELECT count(*) FROM {t[0]}")
                count = cursor.fetchone()[0]
                cursor.execute(f"PRAGMA table_info({t[0]})")
                cols = [c[1] for c in cursor.fetchall()]
                print(f"  Count: {count}, Columns: {cols}")
            except:
                print(f"  (Could not read table {t[0]})")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_tables()
