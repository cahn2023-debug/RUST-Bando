use std::sync::Arc;
use tauri::State;
use crate::domain::implement::modules::v2::sync::engine::{SyncEngine, SyncResult};

#[tauri::command]
pub async fn sync_v2_start(
    sync_engine: State<'_, Arc<SyncEngine>>
) -> Result<SyncResult, String> {
    sync_engine.sync().await
}

#[tauri::command]
pub async fn sync_v2_get_status(
    sync_engine: State<'_, Arc<SyncEngine>>
) -> Result<Option<String>, String> {
    Ok(sync_engine.get_last_error())
}

#[tauri::command]
pub async fn sync_v2_go_online(
    sync_engine: State<'_, Arc<SyncEngine>>
) -> Result<(), String> {
    sync_engine.go_online();
    Ok(())
}

#[tauri::command]
pub async fn sync_v2_go_offline(
    sync_engine: State<'_, Arc<SyncEngine>>
) -> Result<(), String> {
    sync_engine.go_offline();
    Ok(())
}

#[tauri::command]
pub async fn sync_v2_is_online(
    sync_engine: State<'_, Arc<SyncEngine>>
) -> Result<bool, String> {
    Ok(sync_engine.is_online())
}
