use rusqlite::{Connection, Result};
use std::path::Path;
use std::time::Duration;

/// Áp dụng các PRAGMA tối ưu hiệu suất cho SQLite (WAL mode, Timeout, Sync)
pub fn apply_performance_pragmas(conn: &Connection) -> Result<()> {
    // [ANTI-PANIC] Sử dụng toán tử ? để propagate error thay vì unwrap
    conn.busy_timeout(Duration::from_secs(5))?;

    // BẮT BUỘC thiết lập các PRAGMA để chống lock và tối ưu I/O:
    // 1. journal_mode = WAL: Đọc ghi đồng thời.
    // 2. synchronous = NORMAL: Tốc độ cực nhanh trên SSD mà vẫn an toàn với WAL.
    // 3. busy_timeout = 5000: Rust sẽ chờ tối đa 5s nếu DB bị process khác khóa trước khi văng lỗi.
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -64000;
         PRAGMA foreign_keys = ON;
         PRAGMA threads = 4;",
    )?;
    Ok(())
}

/// Khởi tạo kết nối SQLite với cấu hình tối ưu cho kiến trúc V2 (Event Sourcing & Actor-based)
pub fn open_v2_connection<P: AsRef<Path>>(path: P) -> Result<Connection> {
    // [ANTI-PANIC] Sử dụng toán tử ? tại đây
    let conn = Connection::open(path)?;
    apply_performance_pragmas(&conn)?;
    Ok(conn)
}
