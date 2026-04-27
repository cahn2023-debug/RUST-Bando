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
    try:
        conn = sqlite3.connect(f)
        tables = [t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        if 'Points' in tables or 'Points' in [t.capitalize() for t in tables]:
            print(f"FOUND V1 SCHEMA IN: {f}")
            print(f"Tables: {tables}")
            # Check row counts
            for t in ['Points', 'Lines', 'Cameras']:
                if t in tables:
                   count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                   print(f"  - {t}: {count} rows")
        conn.close()
    except: pass
