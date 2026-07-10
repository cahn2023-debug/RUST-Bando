use tauri::State;
use serde_json::{json, Value};
use crate::domain::implement::commands::v2::ActorState;

fn extract_project_metadata(rows: &Value) -> Value {
    let metadata = rows
        .as_array()
        .and_then(|a| a.first())
        .and_then(|obj| obj.get("metadata_json"))
        .cloned()
        .unwrap_or_else(|| json!({}));

    if metadata.is_object() {
        metadata
    } else {
        json!({})
    }
}

// ============================================================================
// ✅ INPUT STRUCTS WITH CAMELCASE SUPPORT (Match Frontend Convention)
// ============================================================================

// Flattened signatures to match frontend flat objects

// ============================================================================
// ✅ COMMAND IMPLEMENTATIONS (Match Frontend camelCase naming)
// ============================================================================

#[tauri::command]
#[allow(non_snake_case)]
pub async fn query_projection_v2(
    state: State<'_, ActorState>,
    table: String,
    projectId: String,
) -> Result<Value, String> {
    match table.as_str() {
        "bom_metadata" => {
            // Lỗi #6: Query custom.bom_table từ metadata_json dùng json_extract
            let sql = "
                SELECT json_extract(metadata_json, '$.custom.bom_table') as bom
                FROM files 
                WHERE project_id = ?1 
                AND metadata_json IS NOT NULL
                AND json_valid(metadata_json)
                AND metadata_json LIKE '%\"custom\"%'
            ";
            
            let (tx, rx) = tokio::sync::oneshot::channel();
            state.gateway_tx.send(crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand::Query {
                sql: sql.to_string(),
                params: vec![projectId.clone()],
                reply: tx,
            }).await.map_err(|e| e.to_string())?;
            
            let rows = rx.await.map_err(|e| e.to_string())??;
            // Trả về structure đúng spec frontend mong đợi
            Ok(json!({ "bom_table": rows.as_array().cloned().unwrap_or_default() }))
        },
        "task_dependencies" | "content_types" | "tasks" | "notes" | "contracts" => {
            Ok(json!({ "items": [], "status": "empty" }))
        },
        _ => Err(format!("[V2] Unsupported projection: {}", table))
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn load_design_state_v2(
    state: State<'_, ActorState>,
    projectId: String,
) -> Result<Value, String> {
    let sql = "SELECT metadata_json FROM projects WHERE id = ?1";
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.gateway_tx.send(crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand::Query {
        sql: sql.to_string(),
        params: vec![projectId.clone()],
        reply: tx,
    }).await.map_err(|e| e.to_string())?;
    
    let rows = rx.await.map_err(|e| e.to_string())??;
    Ok(extract_project_metadata(&rows))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_tasks(
    state: State<'_, ActorState>,
    projectId: String,
) -> Result<Vec<Value>, String> {
    let sql = "SELECT * FROM files WHERE project_id = ?1 AND (extension = 'task' OR metadata_json LIKE '%\"type\":\"task\"%')";
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.gateway_tx.send(crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand::Query {
        sql: sql.to_string(),
        params: vec![projectId],
        reply: tx,
    }).await.map_err(|e| e.to_string())?;
    
    let rows = rx.await.map_err(|e| e.to_string())??;
    Ok(rows.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_notes(
    state: State<'_, ActorState>,
    projectId: String,
) -> Result<Vec<Value>, String> {
    let sql = "SELECT * FROM files WHERE project_id = ?1 AND (extension = 'note' OR metadata_json LIKE '%\"type\":\"note\"%')";
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.gateway_tx.send(crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand::Query {
        sql: sql.to_string(),
        params: vec![projectId],
        reply: tx,
    }).await.map_err(|e| e.to_string())?;
    
    let rows = rx.await.map_err(|e| e.to_string())??;
    Ok(rows.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_contracts(
    state: State<'_, ActorState>,
    projectId: String,
) -> Result<Vec<Value>, String> {
    let sql = "SELECT * FROM files WHERE project_id = ?1 AND (extension = 'contract' OR metadata_json LIKE '%\"type\":\"contract\"%')";
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.gateway_tx.send(crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand::Query {
        sql: sql.to_string(),
        params: vec![projectId],
        reply: tx,
    }).await.map_err(|e| e.to_string())?;
    
    let rows = rx.await.map_err(|e| e.to_string())??;
    Ok(rows.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_materials(
    state: State<'_, ActorState>,
    projectId: String,
) -> Result<Vec<Value>, String> {
    let sql = "SELECT * FROM files WHERE project_id = ?1 AND (extension = 'material' OR metadata_json LIKE '%\"type\":\"material\"%')";
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.gateway_tx.send(crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand::Query {
        sql: sql.to_string(),
        params: vec![projectId],
        reply: tx,
    }).await.map_err(|e| e.to_string())?;
    
    let rows = rx.await.map_err(|e| e.to_string())??;
    Ok(rows.as_array().cloned().unwrap_or_default())
}

/// Stub cho các lệnh V1 đã deprecated
#[tauri::command]
pub fn get_task_dependencies_v2() -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub fn get_content_types_v2() -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub fn get_project_bom_table_v2() -> Result<Value, String> {
    Ok(json!({ "bom_table": [] }))
}

// --- Legacy Stubs (SPEC_PMP_V2.md §5.1) ---

#[tauri::command]
pub fn get_task_dependencies() -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub fn get_content_types() -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub fn get_project_bom_table() -> Result<Value, String> {
    Ok(json!({ "bom_table": [] }))
}

#[tauri::command]
pub fn get_tasks_legacy() -> Result<Value, String> {
    Ok(json!([]))
}

#[tauri::command]
pub fn get_notes_legacy() -> Result<Value, String> {
    Ok(json!([]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_project_metadata_returns_object_payload() {
        let rows = json!([
            {
                "metadata_json": {
                    "features": { "f1": { "id": "f1" } },
                    "layers": { "l1": { "id": "l1" } },
                    "regions": { "r1": { "id": "r1" } }
                }
            }
        ]);
        let out = extract_project_metadata(&rows);
        assert!(out.get("features").is_some());
        assert!(out.get("layers").is_some());
        assert!(out.get("regions").is_some());
    }

    #[test]
    fn extract_project_metadata_rejects_non_object_payload() {
        let rows = json!([{ "metadata_json": "bad-shape" }]);
        let out = extract_project_metadata(&rows);
        assert_eq!(out, json!({}));
    }
}
