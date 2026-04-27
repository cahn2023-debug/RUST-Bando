use crate::contract::project_model::Project;
use arc_swap::ArcSwap;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tauri::State;

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct AppConfig {
    pub device_id: String,
    pub last_opened_pmp: Option<String>,
    pub recent_pmps: Vec<Project>,
    pub enable_ai: bool,
    pub low_power_mode: bool,
    pub current_user_email: Option<String>,
    pub user_roles: std::collections::HashMap<String, String>,
    #[serde(skip)]
    pub pending_pmp_path: Option<String>,
}

impl AppConfig {
    pub fn load(app_data_dir: &Path) -> Self {
        let mut config = AppConfig::default();
        let config_path = app_data_dir.join("settings.json");
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(loaded) = serde_json::from_str::<AppConfig>(&content) {
                    config = loaded;
                }
            }
        }
        if config.device_id.is_empty() {
            config.device_id = uuid::Uuid::new_v4().to_string();
        }
        config.user_roles.insert("thanh.bd@tfsc.com.vn".to_string(), "Admin".to_string());
        config
    }

    pub fn save(&self, app_data_dir: &Path) -> Result<(), String> {
        let config_path = app_data_dir.join("settings.json");
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(config_path, content).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct ConfigState(pub Arc<ArcSwap<AppConfig>>);

// ========================================================================
// Tauri Commands Stubs
// ========================================================================

#[tauri::command] pub async fn get_app_config(state: State<'_, ConfigState>) -> Result<AppConfig, String> { Ok(state.0.load().as_ref().clone()) }
#[tauri::command] pub async fn update_app_config(_config: serde_json::Value) -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn get_recent_projects() -> Result<Vec<Project>, String> { Ok(vec![]) }
#[tauri::command] pub async fn save_recent_projects(#[allow(unused_variables)] projects: Vec<Project>) -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn remove_recent_project(_path: String) -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn clear_last_opened_project() -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn save_last_opened_project(#[allow(unused_variables)] project: Project) -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn get_pending_pmp_path() -> Result<Option<String>, String> { Ok(None) }
#[tauri::command] pub async fn release_ai_memory() -> Result<(), String> { Ok(()) }
