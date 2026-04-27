use crate::implement::modules::ai::AIManager;
use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, State};

#[cfg(feature = "ai")]
#[tauri::command]
pub async fn check_ai_status(
    _app: AppHandle,
    ai_state: State<'_, AIManager>,
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

    // Check if models are loaded
    let is_phi3_ready = ai_state.is_phi3_loaded();
    let is_embedding_ready = ai_state.is_embedding_loaded();

    status.insert("ready".to_string(), is_phi3_ready && is_embedding_ready);
    status.insert("phi3_loaded".to_string(), is_phi3_ready);
    status.insert("embedding_loaded".to_string(), is_embedding_ready);

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
    ai_state: State<'_, AIManager>,
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

    let embedder = ai_state.get_embedding_engine().map_err(|e| e.to_string())?;

    let embedding = embedder
        .get_embeddings(&normalized_text)
        .map_err(|e| e.to_string())?;

    Ok(MetadataNormalizeResponse {
        normalized_text,
        embedding,
        model: "all-MiniLM-L6-v2".to_string(),
        updated_at: Utc::now().to_rfc3339(),
    })
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
