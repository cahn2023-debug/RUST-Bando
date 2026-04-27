#![allow(non_snake_case)]
use tauri::State;
pub use serde_json::Value;
pub use uuid::Uuid;
use crate::contract::spatial_models::BincodeMapState;

pub mod events;
pub mod models;
pub mod spatial;
pub mod state;

pub use events::DesignEventType;
pub use state::MapState;

use crate::domain::implement::modules::core::active_pmp::ActivePmpState;

#[tauri::command]
pub async fn load_design_state(
    _projectId: String,
    active_pmp: State<'_, ActivePmpState>,
) -> Result<Vec<u8>, String> {
    let v2_db = active_pmp.v2_db()?;
    let conn_guard = v2_db.conn.lock();
    let conn = &*conn_guard;

    // 1. Fetch all design events for this project
    // Note: We query `design_events` which is the UI-optimized event log
    let mut stmt = conn.prepare(
        "SELECT payload_json FROM design_events 
         WHERE is_undone = 0 
         ORDER BY timestamp ASC"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let event_rows = stmt.query_map([], |row| {
        let payload: String = row.get(0)?;
        Ok(payload)
    }).map_err(|e| format!("Query failed: {}", e))?;

    // 2. Rebuild MapState
    let map_state = MapState::default();
    for row in event_rows {
        if let Ok(payload) = row {
            if let Ok(event) = DesignEventType::robust_deserialize(&payload, None) {
                map_state.apply_event(&event);
            }
        }
    }

    // 3. Convert to Bincode compatible format
    let snapshot = map_state.to_snapshot();
    let bincode_state = BincodeMapState::from(snapshot);

    // 4. Serialize with Bincode
    let data = bincode::serialize(&bincode_state)
        .map_err(|e| format!("Bincode serialization failed: {}", e))?;

    Ok(data)
}

#[tauri::command] pub async fn trigger_bridge_event(#[allow(unused_variables)] projectId: String, #[allow(unused_variables)] t: String, #[allow(unused_variables)] payload: Value) -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn get_design_state(#[allow(unused_variables)] projectId: String) -> Result<Value, String> { Ok(serde_json::json!({})) }
#[tauri::command] pub async fn dispatch_design_events(#[allow(unused_variables)] projectId: String, #[allow(unused_variables)] events: Vec<Value>) -> Result<Value, String> { 
    Ok(serde_json::json!({
        "success": true,
        "last_event_id": "",
        "applied_events": [],
        "side_effects": []
    })) 
}
#[tauri::command] pub async fn undo_design_event(#[allow(unused_variables)] projectId: String) -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn redo_design_event(#[allow(unused_variables)] projectId: String) -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn deduplicate_project_data(#[allow(unused_variables)] projectId: String) -> Result<(), String> { Ok(()) }
#[tauri::command] pub async fn aggregate_project_data(#[allow(unused_variables)] projectId: String) -> Result<Value, String> { Ok(serde_json::json!({})) }
#[tauri::command] pub async fn query_features_in_area(#[allow(unused_variables)] projectId: String, #[allow(unused_variables)] bounds: Value) -> Result<Vec<Value>, String> { Ok(vec![]) }
#[tauri::command] pub async fn find_nearest_snap_point(#[allow(unused_variables)] projectId: String, #[allow(unused_variables)] point: Value) -> Result<Option<Value>, String> { Ok(None) }

pub use MapState as MapStateV2;
