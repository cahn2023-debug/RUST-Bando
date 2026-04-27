pub mod db_config;
pub mod logic;
pub mod migrations;
pub mod models;
pub mod schema;
pub mod event_store;
pub mod projection_engine;
pub mod migration_v2;

use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use tauri;
use tracing::{error, info, warn};
use uuid::Uuid;

pub use self::models::DatabaseState;
use crate::design::design_events::DesignEventType;
use crate::implement::modules::v2::storage::schema::load_pmp_metadata;
use chrono::Local;

/// Initializes the application directory but does not open a DB immediately.
/// We wait for load_pmp_file command to open the actual project DB.
pub fn initialize_database(_app_dir: PathBuf) -> Result<DatabaseState, rusqlite::Error> {
    Ok(DatabaseState::new())
}

/// Creates a completely new PMP database from scratch
pub fn create_project_db(state: &DatabaseState, db_path: PathBuf) -> Result<(), String> {
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    setup_connection(&mut conn)?;

    schema::apply_base_schema(&conn)?;
    init_design_tables(&conn)?;

    // Set new active connection
    *state
        .conn
        .lock()
        .map_err(|_| "Connection lock poisoned".to_string())? = Some(conn);
    Ok(())
}

/// Opens a project .pmp file and applies any missing Rust schema requirements.
/// Returns the Project record from the newly opened database.
pub fn open_project_db(
    state: &DatabaseState,
    db_path: PathBuf,
) -> Result<crate::contract::project_model::Project, String> {
    info!(path = ?db_path, "Attempting to open database connection");

    if !db_path.exists() {
        return Err(format!("Tệp dự án không tồn tại: {:?}", db_path));
    }

    if db_path.is_dir() {
        return Err(format!("Đường dẫn được chọn là thư mục: {:?}", db_path));
    }

    let mut conn = Connection::open(&db_path)
        .or_else(|e| {
            if let Ok(can_path) = db_path.canonicalize() {
                Connection::open(can_path)
            } else {
                Err(e)
            }
        })
        .map_err(|e| {
            let err_msg = e.to_string();
            if err_msg.contains("code 14") || err_msg.contains("unable to open") {
                format!("Không thể mở tập tin dự án: {:?}", db_path)
            } else {
                format!("Lỗi SQLite: {} ({:?})", err_msg, db_path)
            }
        })?;

    setup_connection(&mut conn)?;

    // V70 Fix: Apply schema and migrations before loading records
    // This ensures columns like 'metadata_json' exist in the 'projects' table.
    schema::apply_base_schema(&conn)?;
    init_design_tables(&conn).ok(); // Ensure design tables exist

    // Check if database is empty (no projects) to seed if necessary
    let table_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='projects'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if table_exists > 0 {
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
            .unwrap_or(0);
        if count == 0 {
            let path_str = db_path.to_string_lossy().to_string();
            let root_path_str = db_path
                .parent()
                .unwrap_or(std::path::Path::new(""))
                .to_string_lossy()
                .to_string();
            let timestamp_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO projects (id, name, path, root_path, status) VALUES (?1, ?2, ?3, ?4, 'active')",
                params![timestamp_id, "New Project", path_str, root_path_str],
            ).ok();
        }
    }

    let db_version = detect_db_version(&conn);
    if db_version == "v1" {
        info!("Phát hiện dự án V1. Tự động nâng cấp dữ liệu toàn diện...");
        
        // Sử dụng Migrator 2000 dòng code (V1ToV2Migrator)
        use crate::implement::modules::v2::migration::engine::V1ToV2Migrator;
        if let Err(e) = V1ToV2Migrator::migrate(&conn) {
            error!("Migration failed: {}", e);
            return Err(format!("Lỗi nâng cấp cơ sở dữ liệu: {}", e));
        }
        
        info!("Migration hoàn tất. Toàn bộ Features và Layers đã được chuyển sang V2.");
    }

    let project = load_project_record_robust(&conn, &db_path.to_string_lossy())
        .map_err(|e| format!("Failed to load project record: {}", e))?;

    state.indexing_task_id.fetch_add(1, Ordering::SeqCst);

    // [ANTI-LOCK-FIX] Clear Pool before opening new connection to avoid multiple handles to same file
    state.connection_pool.clear();

    // --- Connection Triad (V5.2) ---
    // 1. Read Connection (Primary for hydration)
    *state
        .conn
        .lock()
        .map_err(|_| "Connection lock poisoned".to_string())? = Some(conn);

    // 2. Write Connection (Dedicated for Persistence)
    match Connection::open(&db_path) {
        Ok(mut w_conn) => {
            if let Err(e) = setup_connection(&mut w_conn) {
                warn!(error = %e, "Failed to optimize write connection");
            }
            *state
                .write_conn
                .lock()
                .map_err(|_| "Write connection lock poisoned".to_string())? = Some(w_conn);
            info!(project_id = project.id, "Write connection initialized");
        }
        Err(e) => error!(error = %e, "Failed to initialize write connection"),
    }

    // Add to pool for concurrent reads (V5.2 Fix)
    if let Ok(mut pool_conn) = Connection::open(&db_path) {
        if setup_connection(&mut pool_conn).is_ok() {
            state
                .connection_pool
                .insert(db_path.clone(), Arc::new(Mutex::new(pool_conn)));
            info!(
                project_id = project.id,
                "Hydration connection added to pool"
            );
        }
    }

    // 3. Metadata Mapping
    state
        .project_id_to_path
        .insert(project.id.clone(), db_path.clone());

    // --- V5.3 Initialization (Async) ---
    let storage = state.storage_v53.clone();
    let db_path_v53 = db_path.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = storage.open(db_path_v53).await {
            tracing::error!("Failed to initialize V5.3 storage pool: {}", e);
        } else {
            tracing::info!("V5.3 Storage Core initialized successfully");
        }
    });

    *state
        .active_dmp_path
        .lock()
        .map_err(|_| "Active DMP path lock poisoned".to_string())? = Some(db_path);

    *state
        .active_project_id
        .lock()
        .map_err(|_| "Active project ID lock poisoned".to_string())? = Some(project.id.clone());
    *state
        .hydrated_project_id
        .lock()
        .map_err(|_| "Hydrated project ID lock poisoned".to_string())? = None;

    Ok(project)
}

