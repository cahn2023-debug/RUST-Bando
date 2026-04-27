import sqlite3
import os

def sync_data():
    # Cấu hình đường dẫn chính xác từ UI và kết quả tìm kiếm
    source_db = r'd:\Code Antinigaty\Phan mem quan ly file V4\Du an Lam Dong.pmp'
    target_db = r'J:\My Drive\-----TRIEN KHAI -----\Duan_Camera_LamDong.pmp'

    if not os.path.exists(source_db):
        print(f"Error: Source database not found at {source_db}")
        return

    if not os.path.exists(target_db):
        # Thử tìm kiếm nếu đường dẫn J: có lỗi gõ phím
        print(f"Target file not found at {target_db}. Searching...")
        # (Trong thực tế script sẽ dừng ở đây nếu không tìm thấy)
        return

    try:
        # Connect to source and target
        s_conn = sqlite3.connect(source_db)
        t_conn = sqlite3.connect(target_db)
        s_cur = s_conn.cursor()
        t_cur = t_conn.cursor()

        print(f"Syncing from {source_db} to {target_db}...")

        # 1. Đồng bộ Metadata Dự án (Projects table)
        # Lấy metadata từ project đầu tiên của file nguồn
        s_cur.execute("SELECT contract_number, investor, contractor, signed_date, duration, end_date FROM projects LIMIT 1")
        p_data = s_cur.fetchone()
        
        if p_data:
            print(f"Updating project metadata: No. {p_data[0]} / Investor: {p_data[1]}")
            # Cập nhật cho tất cả dự án trong file đích (thường chỉ có 1 dự án chính)
            t_cur.execute("""
                UPDATE projects SET 
                    contract_number = ?, 
                    investor = ?, 
                    contractor = ?, 
                    signed_date = ?, 
                    duration = ?,
                    end_date = ?
            """, p_data)
            print("Project metadata updated successfully.")
        else:
            print("Warning: No metadata found in source projects table.")

        # 2. Đồng bộ Danh sách Hợp đồng (Contracts table)
        s_cur.execute("SELECT name, contract_number, vendor, value, signed_date, notes, file_path FROM contracts")
        c_data = s_cur.fetchall()
        
        if c_data:
            # Xóa contracts cũ và nạp mới
            t_cur.execute("DELETE FROM contracts")
            for row in c_data:
                # Gán project_id mặc định là 1 cho các hợp đồng trong file đích
                t_cur.execute("""
                    INSERT INTO contracts (project_id, name, contract_number, vendor, value, signed_date, notes, file_path)
                    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
                """, row)
            print(f"Synced {len(c_data)} contracts.")
        else:
            print("Warning: No contracts found in source database.")

        t_conn.commit()
        s_conn.close()
        t_conn.close()
        print("Final metadata synchronization complete.")

    except Exception as e:
        print(f"Error during sync: {e}")

if __name__ == "__main__":
    sync_data()
