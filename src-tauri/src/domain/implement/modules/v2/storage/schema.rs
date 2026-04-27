/// V2 Database Schema
///
/// Defines the complete SQLite schema for V2 .pmp files.
/// Key changes from V1:
/// - UUIDs instead of INTEGER IDs
/// - event_store as source of truth
/// - metadata_registry for schema control
/// - entity_index for unified search
/// - sync_state for multi-device support
/// - current_version column on all projection tables
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use uuid::Uuid;

pub const PMP_FORMAT_VERSION: &str = "2.1";

#[derive(Debug, Clone)]
pub struct PmpMetadata {
    pub format_version: String,
    pub project_id: Uuid,
    pub app_version: String,
    pub device_id: String,
    pub last_global_seq: i64,
    pub features_json: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Apply the complete V2 schema to a connection
pub fn apply_v2_schema(conn: &Connection) -> Result<(), String> {
    normalize_legacy_table_conflicts(conn)?;

    // [ANTI-CRASH V2.1] Ensure features table has task_id column before execute_batch runs indices
    // This handles old V2 databases that were created before task_id was added to the projection.
    let table_exists: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='features'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if table_exists > 0 {
        let has_task_id: i64 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('features') WHERE name='task_id'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if has_task_id == 0 {
            let _ = conn.execute("ALTER TABLE features ADD COLUMN task_id TEXT", []);
        }

        // [V2.2 Migration] Ensure spatial columns and new visibility columns exist
        let has_wkb: i32 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('features') WHERE name='geometry_wkb'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if has_wkb == 0 {
            let _ = conn.execute("ALTER TABLE features ADD COLUMN geometry_wkb BLOB", []);
            let _ = conn.execute("ALTER TABLE features ADD COLUMN min_x REAL", []);
            let _ = conn.execute("ALTER TABLE features ADD COLUMN min_y REAL", []);
            let _ = conn.execute("ALTER TABLE features ADD COLUMN max_x REAL", []);
            let _ = conn.execute("ALTER TABLE features ADD COLUMN max_y REAL", []);
        }

        // V72: Add is_visible and note to features
        let has_is_visible: i32 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('features') WHERE name='is_visible'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if has_is_visible == 0 {
            let _ = conn.execute(
                "ALTER TABLE features ADD COLUMN is_visible BOOLEAN DEFAULT 1",
                [],
            );
        }

        let has_note: i32 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('features') WHERE name='note'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if has_note == 0 {
            let _ = conn.execute("ALTER TABLE features ADD COLUMN note TEXT DEFAULT ''", []);
        }

        // V72: Add is_visible and group_type to feature_groups
        let has_fg_is_visible: i32 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('feature_groups') WHERE name='is_visible'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if has_fg_is_visible == 0 {
            let _ = conn.execute(
                "ALTER TABLE feature_groups ADD COLUMN is_visible BOOLEAN DEFAULT 1",
                [],
            );
        }

        let has_fg_type: i32 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('feature_groups') WHERE name='group_type'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if has_fg_type == 0 {
            let _ = conn.execute(
                "ALTER TABLE feature_groups ADD COLUMN group_type TEXT DEFAULT 'group'",
                [],
            );
        }
    }

    // [ANTI-CRASH V2.3] Ensure layers table has region_id
    let has_region_id: i64 = conn
        .query_row(
            "SELECT count(*) FROM pragma_table_info('layers') WHERE name='region_id'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_region_id == 0 {
        let _ = conn.execute("ALTER TABLE layers ADD COLUMN region_id TEXT", []);
    }

    // [ANTI-CRASH V2.4] Ensure event_store has schema_version
    let has_schema_version: i64 = conn
        .query_row(
            "SELECT count(*) FROM pragma_table_info('event_store') WHERE name='schema_version'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_schema_version == 0 {
        let _ = conn.execute(
            "ALTER TABLE event_store ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1",
            [],
        );
    }

    // [ANTI-CRASH V2.3] Ensure materials table has project_id
    let has_material_project_id: i64 = conn
        .query_row(
            "SELECT count(*) FROM pragma_table_info('materials') WHERE name='project_id'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_material_project_id == 0 {
        let _ = conn.execute("ALTER TABLE materials ADD COLUMN project_id TEXT", []);
    }

    conn.execute_batch(SCHEMA_SQL).map_err(|e| e.to_string())?;

    // Auto-backfill for existing features
    let _ = backfill_spatial_data(conn);
    let _ = backfill_metadata_fields(conn);

    Ok(())
}

pub fn backfill_metadata_fields(conn: &Connection) -> Result<usize, String> {
    use serde_json::Value;

    let mut backfilled_count = 0;

    // 1. Backfill features: is_visible and note from metadata_json
    let mut stmt = conn
        .prepare("SELECT id, metadata_json FROM features")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        if let Ok((id, meta_json)) = row {
            if let Ok(meta) = serde_json::from_str::<Value>(&meta_json) {
                let is_visible = meta
                    .get("is_visible")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let note = meta.get("note").and_then(|v| v.as_str()).unwrap_or("");

                let _ = conn.execute(
                    "UPDATE features SET is_visible = ?1, note = ?2 WHERE id = ?3",
                    params![is_visible, note, id],
                );
                backfilled_count += 1;
            }
        }
    }

