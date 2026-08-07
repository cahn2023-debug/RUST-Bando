use crate::domain::implement::modules::v2::storage::audit::{audit_database, DatabaseAuditReport};
use crate::domain::implement::modules::v2::storage::schema::{
    apply_base_schema, apply_v10_schema, apply_v11_schema, apply_v9_schema, ensure_runtime_schema_compatibility,
    ensure_v8_compatibility, stamp_schema_version, CURRENT_SCHEMA_VERSION, MIN_COMPATIBLE_SCHEMA_VERSION,
};
use rusqlite::{backup::Backup, params, Connection, DatabaseName, OpenFlags, TransactionBehavior};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Duration;

const PROJECT_FORMAT_VERSION: &str = "4.0.0";

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

        let mut conn = Connection::open_with_flags(
            &pmp_path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;

        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "mmap_size", "268435456")?;
        conn.pragma_update(None, "page_size", "4096")?;
        conn.pragma_update(None, "cache_size", "-64000")?;
        conn.pragma_update(None, "busy_timeout", "15000")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;

        if let Err(e) = crate::domain::implement::modules::v2::storage::gpkg::init_gpkg_tables(&conn) {
            log::warn!("[Storage] GeoPackage RTree initialization warning: {e}");
        }

        let version: i32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version > CURRENT_SCHEMA_VERSION {
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_ERROR),
                Some(format!(
                    "[V4 STRICT] Unsupported DB version {}. This build supports up to {} (min compatible: {}).",
                    version, CURRENT_SCHEMA_VERSION, MIN_COMPATIBLE_SCHEMA_VERSION
                )),
            ));
        }

        if version < CURRENT_SCHEMA_VERSION {
            if version >= MIN_COMPATIBLE_SCHEMA_VERSION {
                repair_legacy_design_relations(&mut conn, &pmp_path)?;
                let report = audit_database(&conn)?;
                reject_blocking_audit(&report, false)?;
            }

            let mut backup_info: Option<PathBuf> = None;
            if version > 0 {
                conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
                let (backup_path, backup_sha256) =
                    create_pre_migration_backup(&conn, &pmp_path, version)?;
                log::info!(
                    "[Storage] Pre-v{} migration backup created: {} ({})",
                    CURRENT_SCHEMA_VERSION,
                    backup_path.display(),
                    backup_sha256
                );
                backup_info = Some(backup_path);
            }

            let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            if version < 8 {
                apply_base_schema(&transaction)?;
                migrate_foundational_v4_state(&transaction)?;
                migrate_sync_state(&transaction)?;
                let report = audit_database(&transaction)?;
                reject_blocking_audit(&report, true)?;
            } else {
                ensure_v8_compatibility(&transaction)?;
            }
            apply_v9_schema(&transaction)?;
            apply_v10_schema(&transaction)?;
            apply_v11_schema(&transaction)?;
            stamp_schema_version(&transaction)?;
            let report = audit_database(&transaction)?;
            reject_blocking_audit(&report, false)?;
            transaction.commit()?;

            if let Some(backup_path) = backup_info {
                if backup_path.exists() {
                    log::info!(
                        "[Storage] Pre-migration backup verified and retained for safety: {}",
                        backup_path.display()
                    );
                }
            }

            if let Err(error) = conn.execute_batch("ANALYZE; PRAGMA optimize;") {
                log::warn!("[Storage] Post-migration optimizer failed: {error}");
            }
        }

        ensure_runtime_schema_compatibility(&conn)?;
        repair_legacy_design_relations(&mut conn, &pmp_path)?;

        log::info!(
            "[Storage] Database opened successfully with runtime schema compatibility ensured (path: {})",
            pmp_path.display()
        );

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
            SELECT id, COALESCE(filename, '') || ' ' || COALESCE(metadata_json, '') FROM files;
        "#,
        )?;
        Ok(())
    }

    pub fn verify_integrity(&self) -> Result<String, rusqlite::Error> {
        self.conn
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
    }

    pub fn audit_database(&self) -> Result<DatabaseAuditReport, rusqlite::Error> {
        audit_database(&self.conn)
    }

    pub fn audit_path(path: &Path) -> Result<DatabaseAuditReport, rusqlite::Error> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        audit_database(&conn)
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

pub fn is_network_drive_path(path: &Path) -> bool {
    let s = path.to_string_lossy().to_lowercase();
    s.starts_with("\\\\")
        || s.contains("shared drives")
        || s.contains("google drive")
        || s.contains("onedrive")
        || s.contains("my drive")
}

