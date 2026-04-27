use crate::core::storage::EventLog;
use crate::domain::design::WorldState;
use std::sync::{Arc, Mutex};
use tauri::State;

#[tauri::command]
pub async fn v4_get_state(state: State<'_, Arc<Mutex<WorldState>>>) -> Result<Vec<u8>, String> {
    let world_state = state.lock().map_err(|e| e.to_string())?;
    super::protocol::encode(&*world_state)
}

#[tauri::command]
pub async fn v4_dispatch_event(
    event_log: State<'_, Arc<EventLog>>,
    state: State<'_, Arc<Mutex<WorldState>>>,
    event_bytes: Vec<u8>,
) -> Result<i64, String> {
    let event = super::protocol::decode(&event_bytes)?;

    // 1. Append to log
    let seq_id = event_log.append(&event).map_err(|e| e.to_string())?;

    // 2. Apply to state
    let mut world_state = state.lock().map_err(|e| e.to_string())?;
    world_state.apply_event(event);

    Ok(seq_id)
}
