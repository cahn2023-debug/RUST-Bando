use rusqlite::Connection;

// Import logic từ codebase hiện tại
// Lưu ý: Chúng ta cần truy cập vào module v2.
// Vì đây là file trong src/bin, nó sẽ được compile như một crate con.

fn main() {
    let db_path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165.pmp";
    println!("Opening database: {}", db_path);

    let conn = Connection::open(db_path).expect("Failed to open connection");

    // Gọi trực tiếp logic alignment (vì chúng ta đang ở trong cùng repo)
    // Tuy nhiên, để đơn giản và chắc chắn, chúng ta sẽ copy logic hoặc gọi qua V2Database nếu được.

    println!("Checking project alignment...");

    // Giả lập logic trong engine.rs để chạy độc lập
    let v2_project_id: String = conn
        .query_row("SELECT id FROM projects LIMIT 1", [], |r| r.get(0))
        .expect("No project found in projects table");

    println!("Authoritative Project ID: {}", v2_project_id);

    let mismatched: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM event_store WHERE project_id != ?",
            [v2_project_id.clone()],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if mismatched > 0 {
        println!("Found {} mismatched events. Realigning...", mismatched);
        conn.execute(
            "UPDATE event_store SET project_id = ?",
            [v2_project_id.clone()],
        )
        .expect("Update failed");
    } else {
        println!("All events are already aligned to {}", v2_project_id);
    }

    // FORCE REBUILD
    println!("Rebuilding projections...");
    // Ở đây chúng ta sẽ gọi logic rebuild.
    // Do cấu trúc project phức tạp, tôi sẽ chạy một lệnh SQL để xóa bảng features
    // và để app tự rebuild khi mở, HOẶC tôi thực hiện rebuild thủ công nếu script này có thể import engine.
}
