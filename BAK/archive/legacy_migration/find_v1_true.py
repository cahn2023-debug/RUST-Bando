import sqlite3
import glob
import os

patterns = [
    'd:/Code Antinigaty/Phan mem quan ly file V4/**/*.pmp',
    'd:/Code Antinigaty/Phan mem quan ly file V4/**/*.db',
    'd:/Code Antinigaty/Phan mem quan ly file V4/**/*.sqlite'
]

all_files = []
for p in patterns:
    all_files.extend(glob.glob(p, recursive=True))

for f in all_files:
    if not os.path.isfile(f): continue
    try:
        conn = sqlite3.connect(f)
        tables = [t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        # Search for V1 indicators
        if any(t.lower() == 'points' for t in tables):
            print(f"\n[FOUND V1] {f}")
            print(f"Tables: {tables}")
            # Check for ProjectID column in Layers or Points
            cursor = conn.execute("PRAGMA table_info(Points)")
            cols = [c[1] for c in cursor.fetchall()]
            print(f"Points columns: {cols}")
        conn.close()
    except Exception as e:
        pass
