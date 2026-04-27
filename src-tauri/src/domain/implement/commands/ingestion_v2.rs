use crate::domain::implement::modules::v2::{AppEvent};
use crate::domain::implement::modules::ingestion::import::{KmlParser, ExcelParser, KmzParser, ImportMapping};
use std::path::PathBuf;
use tauri::command;
use uuid::Uuid;
use crate::domain::implement::modules::core::active_pmp::ActivePmpState;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

#[command]
pub async fn start_ingestion_v2(
    db: tauri::State<'_, ActivePmpState>,
    project_id: String,
    path: String,
    mapping: Option<ImportMapping>,
) -> Result<String, String> {
    let project_uuid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let path_buf = PathBuf::from(&path);
    let ext = path_buf.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    
    let db_instance = db.v2_db()?;
    
    // 1. Ingestion Started
    let ingestion_id = Uuid::new_v4();
    let start_event = AppEvent::IngestionStarted {
        ingestion_id,
        source_path: path.clone(),
        source_type: ext.clone(),
        metadata: serde_json::json!({"path": path}),
    };
    let envelope = db_instance.event_store.append(project_uuid, start_event, "ingestion", ingestion_id)?;
    db_instance.projection_engine.process_event(&envelope)?;

    // 2. Run Parser with Event Emitter
    let count = Arc::new(AtomicUsize::new(0));
    
    // Clones for the callback
    let db_clone = db_instance.clone();
    let count_clone = count.clone();
    
    let _meta = match ext.as_str() {
        "kml" => {
            KmlParser::parse_file(path_buf, mapping, |r| {
                let event = AppEvent::IngestionFeatureAdded { 
                    ingestion_id,
                    feature_name: "KML Feature".to_string(),
                    geometry_type: "Unknown".to_string(),
                    data: serde_json::to_value(&r).unwrap() 
                };
                let _ = db_clone.event_store.append(project_uuid, event, "feature", Uuid::new_v4());
                count_clone.fetch_add(1, Ordering::SeqCst);
            })?
        }
        "xlsx" | "xls" => {
            ExcelParser::parse_file(path_buf, mapping, |r| {
                let event = AppEvent::IngestionFeatureAdded { 
                    ingestion_id,
                    feature_name: "Excel Column".to_string(),
                    geometry_type: "Point".to_string(),
                    data: serde_json::to_value(&r).unwrap() 
                };
                let _ = db_clone.event_store.append(project_uuid, event, "feature", Uuid::new_v4());
                count_clone.fetch_add(1, Ordering::SeqCst);
            })?
        }
        "kmz" => {
            KmzParser::parse_file(path_buf, mapping, |r| {
                let event = AppEvent::IngestionFeatureAdded { 
                    ingestion_id,
                    feature_name: "KMZ Feature".to_string(),
                    geometry_type: "Unknown".to_string(),
                    data: serde_json::to_value(&r).unwrap() 
                };
                let _ = db_clone.event_store.append(project_uuid, event, "feature", Uuid::new_v4());
                count_clone.fetch_add(1, Ordering::SeqCst);
            })?
        }
        _ => return Err("Format not supported for V2 ingestion yet".to_string()),
    };

    // 3. Ingestion Completed
    let final_count = count.load(Ordering::SeqCst);
    let end_event = AppEvent::IngestionCompleted {
        ingestion_id,
        total_count: final_count as u64,
        status: "Success".to_string(),
        message: format!("Ingested {} features", final_count),
        metadata: serde_json::json!({}),
    };
    let end_envelope = db_instance.event_store.append(project_uuid, end_event, "ingestion", ingestion_id)?;
    db_instance.projection_engine.process_event(&end_envelope)?;

    Ok(ingestion_id.to_string())
}
