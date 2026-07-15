import sqlite3
import os

db_path = r"d:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

def inspect_165():
    if not os.path.exists(db_path):
        print(f"File not found: {db_path}")
        return
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [t[0] for t in cursor.fetchall()]
    print(f"Tables in {db_path}:")
    for t in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM \"{t}\"")
            print(f" - {t}: {cursor.fetchone()[0]} rows")
        except:
            print(f" - {t}: (error reading count)")
            
    conn.close()

if __name__ == "__main__":
    inspect_165()
