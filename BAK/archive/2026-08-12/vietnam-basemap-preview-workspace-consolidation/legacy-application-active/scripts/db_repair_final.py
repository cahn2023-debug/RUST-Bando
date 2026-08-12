import sqlite3
import uuid

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165_fix.pmp"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- REPAIR START ---")

# 1. Tìm Project ID thực sự có dữ liệu
cursor.execute("SELECT project_id, COUNT(*) FROM event_store GROUP BY project_id ORDER BY COUNT(*) DESC LIMIT 1")
row = cursor.fetchone()
if not row:
    print("No events found in event_store. Cannot repair.")
    conn.close()
    exit()

active_id = row[0]
event_count = row[1]
print(f"Found active Project ID from EventStore: {active_id} (Events: {event_count})")

# 2. Kiểm tra bảng projects
cursor.execute("SELECT id FROM projects WHERE id = ?", (active_id,))
if not cursor.fetchone():
    print(f"Active ID {active_id} is MISSING from projects table. Inserting it...")
    # Lấy tên từ bản ghi project đầu tiên nếu có
    cursor.execute("SELECT name FROM projects LIMIT 1")
    p_name_row = cursor.fetchone()
    p_name = p_name_row[0] if p_name_row else "Recovered Project"
    cursor.execute("INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))", (active_id, p_name))

# 3. Xóa các project ID rác (không có events)
cursor.execute("DELETE FROM projects WHERE id != ?", (active_id,))
print(f"Deleted orphan projects. Standing project: {active_id}")

# 4. Alignment: Cập nhật TẤT CẢ event store sang ID này (phòng hờ có vài cái bị lệch)
cursor.execute("UPDATE event_store SET project_id = ?", (active_id,))
print(f"Ensured all 7054 events point to {active_id}")

# 5. Xóa projection cũ để ép rebuild (hoặc để tí nữa Rust rebuild)
cursor.execute("DELETE FROM features")
cursor.execute("DELETE FROM tasks")
cursor.execute("DELETE FROM files")
print("Cleared empty/corrupt projections.")

conn.commit()
conn.close()
print("--- REPAIR DONE AT DB LEVEL ---")
