import sqlite3
import os

files = [
    r"d:\Code Antinigaty\Phan mem quan ly file V4\MICROSOFT C\OfflineProjectManager\offline_pm.db",
    r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\BAK\offline_pm.db",
    r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\TOOL\database\offline_pm.db"
]

for f in files:
    print(f"\n--- Checking: {f} ---")
    if not os.path.exists(f):
        print("  FILE NOT FOUND")
        continue
    try:
        conn = sqlite3.connect(f)
        tables = [t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        print(f"  Tables: {tables}")
        if "Points" in tables:
            print("  [MATCH] Found V1 schema in this file!")
        conn.close()
    except Exception as e:
        print(f"  Error: {e}")
