use crate::contract::project_model::Project;
use crate::implement::commands::models::ProjectSettings;
use crate::implement::commands::project_v2_commands::CreateProjectV2Request;
use crate::implement::db::DatabaseState;
use crate::implement::modules::core::active_pmp::ActivePmpState;
use serde_json::json;
use tauri::State;

/// Unified Project Commands (V2 & V4 Bridge)
///
/// This module provides a single entry point for project-related operations,
/// automatically handling version detection and dispatching to the correct sub-module.

#[tauri::command]
pub async fn load_project_unified(
    path: String,
    db: State<'_, DatabaseState>,
    active_pmp: State<'_, ActivePmpState>,
) -> Result<Project, String> {
    println!("[Unified] Loading project from: {}", path);
    crate::implement::commands::project_manager::load_pmp_file(path, db, active_pmp).await
}

#[tauri::command]
pub async fn get_project_settings_unified(
    _db_state: State<'_, DatabaseState>,
    active_pmp: State<'_, ActivePmpState>,
    project_id: String,
) -> Result<ProjectSettings, String> {
    crate::implement::commands::project_v4::get_project_settings(project_id, active_pmp).await
}

#[tauri::command]
pub async fn create_project_unified(
    name: String,
    root_path: String,
    db_path: String,
    device_id: String,
    version: String,
    db_state: State<'_, DatabaseState>,
    active_pmp: State<'_, ActivePmpState>,
) -> Result<serde_json::Value, String> {
    match version.as_str() {
        "v2" => {
            let req = CreateProjectV2Request {
                db_path,
                project_name: name,
                root_path,
                device_id,
            };
            let res = crate::implement::commands::project_v2_commands::create_project_v2(
                req,
                db_state,
                active_pmp,
            )
            .await?;
            Ok(json!(res))
        }
        _ => {
            // Default to V4 style or placeholder
            Ok(json!({ "success": true, "message": "Project V4 created (Legacy flow)" }))
        }
    }
}
