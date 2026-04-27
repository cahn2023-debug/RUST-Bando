use crate::core::storage::bincode_util::BincodeUtil;
use crate::core::storage::snapshot::SnapshotManager;
use crate::domain::design::state::WorldState;
use crate::domain::implement::modules::v2::events::AppEvent;
use rusqlite::{params, Connection};
use serde_json::json;
use std::path::Path;
use uuid::Uuid;

pub struct NativeMigrator;

impl NativeMigrator {
    /// Thử di cư từ file nhị phân PMP4
    fn column_exists(
        conn: &Connection,
        table_name: &str,
        column_name: &str,
    ) -> Result<bool, String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({})", table_name))
            .map_err(|e| e.to_string())?;
        let exists = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .any(|name| name.map_or(false, |n| n == column_name));
        Ok(exists)
    }

    pub fn migrate_from_binary(
        path: &Path,
        conn: &Connection,
        project_id: &str,
    ) -> Result<usize, String> {
        let world_state = SnapshotManager::load(path)?;
        Self::import_world_state(world_state, conn, project_id)
    }

    /// Quy trình di cư toàn diện từ V4 (SQLite) sang V5.2
    pub fn migrate_v4_to_v5_comprehensive(
        conn: &Connection,
        project_id_str: &str,
    ) -> Result<usize, String> {
        let mut total_count = 0;
        let project_id = Self::to_valid_uuid(project_id_str);

        // 1. Khởi tạo Schema V5.2/V2 nếu chưa có
        Self::ensure_v2_schema(conn)?;

        // 2. Replay Design Events (Nếu có)
        total_count += Self::replay_v4_design_events(conn, project_id)?;

        // 4. Retroactive GIS Repair (Backfill missing WKB/BBox)
        let _ = Self::repair_sync_gis(conn);

        // 5. Cleanup cấu trúc cũ
        Self::cleanup_v4_structures(conn)?;

        Ok(total_count)
    }

    fn ensure_v2_schema(conn: &Connection) -> Result<(), String> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS event_store (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                metadata_json TEXT,
                version INTEGER NOT NULL,
                global_seq INTEGER NOT NULL UNIQUE,
                device_id TEXT NOT NULL,
                correlation_id TEXT,
                causation_id TEXT,
                schema_version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                current_version INTEGER DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'todo',
                current_version INTEGER DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS features (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                layer_id TEXT,
                group_id TEXT,
                name TEXT NOT NULL,
                geom_type TEXT NOT NULL,
                geometry_json TEXT NOT NULL,
                geometry_wkb BLOB,
                min_x REAL,
                min_y REAL,
                max_x REAL,
                max_y REAL,
                area REAL,
                length REAL,
                is_visible BOOLEAN DEFAULT 1,
                note TEXT DEFAULT '',
                properties_json TEXT DEFAULT '{}',
                style_id TEXT,
                current_version INTEGER DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .map_err(|e| format!("V2 Schema Initialization failed: {}", e))
    }

    /// Sửa lỗi hồi tố: Đồng bộ lại WKB và BBox từ Event Store vào bảng features
    pub fn repair_sync_gis(conn: &Connection) -> Result<usize, String> {
        println!("INFO: Starting Retroactive GIS Repair...");

        // 1. Lấy toàn bộ sự kiện FeatureCreated và FeatureUpdated từ event_store
        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, event_type FROM event_store 
                 WHERE entity_type = 'Feature' 
                 AND (event_type = 'FeatureCreated' OR event_type = 'FeatureUpdated')
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?, // entity_id
                    row.get::<_, String>(1)?, // project_id
                    row.get::<_, String>(2)?, // payload_json
                    row.get::<_, String>(3)?, // event_type
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut repair_count = 0;

        for row in rows {
            let (entity_id_str, project_id_str, payload_json, _event_type) =
                row.map_err(|e| e.to_string())?;

            // 2. Deserialize robustly
            if let Ok(event) = AppEvent::robust_deserialize(&payload_json) {
                match event {
                    AppEvent::FeatureCreated {
                        layer_id,
                        group_id,
                        name,
                        geom_type,
                        geometry,
                        properties,
                        style_id,
                        is_visible,
                        note,
                        ..
                    } => {
                        // 3. Tính toán lại WKB và BBox (Chuẩn hóa sang WGS84)
                        let (
                            transformed_geom,
                            wkb,
                            min_x,
                            min_y,
                            max_x,
                            max_y,
                            _x_vn,
                            _y_vn,
                            area,
                            length,
                        ) = crate::domain::implement::modules::v2::spatial::calculate_spatial(
                            &geometry,
                        );

                        let geom_json = serde_json::to_string(&transformed_geom)
                            .unwrap_or_else(|_| payload_json.clone());
                        let props_json = serde_json::to_string(&properties).unwrap_or_default();

                        // 4. Cập nhật hoặc chèn mới vào bảng features
                        let res = conn.execute(
                            "INSERT INTO features (
                                id, project_id, layer_id, group_id, name, geom_type, 
                                geometry_json, geometry_wkb, min_x, min_y, max_x, max_y,
                                area, length,
                                is_visible, note, properties_json, style_id
                            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
                            ON CONFLICT(id) DO UPDATE SET
                                geometry_json = excluded.geometry_json,
                                geometry_wkb = excluded.geometry_wkb,
                                min_x = excluded.min_x,
                                min_y = excluded.min_y,
                                max_x = excluded.max_x,
                                max_y = excluded.max_y,
                                area = excluded.area,
                                length = excluded.length,
                                is_visible = excluded.is_visible,
                                note = excluded.note,
                                properties_json = excluded.properties_json,
                                style_id = excluded.style_id,
                                updated_at = datetime('now')",
                            params![
                                entity_id_str,
                                project_id_str,
                                layer_id.to_string(),
                                group_id.map(|u| u.to_string()),
                                name,
                                geom_type,
                                geom_json,
                                wkb,
                                min_x,
                                min_y,
                                max_x,
                                max_y,
                                area,
                                length,
                                is_visible,
                                note,
                                props_json,
                                style_id.map(|u| u.to_string()),
                            ],
                        );

                        if res.is_ok() {
                            repair_count += 1;
                        }
                    }
                    AppEvent::FeatureUpdated { changes } => {
                        // Nếu có thay đổi về geometry, ta cập nhật lại projection
                        if let Some(geom) = changes.get("geometry") {
                            let (_, wkb, min_x, min_y, max_x, max_y, _x_vn, _y_vn, area, length) =
                                crate::domain::implement::modules::v2::spatial::calculate_spatial(
                                    geom,
                                );

                            let _ = conn.execute(
                                "UPDATE features SET 
                                    geometry_json = ?, 
                                    geometry_wkb = ?, 
                                    min_x = ?, min_y = ?, max_x = ?, max_y = ?,
                                    area = ?, length = ?,
                                    updated_at = datetime('now') 
                                 WHERE id = ?",
                                params![
                                    geom.to_string(),
                                    wkb,
                                    min_x,
                                    min_y,
                                    max_x,
                                    max_y,
                                    area,
                                    length,
                                    entity_id_str
                                ],
                            );
                        }
                    }
                    _ => {}
                }
            }
        }

        println!(
            "SUCCESS: Retroactive GIS Repair completed. {} features synced.",
            repair_count
        );
        Ok(repair_count)
    }

    fn replay_v4_design_events(conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        if !Self::table_exists(conn, "design_events")? {
            return Ok(0);
        }

        let id_col = if Self::column_exists(conn, "design_events", "entity_id")? {
            "entity_id"
        } else {
            "event_id"
        };
        let time_col = if Self::column_exists(conn, "design_events", "created_at")? {
            "created_at"
        } else {
            "timestamp"
        };

        let mut stmt = conn
            .prepare(&format!(
                "SELECT {}, event_type, payload_json, {} FROM design_events",
                id_col, time_col
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?, // id/entity_id
                    row.get::<_, String>(1)?, // event_type
                    row.get::<_, String>(2)?, // payload_json
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        let mut global_seq_counter: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(global_seq), 0) FROM event_store",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        for row in rows {
            let (entity_id_str, event_type, payload_json) = row.map_err(|e| e.to_string())?;
            let entity_id = Self::to_valid_uuid(&entity_id_str);

            if event_type.contains("FeatureCreated") {
                println!("DEBUG: V4 FeatureCreated Payload: {}", payload_json);
            }

            // Sử dụng robust_deserialize để xử lý payload cũ
            if let Ok(app_ev) = AppEvent::robust_deserialize(&payload_json) {
                global_seq_counter += 1;
                Self::insert_event_v2(
                    conn,
                    project_id,
                    &entity_id,
                    &app_ev,
                    global_seq_counter,
                    "migration-replay",
                )?;
                count += 1;
            } else {
                // Log failed deserialize for debugging
                println!(
                    "Warning: Failed to deserialize event from payload: {}",
                    payload_json
                );
            }
        }

        Ok(count)
    }

    fn insert_event_v2(
        conn: &Connection,
        project_id: Uuid,
        entity_id: &Uuid,
        event: &AppEvent,
        global_seq: i64,
        created_at_str: &str,
    ) -> Result<(), String> {
        let entity_type = event.entity_type();
        let event_type = event.action();
        let payload = serde_json::to_string(event).unwrap_or_default();
        let metadata = serde_json::json!({
            "migrated_from_v4": true,
            "original_timestamp": created_at_str,
            "system": "native_migrator"
        })
        .to_string();

        conn.execute(
            "INSERT INTO event_store (
                id, project_id, entity_type, entity_id, 
                event_type, payload_json, metadata_json,
                version, global_seq, device_id, created_at, schema_version
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                Uuid::new_v4().to_string(),
                project_id.to_string(),
                entity_type,
                entity_id.to_string(),
                event_type,
                payload,
                metadata,
                1, // version prefix
                global_seq,
                "native_migrator",
                created_at_str,
                1, // schema_version
            ],
        )
        .map_err(|e| format!("V2 Event Store Insert failed: {}", e))?;

        Ok(())
    }

    fn cleanup_v4_structures(conn: &Connection) -> Result<(), String> {
        let tables_to_drop = vec![
            "design_events",
            "audit_logs",
            "metadata",
            "contracts",
            "personnel",
            "materials",
            "bom",
            "tasks",
            "features_legacy",
            "regions",
            "layers",
        ];

        for table in tables_to_drop {
            if Self::table_exists(conn, table)? {
                conn.execute(&format!("DROP TABLE {}", table), [])
                    .map_err(|e| format!("Failed to drop table {}: {}", table, e))?;
            }
        }

        Ok(())
    }

    /// Thử di cư từ bảng metadata cũ trong SQLite
    pub fn migrate_from_metadata_table(
        conn: &Connection,
        project_id: &str,
    ) -> Result<usize, String> {
        let exists = Self::table_exists(conn, "metadata")?;

        if !exists {
            return Err("Metadata table not found".to_string());
        }

        let blob: Vec<u8> = conn
            .query_row(
                "SELECT value FROM metadata WHERE key = 'world_state' LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to read world_state blob: {}", e))?;

        let world_state: WorldState = BincodeUtil::robust_deserialize(&blob)?;

        Self::import_world_state(world_state, conn, project_id)
    }

    fn to_valid_uuid(id: &str) -> Uuid {
        if let Ok(u) = Uuid::parse_str(id) {
            u
        } else {
            // Chuẩn hóa ID không phải UUID (ví dụ: "root", "default", "1") thành UUID deterministic
            Uuid::new_v5(&Uuid::NAMESPACE_OID, id.as_bytes())
        }
    }

    pub fn import_world_state(
        state: WorldState,
        conn: &Connection,
        project_id_str: &str,
    ) -> Result<usize, String> {
        let mut count = 0;
        let project_id = Self::to_valid_uuid(project_id_str);

        // --- Ensure V2 Schema Exists ---
        Self::ensure_v2_schema(conn)?;

        // Get current global_seq max
        let mut global_seq: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(global_seq), 0) FROM event_store",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // 1. Map Regions
        for (id, val) in state.regions {
            let ev = AppEvent::RegionCreated {
                name: val
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Untitled Region")
                    .to_string(),
                metadata: val.clone(),
            };
            global_seq += 1;
            Self::insert_event_v2(
                conn,
                project_id,
                &Self::to_valid_uuid(&id),
                &ev,
                global_seq,
                "import-json",
            )?;
            count += 1;
        }

        // 2. Map Layers
        for (id, val) in state.layers {
            let ev = AppEvent::LayerCreated {
                name: val
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Untitled Layer")
                    .to_string(),
                metadata: val.clone(),
            };
            let layer_id = Self::to_valid_uuid(&id);
            global_seq += 1;
            Self::insert_event_v2(conn, project_id, &layer_id, &ev, global_seq, "import-json")?;
            count += 1;
        }

        // 3. Map Features
        for (id, val) in state.features {
            let feature_id = Self::to_valid_uuid(&id);
            let layer_id_str = val
                .get("layer_id")
                .and_then(|v| v.as_str())
                .unwrap_or("default");

            let geom_type = val
                .get("geom_type")
                .and_then(|v| v.as_str())
                .unwrap_or("Point")
                .to_string();

            // Sanitize specialized geom types
            let (final_geom_type, _final_geometry) =
                if geom_type == "camera" || geom_type == "intersection" {
                    let coords = val.get("coordinates").cloned().unwrap_or(json!([]));
                    (
                        "Point".to_string(),
                        json!({
                            "type": "Point",
                            "coordinates": coords
                        }),
                    )
                } else {
                    let coords = val.get("coordinates").cloned().unwrap_or(json!([]));
                    (
                        geom_type.clone(),
                        json!({
                            "type": "Point", // Fallback type in structure if not valid GeoJSON, though geom_type is preserved
                            "coordinates": coords
                        }),
                    )
                };

            // Re-adjust geom_type for valid GeoJSON if it was expected to be Point/Line/Polygon
            let actual_geom_type = if final_geom_type == "Point"
                || final_geom_type == "LineString"
                || final_geom_type == "Polygon"
            {
                final_geom_type
            } else {
                "Point".to_string()
            };

            let geometry = json!({
                "type": actual_geom_type,
                "coordinates": val.get("coordinates").cloned().unwrap_or(json!([]))
            });

            let ev = AppEvent::FeatureCreated {
                layer_id: Self::to_valid_uuid(layer_id_str),
                group_id: None,
                name: val
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Untitled Feature")
                    .to_string(),
                geom_type: geom_type.clone(),
                geometry,
                properties: val.clone(),
                style_id: None,
                is_visible: true,
                note: Some("".to_string()),
                bbox: None,
                metadata: val.clone(),
            };

            global_seq += 1;
            Self::insert_event_v2(
                conn,
                project_id,
                &feature_id,
                &ev,
                global_seq,
                "import-json",
            )?;
            count += 1;
        }

        Ok(count)
    }

    fn table_exists(conn: &Connection, table_name: &str) -> Result<bool, String> {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                [table_name],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(exists > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    #[ignore]
    fn test_comprehensive_migration() {
        let pmp_path = "C:\\Users\\ThanhBui\\AppData\\Local\\Temp\\Du_an_165_backup.pmp";
        let conn = Connection::open(pmp_path).expect("Failed to open backup DB");

        let project_id = "test-migration-165";

        // Debug schema
        println!("DESIGN_EVENTS SCHEMA:");
        let mut debug_stmt = conn.prepare("PRAGMA table_info(design_events)").unwrap();
        let debug_rows = debug_stmt
            .query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
            .unwrap();
        for dr in debug_rows {
            let (name, ty) = dr.unwrap();
            println!(" - {}: {}", name, ty);
        }

        println!("FEATURES SCHEMA:");
        let mut debug_stmt = conn.prepare("PRAGMA table_info(features)").unwrap();
        let debug_rows = debug_stmt
            .query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
            .unwrap();
        for dr in debug_rows {
            let (name, ty) = dr.unwrap();
            println!(" - {}: {}", name, ty);
        }

        // Debug sample data
        let mut sample_stmt = conn.prepare("SELECT * FROM design_events LIMIT 1").unwrap();
        let sample_row = sample_stmt
            .query_row([], |r| {
                Ok((r.get::<_, String>(2)?, r.get::<_, String>(3)?)) // event_type, payload_json
            })
            .unwrap();
        println!("SAMPLE DATA:");
        println!(" - Type: {}", sample_row.0);
        println!(" - Payload: {}", sample_row.1);

        // Debug all tables
        let tables = vec![
            "tasks",
            "materials",
            "personnel",
            "contracts",
            "audit_logs",
            "metadata",
        ];
        for table in tables {
            if NativeMigrator::table_exists(&conn, table).unwrap_or(false) {
                let mut t_debug = conn
                    .prepare(&format!("PRAGMA table_info({})", table))
                    .unwrap();
                let t_rows = t_debug
                    .query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
                    .unwrap();
                println!("TABLE {} SCHEMA:", table.to_uppercase());
                for dr in t_rows {
                    let (name, ty) = dr.unwrap();
                    println!(" - {}: {}", name, ty);
                }
            }
        }

        let result = NativeMigrator::migrate_v4_to_v5_comprehensive(&conn, project_id);

        match result {
            Ok(count) => {
                println!("SUCCESS: Migrated {} events/tasks", count);
                // Kiểm tra xem bảng cũ đã mất chưa
                let exists = NativeMigrator::table_exists(&conn, "tasks").unwrap();
                assert!(!exists, "Old tasks table should be dropped!");

                let event_count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM event_store", [], |r| r.get(0))
                    .unwrap();
                println!("New event_store has {} records", event_count);
            }
            Err(e) => panic!("Migration failed: {}", e),
        }
    }
}
