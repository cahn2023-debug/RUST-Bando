use tauri::State;
use crate::implement::modules::core::active_pmp::ActivePmpState;
use crate::implement::modules::core::config::ConfigState;
use crate::implement::commands::models::ProjectSettings;
use rusqlite::params;

#[tauri::command]
pub async fn get_project_settings(
    #[allow(non_snake_case)] projectId: String,
    db: State<'_, ActivePmpState>,
) -> Result<ProjectSettings, String> {
    let db_instance = db.v2_db()?;
    let conn_lock = db_instance.conn.lock();
    let conn = &*conn_lock;
    
    conn.query_row(
        "SELECT project_id, epsg_code, units, center_lat, center_lon, default_zoom, updated_at 
        FROM project_settings WHERE project_id = ?1",
        params![projectId],
        |row| {
            Ok(ProjectSettings {
                project_id: row.get::<_, String>(0)?,
                epsg_code: row.get::<_, Option<i32>>(1)?.map(|v| v.to_string()).unwrap_or_default(),
                units: row.get(2)?,
                center_lat: Some(row.get(3)?),
                center_lon: Some(row.get(4)?),
                default_zoom: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_project_settings(
    settings: ProjectSettings,
    db: State<'_, ActivePmpState>,
    config_state: State<'_, ConfigState>,
) -> Result<String, String> {
    let _user_email = crate::implement::modules::core::auth_guard::get_current_user_email(&config_state);
    let project_id = settings.project_id.to_string();
    
    let db_instance = db.v2_db()?;
    let conn_lock = db_instance.conn.lock();
    let conn = &*conn_lock;
    
    conn.execute(
        "UPDATE project_settings SET epsg_code = ?1, units = ?2, center_lat = ?3, center_lon = ?4, default_zoom = ?5, updated_at = datetime('now') 
        WHERE project_id = ?6",
        params![
            settings.epsg_code,
            settings.units,
            settings.center_lat,
            settings.center_lon,
            settings.default_zoom,
            project_id
        ],
    ).map_err(|e| e.to_string())?;

    Ok("Settings updated".to_string())
}

#[tauri::command]
pub async fn get_project_bom_table(
    #[allow(non_snake_case)] _projectId: String,
    _db: State<'_, ActivePmpState>,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!([]))
}

#[tauri::command]
pub async fn get_audit_logs(
    #[allow(non_snake_case)] _projectId: String,
    _db: State<'_, ActivePmpState>,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!([]))
}
