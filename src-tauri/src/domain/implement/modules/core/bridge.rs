use crate::contract::design_state::DesignEventType;
use crate::implement::db::DatabaseState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tracing::info;

/// Payload sent from UI/Design layer to the Implementation layer (DB)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgePayload {
    pub project_id: i64,
    pub event_type: DesignEventType,
    pub payload: serde_json::Value,
    pub source: String,
}

pub fn init_bridge(app_handle: AppHandle) {
    let db_state = app_handle.state::<DatabaseState>();
    let active_pmp = app_handle.state::<crate::implement::modules::core::active_pmp::ActivePmpState>();
    
    if let Ok(mut lock) = db_state.device_id.lock() {
        *lock = active_pmp.current_device_id().unwrap_or_default();
    }

    info!("[Bridge] Initialization complete");
}

async fn _process_bridge_message(app: AppHandle, msg: BridgePayload) -> Result<(), String> {
    let _ = app.emit("design-event-processed", &msg);
    Ok(())
}
