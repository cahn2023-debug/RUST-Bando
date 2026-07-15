import sqlite3
import glob
import os

patterns = [
    'd:/Code Antinigaty/Phan mem quan ly file V4/**/*.pmp',
    'd:/Code Antinigaty/Phan mem quan ly file V4/**/*.db',
    'd:/Code Antinigaty/Phan mem quan ly file V4/**/*.sqlite'
]

targets = []
for p in patterns:
    targets.extend(glob.glob(p, recursive=True))

for f in targets:
    if not os.path.isfile(f): continue
    try:
        conn = sqlite3.connect(f)
        tables = [t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        print(f"File: {f}")
        print(f"  Tables: {tables}")
        if any(t.lower() == 'points' for t in tables):
            print("  *** [V1 GIS MATCH] ***")
        conn.close()
    except Exception as e:
        print(f"File: {f} ERROR: {e}")
