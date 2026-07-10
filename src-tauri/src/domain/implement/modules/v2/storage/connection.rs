use rusqlite::{Connection, OpenFlags};
use std::path::PathBuf;
use serde_json::json;

#[derive(Debug)]
pub struct PmpDatabase {
    pub conn: Connection,
    pub base_dir: PathBuf,
    pub pmp_path: PathBuf,
}

impl PmpDatabase {
    pub fn open_or_create(pmp_path: PathBuf) -> Result<Self, rusqlite::Error> {
        if let Some(parent) = pmp_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        
        let conn = Connection::open_with_flags(
            &pmp_path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;

        // 0. Performance PRAGMAs
        conn.pragma_update(None, "journal_mode", &"WAL")?;
        conn.pragma_update(None, "synchronous", &"NORMAL")?;
        conn.pragma_update(None, "cache_size", &"-64000")?; // 64MB
        conn.pragma_update(None, "busy_timeout", &"5000")?;

        // 1. Strict Version Check
        let version: i32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version != 0 && version != 2 && version != 3 {
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_ERROR),
                Some(format!("[V2 STRICT] Unsupported DB version {}. Only 0, 2 or 3 allowed.", version))
            ));
        }

        // 2. Force Apply V2 Schema
        crate::domain::implement::modules::v2::storage::schema::apply_v2_schema(&conn)?;

        // 3. Integrity Check (Self-Healing Stage)
        let integrity: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
        if integrity != "ok" {
            log::error!("[V2 Integrity] 🚨 Database corruption detected: {}", integrity);
            // In a more advanced version, we could attempt REINDEX or other recovery steps.
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT),
                Some(format!("Database integrity check failed: {}", integrity))
            ));
        }

        // 4. Verify & Auto-Migrate Critical Columns
        let projects_info: Vec<String> = conn.prepare("PRAGMA table_info('projects')")?
            .query_map([], |row| row.get(1))?
            .collect::<Result<Vec<String>, _>>()?;
            
        if !projects_info.contains(&"title".to_string()) {
            log::info!("[V2 Migration] Adding 'title' column to projects...");
            conn.execute("ALTER TABLE projects ADD COLUMN title TEXT NOT NULL DEFAULT 'Untitled Project'", [])?;
        }
        if !projects_info.contains(&"base_dir_hint".to_string()) {
            log::info!("[V2 Migration] Adding 'base_dir_hint' column to projects...");
            conn.execute("ALTER TABLE projects ADD COLUMN base_dir_hint TEXT", [])?;
        }
        if !projects_info.contains(&"metadata_json".to_string()) {
            log::info!("[V2 Migration] Adding 'metadata_json' column to projects...");
            conn.execute("ALTER TABLE projects ADD COLUMN metadata_json TEXT DEFAULT '{}'", [])?;
        }

        let files_info: Vec<String> = conn.prepare("PRAGMA table_info('files')")?
            .query_map([], |row| row.get(1))?
            .collect::<Result<Vec<String>, _>>()?;

        if !files_info.contains(&"status".to_string()) {
            log::info!("[V2 Migration] Adding 'status' column to files...");
            conn.execute("ALTER TABLE files ADD COLUMN status TEXT DEFAULT 'active'", [])?;
        }
        if !files_info.contains(&"metadata_json".to_string()) {
            log::info!("[V2 Migration] Adding 'metadata_json' column to files...");
            conn.execute("ALTER TABLE files ADD COLUMN metadata_json TEXT DEFAULT '{}'", [])?;
        }
        
        Ok(Self {
            conn,
            base_dir: pmp_path.parent().unwrap().to_path_buf(),
            pmp_path,
        })
    }
    pub fn validate_file_paths(&self) -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = self.conn.prepare("SELECT id, rel_path FROM files WHERE status = 'active'")?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let rel: String = row.get(1)?;
            Ok((id, rel))
        })?;

        let mut missing = Vec::new();
        for row in rows {
            let (id, rel) = row?;
            let full_path = self.base_dir.join(&rel);
            if !full_path.exists() {
                missing.push(id);
            }
        }
        Ok(missing)
    }

    pub fn rebuild_fts_index(&self) -> Result<(), rusqlite::Error> {
        log::info!("[V2 Self-Healing] Rebuilding FTS5 index...");
        self.conn.execute_batch(r#"
            DELETE FROM fts_files_content;
            INSERT INTO fts_files_content(file_id, content)
            SELECT id, filename || ' ' || metadata_json FROM files;
        "#)?;
        Ok(())
    }

    pub fn verify_integrity(&self) -> Result<String, rusqlite::Error> {
        self.conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))
    }

    pub fn checkpoint_wal(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", [])?;
        Ok(())
    }

    pub fn backup_project(&self, project_id: &str) -> Result<serde_json::Value, String> {
        self.checkpoint_wal().map_err(|e| e.to_string())?;
        let backup_dir = self.base_dir.join("backups").join(project_id);
        std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

        let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_id = format!("{}_{}", project_id, ts);
        let backup_path = backup_dir.join(format!("{backup_id}.pmp"));
        std::fs::copy(&self.pmp_path, &backup_path).map_err(|e| e.to_string())?;
        let size = std::fs::metadata(&backup_path).map_err(|e| e.to_string())?.len();

        self.conn.execute(
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES('last_backup_at', ?1)",
            [chrono::Local::now().to_rfc3339()],
        ).map_err(|e| e.to_string())?;

        Ok(json!({
            "backupId": backup_id,
            "path": backup_path.to_string_lossy().to_string(),
            "sizeBytes": size,
            "createdAt": chrono::Local::now().to_rfc3339(),
        }))
    }

    pub fn list_backups(&self, project_id: &str) -> Result<serde_json::Value, String> {
        let backup_dir = self.base_dir.join("backups").join(project_id);
        if !backup_dir.exists() {
            return Ok(json!([]));
        }

        let mut items = Vec::new();
        for entry in std::fs::read_dir(&backup_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("pmp") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            items.push(json!({
                "backupId": stem,
                "path": path.to_string_lossy().to_string(),
                "sizeBytes": meta.len(),
                "modifiedAt": meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()),
            }));
        }

        items.sort_by(|a, b| b["backupId"].as_str().cmp(&a["backupId"].as_str()));
        Ok(serde_json::Value::Array(items))
    }
}
