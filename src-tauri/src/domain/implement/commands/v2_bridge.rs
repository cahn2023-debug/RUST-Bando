use crate::domain::implement::commands::v2::ActorState;
use crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand;
use serde_json::{json, Value};
use tauri::State;
use url::Url;

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

async fn resolve_fiber_cable_scope(
    state: &ActorState,
    project_id: &str,
    cable_id: Option<&str>,
    feature_id: Option<&str>,
) -> Result<Option<String>, String> {
    if let Some(cable_id) = cable_id {
        return Ok(Some(cable_id.to_string()));
    }

    if let Some(feature_id) = feature_id {
        let rows = exec_query(
            state,
            "SELECT id FROM fiber_cables WHERE project_id = ?1 AND feature_id = ?2 LIMIT 1",
            vec![project_id.to_string(), feature_id.to_string()],
        )
        .await?;
        return Ok(rows
            .as_array()
            .and_then(|items| items.first())
            .and_then(|row| row.get("id"))
            .and_then(Value::as_str)
            .map(|value| value.to_string()));
    }

    Ok(None)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_fiber_inventory(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    cable_id: Option<String>,
    cableId: Option<String>,
    feature_id: Option<String>,
    featureId: Option<String>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let scope_cable_id = resolve_fiber_cable_scope(
        &state,
        &project_id,
        cable_id.as_deref().or(cableId.as_deref()),
        feature_id.as_deref().or(featureId.as_deref()),
    )
    .await?;
    let scope_feature_id = if let Some(cable_id) = scope_cable_id.as_deref() {
        exec_query(
            &state,
            "SELECT feature_id FROM fiber_cables WHERE id = ?1 LIMIT 1",
            vec![cable_id.to_string()],
        )
        .await?
        .as_array()
        .and_then(|items| items.first())
        .and_then(|row| row.get("feature_id"))
        .and_then(Value::as_str)
        .map(|value| value.to_string())
    } else {
        feature_id.or(featureId)
    };

    let cables_sql = if let Some(cable_id) = scope_cable_id.as_deref() {
        (
            "SELECT * FROM fiber_cables WHERE project_id = ?1 AND id = ?2 ORDER BY created_at, id",
            vec![project_id.clone(), cable_id.to_string()],
        )
    } else {
        (
            "SELECT * FROM fiber_cables WHERE project_id = ?1 ORDER BY created_at, id",
            vec![project_id.clone()],
        )
    };
    let cables = exec_query(&state, cables_sql.0, cables_sql.1).await?;

    let strands_sql = if let Some(cable_id) = scope_cable_id.as_deref() {
        (
            "SELECT * FROM fiber_strands WHERE cable_id = ?1 ORDER BY strand_no, id",
            vec![cable_id.to_string()],
        )
    } else {
        (
            "SELECT fs.* FROM fiber_strands fs INNER JOIN fiber_cables fc ON fc.id = fs.cable_id WHERE fc.project_id = ?1 ORDER BY fc.id, fs.strand_no, fs.id",
            vec![project_id.clone()],
        )
    };
    let strands = exec_query(&state, strands_sql.0, strands_sql.1).await?;

    let ports_sql = if let Some(feature_id) = scope_feature_id.as_deref() {
        (
            "SELECT * FROM fiber_ports WHERE feature_id = ?1 ORDER BY port_label, id",
            vec![feature_id.to_string()],
        )
    } else {
        (
            "SELECT fp.* FROM fiber_ports fp INNER JOIN features f ON f.id = fp.feature_id WHERE f.project_id = ?1 ORDER BY fp.feature_id, fp.port_label, fp.id",
            vec![project_id.clone()],
        )
    };
    let ports = exec_query(&state, ports_sql.0, ports_sql.1).await?;

    let port_terminations_sql = if let Some(feature_id) = scope_feature_id.as_deref() {
        (
            "SELECT fpt.* FROM fiber_port_terminations fpt INNER JOIN fiber_ports fp ON fp.id = fpt.port_id WHERE fp.feature_id = ?1 ORDER BY fp.port_label, fpt.side, fpt.id",
            vec![feature_id.to_string()],
        )
    } else {
        (
            "SELECT fpt.* FROM fiber_port_terminations fpt INNER JOIN fiber_ports fp ON fp.id = fpt.port_id INNER JOIN features f ON f.id = fp.feature_id WHERE f.project_id = ?1 ORDER BY fp.feature_id, fp.port_label, fpt.id",
            vec![project_id.clone()],
        )
    };
    let port_terminations =
        exec_query(&state, port_terminations_sql.0, port_terminations_sql.1).await?;

    let port_patches_sql = if let Some(feature_id) = scope_feature_id.as_deref() {
        (
            "SELECT fpp.* FROM fiber_port_patches fpp INNER JOIN fiber_ports fp1 ON fp1.id = fpp.from_port_id INNER JOIN fiber_ports fp2 ON fp2.id = fpp.to_port_id WHERE fp1.feature_id = ?1 OR fp2.feature_id = ?1 ORDER BY fpp.created_at, fpp.id",
            vec![feature_id.to_string()],
        )
    } else {
        (
            "SELECT fpp.* FROM fiber_port_patches fpp INNER JOIN fiber_ports fp ON fp.id = fpp.from_port_id INNER JOIN features f ON f.id = fp.feature_id WHERE f.project_id = ?1 ORDER BY fpp.created_at, fpp.id",
            vec![project_id.clone()],
        )
    };
    let port_patches = exec_query(&state, port_patches_sql.0, port_patches_sql.1).await?;

    let splices_sql = if let Some(feature_id) = scope_feature_id.as_deref() {
        (
            "SELECT fs.* FROM fiber_splices fs WHERE fs.enclosure_feature_id = ?1 ORDER BY fs.created_at, fs.id",
            vec![feature_id.to_string()],
        )
    } else {
        (
            "SELECT fs.* FROM fiber_splices fs INNER JOIN features f ON f.id = fs.enclosure_feature_id WHERE f.project_id = ?1 ORDER BY fs.created_at, fs.id",
            vec![project_id.clone()],
        )
    };
    let splices = exec_query(&state, splices_sql.0, splices_sql.1).await?;

    let circuits_sql = if let Some(feature_id) = scope_feature_id.as_deref() {
        (
            "SELECT * FROM fiber_circuits WHERE project_id = ?1 AND (a_feature_id = ?2 OR z_feature_id = ?2) ORDER BY created_at, id",
            vec![project_id.clone(), feature_id.to_string()],
        )
    } else {
        (
            "SELECT * FROM fiber_circuits WHERE project_id = ?1 ORDER BY created_at, id",
            vec![project_id.clone()],
        )
    };
    let circuits = exec_query(&state, circuits_sql.0, circuits_sql.1).await?;

    let cable_points_sql = if let Some(cable_id) = scope_cable_id.as_deref() {
        (
            "SELECT * FROM fiber_cable_points WHERE project_id = ?1 AND cable_id = ?2 ORDER BY cable_id, sequence_no, point_kind, id",
            vec![project_id.clone(), cable_id.to_string()],
        )
    } else {
        (
            "SELECT * FROM fiber_cable_points WHERE project_id = ?1 ORDER BY cable_id, sequence_no, point_kind, id",
            vec![project_id.clone()],
        )
    };
    let cable_points = exec_query(&state, cable_points_sql.0, cable_points_sql.1).await?;

    let equipment_sql = if let Some(feature_id) = scope_feature_id.as_deref() {
        (
            "SELECT * FROM equipment WHERE project_id = ?1 AND feature_id = ?2 ORDER BY equipment_type, created_at, id",
            vec![project_id.clone(), feature_id.to_string()],
        )
    } else {
        (
            "SELECT * FROM equipment WHERE project_id = ?1 ORDER BY feature_id, equipment_type, created_at, id",
            vec![project_id.clone()],
        )
    };
    let equipment = exec_query(&state, equipment_sql.0, equipment_sql.1).await?;

    let strands_rows = row_array(strands.clone());
    let strand_total = strands_rows.len() as i64;
    let strand_reserved = strands_rows
        .iter()
        .filter(|row| row.get("status").and_then(Value::as_str) == Some("reserved"))
        .count() as i64;
    let strand_active = strands_rows
        .iter()
        .filter(|row| row.get("status").and_then(Value::as_str) == Some("active"))
        .count() as i64;
    let strand_damaged = strands_rows
        .iter()
        .filter(|row| row.get("status").and_then(Value::as_str) == Some("damaged"))
        .count() as i64;
    let strand_available = strands_rows
        .iter()
        .filter(|row| row.get("status").and_then(Value::as_str) == Some("available"))
        .count() as i64;

    Ok(json!({
        "project_id": project_id,
        "scope": {
            "cable_id": scope_cable_id,
            "feature_id": scope_feature_id,
        },
        "cables": row_array(cables),
        "strands": strands_rows,
        "ports": row_array(ports),
        "port_terminations": row_array(port_terminations),
        "port_patches": row_array(port_patches),
        "splices": row_array(splices),
        "circuits": row_array(circuits),
        "cable_points": row_array(cable_points),
        "equipment": row_array(equipment),
        "summary": {
            "total_strands": strand_total,
            "available_strands": strand_available,
            "reserved_strands": strand_reserved,
            "active_strands": strand_active,
            "damaged_strands": strand_damaged,
            "free_strands": strand_available,
        }
    }))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_fiber_cable_points(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    cable_id: Option<String>,
    cableId: Option<String>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let scope_cable_id = cable_id.or(cableId);
    let (sql, params) = if let Some(cable_id) = scope_cable_id {
        (
            "SELECT * FROM fiber_cable_points WHERE project_id = ?1 AND cable_id = ?2 ORDER BY cable_id, sequence_no, point_kind, id",
            vec![project_id, cable_id],
        )
    } else {
        (
            "SELECT * FROM fiber_cable_points WHERE project_id = ?1 ORDER BY cable_id, sequence_no, point_kind, id",
            vec![project_id],
        )
    };
    let rows = exec_query(&state, sql, params).await?;
    Ok(json!({ "items": row_array(rows) }))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_fiber_capacity(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    cable_id: Option<String>,
    cableId: Option<String>,
    feature_id: Option<String>,
    featureId: Option<String>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let scope_cable_id = resolve_fiber_cable_scope(
        &state,
        &project_id,
        cable_id.as_deref().or(cableId.as_deref()),
        feature_id.as_deref().or(featureId.as_deref()),
    )
    .await?;

    let (sql, params) = if let Some(cable_id) = scope_cable_id.as_deref() {
        (
            "
            SELECT
                fc.id AS cable_id,
                fc.feature_id AS feature_id,
                fc.cable_type AS cable_type,
                fc.fiber_count AS fiber_count,
                COALESCE(SUM(CASE WHEN fs.status = 'available' THEN 1 ELSE 0 END), 0) AS available_count,
                COALESCE(SUM(CASE WHEN fs.status = 'reserved' THEN 1 ELSE 0 END), 0) AS reserved_count,
                COALESCE(SUM(CASE WHEN fs.status = 'active' THEN 1 ELSE 0 END), 0) AS active_count,
                COALESCE(SUM(CASE WHEN fs.status = 'damaged' THEN 1 ELSE 0 END), 0) AS damaged_count,
                COALESCE(SUM(CASE WHEN fs.status IN ('reserved', 'active', 'damaged') THEN 1 ELSE 0 END), 0) AS occupied_count,
                CASE
                    WHEN COALESCE(fc.fiber_count, 0) = 0 THEN 0
                    ELSE ROUND(
                        CAST(COALESCE(SUM(CASE WHEN fs.status IN ('reserved', 'active', 'damaged') THEN 1 ELSE 0 END), 0) AS REAL)
                        / CAST(fc.fiber_count AS REAL),
                        4
                    )
                END AS utilization
            FROM fiber_cables fc
            LEFT JOIN fiber_strands fs ON fs.cable_id = fc.id
            WHERE fc.project_id = ?1 AND fc.id = ?2
            GROUP BY fc.id
            ORDER BY fc.created_at, fc.id
            ",
            vec![project_id.clone(), cable_id.to_string()],
        )
    } else {
        (
            "
            SELECT
                fc.id AS cable_id,
                fc.feature_id AS feature_id,
                fc.cable_type AS cable_type,
                fc.fiber_count AS fiber_count,
                COALESCE(SUM(CASE WHEN fs.status = 'available' THEN 1 ELSE 0 END), 0) AS available_count,
                COALESCE(SUM(CASE WHEN fs.status = 'reserved' THEN 1 ELSE 0 END), 0) AS reserved_count,
                COALESCE(SUM(CASE WHEN fs.status = 'active' THEN 1 ELSE 0 END), 0) AS active_count,
                COALESCE(SUM(CASE WHEN fs.status = 'damaged' THEN 1 ELSE 0 END), 0) AS damaged_count,
                COALESCE(SUM(CASE WHEN fs.status IN ('reserved', 'active', 'damaged') THEN 1 ELSE 0 END), 0) AS occupied_count,
                CASE
                    WHEN COALESCE(fc.fiber_count, 0) = 0 THEN 0
                    ELSE ROUND(
                        CAST(COALESCE(SUM(CASE WHEN fs.status IN ('reserved', 'active', 'damaged') THEN 1 ELSE 0 END), 0) AS REAL)
                        / CAST(fc.fiber_count AS REAL),
                        4
                    )
                END AS utilization
            FROM fiber_cables fc
            LEFT JOIN fiber_strands fs ON fs.cable_id = fc.id
            WHERE fc.project_id = ?1
            GROUP BY fc.id
            ORDER BY fc.created_at, fc.id
            ",
            vec![project_id.clone()],
        )
    };

    let rows = exec_query(&state, sql, params).await?;
    Ok(json!({ "items": row_array(rows) }))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn trace_fiber_circuit(
    state: State<'_, ActorState>,
    circuit_id: Option<String>,
    circuitId: Option<String>,
) -> Result<Value, String> {
    let circuit_id = circuit_id
        .or(circuitId)
        .ok_or_else(|| "Missing circuit_id".to_string())?;
    let circuit_rows = exec_query(
        &state,
        "SELECT * FROM fiber_circuits WHERE id = ?1 LIMIT 1",
        vec![circuit_id.clone()],
    )
    .await?;
    let circuit = circuit_rows
        .as_array()
        .and_then(|items| items.first())
        .cloned()
        .unwrap_or(Value::Null);

    let hops = exec_query(
        &state,
        "SELECT * FROM fiber_circuit_hops WHERE circuit_id = ?1 ORDER BY sequence_no, created_at",
        vec![circuit_id.clone()],
    )
    .await?;
    let hop_rows = row_array(hops.clone());
    let strand_ids: Vec<String> = hop_rows
        .iter()
        .filter_map(|row| {
            row.get("strand_id")
                .and_then(Value::as_str)
                .map(|value| value.to_string())
        })
        .collect();
    let port_ids: Vec<String> = hop_rows
        .iter()
        .filter_map(|row| {
            row.get("port_id")
                .and_then(Value::as_str)
                .map(|value| value.to_string())
        })
        .collect();

    let strands = if strand_ids.is_empty() {
        json!([])
    } else {
        exec_query(
            &state,
            &format!(
                "SELECT * FROM fiber_strands WHERE id IN ({}) ORDER BY cable_id, strand_no, id",
                std::iter::repeat_n("?", strand_ids.len())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            strand_ids.clone(),
        )
        .await?
    };
    let ports = if port_ids.is_empty() {
        json!([])
    } else {
        exec_query(
            &state,
            &format!(
                "SELECT * FROM fiber_ports WHERE id IN ({}) ORDER BY feature_id, port_label, id",
                std::iter::repeat_n("?", port_ids.len())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            port_ids.clone(),
        )
        .await?
    };
    let splices = if strand_ids.is_empty() {
        json!([])
    } else {
        let mut splice_params = strand_ids.clone();
        splice_params.extend(strand_ids.clone());
        exec_query(
            &state,
            &format!(
                "SELECT * FROM fiber_splices WHERE from_strand_id IN ({0}) OR to_strand_id IN ({0}) ORDER BY created_at, id",
                std::iter::repeat_n("?", strand_ids.len())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            splice_params,
        )
        .await?
    };

    let diagnostics = trace_fiber_diagnostics(
        circuit.as_object(),
        &hop_rows,
        &row_array(strands.clone()),
        &row_array(ports.clone()),
        &row_array(splices.clone()),
    );

    Ok(json!({
        "circuit": circuit,
        "hops": hop_rows,
        "strands": row_array(strands),
        "ports": row_array(ports),
        "splices": row_array(splices),
        "diagnostics": diagnostics,
    }))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn validate_fiber_network(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    cable_id: Option<String>,
    cableId: Option<String>,
    feature_id: Option<String>,
    featureId: Option<String>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let inventory = get_fiber_inventory(
        state,
        Some(project_id.clone()),
        None,
        cable_id,
        cableId,
        feature_id,
        featureId,
    )
    .await?;
    let diagnostics = validate_fiber_inventory(&inventory);
    Ok(json!({
        "inventory": inventory,
        "diagnostics": diagnostics,
    }))
}

fn trace_fiber_diagnostics(
    circuit: Option<&serde_json::Map<String, Value>>,
    hops: &[Value],
    strands: &[Value],
    ports: &[Value],
    splices: &[Value],
) -> Vec<Value> {
    let mut diagnostics = Vec::new();
    if circuit.is_none() {
        diagnostics.push(json!({
            "type": "missing-circuit-endpoint",
            "message": "Circuit không tồn tại hoặc đã bị xoá",
        }));
        return diagnostics;
    }

    if hops.is_empty() {
        diagnostics.push(json!({
            "type": "missing-circuit-endpoint",
            "message": "Circuit chưa có hop nào",
        }));
    }

    if hops.iter().any(|hop| {
        hop.get("strand_id").and_then(Value::as_str).is_none()
            && hop.get("port_id").and_then(Value::as_str).is_none()
    }) {
        diagnostics.push(json!({
            "type": "broken-hop",
            "message": "Có hop không gắn strand hoặc port",
        }));
    }

    if strands
        .iter()
        .any(|strand| strand.get("status").and_then(Value::as_str) == Some("damaged"))
    {
        diagnostics.push(json!({
            "type": "damaged-strand",
            "message": "Circuit đi qua strand damaged",
        }));
    }

    let mut splice_keys = std::collections::HashSet::new();
    let has_duplicate_splice = splices.iter().any(|splice| {
        let key = format!(
            "{}:{}",
            splice
                .get("from_strand_id")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            splice
                .get("to_strand_id")
                .and_then(Value::as_str)
                .unwrap_or_default()
        );
        !splice_keys.insert(key)
    });
    if has_duplicate_splice {
        diagnostics.push(json!({
            "type": "duplicate-splice",
            "message": "Phát hiện splice trùng",
        }));
    }

    if ports.is_empty() {
        diagnostics.push(json!({
            "type": "missing-port",
            "message": "Circuit không có port nào",
        }));
    }

    diagnostics
}

fn validate_fiber_inventory(inventory: &Value) -> Vec<Value> {
    let mut diagnostics = Vec::new();
    let cables = inventory
        .get("cables")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let strands = inventory
        .get("strands")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let ports = inventory
        .get("ports")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let splices = inventory
        .get("splices")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let port_terminations = inventory
        .get("port_terminations")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let port_patches = inventory
        .get("port_patches")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let circuits = inventory
        .get("circuits")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let cable_points = inventory
        .get("cable_points")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for cable in cables {
        let cable_id = cable
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let cable_feature_id = cable.get("feature_id").cloned().unwrap_or(Value::Null);
        let fiber_count = cable
            .get("fiber_count")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let cable_strands: Vec<&Value> = strands
            .iter()
            .filter(|strand| {
                strand.get("cable_id").and_then(Value::as_str) == Some(cable_id.as_str())
            })
            .collect();
        let points_for_cable: Vec<&Value> = cable_points
            .iter()
            .filter(|point| {
                point.get("cable_id").and_then(Value::as_str) == Some(cable_id.as_str())
            })
            .collect();
        let has_start = points_for_cable
            .iter()
            .any(|point| point.get("point_kind").and_then(Value::as_str) == Some("cable_start"));
        let has_end = points_for_cable
            .iter()
            .any(|point| point.get("point_kind").and_then(Value::as_str) == Some("cable_end"));
        if points_for_cable.is_empty() {
            diagnostics.push(json!({
                "type": "unmaterialized-cable-points",
                "message": "Cable chưa materialize điểm đầu/cuối và măng xông",
                "cable_id": cable_id,
                "feature_id": cable_feature_id,
            }));
        } else if !has_start || !has_end {
            diagnostics.push(json!({
                "type": "missing-cable-point",
                "message": "Cable thiếu điểm đầu hoặc điểm cuối",
                "cable_id": cable_id,
                "feature_id": cable_feature_id,
            }));
        }
        if fiber_count > 0 && cable_strands.is_empty() {
            diagnostics.push(json!({
                "type": "uninitialized-cable",
                "message": "Cable chưa initialize strands",
                "cable_id": cable_id,
            }));
        }
    }

    for strand in &strands {
        if strand.get("status").and_then(Value::as_str) == Some("damaged") {
            diagnostics.push(json!({
                "type": "damaged-strand",
                "message": "Có strand damaged",
                "strand_id": strand.get("id").cloned().unwrap_or(Value::Null),
                "cable_id": strand.get("cable_id").cloned().unwrap_or(Value::Null),
            }));
        }
    }

    for circuit in &circuits {
        let circuit_id = circuit
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let a_feature_missing = circuit
            .get("a_feature_id")
            .and_then(Value::as_str)
            .map(|value| value.trim().is_empty())
            .unwrap_or(true);
        let z_feature_missing = circuit
            .get("z_feature_id")
            .and_then(Value::as_str)
            .map(|value| value.trim().is_empty())
            .unwrap_or(true);
        if a_feature_missing || z_feature_missing {
            diagnostics.push(json!({
                "type": "missing-circuit-endpoint",
                "message": "Circuit thiếu A/Z",
                "circuit_id": circuit_id,
            }));
        }
    }

    for splice in &splices {
        let from_id = splice
            .get("from_strand_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let to_id = splice
            .get("to_strand_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let from_direction = splice
            .get("from_direction")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let to_direction = splice
            .get("to_direction")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if from_id == to_id && from_direction == to_direction {
            diagnostics.push(json!({
                "type": "invalid-splice-loop",
                "message": "Splice tạo vòng không hợp lệ",
                "strand_id": from_id,
            }));
        }
    }

    for termination in &port_terminations {
        let port_id = termination
            .get("port_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let has_patch = port_patches.iter().any(|patch| {
            patch.get("from_port_id").and_then(Value::as_str) == Some(port_id)
                || patch.get("to_port_id").and_then(Value::as_str) == Some(port_id)
        });
        if !has_patch {
            diagnostics.push(json!({
                "type": "odf-one-side",
                "message": "ODF port da dau core nhung chua patch thong tuyen",
                "port_id": port_id,
                "strand_id": termination.get("strand_id").cloned().unwrap_or(Value::Null),
            }));
        }
    }

    if ports.is_empty() {
        diagnostics.push(json!({
            "type": "missing-port",
            "message": "Không có port fiber nào",
        }));
    }

    diagnostics
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

    let parsed_url = validate_webview_navigation(&label, &url)?;
    let webview = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    webview.navigate(parsed_url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn eval_webview(app: tauri::AppHandle, label: String, script: String) -> Result<(), String> {
    use tauri::Manager;

    if !webview_eval_enabled() {
        return Err("Webview script evaluation is disabled in this build".to_string());
    }

    let webview = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    webview.eval(&script).map_err(|e| e.to_string())
}

fn webview_eval_enabled() -> bool {
    cfg!(debug_assertions) || std::env::var("PMP_ALLOW_WEBVIEW_EVAL").as_deref() == Ok("1")
}

fn validate_webview_navigation(label: &str, url: &str) -> Result<Url, String> {
    if label != "street-view" {
        return Err("Webview navigation is only allowed for the street-view window".to_string());
    }

    let parsed =
        Url::parse(url).map_err(|e| format!("Invalid URL for webview navigation: {}", e))?;
    if parsed.scheme() != "https" {
        return Err("Webview navigation requires https".to_string());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "Webview navigation URL must include a host".to_string())?;
    let is_google_maps = host == "www.google.com" || host == "maps.google.com";
    if !is_google_maps {
        return Err(format!("Webview navigation host is not allowed: {host}"));
    }

    Ok(parsed)
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
pub async fn capture_webview_png(
    app: tauri::AppHandle,
    label: String,
) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        use tokio::sync::oneshot;

        let window = app
            .get_webview_window(&label)
            .ok_or_else(|| format!("Webview not found: {}", label))?;

        let (tx, rx) = oneshot::channel::<Result<String, String>>();

        window.with_webview(move |webview| {
            unsafe {
                use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG;
                use windows_sys::Win32::System::Com::{CreateStreamOnHGlobal, GetHGlobalFromStream};
                use windows_sys::Win32::System::Memory::{GlobalLock, GlobalUnlock, GlobalSize};

                let mut stream_ptr = std::ptr::null_mut();
                if CreateStreamOnHGlobal(std::ptr::null_mut(), 1, &mut stream_ptr) != 0 || stream_ptr.is_null() {
                    let _ = tx.send(Err("Failed to create IStream".into()));
                    return;
                }

                let stream: windows::Win32::System::Com::IStream = std::mem::transmute(stream_ptr);
                let controller = webview.controller();

                let handler = webview2_com::CapturePreviewCompletedHandler::create(Box::new(move |res| {
                    if res.is_err() {
                        let _ = tx.send(Err("CapturePreview failed".into()));
                        return Ok(());
                    }
                    let mut hglobal = std::ptr::null_mut();
                    if GetHGlobalFromStream(stream_ptr, &mut hglobal) == 0 && !hglobal.is_null() {
                        let size = GlobalSize(hglobal);
                        let ptr = GlobalLock(hglobal) as *const u8;
                        if !ptr.is_null() && size > 0 {
                            let bytes = std::slice::from_raw_parts(ptr, size as usize);
                            let base64_str = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
                            GlobalUnlock(hglobal);
                            let data_url = format!("data:image/png;base64,{}", base64_str);
                            let _ = tx.send(Ok(data_url));
                            return Ok(());
                        }
                    }
                    let _ = tx.send(Err("Failed to read captured stream".into()));
                    Ok(())
                }));

                if let Ok(core) = controller.CoreWebView2() {
                    if let Err(e) = core.CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, &stream, &handler) {
                        let _ = tx.send(Err(format!("CapturePreview error: {:?}", e)));
                    }
                } else {
                    let _ = tx.send(Err("Failed to get CoreWebView2".into()));
                }
            }
        }).map_err(|e| e.to_string())?;

        let data_url = rx.await.map_err(|e| e.to_string())??;
        Ok(json!({
            "dataUrl": data_url
        }))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = label;
        Err("Nền tảng chưa hỗ trợ".to_string())
    }
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
