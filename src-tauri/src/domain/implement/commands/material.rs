use crate::implement::commands::helpers::{
    active_v2_sender, get_db_connection, project_id_to_uuid, send_v2_event,
};
use crate::implement::commands::models::{Material, WorkItem};
use crate::implement::db::DatabaseState;
use crate::implement::modules::core::active_pmp::ActivePmpState;
use crate::implement::modules::core::audit;
use crate::implement::modules::v2::events::AppEvent;
use rusqlite::params;
use serde_json::json;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_materials(state: State<'_, DatabaseState>) -> Result<Vec<Material>, String> {
    let guard = get_db_connection(&state)?;
    let conn = guard.as_ref().ok_or("Database not opened")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, code, unit, base_price, category, created_at
             FROM materials
             ORDER BY category, name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Material {
                id: row.get(0)?,
                name: row.get(1)?,
                code: row.get(2)?,
                unit: row.get(3)?,
                base_price: row.get(4)?,
                category: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|row| row.ok()).collect())
}

#[tauri::command]
pub async fn create_material(
    active_pmp: State<'_, ActivePmpState>,
    state: State<'_, DatabaseState>,
    name: String,
    code: Option<String>,
    unit: Option<String>,
    base_price: f64,
    category: Option<String>,
) -> Result<String, String> {
    let sender = active_v2_sender(&active_pmp)?;
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_id = Uuid::new_v4();

    let mut metadata_map = serde_json::Map::new();
    if let Some(unit) = unit {
        metadata_map.insert("unit".to_string(), json!(unit));
    }
    metadata_map.insert("base_price".to_string(), json!(base_price));
    if let Some(category) = category {
        metadata_map.insert("category".to_string(), json!(category));
    }

    send_v2_event(
        &sender,
        proj_uuid,
        "material",
        entity_id,
        AppEvent::MaterialCreated {
            name: name.clone(),
            code: code.unwrap_or_default(),
            metadata: serde_json::Value::Object(metadata_map),
        },
    )
    .await?;

    let guard = get_db_connection(&state)?;
    let conn = guard.as_ref().ok_or("Database not opened")?;
    let _ = audit::log_event(
        conn,
        &project_id,
        None,
        "CREATE_MATERIAL",
        "materials",
        &entity_id.to_string(),
        None,
        Some(json!({ "name": name, "price": base_price })),
    );

    Ok(entity_id.to_string())
}

#[tauri::command]
pub async fn delete_material(
    active_pmp: State<'_, ActivePmpState>,
    id: String,
) -> Result<(), String> {
    let sender = active_v2_sender(&active_pmp)?;
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;

    send_v2_event(
        &sender,
        proj_uuid,
        "material",
        entity_uuid,
        AppEvent::MaterialDeleted { id: entity_uuid },
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn list_work_items(
    state: State<'_, DatabaseState>,
    #[allow(non_snake_case)] projectId: String,
) -> Result<Vec<WorkItem>, String> {
    let guard = get_db_connection(&state)?;
    let conn = guard.as_ref().ok_or("Database not opened")?;

    let mut stmt = conn
        .prepare(
            "SELECT id,
                    project_id,
                    feature_id,
                    name,
                    material_id,
                    quantity,
                    unit_price,
                    total_price,
                    status,
                    created_at
             FROM work_items
             WHERE project_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![projectId], |row| {
            Ok(WorkItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                feature_id: row.get(2)?,
                name: row.get(3)?,
                material_id: row.get(4)?,
                quantity: row.get(5)?,
                unit_price: row.get(6)?,
                total_price: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|row| row.ok()).collect())
}

#[tauri::command]
pub async fn add_work_item(
    active_pmp: State<'_, ActivePmpState>,
    state: State<'_, DatabaseState>,
    #[allow(non_snake_case)] projectId: String,
    #[allow(non_snake_case)] featureId: Option<String>,
    name: String,
    #[allow(non_snake_case)] materialId: Option<String>,
    quantity: f64,
    #[allow(non_snake_case)] unitPrice: f64,
) -> Result<String, String> {
    let sender = active_v2_sender(&active_pmp)?;
    let proj_uuid = project_id_to_uuid(&projectId)?;
    let entity_id = Uuid::new_v4();

    let feat_uuid = featureId
        .as_deref()
        .and_then(|value| Uuid::parse_str(value).ok());

    let mat_uuid = if let Some(ref material_id) = materialId {
        Some(Uuid::parse_str(material_id).map_err(|e| e.to_string())?)
    } else {
        None
    };

    let total_price = quantity * unitPrice;

    send_v2_event(
        &sender,
        proj_uuid,
        "work_item",
        entity_id,
        AppEvent::WorkItemCreated {
            feature_id: feat_uuid.unwrap_or_default(),
            material_id: mat_uuid.unwrap_or_default(),
            name: name.clone(),
            quantity,
            unit_price: unitPrice,
            metadata: json!({ "total_price": total_price }),
        },
    )
    .await?;

    let guard = get_db_connection(&state)?;
    let conn = guard.as_ref().ok_or("Database not opened")?;
    let _ = audit::log_event(
        conn,
        &projectId,
        None,
        "ADD_WORK_ITEM",
        "work_items",
        &entity_id.to_string(),
        None,
        Some(json!({ "name": name, "total": total_price })),
    );

    Ok(entity_id.to_string())
}

#[tauri::command]
pub async fn delete_work_item(
    active_pmp: State<'_, ActivePmpState>,
    id: String,
) -> Result<(), String> {
    let sender = active_v2_sender(&active_pmp)?;
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;

    send_v2_event(
        &sender,
        proj_uuid,
        "work_item",
        entity_uuid,
        AppEvent::WorkItemDeleted { id: entity_uuid },
    )
    .await?;

    Ok(())
}
