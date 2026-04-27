use crate::contract::spatial_models::FeatureState;
use crate::implement::commands::models::AuditLog;
use crate::implement::db::logic;
use crate::implement::db::DatabaseState;
use tauri::State;
use crate::domain::implement::modules::v2::gis::topology::TopologyValidator;

#[tauri::command]
pub async fn validate_topology(
    db_state: State<'_, DatabaseState>,
    project_id: String,
    feature: FeatureState,
) -> Result<Vec<String>, String> {
    let guard = db_state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;

    // 1. Convert new feature to geo::Geometry
    let new_geo = TopologyValidator::value_to_geometry(&feature.geom_type, &feature.coordinates)?;

    if let Some(bbox) = &feature.bbox {
        // 2. Fetch candidate features using BBOX filtering for performance
        let mut stmt = conn.prepare(
            "SELECT id, geom_type, coordinates FROM features 
             WHERE project_id = ?1 AND id != ?2 
             AND NOT (max_x < ?3 OR min_x > ?4 OR max_y < ?5 OR min_y > ?6)"
        ).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(
                rusqlite::params![
                    project_id, feature.id, bbox.min_x, bbox.max_x, bbox.min_y, bbox.max_y
                ],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?;

        // 3. Perform detailed intersection check
        let mut candidates = Vec::new();
        for row in rows {
            let (id, g_type, coords_json) = row.map_err(|e| e.to_string())?;
            let coords: serde_json::Value = serde_json::from_str(&coords_json).map_err(|e| e.to_string())?;
            let geo = TopologyValidator::value_to_geometry(&g_type, &coords)?;
            candidates.push((id, geo));
        }

        let overlaps = TopologyValidator::check_overlap(&new_geo, &candidates);
        let results = overlaps
            .into_iter()
            .map(|(id, t)| format!("{}|{}", id, t))
            .collect();
        Ok(results)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn export_geojson_command(
    db_state: State<'_, DatabaseState>,
    project_id: String,
) -> Result<String, String> {
    let guard = db_state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;

    logic::export_to_geojson(conn, &project_id)
}

#[tauri::command]
pub async fn get_gis_audit_logs(
    db_state: State<'_, DatabaseState>,
    project_id: String,
) -> Result<Vec<AuditLog>, String> {
    let guard = db_state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project opened")?;

    let mut stmt = conn
        .prepare("SELECT id, project_id, user_id, user_email, action_type, table_name, record_id, old_values_json, new_values_json, timestamp 
                  FROM audit_logs 
                  WHERE project_id = ? AND (action_type LIKE 'GIS_%' OR action_type LIKE 'TOPOLOGY_%')
                  ORDER BY timestamp DESC LIMIT 100")
        .map_err(|e| e.to_string())?;

    let logs = stmt
        .query_map([project_id], |row| {
            Ok(AuditLog {
                id: row.get(0)?,
                project_id: row.get(1)?,
                user_id: row.get(2)?,
                user_email: row.get(3)?,
                action_type: row.get(4)?,
                table_name: row.get(5)?,
                record_id: row.get(6)?,
                old_values_json: row.get(7)?,
                new_values_json: row.get(8)?,
                timestamp: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(logs)
}
