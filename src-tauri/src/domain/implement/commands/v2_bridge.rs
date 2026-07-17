use crate::domain::implement::commands::v2::ActorState;
use crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand;
use serde_json::{json, Value};
use tauri::State;

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

async fn exec_query(state: &ActorState, sql: &str, params: Vec<String>) -> Result<Value, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::Query {
            sql: sql.to_string(),
            params,
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

fn empty_design_state() -> Value {
    json!({
        "regions": {},
        "layers": {},
        "feature_groups": {},
        "features": {},
        "settings": {}
    })
}

fn has_design_data(state: &Value) -> bool {
    ["regions", "layers", "feature_groups", "features"]
        .iter()
        .any(|key| {
            state
                .get(*key)
                .and_then(Value::as_object)
                .map(|obj| !obj.is_empty())
                .unwrap_or(false)
        })
}

fn ensure_design_shape(state: Value) -> Value {
    let mut shaped = empty_design_state();
    if let Some(src) = state.as_object() {
        if let Some(dst) = shaped.as_object_mut() {
            for key in [
                "regions",
                "layers",
                "feature_groups",
                "features",
                "settings",
            ] {
                if let Some(value) = src.get(key) {
                    dst.insert(key.to_string(), value.clone());
                }
            }
        }
    }
    shaped
}

fn row_array(value: Value) -> Vec<Value> {
    value.as_array().cloned().unwrap_or_default()
}

fn normalize_metadata_to_string(v: &Value) -> String {
    match v {
        Value::Null => "{}".to_string(),
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() || trimmed == "null" || trimmed == "undefined" {
                "{}".to_string()
            } else {
                trimmed.to_string()
            }
        }
        other => other.to_string(),
    }
}

