import sqlite3
import os
import glob

def fix_db_schema(db_path):
    print(f"Checking {db_path}...")
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        
        # 1. Projects table
        cur.execute("PRAGMA table_info(projects)")
        cols = [r[1] for r in cur.fetchall()]
        if 'end_date' not in cols:
            print(f"  Adding projects.end_date...")
            cur.execute("ALTER TABLE projects ADD COLUMN end_date TEXT")
            
        # 2. Contracts table
        cur.execute("PRAGMA table_info(contracts)")
        cols = [r[1] for r in cur.fetchall()]
        if 'has_analysis' not in cols:
            print(f"  Adding contracts.has_analysis...")
            cur.execute("ALTER TABLE contracts ADD COLUMN has_analysis INTEGER DEFAULT 0")
            
        # 3. Files table (ensure metadata_json exists)
        cur.execute("PRAGMA table_info(files)")
        cols = [r[1] for r in cur.fetchall()]
        if 'metadata_json' not in cols:
            print(f"  Adding files.metadata_json...")
            cur.execute("ALTER TABLE files ADD COLUMN metadata_json TEXT")
            
        conn.commit()
        conn.close()
        print(f"  Successfully fixed {db_path}")
    except Exception as e:
        print(f"  Error fixing {db_path}: {e}")

def main():
    root_dir = r"d:\Code Antinigaty\Phan mem quan ly file V4"
    pmp_files = glob.glob(os.path.join(root_dir, "**", "*.pmp"), recursive=True)
    
    print(f"Found {len(pmp_files)} .pmp files.")
    for f in pmp_files:
        fix_db_schema(f)
    print("Done.")

if __name__ == "__main__":
    main()
