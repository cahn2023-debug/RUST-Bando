import sqlite3
import json
import os

# Use absolute path for DB
db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

def analyze_db():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    # Set row factory to see column names in row keys
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]
    print(f"Analysis of {db_path}")
    print("="*50)
    print(f"Total tables: {len(tables)}")

    for table in tables:
        print(f"\n[Table: {table}]")
        # Get schema
        cursor.execute(f"PRAGMA table_info('{table}')")
        cols = cursor.fetchall()
        col_info = ", ".join([f"{c[1]} ({c[2]})" for c in cols])
        print(f"  Columns: {col_info}")

        # Get row count
        cursor.execute(f"SELECT COUNT(*) FROM '{table}'")
        count = cursor.fetchone()[0]
        print(f"  Row count: {count}")

        # Peek data
        if count > 0:
            print("  Sample Data (First 1 row):")
            cursor.execute(f"SELECT * FROM '{table}' LIMIT 1")
            row = cursor.fetchone()
            # Convert row to dict for better display
            row_dict = {key: row[key] for key in row.keys()}
            # Truncate long strings for display
            display_dict = {}
            for k, v in row_dict.items():
                if isinstance(v, str) and len(v) > 100:
                    display_dict[k] = v[:100] + "..."
                else:
                    display_dict[k] = v
            print(f"    {display_dict}")

    # 2. metadata check
    if 'projects' in tables:
        print("\n" + "="*50)
        print("Project Details:")
        cursor.execute("SELECT name, description, status FROM projects LIMIT 1")
        p = cursor.fetchone()
        if p:
            print(f"  Name: {p['name']}")
            print(f"  Description: {p['description']}")
            print(f"  Status: {p['status']}")

    conn.close()

if __name__ == "__main__":
    analyze_db()
