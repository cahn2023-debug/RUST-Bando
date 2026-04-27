use crate::implement::commands::helpers::{
    active_v2_sender, get_db_connection, project_id_to_uuid, send_v2_event,
};
use crate::implement::db::DatabaseState;
use crate::implement::modules::core::active_pmp::ActivePmpState;
use crate::implement::modules::core::audit;
use crate::implement::modules::v2::events::AppEvent;
use rusqlite::params;
use serde_json::json;
use uuid::Uuid;

use super::models::Contract;

#[tauri::command]
pub async fn get_contracts(
    state: tauri::State<'_, DatabaseState>,
    #[allow(non_snake_case)] projectId: String,
) -> Result<Vec<Contract>, String> {
    let guard = get_db_connection(&state)?;
    let conn = guard.as_ref().ok_or("No project opened")?;
    let mut stmt = conn
        .prepare(
            "SELECT id,
                    project_id,
                    CAST(name AS TEXT),
                    CAST(contract_number AS TEXT),
                    CAST(vendor AS TEXT),
                    value,
                    CAST(signed_date AS TEXT),
                    CAST(notes AS TEXT),
                    CAST(file_path AS TEXT),
                    created_at,
                    (metadata_json IS NOT NULL) as has_analysis
             FROM contracts
             WHERE project_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let contracts_iter = stmt
        .query_map(params![projectId], |row| {
            Ok(Contract {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                contract_number: row.get(3)?,
                vendor: row.get(4)?,
                value: row.get(5)?,
                signed_date: row.get(6)?,
                notes: row.get(7)?,
                file_path: row.get(8)?,
                created_at: row.get(9)?,
                has_analysis: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut contracts = Vec::new();
    for contract_result in contracts_iter {
        contracts.push(contract_result.map_err(|e| e.to_string())?);
    }
    Ok(contracts)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn create_contract(
    active_pmp: tauri::State<'_, ActivePmpState>,
    state: tauri::State<'_, DatabaseState>,
    #[allow(non_snake_case)] projectId: String,
    name: String,
    #[allow(non_snake_case)] contractNumber: Option<String>,
    vendor: Option<String>,
    value: Option<f64>,
    #[allow(non_snake_case)] signedDate: Option<String>,
    notes: Option<String>,
    #[allow(non_snake_case)] filePath: Option<String>,
) -> Result<String, String> {
    let sender = active_v2_sender(&active_pmp)?;
    let proj_uuid = project_id_to_uuid(&projectId)?;
    let entity_id = Uuid::new_v4();

    let mut metadata_map = serde_json::Map::new();
    if let Some(v) = value {
        metadata_map.insert("value".to_string(), json!(v));
    }
    if let Some(s) = signedDate {
        metadata_map.insert("signed_date".to_string(), json!(s));
    }
    if let Some(n) = notes {
        metadata_map.insert("notes".to_string(), json!(n));
    }
    if let Some(fp) = filePath {
        metadata_map.insert("file_path".to_string(), json!(fp.replace("\\", "/")));
    }

    send_v2_event(
        &sender,
        proj_uuid,
        "contract",
        entity_id,
        AppEvent::ContractCreated {
            name: name.clone(),
            contract_number: contractNumber.unwrap_or_default(),
            vendor: vendor.clone(),
            metadata: serde_json::Value::Object(metadata_map),
        },
    )
    .await?;

    let guard = get_db_connection(&state)?;
    let conn = guard.as_ref().ok_or("No project opened")?;
    let _ = audit::log_event(
        conn,
        &projectId,
        None,
        "CREATE_CONTRACT",
        "contracts",
        &entity_id.to_string(),
        None,
        Some(json!({ "name": name, "vendor": vendor, "value": value })),
    );

    Ok(entity_id.to_string())
}

#[tauri::command]
pub async fn delete_contract(
    active_pmp: tauri::State<'_, ActivePmpState>,
    state: tauri::State<'_, DatabaseState>,
    #[allow(non_snake_case)] contractId: String,
) -> Result<(), String> {
    let sender = active_v2_sender(&active_pmp)?;
    let project_id = active_pmp.project_id_string()?;
    let proj_uuid = project_id_to_uuid(&project_id)?;
    let entity_uuid = Uuid::parse_str(&contractId).map_err(|e| e.to_string())?;

    send_v2_event(
        &sender,
        proj_uuid,
        "contract",
        entity_uuid,
        AppEvent::ContractDeleted { id: entity_uuid },
    )
    .await?;

    {
        let guard = get_db_connection(&state)?;
        let conn = guard.as_ref().ok_or("No project opened")?;
        let _ = audit::log_event(
            conn,
            &project_id,
            None,
            "DELETE_CONTRACT",
            "contracts",
            &contractId,
            None,
            None,
        );
    }

    Ok(())
}
