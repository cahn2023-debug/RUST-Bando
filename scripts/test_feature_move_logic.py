import sqlite3
import json
import uuid
import os
from datetime import datetime

# Cấu hình Test
DB_NAME = "test_feature_move.db"
PROJECT_ID = 123
FEATURE_ID = "feat_" + str(uuid.uuid4())[:8]
OLD_COORDS = [106.660172, 10.762622] # TP.HCM
NEW_COORDS = [106.701123, 10.775432] # Vị trí mới (Quận 1)

def setup_database():
    if os.path.exists(DB_NAME):
        os.remove(DB_NAME)
    
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # 1. Tạo Schema tối giản nhưng đủ để test logic V5.3
    cursor.execute("CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, metadata_json TEXT)")
    
    cursor.execute("""
        CREATE TABLE design_events (
            event_id TEXT PRIMARY KEY,
            project_id INTEGER,
            event_type TEXT,
            payload_json TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_undone BOOLEAN DEFAULT 0
        )
    """)
    
    cursor.execute("""
        CREATE TABLE features (
            id TEXT PRIMARY KEY,
            project_id INTEGER,
            name TEXT,
            geom_type TEXT,
            geometry_json TEXT,
            properties_json TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE work_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            feature_id TEXT,
            name TEXT,
            material_id INTEGER,
            quantity REAL,
            unit_price REAL,
            total_price REAL,
            metadata_json TEXT,
            UNIQUE(feature_id)
        )
    """)
    
    # 2. Chèn dữ liệu ban đầu
    cursor.execute("INSERT INTO projects (id, name, metadata_json) VALUES (?, ?, ?)", 
                   (PROJECT_ID, "Test Move Project", "{}"))
    
    cursor.execute("""
        INSERT INTO features (id, project_id, name, geom_type, geometry_json) 
        VALUES (?, ?, ?, ?, ?)
    """, (FEATURE_ID, PROJECT_ID, "Cột Điện Test", "Point", json.dumps(OLD_COORDS)))
    
    cursor.execute("""
        INSERT INTO work_items (project_id, feature_id, name, material_id, quantity, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (PROJECT_ID, FEATURE_ID, "Cột Điện Test", 1, 1.0, json.dumps({"coordinates": OLD_COORDS})))
    
    conn.commit()
    return conn

def simulate_backend_logic(conn, event_payload):
    """Mô phỏng logic trong Rust: apply_event_to_structural_tables"""
    cursor = conn.cursor()
    event_id = str(uuid.uuid4())
    payload = event_payload["payload"]
    feat_id = payload["id"]
    new_coords = payload["coordinates"]
    
    # Bước 1: Lưu vào design_events
    cursor.execute("""
        INSERT INTO design_events (event_id, project_id, event_type, payload_json)
        VALUES (?, ?, ?, ?)
    """, (event_id, PROJECT_ID, "FeatureUpdated", json.dumps(event_payload)))
    
    # Bước 2: Cập nhật bảng features (Read Model)
    cursor.execute("""
        UPDATE features 
        SET geometry_json = ?, updated_at = ?
        WHERE id = ?
    """, (json.dumps(new_coords), datetime.now().isoformat(), feat_id))
    
    # Bước 3: Cập nhật bảng work_items (Analytical Sync)
    # Trong Rust dùng json_patch, ở đây mô phỏng bằng cách load/update/dump
    cursor.execute("SELECT metadata_json FROM work_items WHERE feature_id = ?", (feat_id,))
    row = cursor.fetchone()
    if row:
        metadata = json.loads(row[0])
        metadata["coordinates"] = new_coords
        cursor.execute("""
            UPDATE work_items 
            SET metadata_json = ? 
            WHERE feature_id = ?
        """, (json.dumps(metadata), feat_id))
    
    conn.commit()
    print(f"🚀 [Simulation] Processed FeatureUpdated for {feat_id}")

def run_test():
    print(f"--- BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG CHỨC NĂNG DI CHUYỂN ---")
    conn = setup_database()
    cursor = conn.cursor()
    
    # Kiểm tra trạng thái trước khi move
    cursor.execute("SELECT geometry_json FROM features WHERE id = ?", (FEATURE_ID,))
    print(f"📍 Tọa độ ban đầu (features): {cursor.fetchone()[0]}")
    
    # Tạo sự kiện di chuyển (tương tự JSON gửi từ Frontend)
    event_payload = {
        "type": "FeatureUpdated",
        "payload": {
            "id": FEATURE_ID,
            "coordinates": NEW_COORDS
        }
    }
    
    # Chạy mô phỏng
    simulate_backend_logic(conn, event_payload)
    
    # --- XÁC MINH (VALIDATION) ---
    print("\n--- KẾT QUẢ KIỂM TRA ---")
    
    # 1. Kiểm tra design_events
    cursor.execute("SELECT COUNT(*) FROM design_events WHERE project_id = ?", (PROJECT_ID,))
    count_events = cursor.fetchone()[0]
    if count_events == 1:
        print("✅ PASS: Sự kiện di chuyển đã được lưu vào lịch sử (design_events).")
    else:
        print("❌ FAIL: Không tìm thấy sự kiện trong design_events.")

    # 2. Kiểm tra tọa độ trong features
    cursor.execute("SELECT geometry_json FROM features WHERE id = ?", (FEATURE_ID,))
    saved_coords = json.loads(cursor.fetchone()[0])
    if saved_coords == NEW_COORDS:
        print(f"✅ PASS: Tọa độ mới {saved_coords} đã được cập nhật vào bảng features.")
    else:
        print(f"❌ FAIL: Tọa độ trong bảng features không khớp! ({saved_coords})")

    # 3. Kiểm tra đồng bộ work_items
    cursor.execute("SELECT metadata_json FROM work_items WHERE feature_id = ?", (FEATURE_ID,))
    wi_metadata = json.loads(cursor.fetchone()[0])
    if wi_metadata.get("coordinates") == NEW_COORDS:
        print(f"✅ PASS: Bảng phân tích khối lượng (work_items) đã đồng bộ tọa độ mới.")
    else:
        print(f"❌ FAIL: Bảng work_items chưa được đồng bộ tọa độ!")

    conn.close()
    if os.path.exists(DB_NAME):
        os.remove(DB_NAME)
    print("\n--- KIỂM THỬ HOÀN TẤT ---")

if __name__ == "__main__":
    run_test()
