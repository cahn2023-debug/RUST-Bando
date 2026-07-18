use crate::domain::implement::modules::core::active_pmp::ActivePmpState;
use crate::implement::modules::ai::actor::{AiMessage, AiResponse};
use crate::implement::modules::ai::AIManager;
use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, State};

#[cfg(feature = "ai")]
#[tauri::command]
pub async fn check_ai_status(
    _app: AppHandle,
    active_pmp: State<'_, ActivePmpState>,
    config_state: State<'_, crate::implement::modules::core::config::ConfigState>,
) -> Result<HashMap<String, bool>, String> {
    let enable_ai = {
        let config = config_state.0.lock().unwrap();
        config.enable_ai
    };

    let mut status = HashMap::new();
    if !enable_ai {
        status.insert("ready".to_string(), false);
        return Ok(status);
    }

    // Get status via Actor
    if let Ok(v2_db) = active_pmp.v2_db() {
        if let Some(ref ai_handle) = v2_db.topology.ai {
            match ai_handle.send(AiMessage::GetStatus).await {
                Some(AiResponse::Status(s)) => {
                    let phi3 = s.get("phi3_loaded").cloned().unwrap_or(false);
                    let embed = s.get("embedding_loaded").cloned().unwrap_or(false);
                    status.insert("ready".to_string(), phi3 && embed);
                    for (k, v) in s {
                        status.insert(k, v);
                    }
                    return Ok(status);
                }
                _ => {}
            }
        }
    }

    status.insert("ready".to_string(), false);
    Ok(status)
}

#[cfg(not(feature = "ai"))]
#[tauri::command]
pub async fn check_ai_status() -> Result<HashMap<String, bool>, String> {
    let mut status = HashMap::new();
    status.insert("ready".to_string(), false);
    Ok(status)
}

#[derive(Serialize)]
pub struct MetadataNormalizeResponse {
    pub normalized_text: String,
    pub embedding: Vec<f32>,
    pub model: String,
    pub updated_at: String,
}

fn normalize_text(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(feature = "ai")]
#[tauri::command]
pub async fn normalize_metadata(
    _app: AppHandle,
    active_pmp: State<'_, ActivePmpState>,
    config_state: State<'_, crate::implement::modules::core::config::ConfigState>,
    text: String,
) -> Result<MetadataNormalizeResponse, String> {
    let enable_ai = {
        let config = config_state.0.lock().unwrap();
        config.enable_ai
    };

    if !enable_ai {
        return Err("AI Assistant is disabled in settings.".to_string());
    }

    let normalized_text = normalize_text(&text);

    // Get Embedding via Actor
    let v2_db = active_pmp.v2_db()?;
    let ai_handle = v2_db.topology.ai.as_ref().ok_or("AI Actor not initialized")?;

    match ai_handle.send(AiMessage::GetEmbedding { text: normalized_text.clone() }).await {
        Some(AiResponse::Embedding(embedding)) => {
            Ok(MetadataNormalizeResponse {
                normalized_text,
                embedding,
                model: "all-MiniLM-L6-v2".to_string(),
                updated_at: Utc::now().to_rfc3339(),
            })
        }
        Some(AiResponse::Error(e)) => Err(e),
        _ => Err("AI Actor timed out or returned invalid response".to_string()),
    }
}

#[cfg(feature = "ai")]
#[tauri::command]
pub async fn check_and_download_models(
    app: AppHandle,
    ai_state: State<'_, AIManager>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("local_data"));
    let downloader = ai_state.get_downloader(app_data_dir);

    println!("[AI Command] Checking and downloading models...");
    downloader.download_all().map_err(|e| e.to_string())?;

    println!("[AI Command] Verifying model hashes...");
    downloader.verify_hashes().map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(not(feature = "ai"))]
#[tauri::command]
pub async fn normalize_metadata(_text: String) -> Result<MetadataNormalizeResponse, String> {
    Err("AI functionality is not compiled in this build.".to_string())
}

#[cfg(not(feature = "ai"))]
#[tauri::command]
pub async fn check_and_download_models() -> Result<(), String> {
    Err("AI functionality is not compiled in this build.".to_string())
}
