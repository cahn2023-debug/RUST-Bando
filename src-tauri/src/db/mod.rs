use rusqlite::{Connection, Result};
use std::sync::Mutex;
use std::path::PathBuf;

pub struct DatabaseState {
    pub conn: Mutex<Option<Connection>>,
}

/// Initializes the application directory but does not open a DB immediately.
/// We wait for load_pmp_file command to open the actual project DB.
pub fn initialize_database(_app_dir: PathBuf) -> Result<DatabaseState> {
    Ok(DatabaseState {
        conn: Mutex::new(None),
    })
}

/// Function to execute the base C# schema + Rust modifications
fn apply_base_schema(conn: &Connection) -> Result<(), String> {
    // 1. Projects table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            name TEXT NOT NULL,
            root_path TEXT NOT NULL,
            path TEXT,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // 2. Files table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            project_id INTEGER,
            path TEXT NOT NULL,
            path_noaccent TEXT,
            filename TEXT NOT NULL,
            filename_noaccent TEXT,
            extension TEXT,
            size INTEGER DEFAULT 0,
            file_type TEXT,
            created_at DATETIME,
            modified_at DATETIME,
            content_summary TEXT,
            content_index TEXT,
            metadata_json TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // 3. Personnel table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS personnel (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            project_id INTEGER,
            name TEXT NOT NULL,
            phone TEXT,
            region TEXT,
            role TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // 4. Contracts table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            project_id INTEGER,
            contractor_name TEXT,
            contract_code TEXT,
            bidding_package TEXT,
            content TEXT,
            region TEXT,
            volume REAL,
            volume_unit TEXT,
            status TEXT,
            start_date DATETIME,
            end_date DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // 5. Tasks table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            project_id INTEGER NOT NULL,
            parent_id INTEGER,
            related_file_id INTEGER,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'todo',
            priority TEXT DEFAULT 'Normal',       
            start_date DATETIME,
            end_date DATETIME,
            target_file_path TEXT,
            anchor_data TEXT,
            progress REAL DEFAULT 0,
            dependencies TEXT,
            is_completed BOOLEAN NOT NULL DEFAULT 0,
            color TEXT,
            assignee_id INTEGER,
            contract_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE SET NULL,
            FOREIGN KEY (related_file_id) REFERENCES files(id) ON DELETE SET NULL,
            FOREIGN KEY (assignee_id) REFERENCES personnel(id) ON DELETE SET NULL,
            FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // 6. Notes table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            project_id INTEGER,
            title TEXT NOT NULL,
            content TEXT,
            target_file_path TEXT,
            anchor_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // 7. Project Folders
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            project_id INTEGER,
            folder_path TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // 8. Content Index
    conn.execute(
        "CREATE TABLE IF NOT EXISTS content_index (
            file_path TEXT PRIMARY KEY,
            content TEXT,
            last_modified INTEGER,
            content_hash TEXT,
            file_size INTEGER
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // 9. Task Dependencies Table (Rust specific for cycle detection)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS task_dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_task_id INTEGER NOT NULL,
            to_task_id INTEGER NOT NULL,
            FOREIGN KEY(from_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY(to_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            UNIQUE(from_task_id, to_task_id)
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // 10. File Search FTS5
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS file_search USING fts5(
            file_path UNINDEXED,
            title,
            content,
            tokenize='unicode61 remove_diacritics 2'
        )",
        [],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

/// Creates a completely new PMP database from scratch
pub fn create_project_db(state: &DatabaseState, db_path: PathBuf) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    // Enable WAL mode
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;"
    ).map_err(|e| e.to_string())?;

    apply_base_schema(&conn)?;

    // Set new active connection
    *state.conn.lock().unwrap() = Some(conn);
    Ok(())
}

/// Opens a project .pmp file and applies any missing Rust schema requirements
pub fn open_project_db(state: &DatabaseState, db_path: PathBuf) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Enable WAL mode
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;"
    ).map_err(|e| e.to_string())?;

    // Handle columns that might be missing if opening an old C# PMP schema
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN path TEXT", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN root_path TEXT", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN description TEXT", []);
    
    let _ = conn.execute("ALTER TABLE tasks ADD COLUMN is_completed BOOLEAN NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE tasks ADD COLUMN color TEXT", []);
    let _ = conn.execute("ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'todo'", []);
    let _ = conn.execute("ALTER TABLE tasks ADD COLUMN target_file_path TEXT", []);
    let _ = conn.execute("ALTER TABLE tasks ADD COLUMN parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL", []);

    // Create tables if they don't exist
    apply_base_schema(&conn)?;

    let path_str = db_path.to_string_lossy().to_string();
    let root_path_str = db_path.parent().unwrap_or(std::path::Path::new("")).to_string_lossy().to_string();

    // If opening a legacy C# PMP, the projects table might exist but its rows have NULL paths
    let _ = conn.execute(
        "UPDATE projects SET path = ?1 WHERE path IS NULL",
        rusqlite::params![path_str],
    );
    let _ = conn.execute(
        "UPDATE projects SET root_path = ?1 WHERE root_path IS NULL",
        rusqlite::params![root_path_str],
    );
    let _ = conn.execute(
        "UPDATE projects SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL",
        [],
    );

    // If opening a legacy C# PMP, the projects table might be completely empty
    // We should synthesize a project record so the app can load it.
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0)).unwrap_or(0);
    if count == 0 {
        let name = db_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        
        let _ = conn.execute(
            "INSERT INTO projects (name, root_path, path, description) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![name, root_path_str, path_str, "Legacy PMP Project"],
        );
    }

    *state.conn.lock().unwrap() = Some(conn);
    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_initialize_database_creates_tables() {
        // Arrange: Create a temporary directory for the isolated database
        let dir = tempdir().unwrap();
        let app_dir = dir.path().to_path_buf();

        // Act: Initialize the database
        let db_state_result = initialize_database(app_dir);
        assert!(db_state_result.is_ok(), "Database initialization should succeed");

        let db_state = db_state_result.unwrap();
        open_project_db(&db_state, dir.path().join("test.pmp")).unwrap();

        let l = db_state.conn.lock().unwrap();
        let conn = l.as_ref().unwrap();

        // Assert: Verify tables were created
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").unwrap();
        let tables: Vec<String> = stmt.query_map([], |row| row.get(0)).unwrap().collect::<Result<_, _>>().unwrap();

        assert!(tables.contains(&"projects".to_string()), "projects table should exist");
        assert!(tables.contains(&"tasks".to_string()), "tasks table should exist");
        assert!(tables.contains(&"task_dependencies".to_string()), "task_dependencies table should exist");
    }
}
