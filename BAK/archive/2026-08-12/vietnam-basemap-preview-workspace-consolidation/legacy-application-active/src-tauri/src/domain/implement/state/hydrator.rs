use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const STATE_VERSION: &str = "v2_0_0"; // Version prefix để tránh xung đột V1
const CACHE_SUBDIR: &str = "state_cache";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct StoredRecentProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppState {
    pub v2_loaded: bool,
    pub project_id: Option<String>,
    pub last_opened_path: Option<String>,
    pub pending_open_path: Option<String>,
    pub recent_pmps: Vec<StoredRecentProject>,
    pub schema_version: String, // "2.0.0"
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            v2_loaded: false,
            project_id: None,
            last_opened_path: None,
            pending_open_path: None,
            recent_pmps: Vec::new(),
            schema_version: "2.0.0".to_string(),
        }
    }
}

pub fn load_state(app_data_dir: &Path) -> AppState {
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
                    info!(
                        "[V2 State] Loaded state for project: {:?}",
                        state.project_id
                    );
                    state
                }
                Err(e) => {
                    warn!(
                        "[V2 State] State corruption or version mismatch: {}. Resetting.",
                        e
                    );
                    let _ = fs::remove_file(&cache_path);
                    AppState::default()
                }
            }
        }
        Err(e) => {
            warn!("[V2 State] Failed to read cache: {}. Using default.", e);
            AppState::default()
        }
    }
}

pub fn save_state(app_data_dir: &Path, state: &AppState) -> Result<(), String> {
    let cache_path = app_data_dir
        .join(CACHE_SUBDIR)
        .join(format!("app_state_{}.bin", STATE_VERSION));

    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create cache dir: {}", e))?;
    }

    let bytes =
        bincode::serialize(state).map_err(|e| format!("Failed to serialize state: {}", e))?;

    fs::write(&cache_path, bytes).map_err(|e| format!("Failed to write cache: {}", e))?;

    Ok(())
}