pub fn prepare_network_pmp_local_copy(original_path: &Path, temp_dir: &Path) -> Result<PathBuf, String> {
    if !original_path.exists() {
        return Err(format!("Tệp PMP không tồn tại: {}", original_path.display()));
    }
    std::fs::create_dir_all(temp_dir).map_err(|e| format!("Không thể tạo thư mục temp: {e}"))?;
    let file_name = original_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("network_project.pmp");

    let mut hasher = Sha256::new();
    hasher.update(original_path.to_string_lossy().as_bytes());
    let path_hash = format!("{:x}", hasher.finalize())[..12].to_string();
    let temp_file_name = format!("{}_{}", path_hash, file_name);
    let temp_path = temp_dir.join(temp_file_name);

    log::info!("[NetworkPMP] Copying network file {} -> temp file {}", original_path.display(), temp_path.display());
    std::fs::copy(original_path, &temp_path).map_err(|e| format!("Không thể sao chép tệp từ ổ đĩa mạng: {e}"))?;
    Ok(temp_path)
}

pub fn sync_local_temp_to_network(local_temp_path: &Path, original_network_path: &Path) -> Result<(), String> {
    if !local_temp_path.exists() {
        return Err("Local temp PMP file missing".to_string());
    }
    log::info!("[NetworkPMP] Syncing local temp {} -> network file {}", local_temp_path.display(), original_network_path.display());

    for attempt in 1..=3 {
        match std::fs::copy(local_temp_path, original_network_path) {
            Ok(_) => return Ok(()),
            Err(err) if attempt < 3 => {
                log::warn!("[NetworkPMP] Sync back attempt {attempt} failed: {err}. Retrying in 500ms...");
                std::thread::sleep(Duration::from_millis(500));
            }
            Err(err) => return Err(format!("Lỗi khi đồng bộ dữ liệu về ổ mạng sau 3 lần thử: {err}")),
        }
    }
    Ok(())
}

