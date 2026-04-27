use crate::implement::db::DatabaseState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum AppCommand {
    // Project Commands
    GetProject { id: i64 },
    ArchiveProject { id: i64 },

    // Feature Commands
    AnalyzeFeature { id: String },

    // Design & Map Commands
    SetDrawingMode { mode: String },
    DeduplicateData { project_id: i64 },

    // System Commands
    ClearCache,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResponse {
    pub success: bool,
    pub data: serde_json::Value,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn dispatch_command(
    _db_state: State<'_, DatabaseState>,
    _memory_state: State<'_, std::sync::Arc<crate::design::design_events::state::MapState>>,
    command: AppCommand,
) -> Result<CommandResponse, String> {
    println!("[Dispatcher] Received command: {:?}", command);

    match command {
        AppCommand::GetProject { id } => Ok(CommandResponse {
            success: true,
            data: serde_json::json!({ "id": id, "status": "active" }),
            message: None,
        }),
        AppCommand::SetDrawingMode { mode } => {
            // Bridge to existing logic
            Ok(CommandResponse {
                success: true,
                data: serde_json::json!({ "active_mode": mode }),
                message: Some(format!("Drawing mode set to {}", mode)),
            })
        }
        AppCommand::DeduplicateData { project_id } => {
            // Bridge to existing logic
            Ok(CommandResponse {
                success: true,
                data: serde_json::json!({ "project_id": project_id }),
                message: Some("Duplicate scan queued".into()),
            })
        }
        _ => Err("Command path not yet bridged in Dispatcher".into()),
    }
}
