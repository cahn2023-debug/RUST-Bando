use tauri::{AppHandle, Manager, State};
use crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand;
use crate::domain::implement::state::hydrator;
use tokio::sync::{mpsc, oneshot};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Clone)]
pub struct ActorState {
    pub gateway_tx: mpsc::Sender<StorageCommand>,
}
async fn exec_query(state: &ActorState, sql: &str, params: Vec<String>) -> Result<Value, String> {
    let (tx, rx) = oneshot::channel();
    state.gateway_tx.send(StorageCommand::Query {
        sql: sql.to_string(),
        params,
        reply: tx,
    }).await.map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

async fn persist_active_project_keys(
    state: &ActorState,
    project_id: Option<String>,
    project_path: Option<String>,
) -> Result<(), String> {
    if let Some(id) = project_id {
        exec_query(
            state,
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES ('active_project_id', ?)",
            vec![id],
        )
        .await?;
    }
    if let Some(path) = project_path {
        exec_query(
            state,
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES ('active_project_path', ?)",
            vec![path],
        )
        .await?;
    }
    Ok(())
}

fn uuid_from_text_fallback(input: &str) -> String {
    let trimmed = input.trim();
    if let Ok(parsed) = Uuid::parse_str(trimmed) {
        return parsed.to_string();
    }
    Uuid::new_v5(&Uuid::NAMESPACE_OID, trimmed.as_bytes()).to_string()
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn create_pmp_v2(
    state: State<'_, ActorState>,
    id: String,
    title: String,
    baseHint: String,
) -> Result<(), String> {
    state.gateway_tx.send(StorageCommand::CreateProject { 
        id, 
        title, 
        base_hint: baseHint 
    })
    .await.map_err(|e| format!("IPC Queue error: {}", e))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn add_file_v2(
    state: State<'_, ActorState>,
    id: String,
    projectId: String,
    absPath: String,
    meta: serde_json::Value,
) -> Result<(), String> {
    let path_buf = absPath.parse().map_err(|_| "Invalid path")?;
    state.gateway_tx.send(StorageCommand::AddFile { 
        id, 
        project_id: projectId, 
        abs_path: path_buf, 
        meta 
    })
    .await.map_err(|e| format!("IPC Queue error: {}", e))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn update_metadata_v2(
    state: State<'_, ActorState>,
    fileId: String,
    patch: serde_json::Value,
) -> Result<(), String> {
    state.gateway_tx.send(StorageCommand::PatchMetadata { 
        file_id: fileId, 
        patch 
    })
    .await.map_err(|e| format!("IPC Queue error: {}", e))
}

// --- Compatibility & Required Stubs ---

#[tauri::command]
pub async fn get_app_config(app: AppHandle) -> Result<serde_json::Value, String> {
    let last_opened_pmp = app
        .path()
        .app_data_dir()
        .ok()
        .map(|p| hydrator::load_state(&p).last_opened_path)
        .unwrap_or(None);
    Ok(json!({
        "version": "2.0.0-zero-legacy",
        "storage_mode": "monolithic",
        "features": ["fts5", "actor_pipeline"],
        "recent_pmps": [],
        "last_opened_pmp": last_opened_pmp
    }))
}
#[tauri::command]
pub async fn get_pending_pmp_path(app: AppHandle) -> Result<Option<String>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(hydrator::load_state(&app_data_dir).last_opened_path)
}

#[tauri::command]
pub async fn get_recent_projects(state: State<'_, ActorState>) -> Result<Vec<Value>, String> {
    let res = exec_query(&state, "SELECT id, title, created_at as last_opened FROM projects LIMIT 10", vec![]).await?;
    Ok(res.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_project_tree(
    state: State<'_, ActorState>, 
    projectId: String, 
    _path: Option<String>
) -> Result<Vec<Value>, String> {
    let res = exec_query(&state, "SELECT * FROM files WHERE project_id = ?", vec![projectId]).await?;
    Ok(res.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
pub async fn sync_v2_get_status() -> Result<serde_json::Value, String> {
    Ok(json!({ "status": "offline", "reason": "v2_zero_legacy_no_sync" }))
}

#[tauri::command]
pub async fn sync_v2_is_online() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub async fn load_pmp_file(
    state: State<'_, ActorState>,
    path: String
) -> Result<serde_json::Value, String> {
    log::info!("[V2] load_pmp_file requesting switch to: {}", path);
    let path_buf = std::path::PathBuf::from(&path);
    let title = path_buf.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown Project").to_string();
    
    state.gateway_tx.send(StorageCommand::OpenDatabase { path: path_buf })
        .await.map_err(|e| format!("IPC Queue error: {}", e))?;

    let first_project = exec_query(
        &state,
        "SELECT id, title FROM projects ORDER BY created_at ASC LIMIT 1",
        vec![],
    ).await?;

    let resolved_id_raw = first_project
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|row| row.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("v2_default")
        .to_string();
    let resolved_id = uuid_from_text_fallback(&resolved_id_raw);
    let resolved_title = first_project
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|row| row.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or(&title)
        .to_string();

    let _ = persist_active_project_keys(&state, Some(resolved_id.clone()), Some(path.clone())).await;

    Ok(json!({
        "id": resolved_id,
        "name": resolved_title,
        "title": resolved_title,
        "path": path,
        "last_opened": chrono::Local::now().to_rfc3339()
    }))
}

#[tauri::command]
pub async fn get_active_project(state: State<'_, ActorState>) -> Result<Option<Value>, String> {
    let active_id = exec_query(
        &state,
        "SELECT value FROM sys_config WHERE key = 'active_project_id' LIMIT 1",
        vec![],
    )
    .await?
    .as_array()
    .and_then(|arr| arr.first())
    .and_then(|row| row.get("value"))
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());
    let active_path = exec_query(
        &state,
        "SELECT value FROM sys_config WHERE key = 'active_project_path' LIMIT 1",
        vec![],
    )
    .await?
    .as_array()
    .and_then(|arr| arr.first())
    .and_then(|row| row.get("value"))
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());
    let res = if let Some(project_id) = active_id {
        exec_query(
            &state,
            "SELECT id, title FROM projects WHERE id = ? LIMIT 1",
            vec![project_id],
        )
        .await?
    } else {
        exec_query(
            &state,
            "SELECT id, title FROM projects ORDER BY created_at ASC LIMIT 1",
            vec![],
        )
        .await?
    };
    if let Some(arr) = res.as_array() {
        if !arr.is_empty() {
            let mut p = arr[0].clone();
            if let Some(obj) = p.as_object_mut() {
                if let Some(id) = obj.get("id").and_then(|v| v.as_str()) {
                    obj.insert("id".to_string(), json!(uuid_from_text_fallback(id)));
                }
                if let Some(title) = obj.get("title") {
                    obj.insert("name".to_string(), title.clone());
                }
                obj.insert(
                    "path".to_string(),
                    json!(active_path.unwrap_or_else(|| "./default_project.pmp".to_string())),
                );
            }
            return Ok(Some(p));
        }
    }
    Ok(Some(json!({
        "id": uuid_from_text_fallback("v2_default"),
        "name": "Default V2 Project",
        "title": "Default V2 Project",
        "path": "./default_project.pmp"
    })))
}
#[tauri::command]
pub async fn save_recent_projects(projects: Vec<Value>) -> Result<(), String> {
    log::info!("[V2] save_recent_projects: count={}", projects.len());
    Ok(())
}

#[tauri::command]
pub async fn save_last_opened_project(
    app: AppHandle,
    state: State<'_, ActorState>,
    project: Option<Value>,
    path: Option<String>,
) -> Result<(), String> {
    let project_id = project
        .as_ref()
        .and_then(|p| p.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let project_path = path.or_else(|| {
        project
            .as_ref()
            .and_then(|p| p.get("path"))
            .and_then(|v| v.as_str().map(|s| s.to_string()))
    });

    let _ = persist_active_project_keys(&state, project_id, project_path.clone()).await;
    if let Some(p) = project_path.clone() {
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            let mut st = hydrator::load_state(&app_data_dir);
            st.last_opened_path = Some(p);
            st.v2_loaded = true;
            let _ = hydrator::save_state(&app_data_dir, &st);
        }
    }

    log::info!("[V2] save_last_opened_project: path={:?}", project_path);
    Ok(())
}

#[tauri::command]
pub async fn index_project_files(
    _state: State<'_, ActorState>,
    project_id: String
) -> Result<serde_json::Value, String> {
    log::info!("[V2] index_project_files for project: {}", project_id);
    Ok(json!({
        "status": "indexed",
        "count": 0,
        "indexed_at": chrono::Local::now().to_rfc3339()
    }))
}

#[tauri::command]
pub async fn search_v2(
    state: State<'_, ActorState>,
    query: String
) -> Result<Vec<Value>, String> {
    log::info!("[V2] Global search: {}", query);
    let sql = "
        SELECT f.id, f.filename, f.rel_path, f.metadata_json 
        FROM fts_files_content fts
        JOIN files f ON f.id = fts.file_id
        WHERE fts.content MATCH ?
        LIMIT 50
    ";
    let res = exec_query(&state, sql, vec![query]).await?;
    Ok(res.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
pub async fn get_stats_v2(state: State<'_, ActorState>) -> Result<Value, String> {
    let project_count = exec_query(&state, "SELECT count(*) as count FROM projects", vec![]).await?;
    let file_count = exec_query(&state, "SELECT count(*) as count FROM files", vec![]).await?;
    let tag_count = exec_query(&state, "SELECT count(*) as count FROM tags", vec![]).await?;
    
    Ok(json!({
        "projects": project_count[0]["count"],
        "files": file_count[0]["count"],
        "tags": tag_count[0]["count"],
        "updated_at": chrono::Local::now().to_rfc3339()
    }))
}

// --- V1/V2 Realized Projections ---
// Moved to v2_bridge.rs with project_id support

#[tauri::command]
pub async fn get_projects(state: State<'_, ActorState>) -> Result<Vec<Value>, String> {
    let res = exec_query(&state, "SELECT id, title as name, description, created_at, updated_at FROM projects", vec![]).await?;
    Ok(res.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn invoke_design_event_batch(
    state: State<'_, ActorState>,
    projectId: String,
    events: Vec<serde_json::Value>,
    requestId: Option<i32>,
) -> Result<Value, String> {
    log::info!("[V2] Processing design event batch: count={}, requestId={:?}", events.len(), requestId);
    let mut envelopes = Vec::new();
    let mut skipped_events = 0usize;
    
    for v in events {
        let mut obj = v.as_object().cloned().ok_or_else(|| "Event must be an object".to_string())?;
        let event_type = obj
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        
        // Inject projectId if missing
        if !obj.contains_key("projectId") {
            obj.insert("projectId".to_string(), json!(projectId));
        }
        
        // Ensure id is present (UUID)
        if obj.get("id").map(|id| id.is_null()).unwrap_or(true) {
            obj.insert("id".to_string(), json!(uuid::Uuid::new_v4().to_string()));
        }
        if let Some(id_str) = obj.get("id").and_then(|v| v.as_str()) {
            if uuid::Uuid::parse_str(id_str).is_err() {
                obj.insert("id".to_string(), json!(uuid::Uuid::new_v4().to_string()));
            }
        }
        if let Some(pid_str) = obj.get("projectId").and_then(|v| v.as_str()) {
            if uuid::Uuid::parse_str(pid_str).is_err() {
                obj.insert("projectId".to_string(), json!(uuid::Uuid::new_v4().to_string()));
            }
        }

        // Fill fields expected by EventEnvelope if missing.
        if !obj.contains_key("entityType") {
            let inferred_entity_type = if event_type.starts_with("Region") {
                "region"
            } else if event_type.starts_with("Layer") {
                "layer"
            } else if event_type.starts_with("FeatureGroup") {
                "feature_group"
            } else if event_type.starts_with("Feature") {
                "feature"
            } else if event_type.starts_with("Settings") {
                "settings"
            } else {
                "unknown"
            };
            obj.insert("entityType".to_string(), json!(inferred_entity_type));
        }
        if !obj.contains_key("entityId") {
            let entity_id = obj
                .get("payload")
                .and_then(|p| p.get("id"))
                .and_then(|v| v.as_str())
                .and_then(|id| uuid::Uuid::parse_str(id).ok())
                .unwrap_or_else(uuid::Uuid::new_v4)
                .to_string();
            obj.insert("entityId".to_string(), json!(entity_id));
        }
        if let Some(eid_str) = obj.get("entityId").and_then(|v| v.as_str()) {
            if uuid::Uuid::parse_str(eid_str).is_err() {
                obj.insert("entityId".to_string(), json!(uuid::Uuid::new_v4().to_string()));
            }
        }

        match serde_json::from_value::<crate::domain::models::v2::EventEnvelope>(serde_json::Value::Object(obj)) {
            Ok(envelope) => envelopes.push(envelope),
            Err(e) => {
                skipped_events += 1;
                log::warn!("[V2] Skipping invalid event envelope: {}", e);
            }
        }
    }
    
    let last_event_id = envelopes
        .last()
        .map(|e| e.id.to_string())
        .unwrap_or_default();

    if !envelopes.is_empty() {
        state.gateway_tx.send(StorageCommand::DispatchEvents { events: envelopes })
            .await.map_err(|e| format!("IPC Queue error: {}", e))?;
    }

    Ok(json!({
        "success": true,
        "last_event_id": last_event_id,
        "applied_events": [],
        "side_effects": [],
        "skipped_events": skipped_events
    }))
}

#[tauri::command]
pub async fn normalize_metadata(
    _state: State<'_, ActorState>,
    text: String
) -> Result<serde_json::Value, String> {
    log::info!("[V2] AI Normalization requested for: {}", text);
    // Mock response for now, to be replaced by ONNX/Burn actor
    Ok(json!({
        "normalized_text": text.trim().to_uppercase(),
        "embedding": vec![0.0; 384],
        "model": "all-MiniLM-L6-v2-mock",
        "updated_at": chrono::Local::now().to_rfc3339()
    }))
}

#[tauri::command]
pub async fn rebuild_fts_v2(state: State<'_, ActorState>) -> Result<(), String> {
    let (tx, rx) = oneshot::channel();
    state.gateway_tx.send(StorageCommand::Query {
        sql: "REBUILD_FTS".to_string(), // We'll handle this special "SQL" in StorageWorker or add a dedicated command
        params: vec![],
        reply: tx,
    }).await.map_err(|e| e.to_string())?;
    
    rx.await.map_err(|e| e.to_string())?.map(|_| ())
}

#[tauri::command] pub async fn close_active_project() -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn remove_recent_project(_path: String) -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn delete_project(_id: String) -> Result<(), String> { Ok(()) }

#[tauri::command]
#[allow(non_snake_case)]
pub async fn find_nearest_snap_point(
    _state: State<'_, ActorState>,
    _projectId: String,
    x: f64,
    y: f64,
    threshold: Option<f64>,
) -> Result<Value, String> {
    log::info!("[V2] find_nearest_snap_point: x={}, y={}, threshold={:?}", x, y, threshold);
    Ok(json!(null))
}

async fn _save_project(state: &ActorState) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.gateway_tx.send(StorageCommand::SaveProject { reply: tx })
        .await.map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_project(state: State<'_, ActorState>) -> Result<(), String> {
    log::info!("[V2] save_project requested via Actor flow");
    _save_project(&state).await
}

#[tauri::command]
pub async fn force_save_project(state: State<'_, ActorState>) -> Result<(), String> {
    _save_project(&state).await
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn save_project_bom_table(
    state: State<'_, ActorState>,
    projectId: String,
    bomData: Value,
) -> Result<(), String> {
    log::info!("[V2] save_project_bom_table for project: {}", projectId);
    let patch = json!({
        "custom": {
            "bom_table": bomData
        }
    });
    
    state.gateway_tx.send(StorageCommand::PatchProjectMetadata { 
        project_id: projectId,
        patch 
    }).await.map_err(|e| e.to_string())?;
    
    _save_project(&state).await
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn update_project_state_v2(
    state: State<'_, ActorState>,
    projectId: String,
    projectState: Value,
) -> Result<(), String> {
    log::info!("[V2] update_project_state_v2 for project: {}", projectId);
    
    state.gateway_tx.send(StorageCommand::UpdateProjectState { 
        project_id: projectId,
        state: projectState 
    }).await.map_err(|e| e.to_string())?;
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::implement::modules::v2::pipeline::worker_storage::StorageWorker;
    use crate::domain::implement::modules::v2::storage::connection::PmpDatabase;
    use crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand;
use crate::domain::implement::state::hydrator;
    use tokio::sync::oneshot;
    use tempfile::tempdir;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn active_project_keys_roundtrip_for_reopen_flow() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("active_path_in_command.pmp");
        let pmp_path_str = pmp_path.to_string_lossy().to_string();

        let db = PmpDatabase::open_or_create(pmp_path.clone()).expect("open db");
        db.conn
            .execute(
                "INSERT INTO projects (id, title, base_dir_hint) VALUES (?1, ?2, ?3)",
                rusqlite::params!["p1", "Project One", dir.path().to_string_lossy().to_string()],
            )
            .expect("seed project");

        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);
        let actor_state = ActorState { gateway_tx: tx };

        let first_project = exec_query(
            &actor_state,
            "SELECT id, title FROM projects ORDER BY created_at ASC LIMIT 1",
            vec![],
        )
        .await
        .expect("query first project");
        let resolved_id = first_project
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|row| row.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        assert_eq!(resolved_id, "p1");

        let _ = exec_query(
            &actor_state,
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES ('active_project_id', ?)",
            vec![resolved_id.clone()],
        )
        .await
        .expect("write active_project_id");
        let _ = exec_query(
            &actor_state,
            "INSERT OR REPLACE INTO sys_config(key, value) VALUES ('active_project_path', ?)",
            vec![pmp_path_str.clone()],
        )
        .await
        .expect("write active_project_path");

        let loaded_id = exec_query(
            &actor_state,
            "SELECT value FROM sys_config WHERE key = 'active_project_id' LIMIT 1",
            vec![],
        )
        .await
        .expect("read active_project_id");
        let loaded_path = exec_query(
            &actor_state,
            "SELECT value FROM sys_config WHERE key = 'active_project_path' LIMIT 1",
            vec![],
        )
        .await
        .expect("read active_project_path");

        assert_eq!(
            loaded_id
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|row| row.get("value"))
                .and_then(|v| v.as_str()),
            Some("p1")
        );
        assert_eq!(
            loaded_path
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|row| row.get("value"))
                .and_then(|v| v.as_str()),
            Some(pmp_path_str.as_str())
        );
    }

    #[tokio::test]
    async fn persist_active_project_keys_writes_sys_config() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("save_last_opened_project.pmp");
        let pmp_path_str = pmp_path.to_string_lossy().to_string();

        let db = PmpDatabase::open_or_create(pmp_path).expect("open db");
        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);
        let actor_state = ActorState { gateway_tx: tx };

        let project_id = "last_p1".to_string();
        let project_path = pmp_path_str;
        persist_active_project_keys(
            &actor_state,
            Some(project_id.clone()),
            Some(project_path.clone()),
        )
        .await
        .expect("persist active keys");

        let loaded_id = exec_query(
            &actor_state,
            "SELECT value FROM sys_config WHERE key = 'active_project_id' LIMIT 1",
            vec![],
        )
        .await
        .expect("read active_project_id");
        let loaded_path = exec_query(
            &actor_state,
            "SELECT value FROM sys_config WHERE key = 'active_project_path' LIMIT 1",
            vec![],
        )
        .await
        .expect("read active_project_path");

        assert_eq!(
            loaded_id
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|row| row.get("value"))
                .and_then(|v| v.as_str()),
            Some(project_id.as_str())
        );
        assert_eq!(
            loaded_path
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|row| row.get("value"))
                .and_then(|v| v.as_str()),
            Some(project_path.as_str())
        );
    }

    #[tokio::test]
    async fn reopen_flow_restores_active_project_and_design_state() {
        let dir = tempdir().expect("tempdir");
        let pmp_path = dir.path().join("reopen_flow_full.pmp");
        let pmp_path_str = pmp_path.to_string_lossy().to_string();
        let project_id = "reopen_p1".to_string();

        let db = PmpDatabase::open_or_create(pmp_path.clone()).expect("open db");
        db.conn
            .execute(
                "INSERT INTO projects (id, title, base_dir_hint) VALUES (?1, ?2, ?3)",
                rusqlite::params![project_id.clone(), "Reopen Project", dir.path().to_string_lossy().to_string()],
            )
            .expect("seed project");

        let (tx, rx) = mpsc::channel(32);
        let _handle = StorageWorker::spawn(rx, db);
        let actor_state = ActorState { gateway_tx: tx.clone() };

        persist_active_project_keys(
            &actor_state,
            Some(project_id.clone()),
            Some(pmp_path_str.clone()),
        )
        .await
        .expect("persist active keys");

        tx.send(StorageCommand::UpdateProjectState {
            project_id: project_id.clone(),
            state: json!({
                "features": { "f1": { "id": "f1", "name": "F1" } },
                "layers": { "l1": { "id": "l1", "name": "L1" } },
                "regions": { "r1": { "id": "r1", "name": "R1" } }
            }),
        })
        .await
        .expect("update state send");

        let (save_tx, save_rx) = oneshot::channel();
        tx.send(StorageCommand::SaveProject { reply: save_tx })
            .await
            .expect("save send");
        save_rx.await.expect("save ack").expect("save ok");

        let reopened = PmpDatabase::open_or_create(pmp_path).expect("reopen db");

        let active_id: String = reopened
            .conn
            .query_row("SELECT value FROM sys_config WHERE key = 'active_project_id'", [], |r| r.get(0))
            .expect("active_project_id");
        let active_path: String = reopened
            .conn
            .query_row("SELECT value FROM sys_config WHERE key = 'active_project_path'", [], |r| r.get(0))
            .expect("active_project_path");
        let metadata_json: String = reopened
            .conn
            .query_row(
                "SELECT metadata_json FROM projects WHERE id = ?1",
                rusqlite::params![project_id.clone()],
                |r| r.get(0),
            )
            .expect("project metadata");
        let metadata: Value = serde_json::from_str(&metadata_json).expect("metadata parse");

        assert_eq!(active_id, project_id);
        assert_eq!(active_path, pmp_path_str);
        assert!(metadata.get("features").is_some());
        assert!(metadata.get("layers").is_some());
        assert!(metadata.get("regions").is_some());
    }
}




