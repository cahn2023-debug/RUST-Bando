import sqlite3
import json

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- EVENT_STORE FIRST 10 ---")
cursor.execute("SELECT global_seq, project_id, event_type, payload_json FROM event_store ORDER BY global_seq LIMIT 10")
for r in cursor.fetchall():
    print(f"Seq: {r[0]}, ProjID: {r[1]}, Type: {r[2]}")
    if r[2] == "ProjectCreated":
        print(f"  Payload: {r[3]}")

conn.close()
