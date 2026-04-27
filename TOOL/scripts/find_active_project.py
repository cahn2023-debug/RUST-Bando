import sqlite3
import os

files = [f for f in os.listdir('.') if f.endswith('.pmp')]
# Also check parent dir
parent_files = [os.path.join('..', f) for f in os.listdir('..') if f.endswith('.pmp')]
all_files = files + parent_files

for f in all_files:
    try:
        # Use RO mode
        db_uri = f"file:{f}?mode=ro"
        conn = sqlite3.connect(db_uri, uri=True)
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM projects")
        count = c.fetchone()[0]
        print(f"{f}: {count} projects")
        if count > 0:
            c.execute("SELECT id, name, root_path FROM projects LIMIT 1")
            proj = c.fetchone()
            print(f"  Example: {proj}")
        conn.close()
    except Exception as e:
        print(f"{f}: Error - {e}")
