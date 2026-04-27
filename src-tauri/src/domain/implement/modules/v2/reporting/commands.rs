use super::{GisReportSummary, ReportingEngine};
use crate::implement::modules::core::active_pmp::ActivePmpState;
use crate::domain::implement::modules::v2::storage::db_config::open_v2_connection;
use tauri::State;

#[tauri::command]
pub async fn get_gis_report_v2(
    #[allow(non_snake_case)] pmpPath: String,
    #[allow(non_snake_case)] projectId: String,
) -> Result<GisReportSummary, String> {
    let path = std::path::Path::new(&pmpPath);
    if !path.exists() {
        return Err(format!("File not found: {}", pmpPath));
    }

    let conn = open_v2_connection(path).map_err(|e| e.to_string())?;
    let engine = ReportingEngine::new(&conn);
    
    engine.generate_project_report(&projectId)
}

#[tauri::command]
pub async fn get_active_gis_report_v2(
    state: State<'_, ActivePmpState>,
) -> Result<GisReportSummary, String> {
    let db_path = state.db_path().map_err(|e| e.to_string())?;
    
    let conn = open_v2_connection(&db_path).map_err(|e| e.to_string())?;
    let engine = ReportingEngine::new(&conn);
    
    // In V2, project_id is often stored in pmp_metadata
    use crate::domain::implement::modules::v2::storage::schema::load_pmp_metadata;
    let metadata = load_pmp_metadata(&conn).map_err(|e| e.to_string())?
        .ok_or("Failed to load project metadata")?;
    
    engine.generate_project_report(&metadata.project_id.to_string())
}
