use crate::implement::db::DatabaseState;
use crate::implement::modules::ai::AIManager;
use crate::implement::modules::ingestion::import::contract_model::BOMItem;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::{Manager, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct ContractCorrection {
    pub investor: String,
    pub contractor: String,
    pub signed_date: String,
    pub duration: String,
    pub end_date: String,
    pub bom_table: Vec<BOMItem>,
    pub context_text: Option<String>,
}

#[cfg(feature = "ai")]
#[tauri::command]
pub async fn save_ai_correction(
    path: String,
    data: ContractCorrection,
    db: State<'_, DatabaseState>,
    ai: State<'_, AIManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let conn_guard = db.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not connected")?;

    // Normalize path to use forward slashes for consistency
    let path = path.replace("\\", "/");

    // 1. Generate hash for the file as a unique context identifier (SHA256)
    let file_hash = if path.starts_with("project://") {
        format!("virtual_{}", path.replace("/", "_").replace(":", "_"))
    } else {
        let file_content =
            fs::read(&path).map_err(|e| format!("Failed to read file: {}. Path: {}", e, path))?;
        let mut hasher = Sha256::new();
        hasher.update(&file_content);
        format!("{:x}", hasher.finalize())
    };

    // 2. Prepare Context Text for Embedding
    let context = data.context_text.clone().unwrap_or_else(|| {
        format!(
            "Investor: {}, Contractor: {}",
            data.investor, data.contractor
        )
    });

    // 3. Get Embedding from Engine
    let embedding_blob = if let Ok(engine) = ai.get_embedding_engine() {
        match engine.get_embeddings(&context) {
            Ok(vec) => {
                let mut bytes: Vec<u8> = Vec::with_capacity(vec.len() * 4);
                for f in vec {
                    let f: f32 = f;
                    bytes.extend_from_slice(&f.to_le_bytes());
                }
                Some(bytes)
            }
            Err(_) => None,
        }
    } else {
        None
    };

    // 4. Save to SQLite (Similarity-based learning)
    let metadata_fields = [
        ("investor", data.investor.clone()),
        ("contractor", data.contractor.clone()),
        ("signed_date", data.signed_date.clone()),
        ("duration", data.duration.clone()),
        ("end_date", data.end_date.clone()),
    ];

    for (field, val) in metadata_fields {
        conn.execute(
            "INSERT INTO ai_corrections (file_hash, field_name, corrected_value, context_text, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![file_hash, field, val, context, embedding_blob],
        ).map_err(|e: rusqlite::Error| e.to_string())?;
    }

    // 5. Export for Training (Offline Fine-tuning - Option C)
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("local_data"));
    let training_dir = app_data_dir.join("training_data");
    fs::create_dir_all(&training_dir).map_err(|e| e.to_string())?;

    let filename = format!(
        "correction_{}_{}.json",
        file_hash,
        chrono::Utc::now().timestamp()
    );
    let export_path = training_dir.join(filename);

    let export_data = serde_json::json!({
        "source_file": path,
        "file_hash": file_hash,
        "context": context,
        "corrections": data,
        "timestamp": chrono::Utc::now().to_rfc3339()
    });

    let json_str = serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())?;
    fs::write(export_path, json_str).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(not(feature = "ai"))]
#[tauri::command]
pub async fn save_ai_correction(
    _path: String,
    _data: ContractCorrection,
    _db: State<'_, DatabaseState>,
    _app_handle: tauri::AppHandle,
) -> Result<(), String> {
    Err("AI functionality is not compiled in this build.".to_string())
}
