use crate::implement::modules::v2::events::AppEvent;
use crate::implement::modules::v2::storage::worker::WorkerCommand;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Dữ liệu đầu vào từ Frontend (TypeScript)
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignEventPayload {
    pub id: String,                 // UUID của Event
    pub entity_id: String,          // UUID của thực thể (Feature/Task/File)
    pub entity_type: String,        // ví dụ: "feature", "task", "file"
    pub event_type: String,         // loại sự kiện (legacy map)
    pub payload: serde_json::Value, // Bắt bằng Value trước để xử lý mapping mềm
}

/// Lệnh nhận một Batch các Event từ giao diện và đẩy vào Worker Queue (Non-blocking I/O)
#[tauri::command]
pub async fn invoke_design_event_batch(
    project_id: String,
    events: Vec<DesignEventPayload>,
    active_pmp: State<'_, crate::implement::modules::core::active_pmp::ActivePmpState>,
) -> Result<Vec<String>, String> {
    // [ANTI-SILENT-FAILURE] Xác nhận Rust có nhận được tín hiệu và payload
    info!(
        "[V2 IPC] ----> Received Batch Request for Project: {} | Events Count: {}",
        project_id,
        events.len()
    );

    if events.is_empty() {
        warn!("[V2 IPC] Empty batch received, skipping.");
        return Ok(vec![]);
    }

    // Get the sender from ActivePmpState
    let sender = active_pmp.sender()?;

    // Hỗ trợ cả UUID chuẩn và Legacy Numeric ID
    let parsed_project_id = match Uuid::parse_str(&project_id) {
        Ok(uuid) => uuid,
        Err(_) => {
            // Nếu là số (Legacy), tạo UUID deterministic dựa trên chuỗi đó
            // Điều này đảm bảo cùng một Project ID số sẽ luôn ra cùng một UUID
            debug!("[IPC] Legacy project_id detected, generating deterministic UUID");
            Uuid::new_v5(&Uuid::NAMESPACE_DNS, project_id.as_bytes())
        }
    };

    // 1. Chuyển đổi payload thành cấu trúc Rust chuẩn
    let mut mapped_events = Vec::with_capacity(events.len());
    for req_event in events {
        let entity_id = match Uuid::parse_str(&req_event.entity_id) {
            Ok(uuid) => uuid,
            Err(_) => {
                // Hỗ trợ ID cũ (số hoặc chuỗi bất kỳ) bằng cách hash sang UUID
                Uuid::new_v5(&Uuid::NAMESPACE_OID, req_event.entity_id.as_bytes())
            }
        };

        // --- Compatibility Layer: Map legacy GIS payloads to V2 AppEvent format ---
        let mut final_payload = req_event.payload.clone();

        if let Some(obj) = final_payload.as_object_mut() {
            // Mapping metadata to properties for ANY Feature-related events (Created and Updated)
            // This MUST be done before wrapping into "changes" for updated events.
            if req_event.event_type.contains("Feature")
                && obj.contains_key("metadata")
                && !obj.contains_key("properties")
            {
                if let Some(meta) = obj.remove("metadata") {
                    debug!(
                        "[IPC] Mapping 'metadata' to 'properties' for {}",
                        req_event.event_type
                    );
                    obj.insert("properties".to_string(), meta);
                }
            }

            // 1. Wrap "Updated" events that are missing the "changes" field
            if req_event.event_type.ends_with("Updated") && !obj.contains_key("changes") {
                let current_content = std::mem::take(obj);
                obj.insert(
                    "changes".to_string(),
                    serde_json::Value::Object(current_content),
                );
            }

            // 2. Map "coordinates" to "geometry" for Feature events
            if req_event.event_type.contains("Feature") && obj.contains_key("coordinates") {
                if let Some(coords) = obj.remove("coordinates") {
                    obj.insert("geometry".to_string(), coords);
                }
            }
        }

        info!(
            "[IPC] Processing {} Event for {} ({})",
            req_event.event_type, req_event.entity_type, entity_id
        );

        let app_event: AppEvent = match serde_json::from_value(final_payload.clone()) {
            Ok(evt) => evt,
            Err(_) => {
                // Fallback: Wrapping it with `type` and `payload` if frontend missed it
                let mut wrapped = serde_json::Map::new();
                wrapped.insert(
                    "type".to_string(),
                    serde_json::Value::String(req_event.event_type.clone()),
                );
                wrapped.insert("payload".to_string(), final_payload.clone());

                match serde_json::from_value(serde_json::Value::Object(wrapped)) {
                    Ok(evt) => evt,
                    Err(e) => {
                        error!(
                            "[IPC] Skipping invalid Event Payload type '{}': {}. Data: {:?}",
                            req_event.event_type, e, final_payload
                        );
                        continue;
                    }
                }
            }
        };

        debug!(
            "[IPC] Queueing event: {} for entity {}",
            app_event.action(),
            entity_id
        );
        mapped_events.push((app_event, req_event.entity_type, entity_id));
    }

    // 2. Tạo oneshot channel để nhận phản hồi từ Worker (Persistence confirmation)
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();

    // 3. Đẩy batch vào Actor Queue
    let command = WorkerCommand::SaveBatch {
        project_id: parsed_project_id,
        events: mapped_events,
        reply_tx,
    };

    if let Err(e) = sender.send(command).await {
        error!("[IPC] Worker channel closed: {}", e);
        return Err("Database Worker is offline".into());
    }

    // 4. Chờ xác nhận từ đĩa (với async await, không block main thread)
    match reply_rx.await {
        Ok(Ok(saved_ids)) => {
            debug!("[IPC] Batch persisted: {} events", saved_ids.len());
            Ok(saved_ids.into_iter().map(|id| id.to_string()).collect())
        }
        Ok(Err(e)) => {
            error!("[IPC] Worker transaction failed: {}", e);
            Err(e)
        }
        Err(e) => {
            error!("[IPC] Worker dropped response: {}", e);
            Err("Database transaction timeout or crash".into())
        }
    }
}