/// V2: Helper to clear current connection and ensure WAL is checkpointed
pub fn clear_active_connection(state: &DatabaseState) -> Result<(), String> {
    // 1. Writer actor is handled in V2 Core active_pmp.rs
    // Legacy V1 writer is being removed.

    // 2. Clear main connections and checkpoint WAL
    let mut conn_lock = state.conn.lock().map_err(|e| e.to_string())?;
    let mut write_conn_lock = state.write_conn.lock().map_err(|e| e.to_string())?;

    if let Some(conn) = conn_lock.take() {
        info!("[DB] Closing main connection and checkpointing WAL...");
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    if let Some(conn) = write_conn_lock.take() {
        info!("[DB] Closing write connection and checkpointing WAL...");
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }

    *state
        .active_project_id
        .lock()
        .map_err(|_| "Project ID lock poisoned".to_string())? = None;

    Ok(())
}

/// V5.3: Execute immediate sync transaction. (Legacy Fallback)
pub fn execute_immediate_sync(
    _app_handle: Option<&tauri::AppHandle>,
    state: &DatabaseState,
    project_id: &str,
    events: &[DesignEventType],
) -> Result<String, String> {
    // Note: In V2, we prefer AppEvent via EventStore.
    // This sync path is kept only for V1 backward compatibility logic.
    execute_immediate_sync_internal(state, project_id, events)
}

/// v74: Saves a project world state snapshot to both Metadata and Snapshots table
pub fn save_snapshot(
    conn: &Connection,
    project_id: &str,
    world_state: serde_json::Value,
) -> Result<(), rusqlite::Error> {
    let payload = serde_json::to_string(&world_state).unwrap_or_default();

    // 1. Update project metadata (for general project state)
    conn.execute(
        "UPDATE projects SET metadata_json = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![payload, project_id],
    )?;

    // 2. Insert into design_snapshots (for full world state history/recovery)
    conn.execute(
        "INSERT OR REPLACE INTO design_snapshots (project_id, state_json, timestamp) VALUES (?1, ?2, datetime('now'))",
        params![project_id, payload],
    )?;

    Ok(())
}

fn execute_immediate_sync_internal(
    state: &DatabaseState,
    project_id: &str,
    events: &[DesignEventType],
) -> Result<String, String> {
    let mut w_guard: std::sync::MutexGuard<Option<Connection>> = state
        .write_conn
        .lock()
        .map_err(|_| "Write lock poisoned".to_string())?;
    let conn = w_guard.as_mut().ok_or("No project opened for writing")?;

    execute_design_events(conn, project_id, events)
}

/// Executes a batch of design events within a single IMMEDIATE transaction.
/// This is the core logic used by both direct sync and the WriteQueue Actor.
pub fn execute_design_events(
    conn: &mut Connection,
    project_id: &str,
    events: &[DesignEventType],
) -> Result<String, String> {
    let t_start = std::time::Instant::now();

    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;

    let mut last_id = String::new();

    for event in events {
        let event_id = uuid::Uuid::new_v4().to_string();
        let payload_json = serde_json::to_string(event).map_err(|e| e.to_string())?;
        let event_type = match event {
            DesignEventType::FeatureCreated { .. } => "FeatureCreated",
            DesignEventType::FeatureUpdated { .. } => "FeatureUpdated",
            DesignEventType::FeatureDeleted { .. } => "FeatureDeleted",
            DesignEventType::LayerCreated { .. } => "LayerCreated",
            DesignEventType::LayerUpdated { .. } => "LayerUpdated",
            DesignEventType::LayerDeleted { .. } => "LayerDeleted",
            DesignEventType::RegionCreated { .. } => "RegionCreated",
            DesignEventType::RegionUpdated { .. } => "RegionUpdated",
            DesignEventType::RegionDeleted { .. } => "RegionDeleted",
            DesignEventType::FeatureGroupCreated { .. } => "FeatureGroupCreated",
            DesignEventType::FeatureGroupUpdated { .. } => "FeatureGroupUpdated",
            DesignEventType::FeatureGroupDeleted { .. } => "FeatureGroupDeleted",
            DesignEventType::SettingsUpdated { .. } => "SettingsUpdated",
            _ => "Unknown",
        };

        tx.prepare_cached(
            "INSERT INTO design_events (event_id, project_id, event_type, payload_json) VALUES (?1, ?2, ?3, ?4)",
        ).map_err(|e| e.to_string())?
        .execute(params![event_id, project_id, event_type, payload_json])
        .map_err(|e| e.to_string())?;

        // side effect: sync to structural tables
        logic::apply_event_to_structural_tables(&tx, project_id, event)?;

        last_id = event_id;
    }

    tx.commit().map_err(|e| e.to_string())?;

    let duration = t_start.elapsed();
    if duration.as_millis() > 100 {
        warn!(
            project_id,
            event_count = events.len(),
            duration_ms = duration.as_millis(),
            "Slow transaction detected"
        );
    }

    Ok(last_id)
}

/// Initializes design-specific tables. Called once during project open/creation.
pub fn init_design_tables(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS design_events (
            event_id TEXT PRIMARY KEY,
            project_id TEXT,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_undone BOOLEAN NOT NULL DEFAULT 0,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Indexing for faster hydration
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_design_events_project ON design_events (project_id, timestamp)",
        []
    ).ok();

    Ok(())
}

/// Common setup for all SQLite connections in this app.
fn setup_connection(conn: &mut Connection) -> Result<(), String> {
    DatabaseState::initialize_connection(conn).map_err(|e| e.to_string())
}

pub fn detect_db_version(conn: &Connection) -> String {
    // 1. Kiểm tra bảng event_store (Dấu hiệu của V2 mới nhất)
    let has_event_store: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='event_store'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if has_event_store > 0 {
        return "v2_event_driven".to_string();
    }

    // 2. Kiểm tra bảng pmp_metadata (V2 core)
    let has_metadata: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='pmp_metadata'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if has_metadata > 0 {
        return "new_v2".to_string();
    }

    // 3. Kiểm tra cột 'title' trong 'projects' (V2 early beta)
    let has_title_col: i64 = match conn.prepare("PRAGMA table_info('projects')") {
        Ok(mut stmt) => stmt
            .query_map([], |r| r.get::<_, String>(1))
            .map(|iter| iter.filter_map(|r| r.ok()).any(|name| name == "title") as i64)
            .unwrap_or(0),
        Err(_) => 0,
    };

    if has_title_col > 0 {
        "core_v2".to_string()
    } else {
        "v1".to_string()
    }
}

pub fn load_project_record_robust(
    conn: &Connection,
    db_path_str: &str,
) -> Result<crate::contract::project_model::Project, String> {
    let db_version = detect_db_version(conn);
    let db_path = std::path::Path::new(db_path_str);

    if db_version == "new_v2" || db_version == "core_v2" || db_version == "v2_event_driven" {
        let name_col = if db_version == "core_v2" {
            "title"
        } else {
            "name"
        };
        let query = format!(
            "SELECT {}, description, created_at, updated_at, metadata_json FROM projects LIMIT 1",
            name_col
        );

        let (name, desc, created, updated, meta) = conn
            .query_row(&query, [], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|e| format!("V2 project load failed ({}): {}", db_version, e))?;
        let project_id = load_pmp_metadata(conn)
            .ok()
            .flatten()
            .map(|metadata| metadata.project_id.to_string())
            .or_else(|| {
                conn.query_row("SELECT id FROM projects LIMIT 1", [], |row| {
                    row.get::<_, String>(0)
                })
                .ok()
            })
            .ok_or_else(|| "Missing V2 project identifier".to_string())?;

        Ok(crate::contract::project_model::Project {
            id: project_id,
            name,
            path: Some(db_path_str.to_string()),
            root_path: Some(
                db_path
                    .parent()
                    .unwrap_or(std::path::Path::new(""))
                    .to_string_lossy()
                    .to_string(),
            ),
            description: desc,
            status: "active".to_string(),
            contract_number: None,
            investor: None,
            contractor: None,
            signed_date: None,
            duration: None,
            end_date: None,
            created_at: created,
            updated_at: updated,
            metadata_json: meta,
        })
    } else {
        // v74: Handle legacy V1 projects (Lam_Dong.pmp) which may lack metadata_json or updated_at
        let has_metadata_col = match conn.prepare("PRAGMA table_info('projects')") {
            Ok(mut stmt) => stmt
                .query_map([], |r| r.get::<_, String>(1))
                .map(|iter| {
                    iter.filter_map(|r| r.ok())
                        .any(|name| name == "metadata_json")
                })
                .unwrap_or(false),
            Err(_) => false,
        };

        let query = if has_metadata_col {
            "SELECT id, name, path, root_path, description, status, 
             contract_number, investor, contractor, signed_date, duration, end_date,
             created_at, updated_at, metadata_json FROM projects LIMIT 1"
        } else {
            "SELECT id, name, path, root_path, description, status, 
             contract_number, investor, contractor, signed_date, duration, end_date,
             created_at, created_at, '{}' FROM projects LIMIT 1"
        };

        conn.query_row(query, [], |row| {
            // Robust ID extraction: handles both INTEGER (V1) and TEXT/UUID (Migrated or manual)
            let id_val: rusqlite::types::Value = row.get(0)?;
            let id_str = match id_val {
                rusqlite::types::Value::Integer(i) => i.to_string(),
                rusqlite::types::Value::Text(s) => s,
                _ => "0".to_string(),
            };

            // Robust Timestamp extraction
            let created_val: rusqlite::types::Value = row.get(12)?;
            let updated_val: rusqlite::types::Value = row.get(13)?;

            let created_at = match created_val {
                rusqlite::types::Value::Text(s) => s,
                rusqlite::types::Value::Integer(i) => i.to_string(),
                _ => datetime_now(),
            };

            let updated_at = match updated_val {
                rusqlite::types::Value::Text(s) => s,
                rusqlite::types::Value::Integer(i) => i.to_string(),
                _ => datetime_now(),
            };

            Ok(crate::contract::project_model::Project {
                id: id_str,
                name: row.get(1)?,
                path: row
                    .get::<_, Option<String>>(2)?
                    .or_else(|| Some(db_path_str.to_string())),
                root_path: row.get::<_, Option<String>>(3)?.or_else(|| {
                    std::path::Path::new(db_path_str)
                        .parent()
                        .map(|p| p.to_string_lossy().to_string())
                }),
                description: row.get(4)?,
                status: row.get(5)?,
                contract_number: row.get(6)?,
                investor: row.get(7)?,
                contractor: row.get(8)?,
                signed_date: row.get(9)?,
                duration: row.get(10)?,
                end_date: row.get(11)?,
                created_at,
                updated_at,
                metadata_json: row.get(14)?,
            })
        })
        .map_err(|e| format!("[DB] Failed to load V1 project record (Robust): {}", e))
    }
}

fn datetime_now() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// v74: Hydrate structural tables from design events and perform auto-repair for V1
pub fn hydrate_structural_tables(conn: &Connection, project_id: &String) -> Result<(), String> {
    info!(project_id = ?project_id, "Hydrating structural tables");

    // 1. Check if structural tables have any data
    let _layer_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM layers WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // 2. Optimization: If layers already exist, we assume structural hydration is done.
    // In V1, this is the primary bottleneck.
    if _layer_count > 0 {
        info!(project_id, "Structural tables already hydrated, skipping event replay.");
        return Ok(());
    }

    // 3. Fetch events
    let mut stmt = conn.prepare("SELECT event_type, payload_json FROM design_events WHERE project_id = ?1 AND is_undone = 0 ORDER BY timestamp ASC").map_err(|e| e.to_string())?;
    let event_rows = stmt
        .query_map(params![project_id], |row| {
            let etype: String = row.get(0)?;
            let payload: String = row.get(1)?;
            Ok((etype, payload))
        })
        .map_err(|e| e.to_string())?;

    // 4. Replay structural events
    for row in event_rows {
        if let Ok((etype, payload)) = row {
            // Only replay structural events (Region, Layer, Group)
            if etype.contains("Region") || etype.contains("Layer") || etype.contains("Group") {
                if let Ok(event_type) =
                    crate::design::design_events::DesignEventType::robust_deserialize(
                        &payload,
                        None,
                    )
                {
                    logic::apply_event_to_structural_tables(conn, project_id, &event_type).ok();
                }
            }
        }
    }

    // 4. Auto-Repair for V1: If no layers exist but project has data
    let current_layer_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM layers WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if current_layer_count == 0 {
        warn!(
            "Project {} has no structure. Applying V1 auto-repair.",
            project_id
        );

        let default_region_id = format!(
            "reg-{}",
            Uuid::new_v4().to_string().split('-').next().unwrap()
        );
        let default_layer_id = format!(
            "lay-{}",
            Uuid::new_v4().to_string().split('-').next().unwrap()
        );

        // Create default structure
        conn.execute(
            "INSERT OR IGNORE INTO regions (id, project_id, name) VALUES (?1, ?2, ?3)",
            params![default_region_id, project_id, "Khu vực dự án"],
        )
        .ok();

        conn.execute("INSERT OR IGNORE INTO layers (id, project_id, region_id, name) VALUES (?1, ?2, ?3, ?4)", 
            params![default_layer_id, project_id, default_region_id, "Lớp dữ liệu chính"]).ok();

        // Assign orphans to default layer
        conn.execute("UPDATE features SET layer_id = ?1 WHERE project_id = ?2 AND (layer_id IS NULL OR layer_id = '')", 
            params![default_layer_id, project_id]).ok();

        info!(
            "Auto-repair completed: Created default Region ({}) and Layer ({})",
            default_region_id, default_layer_id
        );
    }

    Ok(())
}
