use crate::domain::implement::commands::v2::ActorState;
use crate::domain::implement::modules::v2::pipeline::eventbus::StorageCommand;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::State;
use url::Url;

const FULL_FEATURE_HYDRATION_LIMIT: i64 = 10_000;
const VIEWPORT_FEATURE_LIMIT: i64 = 10_000;

fn should_include_features(requested: Option<bool>, feature_count: i64) -> bool {
    requested.unwrap_or(feature_count <= FULL_FEATURE_HYDRATION_LIMIT)
}

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

fn feature_count_in_state(state: &Value) -> Option<i64> {
    state
        .get("features")
        .and_then(Value::as_object)
        .map(|features| features.len() as i64)
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
            for key in ["featureCount", "isLargeProject", "viewportFeatureLimit"] {
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

async fn map_revision_for_project(state: &ActorState, project_id: &str) -> Result<i64, String> {
    let rows = exec_query(
        state,
        "SELECT COALESCE(MAX(global_seq), 0) AS map_revision FROM events WHERE project_id = ?1",
        vec![project_id.to_string()],
    )
    .await?;
    Ok(row_array(rows)
        .first()
        .and_then(|row| row.get("map_revision"))
        .and_then(Value::as_i64)
        .unwrap_or(0))
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
    include_features: bool,
    feature_count: i64,
) -> Result<Value, String> {
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
    if include_features {
        let features = exec_query(
            state,
            "SELECT id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json, bbox_json FROM features WHERE project_id = ?1 ORDER BY created_at, id",
            vec![project_id.to_string()],
        )
        .await?;
        for row in row_array(features) {
            if let Some(id) = row.get("id").and_then(Value::as_str) {
                features_obj.insert(id.to_string(), feature_row_to_state(&row));
            }
        }
    }
    result_obj.insert("features".to_string(), Value::Object(features_obj));

    let settings_value = row_array(settings)
        .into_iter()
        .next()
        .and_then(|row| row.get("settings_json").cloned())
        .unwrap_or_else(|| json!({}));
    result_obj.insert("settings".to_string(), settings_value);
    result_obj.insert("featureCount".to_string(), json!(feature_count));
    result_obj.insert(
        "mapRevision".to_string(),
        json!(map_revision_for_project(state, project_id)
            .await
            .unwrap_or(0)),
    );
    result_obj.insert(
        "isLargeProject".to_string(),
        json!(!include_features && feature_count > 0),
    );
    result_obj.insert(
        "viewportFeatureLimit".to_string(),
        json!(VIEWPORT_FEATURE_LIMIT),
    );

    Ok(result)
}

fn parse_json_value(value: Option<&Value>, default: Value) -> Value {
    match value {
        Some(Value::String(text)) => serde_json::from_str(text).unwrap_or(default),
        Some(Value::Null) | None => default,
        Some(other) => other.clone(),
    }
}

fn bbox_value_to_state(value: Option<&Value>) -> Value {
    let parsed = parse_json_value(value, Value::Null);
    if let Some(arr) = parsed.as_array() {
        if arr.len() == 4 {
            return json!({
                "min_x": arr[0].clone(),
                "min_y": arr[1].clone(),
                "max_x": arr[2].clone(),
                "max_y": arr[3].clone(),
            });
        }
    }
    parsed
}

fn feature_row_to_state(row: &Value) -> Value {
    let metadata = row
        .get("metadata_json")
        .map(normalize_metadata_to_string)
        .unwrap_or_else(|| "{}".to_string());
    json!({
        "id": row.get("id").cloned().unwrap_or(Value::Null),
        "layer_id": row.get("layer_id").cloned().unwrap_or(Value::Null),
        "group_id": row.get("group_id").cloned().unwrap_or(Value::Null),
        "name": row.get("name").cloned().unwrap_or_else(|| json!("Untitled Feature")),
        "geom_type": row.get("geom_type").cloned().unwrap_or_else(|| json!("Point")),
        "coordinates": parse_json_value(row.get("coordinates_json"), Value::Null),
        "properties": parse_json_value(row.get("properties_json"), json!({})),
        "metadata": metadata,
        "bbox": bbox_value_to_state(row.get("bbox_json")),
    })
}

fn fast_feature_row_to_state(row: &Value) -> Value {
    let metadata = parse_json_value(row.get("metadata_json"), json!({}));
    let metadata_string = row
        .get("metadata_json")
        .map(normalize_metadata_to_string)
        .unwrap_or_else(|| "{}".to_string());
    let properties = parse_json_value(row.get("properties_json"), json!({}));
    let gis = metadata
        .get("gis")
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| json!({}));
    json!({
        "id": row.get("id").cloned().unwrap_or(Value::Null),
        "layer_id": row.get("layer_id").cloned().unwrap_or(Value::Null),
        "group_id": row.get("group_id").cloned().unwrap_or(Value::Null),
        "name": row.get("name").cloned().unwrap_or_else(|| json!("Untitled Feature")),
        "geom_type": row.get("geom_type").cloned().unwrap_or_else(|| json!("Point")),
        "coordinates": parse_json_value(row.get("coordinates_json"), Value::Null),
        "properties": {
            "color": gis.get("color")
                .or_else(|| metadata.get("color"))
                .or_else(|| properties.get("color"))
                .cloned()
                .unwrap_or(Value::Null),
            "size": gis.get("size")
                .or_else(|| gis.get("weight"))
                .or_else(|| metadata.get("size"))
                .or_else(|| metadata.get("weight"))
                .cloned()
                .unwrap_or(Value::Null),
            "icon": metadata.get("icon")
                .or_else(|| properties.get("icon"))
                .cloned()
                .unwrap_or(Value::Null),
        },
        "metadata": metadata_string,
        "bbox": bbox_value_to_state(row.get("bbox_json")),
    })
}

#[derive(Debug, Clone, Deserialize)]
pub struct ViewportBounds {
    s: Option<f64>,
    n: Option<f64>,
    w: Option<f64>,
    e: Option<f64>,
    south: Option<f64>,
    north: Option<f64>,
    west: Option<f64>,
    east: Option<f64>,
}

impl ViewportBounds {
    fn normalized(&self) -> Result<(f64, f64, f64, f64), String> {
        let south = self
            .s
            .or(self.south)
            .ok_or_else(|| "Missing south bound".to_string())?;
        let north = self
            .n
            .or(self.north)
            .ok_or_else(|| "Missing north bound".to_string())?;
        let west = self
            .w
            .or(self.west)
            .ok_or_else(|| "Missing west bound".to_string())?;
        let east = self
            .e
            .or(self.east)
            .ok_or_else(|| "Missing east bound".to_string())?;
        Ok((
            south.min(north),
            south.max(north),
            west.min(east),
            west.max(east),
        ))
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
    include_features: Option<bool>,
    includeFeatures: Option<bool>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let feature_count_rows = exec_query(
        &state,
        "SELECT COUNT(*) AS feature_count FROM features WHERE project_id = ?1",
        vec![project_id.clone()],
    )
    .await?;
    let feature_count = row_array(feature_count_rows)
        .first()
        .and_then(|row| row.get("feature_count"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let include_features =
        should_include_features(include_features.or(includeFeatures), feature_count);
    let read_model_state = ensure_design_shape(
        load_design_state_from_tables(&state, &project_id, include_features, feature_count).await?,
    );
    if has_design_data(&read_model_state) {
        if include_features {
            let snapshot_rows = exec_query(
                &state,
                "SELECT state_json FROM project_snapshots WHERE project_id = ?1",
                vec![project_id.clone()],
            )
            .await?;
            let snapshot_state = ensure_design_shape(extract_project_metadata(&json!([{
                "metadata_json": snapshot_rows
                    .as_array()
                    .and_then(|items| items.first())
                    .and_then(|item| item.get("state_json"))
                    .cloned()
                    .unwrap_or_else(|| json!({}))
            }])));
            let snapshot_feature_count = feature_count_in_state(&snapshot_state);
            let table_feature_count = feature_count_in_state(&read_model_state);
            if snapshot_feature_count != table_feature_count {
                log::info!(
                    "[V2] Rebuilding project snapshot from tables for {} (snapshot_features={:?}, table_features={:?})",
                    project_id,
                    snapshot_feature_count,
                    table_feature_count
                );
                let (tx, rx) = tokio::sync::oneshot::channel();
                state
                    .gateway_tx
                    .send(StorageCommand::UpdateProjectState {
                        project_id: project_id.clone(),
                        state: read_model_state.clone(),
                        reply: tx,
                    })
                    .await
                    .map_err(|e| e.to_string())?;
                rx.await.map_err(|e| e.to_string())??;
            }
        }
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
#[allow(clippy::too_many_arguments)]
pub async fn query_visible_features_v2(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    bounds: ViewportBounds,
    zoom: Option<f64>,
    hidden_ids: Option<Vec<String>>,
    hiddenIds: Option<Vec<String>>,
    limit: Option<i64>,
    fast_payload: Option<bool>,
    fastPayload: Option<bool>,
    revision: Option<i64>,
    request_id: Option<i64>,
    requestId: Option<i64>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let (south, north, west, east) = bounds.normalized()?;
    let effective_limit = limit
        .unwrap_or(VIEWPORT_FEATURE_LIMIT)
        .clamp(1, VIEWPORT_FEATURE_LIMIT);
    let hidden: std::collections::BTreeSet<String> = hidden_ids
        .or(hiddenIds)
        .unwrap_or_default()
        .into_iter()
        .collect();
    let use_fast_payload = fast_payload.or(fastPayload).unwrap_or(false);

    let total_rows = exec_query(
        &state,
        "SELECT COUNT(*) AS total
         FROM feature_rtree r
         CROSS JOIN features f ON f.rowid = r.rowid
         WHERE f.project_id = ?1
           AND r.max_x >= ?2 AND r.min_x <= ?3
           AND r.max_y >= ?4 AND r.min_y <= ?5",
        vec![
            project_id.clone(),
            west.to_string(),
            east.to_string(),
            south.to_string(),
            north.to_string(),
        ],
    )
    .await?;
    let total = row_array(total_rows)
        .first()
        .and_then(|row| row.get("total"))
        .and_then(Value::as_i64)
        .unwrap_or(0);

    let rows = exec_query(
        &state,
        "SELECT f.id, f.layer_id, f.group_id, f.name, f.geom_type, f.coordinates_json,
                f.properties_json, f.metadata_json, f.bbox_json
         FROM feature_rtree r
         CROSS JOIN features f ON f.rowid = r.rowid
         WHERE f.project_id = ?1
           AND r.max_x >= ?2 AND r.min_x <= ?3
           AND r.max_y >= ?4 AND r.min_y <= ?5
         ORDER BY f.created_at, f.id
         LIMIT ?6",
        vec![
            project_id.clone(),
            west.to_string(),
            east.to_string(),
            south.to_string(),
            north.to_string(),
            effective_limit.to_string(),
        ],
    )
    .await?;

    let mut features = Vec::new();
    for row in row_array(rows) {
        let id = row.get("id").and_then(Value::as_str).unwrap_or_default();
        let group_id = row
            .get("group_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let layer_id = row
            .get("layer_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if hidden.contains(id) || hidden.contains(group_id) || hidden.contains(layer_id) {
            continue;
        }
        features.push(if use_fast_payload {
            fast_feature_row_to_state(&row)
        } else {
            feature_row_to_state(&row)
        });
    }

    Ok(json!({
        "features": features,
        "total": total,
        "returned": features.len(),
        "truncated": total > effective_limit,
        "limit": effective_limit,
        "zoom": zoom,
        "revision": revision.unwrap_or(map_revision_for_project(&state, &project_id).await.unwrap_or(0)),
        "requestId": request_id.or(requestId),
    }))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_map_tile_v2(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    revision: i64,
    z: i64,
    x: i64,
    y: i64,
) -> Result<Vec<u8>, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::GetMapTile {
            project_id,
            revision,
            z,
            x,
            y,
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(non_snake_case)]
#[allow(clippy::too_many_arguments)]
pub async fn build_map_tiles_v2(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    revision: i64,
    min_zoom: Option<i64>,
    minZoom: Option<i64>,
    max_zoom: Option<i64>,
    maxZoom: Option<i64>,
    bounds: Option<[f64; 4]>,
    tile_limit: Option<i64>,
    tileLimit: Option<i64>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::BuildMapTiles {
            project_id,
            revision,
            min_zoom: min_zoom.or(minZoom).unwrap_or(8),
            max_zoom: max_zoom.or(maxZoom).unwrap_or(16),
            bounds,
            tile_limit: tile_limit.or(tileLimit),
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(12), rx)
        .await
        .map_err(|_| "build_map_tiles_v2 timeout".to_string())?
        .map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn invalidate_map_tiles_v2(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    revision: Option<i64>,
    bbox: Option<[f64; 4]>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .gateway_tx
        .send(StorageCommand::InvalidateMapTiles {
            project_id,
            revision,
            bbox,
            reply: tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_feature_detail_v2(
    state: State<'_, ActorState>,
    project_id: Option<String>,
    projectId: Option<String>,
    feature_id: Option<String>,
    featureId: Option<String>,
) -> Result<Value, String> {
    let project_id = project_id
        .or(projectId)
        .ok_or_else(|| "Missing project_id".to_string())?;
    let feature_id = feature_id
        .or(featureId)
        .ok_or_else(|| "Missing feature_id".to_string())?;
    let rows = exec_query(
        &state,
        "SELECT id, layer_id, group_id, name, geom_type, coordinates_json, properties_json, metadata_json, bbox_json
         FROM features
         WHERE project_id = ?1 AND id = ?2
         LIMIT 1",
        vec![project_id, feature_id],
    )
    .await?;
    row_array(rows)
        .first()
        .map(feature_row_to_state)
        .ok_or_else(|| "Feature not found".to_string())
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
pub async fn capture_webview_png(app: tauri::AppHandle, label: String) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use std::sync::{Arc, Mutex};
        use tauri::Manager;
        use tokio::sync::oneshot;

        let window = app
            .get_webview_window(&label)
            .ok_or_else(|| format!("Webview not found: {}", label))?;

        let (tx, rx) = oneshot::channel::<Result<String, String>>();
        let tx = Arc::new(Mutex::new(Some(tx)));

        window.with_webview(move |webview| {
            unsafe {
                use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG;
                use windows::Win32::Foundation::HGLOBAL;
                use windows::Win32::System::Com::StructuredStorage::{CreateStreamOnHGlobal, GetHGlobalFromStream};
                use windows_sys::Win32::System::Memory::{GlobalLock, GlobalUnlock, GlobalSize};

                let stream = match CreateStreamOnHGlobal(HGLOBAL(std::ptr::null_mut()), true) {
                    Ok(stream) => stream,
                    Err(e) => {
                        if let Ok(mut sender) = tx.lock() {
                            if let Some(sender) = sender.take() {
                                let _ = sender.send(Err(format!("Failed to create IStream: {:?}", e)));
                            }
                        }
                        return;
                    }
                };

                let controller = webview.controller();

                let handler_tx = Arc::clone(&tx);
                let stream_for_handler = stream.clone();
                let handler = webview2_com::CapturePreviewCompletedHandler::create(Box::new(move |res| {
                    if res.is_err() {
                        if let Ok(mut sender) = handler_tx.lock() {
                            if let Some(sender) = sender.take() {
                                let _ = sender.send(Err("CapturePreview failed".into()));
                            }
                        }
                        return Ok(());
                    }
                    if let Ok(hglobal) = GetHGlobalFromStream(&stream_for_handler) {
                        let size = GlobalSize(hglobal.0);
                        let ptr = GlobalLock(hglobal.0) as *const u8;
                        if !ptr.is_null() && size > 0 {
                            let bytes = std::slice::from_raw_parts(ptr, size as usize);
                            let base64_str = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
                            GlobalUnlock(hglobal.0);
                            let data_url = format!("data:image/png;base64,{}", base64_str);
                            if let Ok(mut sender) = handler_tx.lock() {
                                if let Some(sender) = sender.take() {
                                    let _ = sender.send(Ok(data_url));
                                }
                            }
                            return Ok(());
                        }
                    }
                    if let Ok(mut sender) = handler_tx.lock() {
                        if let Some(sender) = sender.take() {
                            let _ = sender.send(Err("Failed to read captured stream".into()));
                        }
                    }
                    Ok(())
                }));

                if let Ok(core) = controller.CoreWebView2() {
                    if let Err(e) = core.CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, &stream, &handler) {
                        if let Ok(mut sender) = tx.lock() {
                            if let Some(sender) = sender.take() {
                                let _ = sender.send(Err(format!("CapturePreview error: {:?}", e)));
                            }
                        }
                    }
                } else {
                    if let Ok(mut sender) = tx.lock() {
                        if let Some(sender) = sender.take() {
                            let _ = sender.send(Err("Failed to get CoreWebView2".into()));
                        }
                    }
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

    #[test]
    fn fast_feature_row_to_state_keeps_render_fields_and_metadata() {
        let row = json!({
            "id": "feature-1",
            "layer_id": "layer-1",
            "group_id": "group-1",
            "name": "Camera 1",
            "geom_type": "Point",
            "coordinates_json": "[105.8,21.02]",
            "properties_json": "{\"color\":\"#111111\"}",
            "metadata_json": "{\"gis\":{\"color\":\"#22d3ee\",\"weight\":6},\"heavy\":\"ignored\"}",
            "bbox_json": "[105.8,21.02,105.8,21.02]"
        });

        let out = fast_feature_row_to_state(&row);

        assert_eq!(out.get("id").and_then(Value::as_str), Some("feature-1"));
        assert_eq!(
            out.pointer("/properties/color").and_then(Value::as_str),
            Some("#22d3ee")
        );
        assert_eq!(
            out.pointer("/properties/size").and_then(Value::as_i64),
            Some(6)
        );
        let metadata = out.get("metadata").and_then(Value::as_str).unwrap_or("{}");
        let metadata_value: Value = serde_json::from_str(metadata).unwrap();
        assert_eq!(
            metadata_value.pointer("/gis/color").and_then(Value::as_str),
            Some("#22d3ee")
        );
        assert_eq!(metadata_value.get("heavy").and_then(Value::as_str), Some("ignored"));
        assert!(out.get("coordinates").and_then(Value::as_array).is_some());
        assert!(out.get("bbox").and_then(Value::as_object).is_some());
    }

    #[test]
    fn include_features_defaults_to_viewport_mode_above_limit() {
        assert!(should_include_features(None, FULL_FEATURE_HYDRATION_LIMIT));
        assert!(!should_include_features(
            None,
            FULL_FEATURE_HYDRATION_LIMIT + 1
        ));
        assert!(!should_include_features(Some(false), 269));
        assert!(should_include_features(
            Some(true),
            FULL_FEATURE_HYDRATION_LIMIT + 1
        ));
    }

    #[tokio::test]
    async fn loading_design_state_without_features_skips_full_feature_query() {
        let (gateway_tx, mut gateway_rx) = tokio::sync::mpsc::channel(8);
        let state = ActorState { gateway_tx };
        let responder = tokio::spawn(async move {
            let mut statements = Vec::new();
            while statements.len() < 5 {
                let command = gateway_rx.recv().await.expect("storage query");
                match command {
                    StorageCommand::Query { sql, reply, .. } => {
                        statements.push(sql);
                        reply.send(Ok(json!([]))).expect("query reply");
                    }
                    other => panic!("unexpected storage command: {other:?}"),
                }
            }
            statements
        });

        let state_value = load_design_state_from_tables(&state, "project-1", false, 269)
            .await
            .expect("load state");
        let statements = responder.await.expect("query responder");

        assert_eq!(state_value.get("features"), Some(&json!({})));
        assert_eq!(
            state_value.get("featureCount").and_then(Value::as_i64),
            Some(269)
        );
        assert_eq!(
            state_value.get("isLargeProject").and_then(Value::as_bool),
            Some(true)
        );
        assert!(statements.iter().all(|sql| {
            !sql.contains(
                "coordinates_json, properties_json, metadata_json, bbox_json FROM features",
            )
        }));
    }

    #[tokio::test]
    async fn loading_design_state_never_issues_destructive_cleanup_queries() {
        let (gateway_tx, mut gateway_rx) = tokio::sync::mpsc::channel(8);
        let state = ActorState { gateway_tx };
        let responder = tokio::spawn(async move {
            let mut statements = Vec::new();
            while statements.len() < 5 {
                let command = gateway_rx.recv().await.expect("storage query");
                match command {
                    StorageCommand::Query { sql, reply, .. } => {
                        statements.push(sql);
                        reply.send(Ok(json!([]))).expect("query reply");
                    }
                    other => panic!("unexpected storage command: {other:?}"),
                }
            }
            statements
        });

        let state_value = load_design_state_from_tables(&state, "project-1", true, 0)
            .await
            .expect("load state");
        let statements = responder.await.expect("query responder");

        assert_eq!(state_value.get("features"), Some(&json!({})));
        assert_eq!(
            state_value.get("featureCount").and_then(Value::as_i64),
            Some(0)
        );
        assert_eq!(
            state_value.get("isLargeProject").and_then(Value::as_bool),
            Some(false)
        );
        assert!(statements
            .iter()
            .all(|sql| sql.trim_start().starts_with("SELECT")));
    }
}
