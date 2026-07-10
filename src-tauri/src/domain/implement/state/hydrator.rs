use std::path::PathBuf;
use std::fs;
use serde::{Serialize, Deserialize};
use log::{warn, info};

const STATE_VERSION: &str = "v2_0_0"; // Version prefix để tránh xung đột V1
const CACHE_SUBDIR: &str = "state_cache";

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct AppState {
    pub v2_loaded: bool,
    pub project_id: Option<String>,
    pub last_opened_path: Option<String>,
    pub schema_version: String, // "2.0.0"
}

pub fn load_state(app_data_dir: &PathBuf) -> AppState {
    let cache_path = app_data_dir
        .join(CACHE_SUBDIR)
        .join(format!("app_state_{}.bin", STATE_VERSION));
    
    if !cache_path.exists() {
        info!("[V2 State] No cache found, initializing default state");
        return AppState::default();
    }

    match fs::read(&cache_path) {
        Ok(bytes) => {
            // Lỗi #4: BincodeDecoder Out of bounds fix
            match bincode::deserialize::<AppState>(&bytes) {
                Ok(state) => {
                    info!("[V2 State] Loaded state for project: {:?}", state.project_id);
                    state
                },
                Err(e) => {
                    warn!("[V2 State] State corruption or version mismatch: {}. Resetting.", e);
                    let _ = fs::remove_file(&cache_path);
                    AppState::default()
                }
            }
        },
        Err(e) => {
            warn!("[V2 State] Failed to read cache: {}. Using default.", e);
            AppState::default()
        }
    }
}

pub fn save_state(app_data_dir: &PathBuf, state: &AppState) -> Result<(), String> {
    let cache_path = app_data_dir
        .join(CACHE_SUBDIR)
        .join(format!("app_state_{}.bin", STATE_VERSION));
    
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create cache dir: {}", e))?;
    }
    
    let bytes = bincode::serialize(state)
        .map_err(|e| format!("Failed to serialize state: {}", e))?;
    
    fs::write(&cache_path, bytes)
        .map_err(|e| format!("Failed to write cache: {}", e))?;
    
    Ok(())
}
