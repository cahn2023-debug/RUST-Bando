use rusqlite::{Connection, Result};
use std::time::Duration;

/// Applies performance-optimizing PRAGMAs to a SQLite connection.
/// This configuration is optimized for V2 Architecture and 2GB RAM environments.
pub fn apply_performance_pragmas(conn: &Connection) -> Result<()> {
    // Increase busy_timeout to 30s for heavy Windows hydration/concurrency
    conn.busy_timeout(Duration::from_secs(30))?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -128000;
         PRAGMA mmap_size = 0;
         PRAGMA wal_autocheckpoint = 1000;
         PRAGMA auto_vacuum = INCREMENTAL;
         PRAGMA secure_delete = OFF;
         PRAGMA threads = 8;",
    )?;

    Ok(())
}
