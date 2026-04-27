import sqlite3
db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT sql FROM sqlite_master WHERE name IN ('features', 'event_store')")
for r in cursor.fetchall():
    print(r[0])
conn.close()