fn repair_legacy_design_relations(
    conn: &mut Connection,
    pmp_path: &Path,
) -> Result<(), rusqlite::Error> {
    let issue_count: i64 = conn.query_row(
        r#"
        SELECT
            (SELECT COUNT(*) FROM regions child
             LEFT JOIN regions parent
               ON parent.id = child.parent_id
              AND parent.project_id = child.project_id
             WHERE child.parent_id IS NOT NULL AND parent.id IS NULL)
          + (SELECT COUNT(*) FROM layers child
             LEFT JOIN regions parent
               ON parent.id = child.region_id
              AND parent.project_id = child.project_id
             WHERE child.region_id IS NOT NULL AND parent.id IS NULL)
          + (SELECT COUNT(*) FROM feature_groups child
             LEFT JOIN layers parent
               ON parent.id = child.layer_id
              AND parent.project_id = child.project_id
             WHERE parent.id IS NULL)
          + (SELECT COUNT(*) FROM feature_groups child
             LEFT JOIN feature_groups parent
               ON parent.id = child.parent_id
              AND parent.project_id = child.project_id
             WHERE child.parent_id IS NOT NULL AND parent.id IS NULL)
          + (SELECT COUNT(*) FROM features child
             LEFT JOIN layers parent
               ON parent.id = child.layer_id
              AND parent.project_id = child.project_id
             WHERE parent.id IS NULL)
          + (SELECT COUNT(*) FROM features child
             LEFT JOIN feature_groups parent
               ON parent.id = child.group_id
              AND parent.project_id = child.project_id
             WHERE child.group_id IS NOT NULL AND parent.id IS NULL)
        "#,
        [],
        |row| row.get(0),
    )?;

    if issue_count == 0 {
        return Ok(());
    }

    create_open_repair_backup(conn, pmp_path)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

    let repaired_region_parents = tx.execute(
        r#"
        UPDATE regions
           SET parent_id = NULL
         WHERE parent_id IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM regions parent
                 WHERE parent.id = regions.parent_id
                   AND parent.project_id = regions.project_id
           )
        "#,
        [],
    )?;

    let repaired_layer_regions = tx.execute(
        r#"
        UPDATE layers
           SET region_id = NULL
         WHERE region_id IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM regions parent
                 WHERE parent.id = layers.region_id
                   AND parent.project_id = layers.project_id
           )
        "#,
        [],
    )?;

    tx.execute(
        r#"
        INSERT OR IGNORE INTO layers(id, project_id, name, metadata_json)
        SELECT '__recovered_layer:' || p.id,
               p.id,
               'Recovered Layer',
               '{"recovered":true,"reason":"legacy_relation_repair"}'
          FROM projects p
         WHERE EXISTS (
                SELECT 1 FROM feature_groups child
                 LEFT JOIN layers parent
                   ON parent.id = child.layer_id
                  AND parent.project_id = child.project_id
                WHERE child.project_id = p.id
                  AND parent.id IS NULL
           )
            OR EXISTS (
                SELECT 1 FROM features child
                 LEFT JOIN layers parent
                   ON parent.id = child.layer_id
                  AND parent.project_id = child.project_id
                WHERE child.project_id = p.id
                  AND parent.id IS NULL
           )
        "#,
        [],
    )?;

    let repaired_feature_groups = tx.execute(
        r#"
        UPDATE feature_groups
           SET layer_id = CASE
                WHEN NOT EXISTS (
                    SELECT 1 FROM layers parent
                     WHERE parent.id = feature_groups.layer_id
                       AND parent.project_id = feature_groups.project_id
                )
                THEN '__recovered_layer:' || project_id
                ELSE layer_id
           END,
               parent_id = CASE
                WHEN parent_id IS NOT NULL
                 AND NOT EXISTS (
                    SELECT 1 FROM feature_groups parent
                     WHERE parent.id = feature_groups.parent_id
                       AND parent.project_id = feature_groups.project_id
                 )
                THEN NULL
                ELSE parent_id
           END
         WHERE NOT EXISTS (
                SELECT 1 FROM layers parent
                 WHERE parent.id = feature_groups.layer_id
                   AND parent.project_id = feature_groups.project_id
           )
            OR (
                parent_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM feature_groups parent
                     WHERE parent.id = feature_groups.parent_id
                       AND parent.project_id = feature_groups.project_id
                )
           )
        "#,
        [],
    )?;

    let repaired_features = tx.execute(
        r#"
        UPDATE features
           SET layer_id = CASE
                WHEN NOT EXISTS (
                    SELECT 1 FROM layers parent
                     WHERE parent.id = features.layer_id
                       AND parent.project_id = features.project_id
                )
                THEN '__recovered_layer:' || project_id
                ELSE layer_id
           END,
               group_id = CASE
                WHEN group_id IS NOT NULL
                 AND NOT EXISTS (
                    SELECT 1 FROM feature_groups parent
                     WHERE parent.id = features.group_id
                       AND parent.project_id = features.project_id
                 )
                THEN NULL
                ELSE group_id
           END
         WHERE NOT EXISTS (
                SELECT 1 FROM layers parent
                 WHERE parent.id = features.layer_id
                   AND parent.project_id = features.project_id
           )
            OR (
                group_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM feature_groups parent
                     WHERE parent.id = features.group_id
                       AND parent.project_id = features.project_id
                )
           )
        "#,
        [],
    )?;

    tx.execute(
        "INSERT OR REPLACE INTO sys_config(key, value) VALUES(?1, ?2)",
        params![
            "legacy_design_relation_repair",
            json!({
                "repairedAt": chrono::Local::now().to_rfc3339(),
                "initialIssueCount": issue_count,
                "regionsParentCleared": repaired_region_parents,
                "layersRegionCleared": repaired_layer_regions,
                "featureGroupsRepaired": repaired_feature_groups,
                "featuresRepaired": repaired_features,
            })
            .to_string()
        ],
    )?;
    tx.commit()?;

    Ok(())
}

fn create_open_repair_backup(
    source: &Connection,
    source_path: &Path,
) -> Result<(), rusqlite::Error> {
    let backup_path = next_open_repair_backup_path(source_path);
    let mut destination = Connection::open_with_flags(
        &backup_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    {
        let backup = Backup::new_with_names(
            source,
            DatabaseName::Main,
            &mut destination,
            DatabaseName::Main,
        )?;
        backup.run_to_completion(64, Duration::from_millis(10), None)?;
    }
    destination.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    Ok(())
}

fn next_open_repair_backup_path(source_path: &Path) -> PathBuf {
    let preferred = PathBuf::from(format!("{}.bak", source_path.to_string_lossy()));
    if !preferred.exists() {
        return preferred;
    }
    PathBuf::from(format!(
        "{}.bak.{}",
        source_path.to_string_lossy(),
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    ))
}

fn reject_blocking_audit(
    report: &DatabaseAuditReport,
    allow_version_mismatch: bool,
) -> Result<(), rusqlite::Error> {
    let blocking_issues: Vec<_> = report
        .issues
        .iter()
        .filter(|issue| {
            issue.severity
                == crate::domain::implement::modules::v2::storage::audit::DatabaseAuditSeverity::Error
                && !(allow_version_mismatch
                    && matches!(
                        issue.rule.as_str(),
                        "schema_version_mismatch" | "configured_schema_version_mismatch"
                    ))
        })
        .collect();
    if report.integrity_check == "ok" && report.foreign_keys_enabled && blocking_issues.is_empty() {
        return Ok(());
    }

    let payload = serde_json::to_string(report)
        .unwrap_or_else(|error| format!("{{\"auditSerializationError\":\"{error}\"}}"));
    Err(rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CONSTRAINT),
        Some(format!("Database migration blocked by audit: {payload}")),
    ))
}