async fn load_design_state_from_tables(
    state: &ActorState,
    project_id: &str,
) -> Result<Value, String> {
    // Dọn dẹp: Xóa các feature "Tuyen Network Moi" không có tọa độ trên bản đồ
    let cleanup_sql = "
        DELETE FROM features 
        WHERE project_id = ?1 
        AND (name = 'Tuyen Network Moi' OR name LIKE 'Tuyen Network Moi%' OR name LIKE 'Tuyến Network Mới%')
        AND (coordinates_json IS NULL OR coordinates_json = '' OR coordinates_json = '[]' OR coordinates_json = '{}')
    ";
    let (tx_clean, rx_clean) = tokio::sync::oneshot::channel();
    let _ = state
        .gateway_tx
        .send(StorageCommand::Query {
            sql: cleanup_sql.to_string(),
            params: vec![project_id.to_string()],
            reply: tx_clean,
        })
        .await;
    let _ = rx_clean.await;

    let regions = exec_query(
        state,
        "SELECT id, parent_id, name, description FROM regions WHERE project_id = ?1 ORDER BY created_at, id",
        vec![project_id.to_string()],
    ).await?;
    let layers = exec_query(
        state,
        "SELECT id, region_id, name, is_visible FROM layers WHERE project_id = ?1 ORDER BY created_at, id",
        vec![project_id.to_string()],
    ).await?;
    let feature_groups = exec_query(
        state,
        "SELECT id, layer_id, parent_id, name, group_type, is_visible, metadata_json FROM feature_groups WHERE project_id = ?1 ORDER BY created_at, id",
        vec![project_id.to_string()],
    ).await?;
    let features = exec_query(
        state,
        "SELECT id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json, bbox_json FROM features WHERE project_id = ?1 ORDER BY created_at, id",
        vec![project_id.to_string()],
    ).await?;
    let settings = exec_query(
        state,
        "SELECT settings_json FROM project_settings WHERE project_id = ?1",
        vec![project_id.to_string()],
    )
    .await?;

    let mut result = empty_design_state();
    let result_obj = result.as_object_mut().expect("state object");

    let mut regions_obj = serde_json::Map::new();
    for row in row_array(regions) {
        if let Some(id) = row.get("id").and_then(Value::as_str) {
            regions_obj.insert(id.to_string(), row);
        }
    }
    result_obj.insert("regions".to_string(), Value::Object(regions_obj));

    let mut layers_obj = serde_json::Map::new();
    for row in row_array(layers) {
        if let Some(id) = row.get("id").and_then(Value::as_str) {
            layers_obj.insert(id.to_string(), row);
        }
    }
    result_obj.insert("layers".to_string(), Value::Object(layers_obj));

    let mut groups_obj = serde_json::Map::new();
    for row in row_array(feature_groups) {
        if let Some(id) = row.get("id").and_then(Value::as_str) {
            let metadata = row
                .get("metadata_json")
                .map(normalize_metadata_to_string)
                .unwrap_or_else(|| "{}".to_string());
            groups_obj.insert(
                id.to_string(),
                json!({
                    "id": id,
                    "layer_id": row.get("layer_id").cloned().unwrap_or(Value::Null),
                    "parent_id": row.get("parent_id").cloned().unwrap_or(Value::Null),
                    "name": row.get("name").cloned().unwrap_or_else(|| json!("Untitled Group")),
                    "type": row.get("group_type").cloned().unwrap_or(Value::Null),
                    "is_visible": row.get("is_visible").and_then(Value::as_i64).unwrap_or(1) != 0,
                    "metadata": metadata,
                }),
            );
        }
    }
    result_obj.insert("feature_groups".to_string(), Value::Object(groups_obj));

    let mut features_obj = serde_json::Map::new();
    for row in row_array(features) {
        if let Some(id) = row.get("id").and_then(Value::as_str) {
            let metadata = row
                .get("metadata_json")
                .map(normalize_metadata_to_string)
                .unwrap_or_else(|| "{}".to_string());
            features_obj.insert(
                id.to_string(),
                json!({
                    "id": id,
                    "layer_id": row.get("layer_id").cloned().unwrap_or(Value::Null),
                    "group_id": row.get("group_id").cloned().unwrap_or(Value::Null),
                    "name": row.get("name").cloned().unwrap_or_else(|| json!("Untitled Feature")),
                    "geom_type": row.get("geom_type").cloned().unwrap_or_else(|| json!("Point")),
                    "coordinates": row.get("coordinates_json").cloned().unwrap_or(Value::Null),
                    "properties": row.get("properties_json").cloned().unwrap_or_else(|| json!({})),
                    "metadata": metadata,
                    "bbox": row.get("bbox_json").cloned().unwrap_or(Value::Null),
                }),
            );
        }
    }
    result_obj.insert("features".to_string(), Value::Object(features_obj));

    let settings_value = row_array(settings)
        .into_iter()
        .next()
        .and_then(|row| row.get("settings_json").cloned())
        .unwrap_or_else(|| json!({}));
    result_obj.insert("settings".to_string(), settings_value);

    Ok(result)
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
    project_id: Option<String>,
    projectId: Option<String>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
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
                params: vec![project_id.clone()],
                reply: tx,
            }).await.map_err(|e| e.to_string())?;

            let rows = rx.await.map_err(|e| e.to_string())??;
            // Trả về structure đúng spec frontend mong đợi
            Ok(json!({ "bom_table": rows.as_array().cloned().unwrap_or_default() }))
        }
        "task_dependencies" | "content_types" | "tasks" | "notes" | "contracts" => {
            Ok(json!({ "items": [], "status": "empty" }))
        }
        _ => Err(format!("[V2] Unsupported projection: {}", table)),
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn load_design_state_v2(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let read_model_state =
        ensure_design_shape(load_design_state_from_tables(&state, &project_id).await?);
    if has_design_data(&read_model_state) {
        return Ok(read_model_state);
    }

    let rows = exec_query(
        &state,
        "SELECT state_json FROM project_snapshots WHERE project_id = ?1",
        vec![project_id.clone()],
    )
    .await?;
    let snapshot_state = ensure_design_shape(extract_project_metadata(&json!([{
        "metadata_json": rows
            .as_array()
            .and_then(|items| items.first())
            .and_then(|item| item.get("state_json"))
            .cloned()
            .unwrap_or_else(|| json!({}))
    }])));

    if has_design_data(&snapshot_state) {
        let (tx, rx) = tokio::sync::oneshot::channel();
        state
            .gateway_tx
            .send(StorageCommand::UpdateProjectState {
                project_id: project_id.clone(),
                state: snapshot_state.clone(),
                reply: tx,
            })
            .await
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())??;
        return Ok(snapshot_state);
    }

    let rows = exec_query(
        &state,
        "SELECT metadata_json FROM projects WHERE id = ?1",
        vec![project_id.clone()],
    )
    .await?;
    let metadata_state = ensure_design_shape(extract_project_metadata(&rows));

    if has_design_data(&metadata_state) {
        let (tx, rx) = tokio::sync::oneshot::channel();
        state
            .gateway_tx
            .send(StorageCommand::UpdateProjectState {
                project_id,
                state: metadata_state.clone(),
                reply: tx,
            })
            .await
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())??;
        return Ok(metadata_state);
    }

    Ok(metadata_state)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_tasks(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
) -> Result<Vec<Value>, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let sql = "SELECT * FROM files WHERE project_id = ?1 AND (extension = 'task' OR metadata_json LIKE '%\"type\":\"task\"%')";
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .gateway_tx
        .send(
            crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand::Query {
                sql: sql.to_string(),
                params: vec![project_id],
                reply: tx,
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    let rows = rx.await.map_err(|e| e.to_string())??;
    Ok(rows.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_notes(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
) -> Result<Vec<Value>, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let sql = "SELECT * FROM files WHERE project_id = ?1 AND (extension = 'note' OR metadata_json LIKE '%\"type\":\"note\"%')";
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .gateway_tx
        .send(
            crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand::Query {
                sql: sql.to_string(),
                params: vec![project_id],
                reply: tx,
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    let rows = rx.await.map_err(|e| e.to_string())??;
    Ok(rows.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_contracts(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
) -> Result<Vec<Value>, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let sql = "SELECT * FROM files WHERE project_id = ?1 AND (extension = 'contract' OR metadata_json LIKE '%\"type\":\"contract\"%')";
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .gateway_tx
        .send(
            crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand::Query {
                sql: sql.to_string(),
                params: vec![project_id],
                reply: tx,
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    let rows = rx.await.map_err(|e| e.to_string())??;
    Ok(rows.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_materials(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
) -> Result<Vec<Value>, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let sql = "SELECT * FROM files WHERE project_id = ?1 AND (extension = 'material' OR metadata_json LIKE '%\"type\":\"material\"%')";
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .gateway_tx
        .send(
            crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand::Query {
                sql: sql.to_string(),
                params: vec![project_id],
                reply: tx,
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    let rows = rx.await.map_err(|e| e.to_string())??;
    Ok(rows.as_array().cloned().unwrap_or_default())
}

/// Stub cho các lệnh V1 đã deprecated
#[tauri::command]
pub fn navigate_webview(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    use tauri::Manager;

    let webview = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;
    let parsed_url = url
        .parse()
        .map_err(|e| format!("Invalid URL for webview navigation: {}", e))?;

    webview.navigate(parsed_url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn eval_webview(app: tauri::AppHandle, label: String, script: String) -> Result<(), String> {
    use tauri::Manager;

    let webview = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    webview.eval(&script).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_webview_url(app: tauri::AppHandle, label: String) -> Result<String, String> {
    use tauri::Manager;

    let webview = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    webview
        .url()
        .map(|url| url.to_string())
        .map_err(|e| e.to_string())
}

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
