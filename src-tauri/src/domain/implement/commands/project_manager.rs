use crate::contract::project_model::Project;
use crate::implement::db::DatabaseState;
use crate::implement::modules::core::active_pmp::{ensure_pmp_v2, ActivePmpState};
use std::path::{Path, PathBuf};
use uuid::Uuid;

fn normalize_project_path(path: &Path) -> String {
    let mut resolved = path
        .canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\");

    // Remove UNC prefix on Windows if present to ensure compatibility with SQLite
    if cfg!(windows) && resolved.starts_with(r"\\?\") {
        resolved = resolved.trim_start_matches(r"\\?\").to_string();
    }

    if cfg!(windows) {
        resolved.to_lowercase()
    } else {
        resolved
    }
}

#[tauri::command]
pub async fn get_active_project(
    db: tauri::State<'_, DatabaseState>,
    active_pmp: tauri::State<'_, ActivePmpState>,
) -> Result<Option<Project>, String> {
    let conn_guard = db
        .conn
        .lock()
        .map_err(|_| "Database connection lock poisoned".to_string())?;

    let conn = match conn_guard.as_ref() {
        Some(c) => c,
        None => return Ok(None),
    };

    let active_path = active_pmp.db_path().ok();
    let db_path = active_path
        .as_ref()
        .map(|path| path.to_string())
        .unwrap_or_default();

    let project = match crate::implement::db::load_project_record_robust(conn, &db_path) {
        Ok(p) => p,
        Err(e) => {
            // Fallback for when path info is missing but connection is valid
            return Err(format!("[DB] Failed to load active project record: {}", e));
        }
    };

    Ok(Some(project))
}

#[tauri::command]
pub async fn load_pmp_file(
    path: String,
    db: tauri::State<'_, DatabaseState>,
    active_pmp: tauri::State<'_, ActivePmpState>,
) -> Result<Project, String> {
    let path_buf = PathBuf::from(&path);
    let normalized_requested_path = normalize_project_path(&path_buf);

    db.indexing_task_id
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);

    let should_return_active = {
        let active_path_guard = db
            .active_dmp_path
            .lock()
            .map_err(|_| "Database path lock poisoned".to_string())?;
        if let Some(active_path) = active_path_guard.as_ref() {
            normalize_project_path(active_path) == normalized_requested_path
        } else {
            false
        }
    };

    if should_return_active {
        match get_active_project(db.clone(), active_pmp.clone()).await {
            Ok(Some(project)) => return Ok(project),
            Ok(None) | Err(_) => {
                let _ = crate::implement::db::clear_active_connection(db.inner());
                if let Ok(mut path_guard) = db.active_dmp_path.lock() {
                    *path_guard = None;
                }
                active_pmp.shutdown().await.ok();
            }
        }
    }

    {
        let mut conn_guard = db
            .conn
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        let _prev = conn_guard.take();
        if let Some(c) = _prev {
            let _ = c.close();
        }
    }

    *db.active_project_id.lock().unwrap() = None;
    *db.hydrated_project_id.lock().unwrap() = None;

    let db_state = db.inner().clone();
    let path_for_open = path_buf.clone();
    let project = tauri::async_runtime::spawn_blocking(move || -> Result<Project, String> {
        ensure_pmp_v2(&path_for_open)?;
        crate::implement::db::open_project_db(&db_state, path_for_open)
    })
    .await
    .map_err(|e| e.to_string())??;

    let project_uuid = Uuid::parse_str(&project.id)
        .map_err(|e| format!("Active project UUID is invalid after load: {}", e))?;
    if let Err(bind_error) = active_pmp.bind_project(path_buf.clone(), project_uuid, None) {
        let _ = crate::implement::db::clear_active_connection(db.inner());
        db.project_id_to_path.remove(&project.id);
        if let Ok(mut path_guard) = db.active_dmp_path.lock() {
            *path_guard = None;
        }
        active_pmp.shutdown().await.ok();
        return Err(format!(
            "Failed to bind active project worker: {}",
            bind_error
        ));
    }

    Ok(project)
}

#[tauri::command]
pub async fn close_active_project(
    db: tauri::State<'_, DatabaseState>,
    active_pmp: tauri::State<'_, ActivePmpState>,
) -> Result<(), String> {
    let active_project_id = db
        .active_project_id
        .lock()
        .map_err(|_| "Active project ID lock poisoned".to_string())?
        .clone();
    let active_path = db
        .active_dmp_path
        .lock()
        .map_err(|_| "Active DB path lock poisoned".to_string())?
        .clone();

    if let Some(project_id) = active_project_id.as_ref() {
        db.project_id_to_path.remove(project_id);
        db.state_cache.remove(project_id);
    }
    if let Some(path) = active_path.as_ref() {
        db.connection_pool.remove(path);
    }

    crate::implement::db::clear_active_connection(db.inner())?;
    if let Ok(mut path_guard) = db.active_dmp_path.lock() {
        *path_guard = None;
    }
    active_pmp.shutdown().await?;
    Ok(())
}

#[tauri::command]
pub async fn save_project() -> Result<(), String> {
    // V2 is event-sourced, "saving" is handled in real-time by the WriteQueue.
    // This command remains for backward compatibility with the frontend UI.
    Ok(())
}

#[tauri::command]
pub async fn force_save_project() -> Result<(), String> {
    // In V2, writes are synchronous and immediate. 
    // This function is kept for UI compatibility.
    Ok(())
}
