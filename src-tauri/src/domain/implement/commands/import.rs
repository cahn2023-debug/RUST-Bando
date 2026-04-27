use crate::domain::models::v2::AppEvent;
use crate::domain::implement::modules::core::active_pmp::ActivePmpState;
use crate::implement::modules::ingestion::import::metadata::ImportMapping;
use crate::implement::modules::ingestion::import::{
    DatasetMeta, ExcelParser, FeatureRecord, KmlParser, KmzParser,
};
use std::path::PathBuf;
use tauri::{command, State};
use uuid::Uuid;

#[command]
pub async fn analyze_import_file(path: String) -> Result<DatasetMeta, String> {
    let path_buf = PathBuf::from(&path);
    let ext = path_buf
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let mut samples = Vec::new();
    let on_sample = |r: FeatureRecord| {
        if samples.len() < 5 {
            samples.push(r.properties);
        }
    };

    let mut meta = match ext.as_str() {
        "xlsx" | "xls" | "xlsb" | "xlsm" => ExcelParser::parse_file(path_buf, None, on_sample)?,
        "kml" => KmlParser::parse_file(path_buf, None, on_sample)?,
        "kmz" => KmzParser::parse_file(path_buf, None, on_sample)?,
        _ => return Err("Unsupported file format".to_string()),
    };

    meta.sample_data = Some(samples);
    Ok(meta)
}

#[command]
pub async fn start_import_task(
    path: String,
    mapping: Option<ImportMapping>,
) -> Result<Vec<FeatureRecord>, String> {
    let path_buf = PathBuf::from(&path);
    let ext = path_buf
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let mut records = Vec::new();

    match ext.as_str() {
        "xlsx" | "xls" | "xlsb" | "xlsm" => {
            ExcelParser::parse_file(path_buf, mapping, |r| {
                records.push(r);
            })?;
        }
        "kml" => {
            KmlParser::parse_file(path_buf, mapping, |r| {
                records.push(r);
            })?;
        }
        "kmz" => {
            KmzParser::parse_file(path_buf, mapping, |r| {
                records.push(r);
            })?;
        }
        _ => return Err("Unsupported file format".to_string()),
    };

    println!("[Import] Parsed {} records from {}", records.len(), ext);
    Ok(records)
}

#[command]
pub async fn commit_import_v2(
    state: State<'_, ActivePmpState>,
    records: Vec<FeatureRecord>,
    folder_id: Option<Uuid>,
) -> Result<usize, String> {
    let project_id = state.project_id()?;
    let v2_db = state.v2_db()?;
    let event_store = v2_db.event_store.clone();

    let mut events = Vec::new();
    for rec in records {
        let event = AppEvent::EntityCreated {
            id: rec.id,
            project_id,
            entity_type: "feature".to_string(),
            data: serde_json::json!({
                "folder_id": folder_id,
                "title": rec.properties.get("name").cloned().unwrap_or_else(|| "Untitled".to_string()),
                "properties": rec.properties,
                "geometry": rec.geometry,
            }),
        };
        events.push(event);
    }

    let count = events.len();
    // In a real scenario, we might want to append sequentially or in a transaction
    for event in events {
        if let AppEvent::EntityCreated { id, .. } = &event {
            let _ = event_store.append(project_id, event.clone(), "feature", *id)?;
        }
    }

    Ok(count)
}