    // 2. Backfill feature_groups: is_visible and group_type from metadata_json
    let mut stmt = conn
        .prepare("SELECT id, metadata_json FROM feature_groups")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        if let Ok((id, meta_json)) = row {
            if let Ok(meta) = serde_json::from_str::<Value>(&meta_json) {
                let is_visible = meta
                    .get("is_visible")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let group_type = meta
                    .get("group_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("group");

                let _ = conn.execute(
                    "UPDATE feature_groups SET is_visible = ?1, group_type = ?2 WHERE id = ?3",
                    params![is_visible, group_type, id],
                );
                backfilled_count += 1;
            }
        }
    }

    if backfilled_count > 0 {
        println!(
            "[V2] Backfilled metadata fields (visibility/notes) for {} entities",
            backfilled_count
        );
    }

    Ok(backfilled_count)
}

pub fn backfill_spatial_data(conn: &Connection) -> Result<usize, String> {
    use crate::implement::modules::v2::spatial::calculate_spatial;
    use serde_json::Value;

    let mut stmt = conn
        .prepare(
            "SELECT id, geometry_json FROM features WHERE geometry_wkb IS NULL OR min_x IS NULL",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut backfilled_count = 0;
    for row in rows {
        if let Ok((id, geometry_json)) = row {
            if let Ok(geometry) = serde_json::from_str::<Value>(&geometry_json) {
                let (transformed_geom, wkb, min_x, min_y, max_x, max_y, _x_vn, _y_vn, ..) =
                    calculate_spatial(&geometry);
                if wkb.is_some() {
                    let wkb_data: Option<Vec<u8>> = wkb;
                    let geom_json =
                        serde_json::to_string(&transformed_geom).unwrap_or(geometry_json);
                    let _ = conn.execute(
                        "UPDATE features SET geometry_json = ?1, geometry_wkb = ?2, min_x = ?3, min_y = ?4, max_x = ?5, max_y = ?6 WHERE id = ?7",
                        params![geom_json, wkb_data, min_x, min_y, max_x, max_y, id],
                    );
                    backfilled_count += 1;
                }
            }
        }
    }

    if backfilled_count > 0 {
        println!(
            "[GIS] Backfilled spatial data for {} features",
            backfilled_count
        );
    }

    Ok(backfilled_count)
}

fn normalize_legacy_table_conflicts(conn: &Connection) -> Result<(), String> {
    // Some partially migrated databases still keep legacy INTEGER-based tables under V2 names.
    // Those tables break V2 seed inserts with "datatype mismatch".
    rename_legacy_table_if_needed(conn, "content_fields", "v1_content_fields", |columns| {
        let id_type = column_decl_type(columns, "id");
        let content_type_id_type = column_decl_type(columns, "content_type_id");
        is_integer_affinity(id_type) || is_integer_affinity(content_type_id_type)
    })?;

    rename_legacy_table_if_needed(conn, "project_settings", "v1_project_settings", |columns| {
        is_integer_affinity(column_decl_type(columns, "project_id"))
    })?;

    Ok(())
}

fn rename_legacy_table_if_needed<F>(
    conn: &Connection,
    table_name: &str,
    legacy_table_name: &str,
    should_rename: F,
) -> Result<(), String>
where
    F: Fn(&[(String, String)]) -> bool,
{
    if !table_exists(conn, table_name)? || table_exists(conn, legacy_table_name)? {
        return Ok(());
    }

    let columns = table_info(conn, table_name)?;
    if should_rename(&columns) {
        conn.execute(
            &format!(
                "ALTER TABLE \"{}\" RENAME TO \"{}\"",
                table_name, legacy_table_name
            ),
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn table_exists(conn: &Connection, table_name: &str) -> Result<bool, String> {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            params![table_name],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(exists > 0)
}

fn table_info(conn: &Connection, table_name: &str) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info('{}')", table_name))
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

fn column_decl_type<'a>(columns: &'a [(String, String)], column_name: &str) -> Option<&'a str> {
    columns
        .iter()
        .find(|(name, _)| name == column_name)
        .map(|(_, decl_type)| decl_type.as_str())
}

fn is_integer_affinity(decl_type: Option<&str>) -> bool {
    decl_type
        .map(|value| value.to_ascii_uppercase().contains("INT"))
        .unwrap_or(false)
}

pub fn load_pmp_metadata(conn: &Connection) -> Result<Option<PmpMetadata>, String> {
    conn.query_row(
        "SELECT format_version, project_id, app_version, device_id, last_global_seq, features_json, created_at, updated_at
         FROM pmp_metadata WHERE singleton = 1",
        [],
        |row| {
            let project_id: String = row.get(1)?;
            Ok(PmpMetadata {
                format_version: row.get(0)?,
                project_id: Uuid::parse_str(&project_id).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        1,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?,
                app_version: row.get(2)?,
                device_id: row.get(3)?,
                last_global_seq: row.get(4)?,
                features_json: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn ensure_pmp_metadata(
    conn: &Connection,
    project_id: Uuid,
    device_id: &str,
) -> Result<PmpMetadata, String> {
    let existing = load_pmp_metadata(conn)?;
    if existing.is_some() {
        conn.execute(
            "UPDATE pmp_metadata
             SET project_id = ?1,
                 device_id = ?2,
                 format_version = ?3,
                 app_version = ?4,
                 updated_at = datetime('now')
             WHERE singleton = 1",
            params![
                project_id.to_string(),
                device_id,
                PMP_FORMAT_VERSION,
                env!("CARGO_PKG_VERSION"),
            ],
        )
        .map_err(|e| e.to_string())?;

        return load_pmp_metadata(conn)?
            .ok_or_else(|| "Failed to reload pmp metadata".to_string())
            .map(|mut metadata| {
                metadata.project_id = project_id;
                metadata.device_id = device_id.to_string();
                metadata
            });
    }

    conn.execute(
        "INSERT INTO pmp_metadata (
            singleton,
            format_version,
            project_id,
            app_version,
            device_id,
            last_global_seq,
            features_json,
            created_at,
            updated_at
        ) VALUES (1, ?1, ?2, ?3, ?4, 0, ?5, datetime('now'), datetime('now'))",
        params![
            PMP_FORMAT_VERSION,
            project_id.to_string(),
            env!("CARGO_PKG_VERSION"),
            device_id,
            r#"["event_sourcing","entity_aliases","design_command_batches"]"#,
        ],
    )
    .map_err(|e| e.to_string())?;

    load_pmp_metadata(conn)?.ok_or_else(|| "Failed to create pmp metadata".to_string())
}

pub fn update_pmp_last_global_seq(
    conn: &Connection,
    device_id: &str,
    last_global_seq: i64,
) -> Result<(), String> {
    conn.execute(
        "UPDATE pmp_metadata
         SET device_id = ?1,
             last_global_seq = ?2,
             updated_at = datetime('now')
         WHERE singleton = 1",
        params![device_id, last_global_seq],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn import_sidecar_manifest_if_present(
    conn: &Connection,
    pmp_path: &Path,
    project_id: Uuid,
    device_id: &str,
) -> Result<(), String> {
    let manifest_io = super::manifest::ManifestIO::new(pmp_path);
    let Some(sidecar) = manifest_io.read().ok() else {
        ensure_pmp_metadata(conn, project_id, device_id)?;
        return Ok(());
    };

    conn.execute(
        "INSERT INTO pmp_metadata (
            singleton,
            format_version,
            project_id,
            app_version,
            device_id,
            last_global_seq,
            features_json,
            created_at,
            updated_at
        ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(singleton) DO UPDATE SET
            format_version = excluded.format_version,
            project_id = excluded.project_id,
            app_version = excluded.app_version,
            device_id = excluded.device_id,
            last_global_seq = excluded.last_global_seq,
            features_json = excluded.features_json,
            updated_at = excluded.updated_at",
        params![
            sidecar.format_version,
            sidecar.project_id.to_string(),
            sidecar.app_version,
            device_id,
            sidecar.last_global_seq,
            serde_json::to_string(&sidecar.features).unwrap_or_else(|_| "[]".to_string()),
            sidecar.created_at,
            sidecar.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub const SCHEMA_SQL: &str = r#"
-- ============================================================================
-- SYSTEM TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    checksum TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
    device_id TEXT PRIMARY KEY,
    device_name TEXT,
    last_pushed_seq INTEGER DEFAULT 0,
    last_pulled_seq INTEGER DEFAULT 0,
    last_sync_at TEXT,
    sync_status TEXT DEFAULT 'idle',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pmp_metadata (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    format_version TEXT NOT NULL,
    project_id TEXT NOT NULL,
    app_version TEXT NOT NULL,
    device_id TEXT NOT NULL,
    last_global_seq INTEGER NOT NULL DEFAULT 0,
    features_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_id_aliases (
    entity_type TEXT NOT NULL,
    scope_id TEXT NOT NULL DEFAULT '',
    legacy_id INTEGER NOT NULL,
    uuid TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (entity_type, scope_id, legacy_id),
    UNIQUE (entity_type, uuid)
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_uuid ON entity_id_aliases(entity_type, uuid);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_scope ON entity_id_aliases(scope_id);

CREATE TABLE IF NOT EXISTS design_events (
    event_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    is_undone BOOLEAN NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_design_events_project_ts ON design_events(project_id, timestamp);

CREATE TABLE IF NOT EXISTS design_command_batches (
    batch_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    events_json TEXT NOT NULL,
    inverse_events_json TEXT NOT NULL,
    event_ids_json TEXT NOT NULL,
    undone_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_design_batches_project ON design_command_batches(project_id, created_at);

-- ============================================================================
-- SOURCE OF TRUTH
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_store (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    metadata_json TEXT,
    version INTEGER NOT NULL,
    global_seq INTEGER NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    correlation_id TEXT,
    causation_id TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_event_store_entity ON event_store(entity_type, entity_id, version);
CREATE INDEX IF NOT EXISTS idx_event_store_global_seq ON event_store(global_seq);
CREATE INDEX IF NOT EXISTS idx_event_store_device ON event_store(device_id, global_seq);
CREATE INDEX IF NOT EXISTS idx_event_store_correlation ON event_store(correlation_id);
CREATE INDEX IF NOT EXISTS idx_event_store_project ON event_store(project_id, entity_type);

-- ============================================================================
-- SCHEMA CONTROL
-- ============================================================================

CREATE TABLE IF NOT EXISTS metadata_registry (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    schema_name TEXT NOT NULL,
    schema_json TEXT NOT NULL,
    version INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(entity_type, version)
);

CREATE INDEX IF NOT EXISTS idx_metadata_registry_type ON metadata_registry(entity_type, is_active);

-- ============================================================================
-- SEARCH INDEX
-- ============================================================================

CREATE TABLE IF NOT EXISTS entity_index (
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT,
    search_vector TEXT,
    tags TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (entity_id, entity_type)
);

CREATE VIRTUAL TABLE IF NOT EXISTS entity_search USING fts5(
    entity_id UNINDEXED,
    entity_type UNINDEXED,
    name,
    search_vector,
    tags,
    content='entity_index',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS entity_search_ai AFTER INSERT ON entity_index BEGIN
    INSERT INTO entity_search(rowid, entity_id, entity_type, name, search_vector, tags)
    VALUES (new.rowid, new.entity_id, new.entity_type, new.name, new.search_vector, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS entity_search_ad AFTER DELETE ON entity_index BEGIN
    INSERT INTO entity_search(entity_search, rowid, entity_id, entity_type, name, search_vector, tags)
    VALUES('delete', old.rowid, old.entity_id, old.entity_type, old.name, old.search_vector, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS entity_search_au AFTER UPDATE ON entity_index BEGIN
    INSERT INTO entity_search(entity_search, rowid, entity_id, entity_type, name, search_vector, tags)
    VALUES('delete', old.rowid, old.entity_id, old.entity_type, old.name, old.search_vector, old.tags);
    INSERT INTO entity_search(rowid, entity_id, entity_type, name, search_vector, tags)
    VALUES (new.rowid, new.entity_id, new.entity_type, new.name, new.search_vector, new.tags);
END;

CREATE INDEX IF NOT EXISTS idx_entity_index_project ON entity_index(project_id);
CREATE INDEX IF NOT EXISTS idx_entity_index_type ON entity_index(entity_type);

-- ============================================================================
-- BLOB METADATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS blob_registry (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    original_filename TEXT,
    blob_path TEXT NOT NULL,
    reference_count INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_blob_registry_sha256 ON blob_registry(sha256);

-- ============================================================================
-- PROJECTION TABLES (READ MODELS)
-- ============================================================================

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_path TEXT,
    path TEXT,
    description TEXT,
    contract_number TEXT,
    investor TEXT,
    contractor TEXT,
    signed_date TEXT,
    duration TEXT,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    metadata_json TEXT DEFAULT '{}',
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Regions (NEW in V2)
CREATE TABLE IF NOT EXISTS regions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    parent_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    metadata_json TEXT DEFAULT '{}',
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_regions_project ON regions(project_id);
CREATE INDEX IF NOT EXISTS idx_regions_parent ON regions(parent_id);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    parent_id TEXT,
    related_file_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT DEFAULT 'normal',
    start_date TEXT,
    end_date TEXT,
    target_file_path TEXT,
    anchor_data TEXT,
    progress REAL DEFAULT 0,
    is_completed BOOLEAN DEFAULT 0,
    color TEXT,
    assignee_id TEXT,
    contract_id TEXT,
    metadata_json TEXT DEFAULT '{}',
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);

-- Features (NEW in V2 - was only in-memory MapState)
CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    layer_id TEXT,
    group_id TEXT,
    name TEXT NOT NULL,
    geom_type TEXT NOT NULL,
    geometry_json TEXT NOT NULL,
    geometry_wkb BLOB,
    min_x REAL,
    min_y REAL,
    max_x REAL,
    max_y REAL,
    is_visible BOOLEAN DEFAULT 1,
    note TEXT DEFAULT '',
    properties_json TEXT DEFAULT '{}',
    metadata_json TEXT DEFAULT '{}',
    style_id TEXT,
    task_id TEXT,
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_features_project ON features(project_id);
CREATE INDEX IF NOT EXISTS idx_features_bbox ON features(project_id, min_x, max_x, min_y, max_y);
CREATE INDEX IF NOT EXISTS idx_features_layer ON features(layer_id);
CREATE INDEX IF NOT EXISTS idx_features_task ON features(task_id);

-- Layers (NEW in V2)
CREATE TABLE IF NOT EXISTS layers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    region_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    is_visible BOOLEAN DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    metadata_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Feature Groups (NEW in V2)
CREATE TABLE IF NOT EXISTS feature_groups (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    group_type TEXT DEFAULT 'group',
    is_visible BOOLEAN DEFAULT 1,
    metadata_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Files
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    blob_id TEXT,
    rel_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    extension TEXT,
    file_size INTEGER DEFAULT 0,
    hash_sha256 TEXT,
    mime_type TEXT,
    file_type TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    content_summary TEXT,
    metadata_json TEXT DEFAULT '{}',
    categorization TEXT,
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
-- hash_sha256 may not exist in migrated V1 databases
-- CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash_sha256);

-- Work Items
CREATE TABLE IF NOT EXISTS work_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    feature_id TEXT,
    name TEXT NOT NULL,
    material_id TEXT,
    quantity REAL DEFAULT 0,
    unit_price REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    metadata_json TEXT DEFAULT '{}',
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_work_items_project ON work_items(project_id);

-- Materials
CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    unit TEXT,
    base_price REAL DEFAULT 0,
    category TEXT,
    metadata_json TEXT DEFAULT '{}',
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Contracts
CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    contract_number TEXT,
    vendor TEXT,
    value REAL,
    signed_date TEXT,
    notes TEXT,
    file_path TEXT,
    has_analysis BOOLEAN DEFAULT 0,
    metadata_json TEXT DEFAULT '{}',
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);

-- Personnel
CREATE TABLE IF NOT EXISTS personnel (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    region TEXT,
    role TEXT,
    metadata_json TEXT DEFAULT '{}',
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_personnel_project ON personnel(project_id);

-- Notes
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    target_file_path TEXT,
    anchor_data TEXT,
    metadata_json TEXT DEFAULT '{}',
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);

-- Content Types
CREATE TABLE IF NOT EXISTS content_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    icon TEXT,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Content Fields
CREATE TABLE IF NOT EXISTS content_fields (
    id TEXT PRIMARY KEY,
    content_type_id TEXT NOT NULL,
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL,
    required BOOLEAN DEFAULT 0,
    options_json TEXT,
    UNIQUE(content_type_id, name)
);

-- Content Items
CREATE TABLE IF NOT EXISTS content_items (
    id TEXT PRIMARY KEY,
    content_type_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data_json TEXT NOT NULL,
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_items_project ON content_items(project_id);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    permissions_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Personnel Roles
CREATE TABLE IF NOT EXISTS personnel_roles (
    personnel_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (personnel_id, role_id)
);

-- Project Settings
CREATE TABLE IF NOT EXISTS project_settings (
    project_id TEXT PRIMARY KEY,
    epsg_code TEXT DEFAULT '3857',
    units TEXT DEFAULT 'm',
    center_lat REAL,
    center_lon REAL,
    default_zoom REAL DEFAULT 15,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT,
    user_email TEXT,
    action_type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    old_values_json TEXT,
    new_values_json TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id);

-- Feature Attachments
CREATE TABLE IF NOT EXISTS feature_attachments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    attachment_type TEXT DEFAULT 'GENERAL',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Design Styles
CREATE TABLE IF NOT EXISTS design_styles (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    geom_type TEXT NOT NULL,
    stroke_color TEXT,
    stroke_width REAL,
    fill_color TEXT,
    opacity REAL,
    icon_path TEXT,
    dash_pattern TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Contract Execution Groups
CREATE TABLE IF NOT EXISTS contract_execution_groups (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo',
    due_date TEXT,
    assignee TEXT,
    color TEXT,
    bom_item_uids TEXT,
    current_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Task Links (replaces text-based dependencies column)
CREATE TABLE IF NOT EXISTS task_links (
    id TEXT PRIMARY KEY,
    from_task_id TEXT NOT NULL,
    to_task_id TEXT NOT NULL,
    link_type TEXT DEFAULT 'depends_on',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(from_task_id, to_task_id, link_type)
);

-- Project Folders
CREATE TABLE IF NOT EXISTS project_folders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI Corrections (for learning loop)
CREATE TABLE IF NOT EXISTS ai_corrections (
    id TEXT PRIMARY KEY,
    file_hash TEXT,
    field_name TEXT NOT NULL,
    original_value TEXT,
    corrected_value TEXT NOT NULL,
    context_text TEXT,
    embedding BLOB,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Offline Sync Queue (NEW in V2.1)
CREATE TABLE IF NOT EXISTS offline_sync_queue (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    event_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offline_sync_project ON offline_sync_queue(project_id);

-- ============================================================================
-- SEED DATA
-- ============================================================================

INSERT OR IGNORE INTO content_types (id, name, icon, description) VALUES ('ct-equipment', 'Thiết bị', 'Zap', 'Quản lý máy móc, công cụ tại công trường');
INSERT OR IGNORE INTO content_fields (id, content_type_id, name, label, field_type, required) VALUES ('cf-eq-1', 'ct-equipment', 'code', 'Mã hiệu', 'text', 1);
INSERT OR IGNORE INTO content_fields (id, content_type_id, name, label, field_type, required) VALUES ('cf-eq-2', 'ct-equipment', 'brand', 'Thương hiệu', 'text', 0);
INSERT OR IGNORE INTO content_fields (id, content_type_id, name, label, field_type, required) VALUES ('cf-eq-3', 'ct-equipment', 'status', 'Tình trạng', 'text', 0);

INSERT OR IGNORE INTO content_types (id, name, icon, description) VALUES ('ct-personnel', 'Nhân sự dự án', 'Users', 'Danh sách cán bộ, công nhân viên tham gia dự án');
INSERT OR IGNORE INTO content_fields (id, content_type_id, name, label, field_type, required) VALUES ('cf-per-1', 'ct-personnel', 'role', 'Chức vụ', 'text', 1);
INSERT OR IGNORE INTO content_fields (id, content_type_id, name, label, field_type, required) VALUES ('cf-per-2', 'ct-personnel', 'phone', 'Số điện thoại', 'text', 0);

INSERT OR IGNORE INTO roles (id, name, permissions_json) VALUES ('role-admin', 'Admin', '{"all": true}');
INSERT OR IGNORE INTO roles (id, name, permissions_json) VALUES ('role-editor', 'Editor', '{"edit_map": true, "edit_tasks": true}');
INSERT OR IGNORE INTO roles (id, name, permissions_json) VALUES ('role-viewer', 'Viewer', '{"view_only": true}');
"#;

/// Check if a database is V2 format
pub fn is_v2_database(conn: &Connection) -> Result<bool, String> {
    // Check for event_store table
    let has_event_store: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='event_store'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(has_event_store > 0)
}

/// Get current schema version from migrations table
pub fn get_schema_version(conn: &Connection) -> Result<i64, String> {
    // Check if migrations table exists
    let has_migrations: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='migrations'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if has_migrations == 0 {
        return Ok(0);
    }

    conn.query_row("SELECT COALESCE(MAX(id), 0) FROM migrations", [], |r| {
        r.get(0)
    })
    .map_err(|e| e.to_string())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_apply_v2_schema() {
        let conn = Connection::open_in_memory().unwrap();
        apply_v2_schema(&conn).unwrap();

        // Verify key tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"event_store".to_string()));
        assert!(tables.contains(&"metadata_registry".to_string()));
        assert!(tables.contains(&"entity_index".to_string()));
        assert!(tables.contains(&"sync_state".to_string()));
        assert!(tables.contains(&"blob_registry".to_string()));
        assert!(tables.contains(&"tasks".to_string()));
        assert!(tables.contains(&"features".to_string()));
        assert!(tables.contains(&"layers".to_string()));
        assert!(tables.contains(&"feature_groups".to_string()));
        assert!(tables.contains(&"task_links".to_string()));
    }

    #[test]
    fn test_is_v2_database() {
        let conn = Connection::open_in_memory().unwrap();

        // Not V2 yet
        assert!(!is_v2_database(&conn).unwrap());

        apply_v2_schema(&conn).unwrap();

        // Now it is V2
        assert!(is_v2_database(&conn).unwrap());
    }

    #[test]
    fn test_schema_version_empty() {
        let conn = Connection::open_in_memory().unwrap();
        apply_v2_schema(&conn).unwrap();

        let version = get_schema_version(&conn).unwrap();
        assert_eq!(version, 0); // No migrations applied
    }

    #[test]
    fn test_seed_data_created() {
        let conn = Connection::open_in_memory().unwrap();
        apply_v2_schema(&conn).unwrap();

        let content_types: i64 = conn
            .query_row("SELECT COUNT(*) FROM content_types", [], |r| r.get(0))
            .unwrap();
        assert_eq!(content_types, 2); // Thiết bị + Nhân sự

        let roles: i64 = conn
            .query_row("SELECT COUNT(*) FROM roles", [], |r| r.get(0))
            .unwrap();
        assert_eq!(roles, 3); // Admin, Editor, Viewer
    }

    #[test]
    fn test_schema_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        apply_v2_schema(&conn).unwrap();
        apply_v2_schema(&conn).unwrap(); // Second call should not fail

        let tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // Should still have the same number of tables
        assert!(tables > 20);
    }

    #[test]
    fn test_fts5_triggers_exist() {
        let conn = Connection::open_in_memory().unwrap();
        apply_v2_schema(&conn).unwrap();

        let triggers: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'entity_search_%' ORDER BY name")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(triggers.len(), 3); // ai, ad, au
        assert!(triggers.contains(&"entity_search_ai".to_string()));
        assert!(triggers.contains(&"entity_search_ad".to_string()));
        assert!(triggers.contains(&"entity_search_au".to_string()));
    }

    #[test]
    fn test_indexes_created() {
        let conn = Connection::open_in_memory().unwrap();
        apply_v2_schema(&conn).unwrap();

        let indexes: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(indexes.len() > 10);
        assert!(indexes.contains(&"idx_event_store_entity".to_string()));
        assert!(indexes.contains(&"idx_event_store_global_seq".to_string()));
        assert!(indexes.contains(&"idx_tasks_project".to_string()));
    }

    #[test]
    fn test_apply_v2_schema_renames_legacy_content_fields() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE content_fields (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_type_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                label TEXT NOT NULL,
                field_type TEXT NOT NULL,
                required BOOLEAN DEFAULT 0,
                options_json TEXT,
                UNIQUE(content_type_id, name)
            );
            ",
        )
        .unwrap();

        apply_v2_schema(&conn).unwrap();

        let v1_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_content_fields'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(v1_exists, 1);

        let decl_type: String = conn
            .query_row(
                "SELECT type FROM pragma_table_info('content_fields') WHERE name = 'id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(decl_type, "TEXT");
    }

    #[test]
    fn test_apply_v2_schema_renames_legacy_project_settings() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE project_settings (
                project_id INTEGER PRIMARY KEY,
                epsg_code TEXT DEFAULT '3857',
                units TEXT DEFAULT 'm'
            );
            ",
        )
        .unwrap();

        apply_v2_schema(&conn).unwrap();

        let v1_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_project_settings'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(v1_exists, 1);

        let decl_type: String = conn
            .query_row(
                "SELECT type FROM pragma_table_info('project_settings') WHERE name = 'project_id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(decl_type, "TEXT");
    }
}
