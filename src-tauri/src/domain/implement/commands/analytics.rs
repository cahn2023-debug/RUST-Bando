use crate::implement::modules::core::active_pmp::ActivePmpState;
use crate::domain::implement::modules::v2::storage::duckdb_manager::{
    ExtensionStat, FileStat, ProjectStats,
};

#[tauri::command]
pub async fn get_dashboard_project_stats(
    active_pmp: tauri::State<'_, ActivePmpState>,
) -> Result<ProjectStats, String> {
    let pmp = active_pmp.v2_db()?;
    let project_id = active_pmp.project_id()?;
    
    pmp.duckdb.get_project_stats(project_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_dashboard_extension_dist(
    active_pmp: tauri::State<'_, ActivePmpState>,
) -> Result<Vec<ExtensionStat>, String> {
    let pmp = active_pmp.v2_db()?;
    let project_id = active_pmp.project_id()?;
    
    pmp.duckdb.get_extension_distribution(project_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_dashboard_top_files(
    active_pmp: tauri::State<'_, ActivePmpState>,
    limit: usize,
) -> Result<Vec<FileStat>, String> {
    let pmp = active_pmp.v2_db()?;
    let project_id = active_pmp.project_id()?;
    
    pmp.duckdb.get_top_files(project_id, limit)
        .map_err(|e| e.to_string())
}
