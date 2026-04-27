use rusqlite::{params, Connection};

/// Helper to add a column if it doesn't exist.
/// Used for incremental schema updates in legacy projects.
pub fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    col_type: &str,
) -> Result<(), String> {
    let query = format!("PRAGMA table_info({})", table);
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;

    if !columns.contains(&column.to_string()) {
        println!("[DB] Adding missing column: {}.{}", table, column);
        conn.execute(
            &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, col_type),
            [],
        )
        .map_err(|e| format!("Failed to add column {}.{}: {}", table, column, e))?;
    }
    Ok(())
}

pub fn migrate_legacy_fts(conn: &Connection) -> Result<(), String> {
    // If we have content_index (old C# table) and file_search (FTS5) is empty, migrate it.
    let fts_count: i64 = conn
        .query_row("SELECT count(*) FROM file_search", [], |r| r.get(0))
        .unwrap_or(0);

    let legacy_exists = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='content_index'",
            [],
            |r| r.get(0),
        )
        .map(|c: i64| c > 0)
        .unwrap_or(false);

    if fts_count == 0 && legacy_exists {
        let legacy_count: i64 = conn
            .query_row("SELECT count(*) FROM content_index", [], |r| r.get(0))
            .unwrap_or(0);
        if legacy_count > 0 {
            println!(
                "[DB] Migrating legacy content_index to FTS5 file_search ({} items)...",
                legacy_count
            );
            let _ = conn.execute(
                "INSERT INTO file_search(file_path, title, content) 
                 SELECT file_path, file_path, content FROM content_index",
                [],
            );
        }
    }
    Ok(())
}

pub fn normalize_data(
    conn: &Connection,
    active_id: i64,
    root_path_str: &str,
    path_str: &str,
) -> Result<(), String> {
    println!(
        "[DB] Running Hybrid Normalization for active_id: {}",
        active_id
    );

    // A. Normalize Status (Python used 'Todo', 'InProgress', 'Done')
    let _ = conn.execute(
        "UPDATE tasks SET status = 'todo' WHERE LOWER(status) = 'todo' AND status != 'todo'",
        [],
    );
    let _ = conn.execute(
        "UPDATE tasks SET status = 'inprogress' WHERE LOWER(status) = 'inprogress' AND status != 'inprogress'",
        [],
    );
    let _ = conn.execute(
        "UPDATE tasks SET status = 'done' WHERE LOWER(status) = 'done' AND status != 'done'",
        [],
    );

    // B. Sync is_completed with status
    let _ = conn.execute(
        "UPDATE tasks SET is_completed = 1 WHERE status = 'done' AND is_completed = 0",
        [],
    );
    let _ = conn.execute(
        "UPDATE tasks SET is_completed = 0 WHERE status != 'done' AND is_completed = 1",
        [],
    );

    // C. Recursive Task Tree
    let _ = conn.execute("UPDATE tasks SET parent_id = NULL WHERE parent_id = 0", []);
    let _ = conn.execute("UPDATE tasks SET parent_id = NULL WHERE parent_id = id", []);

    // E. Path Auto-Fix
    let _ = conn.execute(
        "UPDATE projects SET root_path = ?1, path = ?2 WHERE id = ?3",
        params![root_path_str, path_str, active_id],
    );

    println!("[DB] Hybrid Normalization complete.");
    Ok(())
}