fn create_pre_migration_backup(
    source: &Connection,
    source_path: &Path,
    source_version: i32,
) -> Result<(PathBuf, String), rusqlite::Error> {
    let timestamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ");
    let backup_path = source_path.with_extension(format!(
        "pre-v{source_version}-to-v{CURRENT_SCHEMA_VERSION}-{timestamp}.pmp"
    ));
    let mut destination = Connection::open_with_flags(
        &backup_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    {
        let backup = Backup::new_with_names(
            source,
            DatabaseName::Main,
            &mut destination,
            DatabaseName::Main,
        )?;
        backup.run_to_completion(64, Duration::from_millis(10), None)?;
    }
    let integrity: String =
        destination.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT),
            Some(format!(
                "Pre-migration backup failed integrity validation: {integrity}"
            )),
        ));
    }
    drop(destination);

    let bytes = std::fs::read(&backup_path)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    let sha256 = format!("{:x}", Sha256::digest(bytes));
    Ok((backup_path, sha256))
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
        [PROJECT_FORMAT_VERSION],
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::implement::modules::v2::storage::schema::{
        apply_v2_schema, CURRENT_SCHEMA_LABEL,
    };
    use tempfile::tempdir;

    fn mark_as_v8(conn: &Connection) {
        conn.execute("DELETE FROM schema_migrations", [])
            .expect("clear migrations");
        conn.execute(
            "INSERT INTO schema_migrations(version, label) VALUES(8, '8.0.0')",
            [],
        )
        .expect("v8 migration");
        conn.execute(
            "UPDATE sys_config SET value='8.0.0' WHERE key='schema_version'",
            [],
        )
        .expect("v8 config");
        conn.pragma_update(None, "user_version", 8)
            .expect("v8 pragma");
    }

    #[test]
    fn fresh_database_uses_consistent_current_version_sources() {
        let directory = tempdir().expect("tempdir");
        let path = directory.path().join("fresh.pmp");
        let database = PmpDatabase::open_or_create(path).expect("fresh database");

        let user_version: i32 = database
            .conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("user version");
        let migration_version: i32 = database
            .conn
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .expect("migration version");
        let configured_version: String = database
            .conn
            .query_row(
                "SELECT value FROM sys_config WHERE key='schema_version'",
                [],
                |row| row.get(0),
            )
            .expect("configured version");

        assert_eq!(user_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(migration_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(configured_version, CURRENT_SCHEMA_LABEL);

        let audit = PmpDatabase::audit_path(&database.pmp_path).expect("read-only audit");
        assert!(!audit.has_blocking_errors());
    }

    #[test]
    fn clean_v8_database_is_backed_up_and_migrated() {
        let directory = tempdir().expect("tempdir");
        let path = directory.path().join("upgrade.pmp");
        {
            let conn = Connection::open(&path).expect("fixture database");
            conn.pragma_update(None, "foreign_keys", "ON")
                .expect("foreign keys");
            apply_v2_schema(&conn).expect("fixture schema");
            conn.execute_batch(
                r#"
                INSERT INTO projects(id, name, title) VALUES('p1', 'P1', 'P1');
                INSERT INTO layers(id, project_id, name) VALUES('l1', 'p1', 'Layer');
                INSERT INTO features(id, project_id, layer_id, name, geom_type)
                VALUES('f1', 'p1', 'l1', 'Cable', 'LineString');
                INSERT INTO fiber_cables(id, project_id, feature_id, fiber_count, source)
                VALUES('c1', 'p1', 'f1', 12, 'legacy');
                "#,
            )
            .expect("legacy cable without materialized strands");
            mark_as_v8(&conn);
        }

        let database = PmpDatabase::open_or_create(path.clone()).expect("schema migration");
        let user_version: i32 = database
            .conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("user version");
        assert_eq!(user_version, CURRENT_SCHEMA_VERSION);

        let expected_backup_marker = format!("pre-v8-to-v{CURRENT_SCHEMA_VERSION}");
        let backup_count = std::fs::read_dir(directory.path())
            .expect("backup directory")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .contains(&expected_backup_marker)
            })
            .count();
        assert_eq!(backup_count, 1);
    }

    #[test]
    fn current_version_database_backfills_missing_runtime_schema() {
        let directory = tempdir().expect("tempdir");
        let path = directory.path().join("runtime_compat.pmp");
        {
            let conn = Connection::open(&path).expect("fixture database");
            conn.pragma_update(None, "foreign_keys", "OFF")
                .expect("foreign keys off");
            apply_v2_schema(&conn).expect("fixture schema");
            conn.execute_batch(
                r#"
                DROP TABLE IF EXISTS design_history;
                DROP TRIGGER IF EXISTS trg_features_project_insert;
                DROP TRIGGER IF EXISTS trg_features_project_update;
                DROP TRIGGER IF EXISTS trg_feature_rtree_insert;
                DROP TRIGGER IF EXISTS trg_feature_rtree_update;
                DROP TRIGGER IF EXISTS trg_feature_rtree_delete;
                DROP INDEX IF EXISTS idx_features_project_bbox;
                DROP TABLE IF EXISTS feature_rtree;

                ALTER TABLE features RENAME TO features_with_bbox;
                CREATE TABLE features (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    layer_id TEXT NOT NULL,
                    group_id TEXT,
                    name TEXT NOT NULL,
                    geom_type TEXT NOT NULL,
                    coordinates_json TEXT CHECK (
                        coordinates_json IS NULL
                        OR (json_valid(coordinates_json) AND json_type(coordinates_json) IN ('array', 'object'))
                    ),
                    properties_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(properties_json) AND json_type(properties_json) = 'object'),
                    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
                    bbox_json TEXT CHECK (
                        bbox_json IS NULL
                        OR (json_valid(bbox_json) AND json_type(bbox_json) = 'array')
                    ),
                    is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
                    note TEXT,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY(layer_id, project_id) REFERENCES layers(id, project_id) ON DELETE CASCADE,
                    FOREIGN KEY(group_id) REFERENCES feature_groups(id) ON DELETE SET NULL,
                    UNIQUE(id, project_id)
                );
                CREATE INDEX IF NOT EXISTS idx_features_project ON features (project_id);
                INSERT INTO features (
                    id, project_id, layer_id, group_id, name, geom_type, coordinates_json,
                    properties_json, metadata_json, bbox_json, is_visible, note, created_at, updated_at
                )
                SELECT
                    id, project_id, layer_id, group_id, name, geom_type, coordinates_json,
                    properties_json, metadata_json, bbox_json, is_visible, note, created_at, updated_at
                FROM features_with_bbox;
                DROP TABLE features_with_bbox;
                "#,
            )
            .expect("downgrade runtime schema");
            conn.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)
                .expect("current pragma");
        }

        let database = PmpDatabase::open_or_create(path).expect("runtime compatibility");
        let history_exists: i64 = database
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='design_history'",
                [],
                |row| row.get(0),
            )
            .expect("design_history exists");
        let bbox_column_count: i64 = database
            .conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('features') WHERE name IN ('bbox_min_x', 'bbox_min_y', 'bbox_max_x', 'bbox_max_y')",
                [],
                |row| row.get(0),
            )
            .expect("bbox columns");
        let rtree_exists: i64 = database
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='feature_rtree'",
                [],
                |row| row.get(0),
            )
            .expect("feature_rtree exists");

        assert_eq!(history_exists, 1);
        assert_eq!(bbox_column_count, 4);
        assert_eq!(rtree_exists, 1);
    }

    #[test]
    fn invalid_v8_design_relations_are_backed_up_and_repaired() {
        let directory = tempdir().expect("tempdir");
        let path = directory.path().join("invalid.pmp");
        {
            let conn = Connection::open(&path).expect("fixture database");
            conn.pragma_update(None, "foreign_keys", "ON")
                .expect("foreign keys");
            apply_v2_schema(&conn).expect("fixture schema");
            conn.execute_batch(
                r#"
                INSERT INTO projects(id, name, title) VALUES('p1', 'P1', 'P1');
                INSERT INTO projects(id, name, title) VALUES('p2', 'P2', 'P2');
                INSERT INTO regions(id, project_id, name) VALUES('r1', 'p1', 'Region');
                INSERT INTO layers(id, project_id, name) VALUES('l1', 'p1', 'Layer');
                INSERT INTO feature_groups(id, project_id, layer_id, name) VALUES('g1', 'p1', 'l1', 'Group');
                DROP TRIGGER trg_features_project_insert;
                DROP TRIGGER trg_features_project_update;
                DROP TRIGGER trg_feature_groups_project_insert;
                DROP TRIGGER trg_feature_groups_project_update;
                DROP TRIGGER trg_regions_parent_project_insert;
                DROP TRIGGER trg_regions_parent_project_update;
                DROP TRIGGER trg_layers_region_project_insert;
                DROP TRIGGER trg_layers_region_project_update;
                PRAGMA foreign_keys=OFF;
                INSERT INTO regions(id, project_id, parent_id, name) VALUES('r2', 'p2', 'r1', 'Invalid Region');
                INSERT INTO layers(id, project_id, region_id, name) VALUES('l2', 'p2', 'r1', 'Invalid Layer Region');
                INSERT INTO feature_groups(id, project_id, layer_id, parent_id, name)
                VALUES('g2', 'p2', 'l1', 'g1', 'Invalid Group');
                INSERT INTO features(
                    id, project_id, layer_id, group_id, name, geom_type, properties_json, metadata_json
                ) VALUES('f1', 'p2', 'l1', 'g1', 'Invalid', 'Point', '{}', '{}');
                "#,
            )
            .expect("invalid fixture");
            mark_as_v8(&conn);
        }

        let database = PmpDatabase::open_or_create(path.clone()).expect("migration repairs");
        let report = database.audit_database().expect("post-repair audit");
        assert!(!report.has_blocking_errors(), "{report:#?}");

        let user_version: i32 = database
            .conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("user version");
        assert_eq!(user_version, CURRENT_SCHEMA_VERSION);

        let fallback_layer = "__recovered_layer:p2";
        let feature_relation: (String, Option<String>) = database
            .conn
            .query_row(
                "SELECT layer_id, group_id FROM features WHERE id='f1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("feature repaired");
        assert_eq!(feature_relation, (fallback_layer.to_string(), None));

        let group_relation: (String, Option<String>) = database
            .conn
            .query_row(
                "SELECT layer_id, parent_id FROM feature_groups WHERE id='g2'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("feature group repaired");
        assert_eq!(group_relation, (fallback_layer.to_string(), None));

        let region_parent: Option<String> = database
            .conn
            .query_row("SELECT parent_id FROM regions WHERE id='r2'", [], |row| {
                row.get(0)
            })
            .expect("region repaired");
        assert_eq!(region_parent, None);

        let layer_region: Option<String> = database
            .conn
            .query_row("SELECT region_id FROM layers WHERE id='l2'", [], |row| {
                row.get(0)
            })
            .expect("layer repaired");
        assert_eq!(layer_region, None);

        let marker: String = database
            .conn
            .query_row(
                "SELECT value FROM sys_config WHERE key='legacy_design_relation_repair'",
                [],
                |row| row.get(0),
            )
            .expect("repair marker");
        assert!(marker.contains("\"featuresRepaired\":1"));

        let backup_count = std::fs::read_dir(directory.path())
            .expect("directory")
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".pmp.bak"))
            .count();
        assert_eq!(backup_count, 1);

        let invalid_insert = database.conn.execute(
            "INSERT INTO features(
                id, project_id, layer_id, name, geom_type, properties_json, metadata_json
             ) VALUES('f-new-invalid', 'p2', 'l1', 'Invalid New', 'Point', '{}', '{}')",
            [],
        );
        assert!(invalid_insert.is_err());
    }

    #[test]
    #[ignore = "set PMP_MIGRATION_REHEARSAL_PATH to a disposable database copy"]
    fn external_database_migration_rehearsal() {
        let path = std::env::var_os("PMP_MIGRATION_REHEARSAL_PATH")
            .map(PathBuf::from)
            .expect("PMP_MIGRATION_REHEARSAL_PATH");
        let database = PmpDatabase::open_or_create(path).expect("external migration rehearsal");
        let report = database.audit_database().expect("post-migration audit");

        assert!(!report.has_blocking_errors(), "{report:#?}");
        assert_eq!(report.user_version, CURRENT_SCHEMA_VERSION);
    }
}
