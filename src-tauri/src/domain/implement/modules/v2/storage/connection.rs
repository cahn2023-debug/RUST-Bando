use crate::domain::implement::modules::v2::storage::schema::{
    apply_v2_schema, CURRENT_SCHEMA_LABEL, CURRENT_SCHEMA_VERSION,
};
use rusqlite::{backup::Backup, Connection, DatabaseName, OpenFlags};
use serde_json::json;
use std::path::PathBuf;
use std::time::Duration;

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
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;

        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "cache_size", "-64000")?;
        conn.pragma_update(None, "busy_timeout", "5000")?;

        let version: i32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version > CURRENT_SCHEMA_VERSION {
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_ERROR),
                Some(format!(
                    "[V4 STRICT] Unsupported DB version {}. This build supports up to {}.",
                    version, CURRENT_SCHEMA_VERSION
                )),
            ));
        }

        if version < CURRENT_SCHEMA_VERSION {
            apply_v2_schema(&conn)?;
            migrate_foundational_v4_state(&conn)?;
            migrate_sync_state(&conn)?;
        }

        Ok(Self {
            conn,
            base_dir: pmp_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."))
                .to_path_buf(),
            pmp_path,
        })
    }

    pub fn validate_file_paths(&self) -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, rel_path FROM files WHERE status = 'active'")?;
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
        self.conn.execute_batch(
            r#"
            DELETE FROM fts_files_content;
            INSERT INTO fts_files_content(file_id, content)
            SELECT id, filename || ' ' || metadata_json FROM files;
        "#,
        )?;
        Ok(())
    }

    pub fn verify_integrity(&self) -> Result<String, rusqlite::Error> {
        self.conn
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
    }

    pub fn checkpoint_wal(&self) -> Result<(), rusqlite::Error> {
        self.conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        Ok(())
    }

    pub fn backup_project(&self, project_id: &str) -> Result<serde_json::Value, String> {
        self.checkpoint_wal().map_err(|e| e.to_string())?;
        let backup_dir = self.base_dir.join("backups").join(project_id);
        std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

        let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_id = format!("{}_{}", project_id, ts);
        let backup_path = backup_dir.join(format!("{backup_id}.pmp"));
        let mut dst = Connection::open_with_flags(
            &backup_path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| e.to_string())?;
        {
            let backup = Backup::new_with_names(
                &self.conn,
                DatabaseName::Main,
                &mut dst,
                DatabaseName::Main,
            )
            .map_err(|e| e.to_string())?;
            backup
                .run_to_completion(64, Duration::from_millis(10), None)
                .map_err(|e| e.to_string())?;
        }
        dst.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())?;
        let size = std::fs::metadata(&backup_path)
            .map_err(|e| e.to_string())?
            .len();
        let integrity = Connection::open(&backup_path)
            .and_then(|conn| {
                conn.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
            })
            .unwrap_or_else(|_| "failed".to_string());
        if integrity != "ok" {
            return Err(format!("Backup integrity check failed: {integrity}"));
        }
        let hash = {
            let bytes = std::fs::read(&backup_path).map_err(|e| e.to_string())?;
            let mut hasher = sha2::Sha256::new();
            use sha2::Digest;
            hasher.update(bytes);
            format!("{:x}", hasher.finalize())
        };

        self.conn
            .execute(
                "INSERT OR REPLACE INTO sys_config(key, value) VALUES('last_backup_at', ?1)",
                [chrono::Local::now().to_rfc3339()],
            )
            .map_err(|e| e.to_string())?;

        Ok(json!({
            "backupId": backup_id,
            "path": backup_path.to_string_lossy().to_string(),
            "sizeBytes": size,
            "sha256": hash,
            "integrityStatus": integrity,
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

fn migrate_foundational_v4_state(conn: &Connection) -> Result<(), rusqlite::Error> {
    let projects_info: Vec<String> = conn
        .prepare("PRAGMA table_info('projects')")?
        .query_map([], |row| row.get(1))?
        .collect::<Result<Vec<String>, _>>()?;

    if !projects_info.contains(&"title".to_string()) {
        conn.execute(
            "ALTER TABLE projects ADD COLUMN title TEXT NOT NULL DEFAULT 'Untitled Project'",
            [],
        )?;
    }
    if !projects_info.contains(&"name".to_string()) {
        conn.execute(
            "ALTER TABLE projects ADD COLUMN name TEXT NOT NULL DEFAULT 'Untitled Project'",
            [],
        )?;
    }
    if !projects_info.contains(&"base_dir_hint".to_string()) {
        conn.execute("ALTER TABLE projects ADD COLUMN base_dir_hint TEXT", [])?;
    }
    if !projects_info.contains(&"metadata_json".to_string()) {
        conn.execute(
            "ALTER TABLE projects ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
            [],
        )?;
    }

    conn.execute(
        "UPDATE projects SET name = COALESCE(NULLIF(name, ''), NULLIF(title, ''), 'Untitled Project')",
        [],
    )?;
    conn.execute(
        "UPDATE projects SET title = COALESCE(NULLIF(title, ''), name)",
        [],
    )?;

    let files_info: Vec<String> = conn
        .prepare("PRAGMA table_info('files')")?
        .query_map([], |row| row.get(1))?
        .collect::<Result<Vec<String>, _>>()?;

    if !files_info.contains(&"status".to_string()) {
        conn.execute(
            "ALTER TABLE files ADD COLUMN status TEXT DEFAULT 'active'",
            [],
        )?;
    }
    if !files_info.contains(&"metadata_json".to_string()) {
        conn.execute(
            "ALTER TABLE files ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
            [],
        )?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO schema_migrations(version, label) VALUES (?1, ?2)",
        (CURRENT_SCHEMA_VERSION, CURRENT_SCHEMA_LABEL),
    )?;
    conn.execute(
        "UPDATE sys_config SET value = ?1 WHERE key = 'schema_version'",
        [CURRENT_SCHEMA_LABEL],
    )?;
    conn.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;
    conn.execute(
        "INSERT INTO project_snapshots(project_id, state_json, hydrated_at)
         SELECT id, metadata_json, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         FROM projects
         WHERE json_valid(metadata_json)
           AND json_type(metadata_json, '$.features') = 'object'
         ON CONFLICT(project_id) DO NOTHING",
        [],
    )?;
    conn.execute(
        "UPDATE projects
         SET metadata_json = json_object(
             'schema_version', ?1,
             'storage', json_object('snapshot', 'project_snapshots')
         )
         WHERE json_valid(metadata_json)
           AND json_type(metadata_json, '$.features') = 'object'",
        [CURRENT_SCHEMA_LABEL],
    )?;

    Ok(())
}

fn migrate_sync_state(conn: &Connection) -> Result<(), rusqlite::Error> {
    let events_info: Vec<String> = conn
        .prepare("PRAGMA table_info('events')")?
        .query_map([], |row| row.get(1))?
        .collect::<Result<Vec<String>, _>>()?;

    for (column, ddl) in [
        (
            "server_seq",
            "ALTER TABLE events ADD COLUMN server_seq INTEGER",
        ),
        (
            "entity_version",
            "ALTER TABLE events ADD COLUMN entity_version INTEGER NOT NULL DEFAULT 1",
        ),
        (
            "sync_batch_id",
            "ALTER TABLE events ADD COLUMN sync_batch_id TEXT",
        ),
        (
            "sync_status",
            "ALTER TABLE events ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local'",
        ),
        ("acked_at", "ALTER TABLE events ADD COLUMN acked_at TEXT"),
        (
            "server_time",
            "ALTER TABLE events ADD COLUMN server_time TEXT",
        ),
        (
            "ledger_hash",
            "ALTER TABLE events ADD COLUMN ledger_hash TEXT",
        ),
    ] {
        if !events_info.contains(&column.to_string()) {
            conn.execute(ddl, [])?;
        }
    }

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS sync_outbox (
            event_id TEXT PRIMARY KEY,
            batch_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            base_entity_version INTEGER NOT NULL DEFAULT 1,
            request_json TEXT NOT NULL CHECK (json_valid(request_json)),
            payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acked', 'failed', 'conflicted')),
            retry_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            server_seq INTEGER,
            server_hash TEXT,
            server_time TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            acked_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_project_status ON sync_outbox (project_id, status, created_at);
        CREATE TABLE IF NOT EXISTS sync_cursor (
            project_id TEXT PRIMARY KEY,
            last_server_seq INTEGER NOT NULL DEFAULT 0,
            last_event_id TEXT,
            last_ledger_hash TEXT,
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS cached_leases (
            project_id TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            holder TEXT,
            lease_token TEXT,
            entity_version INTEGER NOT NULL DEFAULT 0,
            expires_at TEXT,
            renewed_at TEXT,
            status TEXT NOT NULL DEFAULT 'cached' CHECK (status IN ('cached', 'leased', 'expired')),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            PRIMARY KEY (project_id, entity_id)
        );
        CREATE TABLE IF NOT EXISTS sync_conflicts (
            conflict_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            base_entity_version INTEGER NOT NULL DEFAULT 0,
            local_event_json TEXT NOT NULL CHECK (json_valid(local_event_json)),
            server_event_json TEXT NOT NULL CHECK (json_valid(server_event_json)),
            resolution_status TEXT NOT NULL DEFAULT 'open' CHECK (resolution_status IN ('open', 'local_wins', 'server_wins', 'merged', 'resolved')),
            resolved_by TEXT,
            resolved_at TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sync_conflicts_project_status ON sync_conflicts (project_id, resolution_status, created_at);
        "#,
    )?;

    conn.execute(
        "UPDATE events SET entity_version = COALESCE(entity_version, 1), sync_status = COALESCE(sync_status, 'local')",
        [],
    )?;

    Ok(())
}
