import sqlite3

try:
    conn = sqlite3.connect(r'd:\Code Antinigaty\Phan mem quan ly file V4_Python_co thu vien\MICROSOFT C\AppDiagnostics\app_test.pmp')
    cur = conn.cursor()
    cur.execute("SELECT name, sql FROM sqlite_master WHERE type='table'")
    tables = cur.fetchall()
    for name, sql in tables:
        print(f"--- Table: {name} ---")
        print(sql)
        print("\n")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
