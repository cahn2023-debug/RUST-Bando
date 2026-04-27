/// V1 → V2 Migration Engine
///
/// Migrates a V1 .pmp database to V2 format:
/// 1. Backup original data
/// 2. Create V2 schema
/// 3. Convert INTEGER → UUID IDs
/// 4. Rebuild event_store from existing data
/// 5. Rebuild projections
/// 6. Create manifest.json
/// 7. Verify integrity
/// 8. Remove V1 tables
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// use super::super::events::AppEvent;
use super::super::storage::schema;

// ============================================================================
// Migration Types
// ============================================================================

pub const MIGRATION_NAMESPACE: Uuid = Uuid::from_u128(0x6ba7b810_9dad_11d1_80b4_00c04fd430c8);

pub trait Migration: Send + Sync {
    fn id(&self) -> i64;
    fn name(&self) -> &str;
    fn up(&self, conn: &Connection) -> Result<(), String>;
    fn down(&self, conn: &Connection) -> Result<(), String>;
}

// ============================================================================
// Migration Report
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MigrationReport {
    pub success: bool,
    pub event_count: i64,
    pub task_count: i64,
    pub file_count: i64,
    pub feature_count: i64,
    pub index_count: i64,
    pub fk_violations: i64,
    pub id_map_size: usize,
    pub errors: Vec<String>,
}

// ============================================================================
// V1 → V2 Migrator
// ============================================================================

pub struct V1ToV2Migrator;

impl V1ToV2Migrator {
    /// Run the full V1 → V2 migration
    pub fn migrate(conn: &Connection) -> Result<MigrationReport, String> {
        let mut report = MigrationReport::default();

        log::info!("[V2 Migration] Starting V1 → V2 migration...");

        // Step 1: Verify this is a V2 database
        if schema::is_v2_database(conn)? {
            return Err("Database is already V2 format".to_string());
        }

        // Step 1.1: Check for Binary Metadata (Legacy V1.x)
        if let Ok(count) =
            super::native_migration::NativeMigrator::migrate_from_metadata_table(conn, "root")
        {
            if count > 0 {
                log::info!(
                    "[V2 Migration] Migrated {} entities from legacy metadata BLOB",
                    count
                );
                report.event_count += count as i64;
                report.success = true;
            }
        }

        // Step 2: Prepare for migration - Rename existing tables
        log::info!("[V2 Migration] Step 2: Renaming V1 tables...");
        let v1_tables = vec![
            "projects",
            "files",
            "tasks",
            "personnel",
            "contracts",
            "materials",
            "work_items",
            "notes",
            "roles",
            "content_types",
            "content_fields",
            "content_items",
            "project_settings",
            "personnel_roles",
            "feature_attachments",
            "design_styles",
            "contract_execution_groups",
            "design_events",
            "audit_logs",
            "project_folders",
            "task_dependencies",
            "layers",
            "regions",
            "feature_groups",
            "features",
            "task_links",
            "project_personnel",
            "personnel_tasks",
            "work_groups",
            "cost_estimates",
            "financial_records",
            "inventories",
            "storage_locations",
            "attachments",
            "comments",
            "tags",
            // Legacy PascalCase Tables (GIS)
            "Layers",
            "Points",
            "Lines",
            "Cameras",
            "Intersections",
            "Folders",
        ];

        let mut existing_tables = Vec::new();
        let mut all_tables = Vec::new();
        if let Ok(mut stmt) = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'") {
            if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
                for r in rows {
                    if let Ok(name) = r {
                        all_tables.push(name);
                    }
                }
            }
        }
        println!("[V2 Migration] TABLES in legacy file: {:?}", all_tables);

        for table in &v1_tables {
            let v1_table = format!("v1_{}", table);
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
                    params![table],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            if exists > 0 {
                conn.execute(
                    &format!("ALTER TABLE \"{}\" RENAME TO \"{}\"", table, v1_table),
                    [],
                )
                .map_err(|e| format!("Failed to rename {}: {}", table, e))?;
                existing_tables.push(*table);
            }
        }

        // Step 3: Create V2 schema
        log::info!("[V2 Migration] Step 3: Creating V2 schema...");
        schema::apply_v2_schema(conn)?;

        // Step 4: Convert IDs and migrate data
        log::info!("[V2 Migration] Step 4: Migrating data to V2 schema...");
        let id_map = Self::migrate_data(conn, &existing_tables)?;
        report.id_map_size = id_map.len();

        // Step 5: Rebuild event_store from existing data
        log::info!("[V2 Migration] Step 5: Rebuilding event_store...");
        let event_count = Self::rebuild_event_store_v2(conn, &id_map, &existing_tables)?;
        report.event_count = event_count;

        // Step 6: Rebuild entity_index
        log::info!("[V2 Migration] Step 6: Rebuilding entity_index...");
        let index_count = Self::rebuild_entity_index(conn)?;
        report.index_count = index_count;

        // Step 6.5: Backfill spatial indices for GIS data
        log::info!("[V2 Migration] Step 6.5: Backfilling spatial indices...");
        if let Err(e) = schema::backfill_spatial_data(conn) {
            log::error!("[V2 Migration] Failed to backfill spatial data: {}", e);
            report
                .errors
                .push(format!("Spatial backfill failed: {}", e));
        }

        // Step 6.4: Realign project_id in event_store to ensure consistency
        log::info!("[V2 Migration] Step 6.4: Realigning Project IDs in event_store...");
        let winner_project_id: Option<String> = conn.query_row(
            "SELECT project_id FROM event_store GROUP BY project_id ORDER BY COUNT(*) DESC LIMIT 1",
            [],
            |r| r.get(0),
        ).ok().or_else(|| {
             conn.query_row("SELECT id FROM projects LIMIT 1", [], |r| r.get(0)).ok()
        });

        if let Some(project_id) = winner_project_id {
            let updated = conn
                .execute("UPDATE event_store SET project_id = ?", params![project_id])
                .unwrap_or(0);
            log::info!(
                "[V2 Migration] Realigned {} events to project {} (Winner ID)",
                updated,
                project_id
            );

            // Ensure this winner exists in projects table
            let p_exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?)",
                    params![project_id],
                    |r| r.get(0),
                )
                .unwrap_or(false);
            if !p_exists {
                let _ = conn.execute(
                    "UPDATE projects SET id = ? WHERE id IN (SELECT id FROM projects LIMIT 1)",
                    params![project_id],
                );
            }
        }

        // Step 6.6: Rebuild all projections from Event Store
        log::info!("[V2 Migration] Step 6.6: Rebuilding all projections...");
        if let Err(e) = Self::rebuild_all_projections(conn) {
            log::error!("[V2 Migration] Failed to rebuild projections: {}", e);
            report
                .errors
                .push(format!("Projection rebuild failed: {}", e));
        }

        // Step 7: Collect stats
        log::info!("[V2 Migration] Step 7: Collecting migration stats...");
        report.task_count = conn
            .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
            .map_err(|e| format!("Failed to count tasks: {}", e))?;
        report.file_count = conn
            .query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
            .map_err(|e| format!("Failed to count files: {}", e))?;
        report.feature_count = conn
            .query_row("SELECT COUNT(*) FROM features", [], |r| r.get(0))
            .map_err(|e| format!("Failed to count features: {}", e))?;

        // Step 8: Verify integrity
        log::info!("[V2 Migration] Step 8: Verifying integrity...");
        report.fk_violations = Self::check_fk_violations(conn);
        report.success = report.event_count > 0;

        Ok(report)
    }

    /// v72.1: Emergency fix for mismatched project IDs in corrupted V2 files
    /// This is called during initialization to handle partially failed migrations.
    pub fn ensure_project_id_alignment(conn: &Connection) -> Result<String, String> {
        // 1. Identify all project IDs and their event counts
        let mut stmt = conn.prepare(
            "SELECT project_id, COUNT(*) as cnt FROM event_store GROUP BY project_id ORDER BY cnt DESC"
        ).map_err(|e| e.to_string())?;

        let event_counts: Vec<(String, i64)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        // 2. The "Winner" is the ID with most events, or if none, the first project in projects table
        let target_project_id: String = if let Some((id, _)) = event_counts.first() {
            id.clone()
        } else {
            match conn.query_row("SELECT id FROM projects LIMIT 1", [], |r| r.get(0)) {
                Ok(id) => id,
                Err(_) => return Err("No project found in database".to_string()),
            }
        };

        log::info!(
            "[V2 Repair] Target Project ID selected (Winner): {}",
            target_project_id
        );

        // 3. Merging & Cleansing: Consolidation
        for (other_id, count) in event_counts {
            if other_id != target_project_id {
                log::info!(
                    "[V2 Repair] Merging project {} ({} events) into {}...",
                    other_id,
                    count,
                    target_project_id
                );

                // Update event_store
                conn.execute(
                    "UPDATE event_store SET project_id = ? WHERE project_id = ?",
                    params![target_project_id, other_id],
                )
                .map_err(|e| e.to_string())?;

                // Cleanup duplicated project rows sharing the same name
                let _ = conn.execute(
                    "DELETE FROM projects WHERE id = ? AND lower(trim(name)) IN (SELECT lower(trim(name)) FROM projects WHERE id = ?)",
                    params![other_id, target_project_id],
                );
            }
        }

        // 4. Case handle: duplicated names but disconnected from event_store
        let _ = conn.execute(
            "DELETE FROM projects 
             WHERE id != ? 
             AND lower(trim(name)) IN (SELECT lower(trim(name)) FROM projects WHERE id = ?)",
            params![target_project_id, target_project_id],
        );

        // 4.1. Cleanup entity_index for deleted projects
        let _ = conn.execute(
            "DELETE FROM entity_index 
             WHERE entity_type = 'project' AND project_id != ?
             AND lower(trim(name)) IN (SELECT lower(trim(name)) FROM projects WHERE id = ?)",
            params![target_project_id, target_project_id],
        );

        // 5. Ensure the target ID exists in projects table
        let p_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?)",
                params![target_project_id],
                |r| r.get(0),
            )
            .unwrap_or(false);

        if !p_exists {
            log::info!("[V2 Repair] Target project ID {} missing from projects table. Re-creating/Updating...", target_project_id);
            // Try to find a project with the same name first
            let same_name_id: Option<String> = conn
                .query_row("SELECT id FROM projects LIMIT 1", [], |r| r.get(0))
                .ok();

            if let Some(old_id) = same_name_id {
                conn.execute(
                    "UPDATE projects SET id = ? WHERE id = ?",
                    params![target_project_id, old_id],
                )
                .map_err(|e| e.to_string())?;
            } else {
                // Last resort: insert new placeholder
                conn.execute(
                    "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, 'Recovered Project', datetime('now'), datetime('now'))",
                    params![target_project_id],
                ).map_err(|e| e.to_string())?;
            }
        }

        // 6. Align Metadata
        let _ = conn.execute(
            "UPDATE pmp_metadata SET project_id = ?",
            params![target_project_id],
        );

        // 7. Force Projection Rebuild if features are empty
        let event_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM event_store WHERE project_id = ?",
                params![target_project_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let feature_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM features WHERE project_id = ?",
                params![target_project_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if event_count > 0 && feature_count == 0 {
            log::info!("[V2 Repair] Features table empty ({} events in store). Triggering force rebuild for {}...", event_count, target_project_id);
            if let Err(e) = Self::rebuild_all_projections_for_id(conn, &target_project_id) {
                log::error!("[V2 Repair] Force rebuild failed: {}", e);
            } else {
                log::info!("[V2 Repair] Force rebuild finished.");
            }
        }

        Ok(target_project_id)
    }

    /// Migrate data from v1_ tables to V2 tables
    fn migrate_data(
        conn: &Connection,
        tables: &[&str],
    ) -> Result<HashMap<String, HashMap<i64, String>>, String> {
        let mut id_map: HashMap<String, HashMap<i64, String>> = HashMap::new();

        for table in tables {
            let v1_table = format!("v1_{}", table);

            // Map V1 table name to V2 target table name
            let target_table = match *table {
                "Points" | "Lines" | "Cameras" | "Intersections" => "features",
                "Layers" => "layers",
                "Folders" => "tasks",
                _ => *table,
            };

            // Get target table columns
            let target_cols = Self::get_table_columns(conn, target_table)?;

            // Get all records from V1 table
            let mut stmt = conn
                .prepare(&format!("SELECT * FROM \"{}\"", v1_table))
                .map_err(|e| format!("Failed to prepare select from {}: {}", v1_table, e))?;

            let column_names: Vec<String> = stmt
                .column_names()
                .into_iter()
                .map(|s| s.to_string())
                .collect();
            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;

            let mut table_map = HashMap::new();

            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                let mut data = HashMap::new();
                for (i, name) in column_names.iter().enumerate() {
                    let val: rusqlite::types::Value = row.get(i).map_err(|e| e.to_string())?;
                    data.insert(name.clone(), val);
                }

                // Generate new UUID for this record
                let old_id = if let Some(rusqlite::types::Value::Integer(id)) = data.get("id") {
                    *id
                } else {
                    continue;
                };

                let new_id = Self::resolve_target_id(conn, target_table, &data, &id_map)?;
                table_map.insert(old_id, new_id.clone());

                if Self::target_row_exists(conn, target_table, &new_id)? {
                    continue;
                }

                // Build insert query for V2 table
                let mut cols = vec!["id".to_string()];
                let mut placeholders = vec!["?1".to_string()];
                let mut values: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(new_id)];

                for (name, val) in &data {
                    if name == "id" {
                        continue;
                    }

                    // Field mapping
                    let mut target_name = name.clone();
                    if *table == "files" {
                        if name == "path" {
                            target_name = "rel_path".to_string();
                        }
                        if name == "size" {
                            target_name = "file_size".to_string();
                        }
                    }

                    // GIS Legacy Mappings
                    if *table == "Points"
                        || *table == "Lines"
                        || *table == "Cameras"
                        || *table == "Intersections"
                    {
                        if name == "LayerId" {
                            target_name = "layer_id".to_string();
                        }
                        if name == "Name" {
                            target_name = "name".to_string();
                        }
                        if name == "X" || name == "Y" || name == "Z" {
                            continue;
                        } // Handle in rebuild_event_store
                        if name == "Coordinates" {
                            continue;
                        } // Handle in rebuild_event_store
                        if name == "Metadata" {
                            target_name = "properties_json".to_string();
                        }
                    }
                    if *table == "Layers" {
                        if name == "Name" {
                            target_name = "name".to_string();
                        }
                    }

                    // Only insert if column exists in target
                    if target_cols.contains(&target_name) {
                        cols.push(format!("\"{}\"", target_name));
                        placeholders.push(format!("?{}", cols.len()));

                        // Box the value to satisfy ToSql
                        match val {
                            rusqlite::types::Value::Null => values.push(Box::new(None::<String>)),
                            rusqlite::types::Value::Integer(i) => values.push(Box::new(*i)),
                            rusqlite::types::Value::Real(f) => values.push(Box::new(*f)),
                            rusqlite::types::Value::Text(s) => values.push(Box::new(s.clone())),
                            rusqlite::types::Value::Blob(b) => values.push(Box::new(b.clone())),
                        }
                    }
                }

                let insert_sql = format!(
                    "INSERT INTO \"{}\" ({}) VALUES ({})",
                    target_table,
                    cols.join(", "),
                    placeholders.join(", ")
                );

                let params_refs: Vec<&dyn rusqlite::ToSql> =
                    values.iter().map(|v| v.as_ref()).collect();
                conn.execute(&insert_sql, rusqlite::params_from_iter(params_refs))
                    .map_err(|e| {
                        format!(
                            "Failed to insert into {} from v1_ id={}: {}",
                            table, old_id, e
                        )
                    })?;
            }

            id_map.insert(table.to_string(), table_map);
        }

        // Fix Foreign Keys in the migrated data
        Self::fix_migrated_fks(conn, &id_map)?;

        Ok(id_map)
    }

    fn get_table_columns(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info(\"{}\")", table))
            .map_err(|e| e.to_string())?;

        let cols = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(cols)
    }

    fn fix_migrated_fks(
        conn: &Connection,
        id_map: &HashMap<String, HashMap<i64, String>>,
    ) -> Result<(), String> {
        let fk_mappings = vec![
            ("files", "project_id", "projects"),
            ("tasks", "project_id", "projects"),
            ("tasks", "parent_id", "tasks"),
            ("personnel", "project_id", "projects"),
            ("contracts", "project_id", "projects"),
            ("work_items", "project_id", "projects"),
            ("work_items", "material_id", "materials"),
            ("notes", "project_id", "projects"),
            ("project_settings", "project_id", "projects"),
            ("project_folders", "project_id", "projects"),
            ("feature_attachments", "project_id", "projects"),
            ("feature_attachments", "file_id", "files"),
            ("design_styles", "project_id", "projects"),
            ("audit_logs", "project_id", "projects"),
            ("content_fields", "content_type_id", "content_types"),
            ("content_items", "project_id", "projects"),
            ("content_items", "content_type_id", "content_types"),
            ("personnel_roles", "role_id", "roles"),
            ("task_links", "from_task_id", "tasks"),
            ("task_links", "to_task_id", "tasks"),
            ("layers", "project_id", "projects"),
            ("feature_groups", "project_id", "projects"),
            ("features", "project_id", "projects"),
            ("features", "layer_id", "layers"),
            ("features", "style_id", "design_styles"),
            ("features", "group_id", "feature_groups"),
            ("features", "task_id", "tasks"),
            ("feature_attachments", "project_id", "projects"),
            ("feature_attachments", "feature_id", "features"),
            ("feature_attachments", "file_id", "files"),
            ("work_items", "project_id", "projects"),
            ("work_items", "material_id", "materials"),
            ("work_items", "feature_id", "features"),
            ("layers", "region_id", "regions"),
            ("regions", "project_id", "projects"),
        ];

        for (table, column, ref_table) in fk_mappings {
            if let Some(ref_map) = id_map.get(ref_table) {
                for (old_id, new_id) in ref_map {
                    conn.execute(
                        &format!(
                            "UPDATE \"{}\" SET \"{}\" = ? WHERE \"{}\" = ?",
                            table, column, column
                        ),
                        params![new_id, old_id],
                    )
                    .ok();
                }
            }
        }
        Ok(())
    }

    fn resolve_target_id(
        conn: &Connection,
        table: &str,
        data: &HashMap<String, rusqlite::types::Value>,
        id_map: &HashMap<String, HashMap<i64, String>>,
    ) -> Result<String, String> {
        match table {
            "projects" => {
                if let (Some(name), Some(path)) = (
                    Self::value_as_text(data.get("name")),
                    Self::value_as_text(data.get("root_path")),
                ) {
                    if let Some(existing_id) = conn
                        .query_row(
                            "SELECT id FROM projects WHERE lower(trim(name)) = lower(trim(?1)) AND lower(trim(root_path)) = lower(trim(?2))",
                            params![name, path],
                            |row| row.get::<_, String>(0),
                        )
                        .optional()
                        .map_err(|e| e.to_string())?
                    {
                        return Ok(existing_id);
                    }
                }
            }
            "roles" => {
                if let Some(name) = Self::value_as_text(data.get("name")) {
                    if let Some(existing_id) = conn
                        .query_row(
                            "SELECT id FROM roles WHERE name = ?1",
                            params![name],
                            |row| row.get::<_, String>(0),
                        )
                        .optional()
                        .map_err(|e| e.to_string())?
                    {
                        return Ok(existing_id);
                    }
                }
            }
            "content_types" => {
                if let Some(name) = Self::value_as_text(data.get("name")) {
                    if let Some(existing_id) = conn
                        .query_row(
                            "SELECT id FROM content_types WHERE name = ?1",
                            params![name],
                            |row| row.get::<_, String>(0),
                        )
                        .optional()
                        .map_err(|e| e.to_string())?
                    {
                        return Ok(existing_id);
                    }
                }
            }
            "content_fields" => {
                if let (Some(old_content_type_id), Some(name)) = (
                    Self::value_as_i64(data.get("content_type_id")),
                    Self::value_as_text(data.get("name")),
                ) {
                    if let Some(mapped_content_type_id) = id_map
                        .get("content_types")
                        .and_then(|mapping| mapping.get(&old_content_type_id))
                    {
                        if let Some(existing_id) = conn
                            .query_row(
                                "SELECT id FROM content_fields WHERE content_type_id = ?1 AND name = ?2",
                                params![mapped_content_type_id, name],
                                |row| row.get::<_, String>(0),
                            )
                            .optional()
                            .map_err(|e| e.to_string())?
                        {
                            return Ok(existing_id);
                        }
                    }
                }
            }
            "regions" => {
                if let (Some(project_id_old), Some(name)) = (
                    Self::value_as_i64(data.get("project_id")),
                    Self::value_as_text(data.get("name")),
                ) {
                    if let Some(project_uuid) = id_map
                        .get("projects")
                        .and_then(|mapping| mapping.get(&project_id_old))
                    {
                        if let Some(existing_id) = conn
                            .query_row(
                                "SELECT id FROM regions WHERE project_id = ?1 AND name = ?2",
                                params![project_uuid, name],
                                |row| row.get::<_, String>(0),
                            )
                            .optional()
                            .map_err(|e| e.to_string())?
                        {
                            return Ok(existing_id);
                        }
                    }
                }
            }
            "layers" => {
                if let (Some(project_id_old), Some(name)) = (
                    Self::value_as_i64(data.get("project_id")),
                    Self::value_as_text(data.get("name")),
                ) {
                    if let Some(project_uuid) = id_map
                        .get("projects")
                        .and_then(|mapping| mapping.get(&project_id_old))
                    {
                        if let Some(existing_id) = conn
                            .query_row(
                                "SELECT id FROM layers WHERE project_id = ?1 AND name = ?2",
                                params![project_uuid, name],
                                |row| row.get::<_, String>(0),
                            )
                            .optional()
                            .map_err(|e| e.to_string())?
                        {
                            return Ok(existing_id);
                        }
                    }
                }
            }
            _ => {}
        }

        Ok(Uuid::new_v4().to_string())
    }

    fn target_row_exists(conn: &Connection, table: &str, id: &str) -> Result<bool, String> {
        let exists: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM \"{}\" WHERE id = ?1", table),
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(exists > 0)
    }

    fn value_as_text(value: Option<&rusqlite::types::Value>) -> Option<String> {
        match value? {
            rusqlite::types::Value::Text(v) => Some(v.clone()),
            rusqlite::types::Value::Integer(v) => Some(v.to_string()),
            rusqlite::types::Value::Real(v) => Some(v.to_string()),
            _ => None,
        }
    }

    fn value_as_i64(value: Option<&rusqlite::types::Value>) -> Option<i64> {
        match value? {
            rusqlite::types::Value::Integer(v) => Some(*v),
            rusqlite::types::Value::Text(v) => v.parse::<i64>().ok(),
            _ => None,
        }
    }

    /// Rebuild event_store from existing V1 data (New logic)
    fn rebuild_event_store_v2(
        conn: &Connection,
        id_map: &HashMap<String, HashMap<i64, String>>,
        _v1_tables: &[&str],
    ) -> Result<i64, String> {
        let mut global_seq: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(global_seq), -1) FROM event_store",
                [],
                |r| r.get(0),
            )
            .unwrap_or(-1)
            + 1;
        println!("[DEBUG] Starting rebuild from global_seq: {}", global_seq);

        // 1. Convert v1_design_events → event_store
        let has_v1_design_events: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_design_events'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if has_v1_design_events > 0 {
            let mut stmt = conn
                .prepare(
                    "SELECT event_id, project_id, event_type, payload_json, timestamp, is_undone
                     FROM v1_design_events ORDER BY timestamp ASC",
                )
                .map_err(|e| e.to_string())?;

            let events: Vec<(String, i64, String, String, String, bool)> = stmt
                .query_map([], |row| {
                    Ok((
                        row.get(0)?,
                        row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                })
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();

            println!("[DEBUG] Starting rebuild of {} events...", events.len());
            conn.execute("BEGIN TRANSACTION", [])
                .map_err(|e| e.to_string())?;

            for (event_id, old_project_id, event_type, payload_json, timestamp, is_undone) in events
            {
                if is_undone {
                    continue;
                }

                let default_project_id = id_map
                    .get("projects")
                    .and_then(|m| m.values().next())
                    .cloned();

                let project_id = id_map
                    .get("projects")
                    .and_then(|m| m.get(&old_project_id))
                    .cloned()
                    .or(default_project_id)
                    .unwrap_or_else(|| Uuid::new_v4().to_string());

                let mut payload: serde_json::Value =
                    serde_json::from_str(&payload_json).unwrap_or(serde_json::json!({}));

                // Patch missing fields to satisfy V2 AppEvent schema
                payload["type"] = serde_json::json!(event_type);
                match event_type.as_str() {
                    "FeatureCreated" => {
                        if payload.get("is_visible").is_none() {
                            payload["is_visible"] = serde_json::json!(true);
                        }
                        if payload.get("metadata").is_none() {
                            payload["metadata"] = serde_json::json!({});
                        }
                        if payload.get("group_id").is_none() {
                            payload["group_id"] = serde_json::json!(null);
                        }
                        if payload.get("style_id").is_none() {
                            payload["style_id"] = serde_json::json!(null);
                        }
                        if payload.get("note").is_none() {
                            payload["note"] = serde_json::json!(null);
                        }
                        if payload.get("bbox").is_none() {
                            payload["bbox"] = serde_json::json!(null);
                        }
                    }
                    "LayerCreated" => {
                        if payload.get("metadata").is_none() {
                            payload["metadata"] = serde_json::json!({});
                        }
                    }
                    "TaskCreated" => {
                        if payload.get("metadata").is_none() {
                            payload["metadata"] = serde_json::json!({});
                        }
                        if payload.get("parent_id").is_none() {
                            payload["parent_id"] = serde_json::json!(null);
                        }
                    }
                    "ProjectCreated" => {
                        if payload.get("metadata").is_none() {
                            payload["metadata"] = serde_json::json!({});
                        }
                        if payload.get("settings").is_none() {
                            payload["settings"] = serde_json::json!({});
                        }
                        if payload.get("id").is_none() {
                            payload["id"] = serde_json::json!(project_id);
                        }
                    }
                    _ => {}
                }

                let entity_id = payload
                    .get("id")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .or_else(|| {
                        payload
                            .get("id")
                            .and_then(|v| v.as_i64().map(|i| i.to_string()))
                    })
                    .unwrap_or_else(|| Uuid::new_v4().to_string());

                let entity_type = if event_type.contains("Task") {
                    "task"
                } else if event_type.contains("Layer") {
                    "layer"
                } else if event_type.contains("Region") {
                    "region"
                } else if event_type.contains("Project") {
                    "project"
                } else {
                    "feature"
                };

                let final_payload_json = serde_json::to_string(&payload).unwrap_or(payload_json);

                conn.execute(
                    "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, 'migration', ?8)",
                    params![event_id, project_id, entity_type, entity_id, event_type, final_payload_json, global_seq, timestamp],
                ).map_err(|e| {
                    let _ = conn.execute("ROLLBACK", []);
                    format!("Failed to insert event {}: {}", event_id, e)
                })?;

                // 2. Double-write to design_events for UI compatibility
                if entity_type == "feature"
                    || entity_type == "layer"
                    || entity_type == "region"
                    || entity_type == "task"
                {
                    conn.execute(
                        "INSERT OR IGNORE INTO design_events (event_id, project_id, event_type, payload_json, timestamp, is_undone)
                         VALUES (?1, ?2, ?3, ?4, ?5, 0)",
                        params![event_id, project_id, event_type, final_payload_json, timestamp],
                    ).map_err(|e| {
                        let _ = conn.execute("ROLLBACK", []);
                        format!("Failed to insert design_event {}: {}", event_id, e)
                    })?;
                }

                if conn.changes() > 0 {
                    global_seq += 1;
                }
                if global_seq % 1000 == 0 {
                    println!("[DEBUG] Migrated {} events...", global_seq);
                }
            }

            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            println!("[DEBUG] Finished rebuild. Total in store: {}", global_seq);
        }

        // 2. Synthesize "Created" events for existing records that lack events
        // 2a. Synthesize ProjectCreated
        if let Some(projects_map) = id_map.get("projects") {
            // v74 Fix: Check for metadata_json existence in v1_projects
            let has_metadata_col = match conn.prepare("PRAGMA table_info('v1_projects')") {
                Ok(mut stmt) => stmt
                    .query_map([], |r| r.get::<_, String>(1))
                    .map(|iter| {
                        iter.filter_map(|r| r.ok())
                            .any(|name| name == "metadata_json")
                    })
                    .unwrap_or(false),
                Err(_) => false,
            };

            let query = if has_metadata_col {
                "SELECT id, name, root_path, metadata_json, created_at FROM v1_projects"
            } else {
                "SELECT id, name, root_path, '{}', created_at FROM v1_projects"
            };

            let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
            let project_rows = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                        row.get::<_, Option<String>>(3)?
                            .unwrap_or_else(|| "{}".to_string()),
                        row.get::<_, Option<String>>(4)?
                            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                    ))
                })
                .map_err(|e| e.to_string())?;

            for row in project_rows {
                if let Ok((old_id, name, root_path, metadata, created_at)) = row {
                    if let Some(uuid) = projects_map.get(&old_id) {
                        let event_payload = serde_json::json!({
                            "type": "ProjectCreated",
                            "name": name,
                            "root_path": root_path,
                            "id": uuid,
                            "settings": {},
                            "metadata": serde_json::from_str::<serde_json::Value>(&metadata).unwrap_or(serde_json::json!({}))
                        });
                        let event_id = Uuid::new_v5(
                            &MIGRATION_NAMESPACE,
                            format!("project_created_{}", uuid).as_bytes(),
                        )
                        .to_string();
                        conn.execute(
                            "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                             VALUES (?1, ?2, 'project', ?3, 'ProjectCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                            params![event_id, uuid, uuid, event_payload.to_string(), global_seq, created_at],
                        ).ok();
                        global_seq += 1;

                        // Synthesize Default Layer
                        let project_uuid_parsed = Uuid::parse_str(uuid).unwrap_or(Uuid::nil());
                        let layer_uuid =
                            Uuid::new_v5(&project_uuid_parsed, b"layer_default").to_string();
                        let layer_event_id = Uuid::new_v5(
                            &MIGRATION_NAMESPACE,
                            format!("layer_created_{}", layer_uuid).as_bytes(),
                        )
                        .to_string();
                        let layer_payload = serde_json::json!({
                            "type": "LayerCreated",
                            "name": "Lớp dữ liệu",
                            "metadata": {"is_default": true}
                        });
                        conn.execute(
                            "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                             VALUES (?1, ?2, 'layer', ?3, 'LayerCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                            params![layer_event_id, uuid, layer_uuid, layer_payload.to_string(), global_seq, created_at],
                        ).ok();
                        global_seq += 1;
                    }
                }
            }
        }

        // 2a.1. Synthesize RegionCreated
        if let Some(regions_map) = id_map.get("regions") {
            let has_v1_regions: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_regions'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_regions > 0 {
                // Check if v1_regions has metadata_json column
                let columns = Self::get_table_columns(conn, "v1_regions").unwrap_or_default();
                let has_metadata_col = columns.iter().any(|c| c == "metadata_json");

                let query = if has_metadata_col {
                    "SELECT id, project_id, name, created_at, metadata_json FROM v1_regions"
                } else {
                    "SELECT id, project_id, name, created_at, NULL as metadata_json FROM v1_regions"
                };

                let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
                let region_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, Option<String>>(3)?
                                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                            row.get::<_, Option<String>>(4)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in region_rows {
                    if let Ok((old_id, old_project_id, name, created_at, metadata)) = row {
                        let project_uuid = id_map
                            .get("projects")
                            .and_then(|m| m.get(&old_project_id))
                            .cloned()
                            .unwrap_or_default();

                        if let Some(uuid) = regions_map.get(&old_id) {
                            let metadata_val = if let Some(meta_str) = metadata {
                                serde_json::from_str::<serde_json::Value>(&meta_str)
                                    .unwrap_or(serde_json::json!({}))
                            } else {
                                serde_json::json!({ "name": name })
                            };

                            let event_payload = serde_json::json!({
                                "type": "RegionCreated",
                                "name": name,
                                "metadata": metadata_val
                            });
                            conn.execute(
                                "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                 VALUES (?1, ?2, 'region', ?3, 'RegionCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                                params![Uuid::new_v4().to_string(), project_uuid, uuid, event_payload.to_string(), global_seq, created_at],
                            ).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2b. Synthesize TaskCreated
        if let Some(tasks_map) = id_map.get("tasks") {
            let has_v1_tasks: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_tasks'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_tasks > 0 {
                let mut stmt = conn
                    .prepare("SELECT id, project_id, name, created_at FROM v1_tasks")
                    .map_err(|e| e.to_string())?;
                let task_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, Option<String>>(3)?
                                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in task_rows {
                    if let Ok((old_id, old_project_id, name, created_at)) = row {
                        let project_uuid = id_map
                            .get("projects")
                            .and_then(|m| m.get(&old_project_id))
                            .cloned()
                            .unwrap_or_default();
                        if let Some(uuid) = tasks_map.get(&old_id) {
                            let event_payload = serde_json::json!({
                                "type": "TaskCreated",
                                "name": name,
                                "parent_id": null,
                                "metadata": {}
                            });
                            conn.execute(
                                "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                 VALUES (?1, ?2, 'task', ?3, 'TaskCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                                params![Uuid::new_v4().to_string(), project_uuid, uuid, event_payload.to_string(), global_seq, created_at],
                            ).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2c. Synthesize FileIndexed
        if let Some(files_map) = id_map.get("files") {
            let has_v1_files: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_files'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_files > 0 {
                let mut stmt = conn.prepare("SELECT id, project_id, filename, rel_path, file_size, created_at FROM v1_files").map_err(|e| e.to_string())?;
                let file_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, i64>(4)?,
                            row.get::<_, Option<String>>(5)?
                                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in file_rows {
                    if let Ok((old_id, old_project_id, filename, rel_path, file_size, created_at)) =
                        row
                    {
                        let project_uuid = id_map
                            .get("projects")
                            .and_then(|m| m.get(&old_project_id))
                            .cloned()
                            .unwrap_or_default();
                        if let Some(uuid) = files_map.get(&old_id) {
                            let event_payload = serde_json::json!({
                                "type": "FileCreated",
                                "folder_id": null,
                                "rel_path": rel_path,
                                "filename": filename,
                                "file_size": file_size,
                                "hash_sha256": "",
                                "metadata": {}
                            });
                            conn.execute(
                                "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                 VALUES (?1, ?2, 'file', ?3, 'FileCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                                params![Uuid::new_v4().to_string(), project_uuid, uuid, event_payload.to_string(), global_seq, created_at],
                            ).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2d. Synthesize LayerCreated
        let project_uuid = id_map
            .get("projects")
            .and_then(|m| m.values().next())
            .cloned()
            .unwrap_or_default();

        // 2d.1 From v1_layers (lowercase)
        if let Some(layers_map) = id_map.get("layers") {
            let has_v1_layers: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_layers'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_layers > 0 {
                let mut stmt = conn.prepare("SELECT id, project_id, name, type, color, visible, created_at, region_id FROM v1_layers").map_err(|e| e.to_string())?;
                let layer_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, Option<String>>(3)?,
                            row.get::<_, Option<String>>(4)?,
                            row.get::<_, Option<i64>>(5)?.unwrap_or(1),
                            row.get::<_, Option<String>>(6)?
                                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                            row.get::<_, Option<i64>>(7)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in layer_rows {
                    if let Ok((old_id, old_p_id, name, l_type, color, visible, created_at, _)) = row
                    {
                        let p_uuid = id_map
                            .get("projects")
                            .and_then(|m| m.get(&old_p_id))
                            .cloned()
                            .unwrap_or(project_uuid.clone());
                        if let Some(uuid) = layers_map.get(&old_id) {
                            let event_payload = serde_json::json!({
                                "type": "LayerCreated",
                                "name": name,
                                "metadata": {
                                    "layer_type": l_type.unwrap_or_else(|| "feature".to_string()),
                                    "color": color.unwrap_or_else(|| "#4285F4".to_string()),
                                    "visible": visible > 0
                                }
                            });
                            conn.execute(
                                "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                VALUES (?1, ?2, 'layer', ?3, 'LayerCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                                params![Uuid::new_v4().to_string(), p_uuid, uuid, event_payload.to_string(), global_seq, created_at],
                            ).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2d.2 From v1_Layers (PascalCase)
        if let Some(layers_map) = id_map.get("Layers") {
            let has_v1_layers_pc: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_Layers'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_layers_pc > 0 {
                let mut stmt = conn
                    .prepare("SELECT id, Name FROM v1_Layers")
                    .map_err(|e| e.to_string())?;
                let layer_rows = stmt
                    .query_map([], |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                    })
                    .map_err(|e| e.to_string())?;

                for row in layer_rows {
                    if let Ok((old_id, name)) = row {
                        if let Some(uuid) = layers_map.get(&old_id) {
                            let event_payload = serde_json::json!({
                                "type": "LayerCreated",
                                "name": name,
                                "metadata": { "is_migrated": true }
                            });
                            conn.execute(
                                "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                 VALUES (?1, ?2, 'layer', ?3, 'LayerCreated', ?4, 1, ?5, 'migration_synth', datetime('now'))",
                                params![Uuid::new_v4().to_string(), project_uuid, uuid, event_payload.to_string(), global_seq],
                            ).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2e. Synthesize FeatureCreated
        if let Some(features_map) = id_map.get("features") {
            let has_v1_features: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_features'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_features > 0 {
                let columns = Self::get_table_columns(conn, "v1_features").unwrap_or_default();
                let has_layer_col = columns.iter().any(|c| c == "layer_id");
                let query = if has_layer_col {
                    "SELECT id, project_id, name, geom_type, geometry_json, properties_json, created_at, layer_id FROM v1_features"
                } else {
                    "SELECT id, project_id, name, geom_type, geometry_json, properties_json, created_at, NULL as layer_id FROM v1_features"
                };

                let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
                let feature_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, String>(4)?,
                            row.get::<_, Option<String>>(5)?,
                            row.get::<_, Option<String>>(6)?
                                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                            row.get::<_, Option<i64>>(7)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in feature_rows {
                    if let Ok((
                        old_id,
                        old_project_id,
                        name,
                        geom_type,
                        geometry,
                        properties,
                        created_at,
                        old_layer_id,
                    )) = row
                    {
                        let project_uuid = id_map
                            .get("projects")
                            .and_then(|m| m.get(&old_project_id))
                            .cloned()
                            .unwrap_or_default();
                        if let Some(feature_uuid) = features_map.get(&old_id) {
                            let project_uuid_parsed =
                                Uuid::parse_str(&project_uuid).unwrap_or(Uuid::nil());
                            let layer_uuid = if let Some(lid) = old_layer_id {
                                id_map
                                    .get("layers")
                                    .and_then(|m| m.get(&lid))
                                    .cloned()
                                    .or_else(|| {
                                        id_map.get("Layers").and_then(|m| m.get(&lid)).cloned()
                                    })
                                    .unwrap_or_else(|| {
                                        Uuid::new_v5(&project_uuid_parsed, b"layer_default")
                                            .to_string()
                                    })
                            } else {
                                Uuid::new_v5(&project_uuid_parsed, b"layer_default").to_string()
                            };

                            let (final_geom_type, final_geometry, final_properties) = if geom_type
                                == "camera"
                                || geom_type == "intersection"
                            {
                                let mut props = serde_json::from_str::<serde_json::Value>(
                                    &properties.clone().unwrap_or_else(|| "{}".to_string()),
                                )
                                .unwrap_or(serde_json::json!({}));
                                props["original_v1_type"] = serde_json::json!(geom_type);
                                let geom_val = serde_json::from_str::<serde_json::Value>(&geometry)
                                    .unwrap_or(serde_json::json!({}));
                                let sanitized_geom = if geom_val.get("coordinates").is_some() {
                                    serde_json::json!({ "type": "Point", "coordinates": geom_val["coordinates"] })
                                } else {
                                    geom_val
                                };
                                (geom_type, sanitized_geom, props)
                            } else {
                                (
                                    geom_type,
                                    serde_json::from_str::<serde_json::Value>(&geometry)
                                        .unwrap_or(serde_json::json!({})),
                                    serde_json::from_str::<serde_json::Value>(
                                        &properties.unwrap_or_else(|| "{}".to_string()),
                                    )
                                    .unwrap_or(serde_json::json!({})),
                                )
                            };

                            let event_payload = serde_json::json!({
                                "type": "FeatureCreated",
                                "layer_id": layer_uuid,
                                "name": name,
                                "geom_type": final_geom_type,
                                "geometry": final_geometry,
                                "properties": final_properties,
                                "is_visible": true
                            });

                            conn.execute("INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                           VALUES (?1, ?2, 'feature', ?3, 'FeatureCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                                         params![Uuid::new_v4().to_string(), project_uuid, feature_uuid, event_payload.to_string(), global_seq, created_at]).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2e.1 Synthesize FeatureCreated from v1_Points (PascalCase)
        if let Some(points_map) = id_map.get("Points") {
            let has_v1_points: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_Points'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_points > 0 {
                let mut stmt = conn
                    .prepare("SELECT id, LayerId, Name, X, Y, Z, Metadata FROM v1_Points")
                    .map_err(|e| e.to_string())?;
                let point_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, f64>(3)?,
                            row.get::<_, f64>(4)?,
                            row.get::<_, f64>(5)?,
                            row.get::<_, Option<String>>(6)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in point_rows {
                    if let Ok((old_id, old_layer_id, name, x, y, z, metadata)) = row {
                        if let Some(feature_uuid) = points_map.get(&old_id) {
                            let l_uuid = id_map
                                .get("Layers")
                                .and_then(|m| m.get(&old_layer_id))
                                .cloned()
                                .unwrap_or_default();
                            let payload = serde_json::json!({
                                "type": "FeatureCreated",
                                "layer_id": l_uuid,
                                "name": name,
                                "geom_type": "Point",
                                "geometry": { "type": "Point", "coordinates": [x, y, z] },
                                "properties": serde_json::from_str::<serde_json::Value>(&metadata.unwrap_or_else(|| "{}".to_string())).unwrap_or(serde_json::json!({})),
                                "is_visible": true
                            });
                            conn.execute("INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                           VALUES (?1, ?2, 'feature', ?3, 'FeatureCreated', ?4, 1, ?5, 'migration_synth', datetime('now'))",
                                         params![Uuid::new_v4().to_string(), project_uuid, feature_uuid, payload.to_string(), global_seq]).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2e.2 Synthesize FeatureCreated from v1_Lines (PascalCase)
        if let Some(lines_map) = id_map.get("Lines") {
            let has_v1_lines: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_Lines'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_lines > 0 {
                let mut stmt = conn
                    .prepare("SELECT id, LayerId, Name, Coordinates, Metadata FROM v1_Lines")
                    .map_err(|e| e.to_string())?;
                let line_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, Option<String>>(4)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in line_rows {
                    if let Ok((old_id, old_layer_id, name, coords_json, metadata)) = row {
                        if let Some(feature_uuid) = lines_map.get(&old_id) {
                            let l_uuid = id_map
                                .get("Layers")
                                .and_then(|m| m.get(&old_layer_id))
                                .cloned()
                                .unwrap_or_default();
                            let coords: Vec<Vec<f64>> =
                                serde_json::from_str(&coords_json).unwrap_or_default();
                            let payload = serde_json::json!({
                                "type": "FeatureCreated",
                                "layer_id": l_uuid,
                                "name": name,
                                "geom_type": "LineString",
                                "geometry": { "type": "LineString", "coordinates": coords },
                                "properties": serde_json::from_str::<serde_json::Value>(&metadata.unwrap_or_else(|| "{}".to_string())).unwrap_or(serde_json::json!({})),
                                "is_visible": true
                            });
                            conn.execute("INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                           VALUES (?1, ?2, 'feature', ?3, 'FeatureCreated', ?4, 1, ?5, 'migration_synth', datetime('now'))",
                                         params![Uuid::new_v4().to_string(), project_uuid, feature_uuid, payload.to_string(), global_seq]).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2e.3 Synthesize FeatureCreated from v1_Cameras (PascalCase)
        if let Some(cameras_map) = id_map.get("Cameras") {
            let has_v1_cameras: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_Cameras'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_cameras > 0 {
                let mut stmt = conn
                    .prepare("SELECT id, LayerId, Name, X, Y, Z, Metadata FROM v1_Cameras")
                    .map_err(|e| e.to_string())?;
                let camera_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, f64>(3)?,
                            row.get::<_, f64>(4)?,
                            row.get::<_, f64>(5)?,
                            row.get::<_, Option<String>>(6)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in camera_rows {
                    if let Ok((old_id, old_layer_id, name, x, y, z, metadata)) = row {
                        if let Some(feature_uuid) = cameras_map.get(&old_id) {
                            let l_uuid = id_map
                                .get("Layers")
                                .and_then(|m| m.get(&old_layer_id))
                                .cloned()
                                .unwrap_or_default();
                            let payload = serde_json::json!({
                                "type": "FeatureCreated",
                                "layer_id": l_uuid,
                                "name": name,
                                "geom_type": "camera",
                                "geometry": { "type": "Point", "coordinates": [x, y, z] },
                                "properties": serde_json::from_str::<serde_json::Value>(&metadata.unwrap_or_else(|| "{}".to_string())).unwrap_or(serde_json::json!({})),
                                "is_visible": true
                            });
                            conn.execute("INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                           VALUES (?1, ?2, 'feature', ?3, 'FeatureCreated', ?4, 1, ?5, 'migration_synth', datetime('now'))",
                                         params![Uuid::new_v4().to_string(), project_uuid, feature_uuid, payload.to_string(), global_seq]).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2e.4 Synthesize FeatureCreated from v1_Intersections (PascalCase)
        if let Some(int_map) = id_map.get("Intersections") {
            let has_v1_int: i64 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_Intersections'", [], |r| r.get(0)).unwrap_or(0);
            if has_v1_int > 0 {
                let mut stmt = conn
                    .prepare("SELECT id, LayerId, Name, X, Y, Z, Metadata FROM v1_Intersections")
                    .map_err(|e| e.to_string())?;
                let int_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, f64>(3)?,
                            row.get::<_, f64>(4)?,
                            row.get::<_, f64>(5)?,
                            row.get::<_, Option<String>>(6)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in int_rows {
                    if let Ok((old_id, old_layer_id, name, x, y, z, metadata)) = row {
                        if let Some(feature_uuid) = int_map.get(&old_id) {
                            let l_uuid = id_map
                                .get("Layers")
                                .and_then(|m| m.get(&old_layer_id))
                                .cloned()
                                .unwrap_or_default();
                            let payload = serde_json::json!({
                                "type": "FeatureCreated",
                                "layer_id": l_uuid,
                                "name": name,
                                "geom_type": "intersection",
                                "geometry": { "type": "Point", "coordinates": [x, y, z] },
                                "properties": serde_json::from_str::<serde_json::Value>(&metadata.unwrap_or_else(|| "{}".to_string())).unwrap_or(serde_json::json!({})),
                                "is_visible": true
                            });
                            conn.execute("INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                           VALUES (?1, ?2, 'feature', ?3, 'FeatureCreated', ?4, 1, ?5, 'migration_synth', datetime('now'))",
                                         params![Uuid::new_v4().to_string(), project_uuid, feature_uuid, payload.to_string(), global_seq]).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2e. Synthesize PersonnelCreated
        if let Some(personnel_map) = id_map.get("personnel") {
            let has_v1_personnel: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_personnel'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_personnel > 0 {
                let mut stmt = conn
                    .prepare("SELECT id, project_id, name, created_at FROM v1_personnel")
                    .map_err(|e| e.to_string())?;
                let personnel_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, Option<String>>(3)?
                                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in personnel_rows {
                    if let Ok((old_id, old_project_id, name, created_at)) = row {
                        let project_uuid = id_map
                            .get("projects")
                            .and_then(|m| m.get(&old_project_id))
                            .cloned()
                            .unwrap_or_default();
                        if let Some(uuid) = personnel_map.get(&old_id) {
                            let event_payload = serde_json::json!({
                                "type": "PersonnelCreated",
                                "name": name,
                                "metadata": {}
                            });
                            conn.execute(
                                "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                 VALUES (?1, ?2, 'personnel', ?3, 'PersonnelCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                                params![Uuid::new_v4().to_string(), project_uuid, uuid, event_payload.to_string(), global_seq, created_at],
                            ).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2f. Synthesize WorkItemCreated
        if let Some(work_item_map) = id_map.get("work_items") {
            let has_v1_work_items: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_work_items'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_work_items > 0 {
                let columns = Self::table_columns(conn, "v1_work_items")?;
                let query = format!(
                    "SELECT id, project_id, {}, name, {}, {}, {}, {}, {}, {} FROM v1_work_items",
                    Self::select_column(&columns, "feature_id", "NULL"),
                    Self::select_column(&columns, "material_id", "NULL"),
                    Self::select_column(&columns, "quantity", "0"),
                    Self::select_column(&columns, "unit_price", "0"),
                    Self::select_column(&columns, "total_price", "0"),
                    Self::select_column(&columns, "status", "'pending'"),
                    Self::select_column(&columns, "created_at", "datetime('now')")
                );

                let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
                let work_item_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, Option<String>>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, Option<i64>>(4)?,
                            row.get::<_, f64>(5)?,
                            row.get::<_, f64>(6)?,
                            row.get::<_, f64>(7)?,
                            row.get::<_, String>(8)?,
                            row.get::<_, String>(9)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in work_item_rows {
                    if let Ok((
                        old_id,
                        old_project_id,
                        old_feature_id,
                        name,
                        old_material_id,
                        quantity,
                        unit_price,
                        _total_price,
                        status,
                        created_at,
                    )) = row
                    {
                        let project_uuid = id_map
                            .get("projects")
                            .and_then(|m| m.get(&old_project_id))
                            .cloned()
                            .unwrap_or_default();

                        let feature_uuid = if let Some(fid_str) = old_feature_id {
                            if let Ok(fid) = fid_str.parse::<i64>() {
                                id_map.get("features").and_then(|m| m.get(&fid)).cloned()
                            } else {
                                None
                            }
                        } else {
                            None
                        };

                        let material_uuid = if let Some(mid) = old_material_id {
                            id_map.get("materials").and_then(|m| m.get(&mid)).cloned()
                        } else {
                            None
                        };

                        if let Some(uuid) = work_item_map.get(&old_id) {
                            let event_payload = serde_json::json!({
                                "type": "WorkItemCreated",
                                "name": name,
                                "feature_id": feature_uuid,
                                "material_id": material_uuid,
                                "quantity": quantity,
                                "unit_price": unit_price,
                                "metadata": {
                                    "status": status
                                }
                            });
                            conn.execute(
                                "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                 VALUES (?1, ?2, 'work_item', ?3, 'WorkItemCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                                params![Uuid::new_v4().to_string(), project_uuid, uuid, event_payload.to_string(), global_seq, created_at],
                            ).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2g. Synthesize NoteCreated
        if let Some(notes_map) = id_map.get("notes") {
            let has_v1_notes: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_notes'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_notes > 0 {
                let columns = Self::table_columns(conn, "v1_notes")?;
                let query = format!(
                    "SELECT id, project_id, {}, {}, {} FROM v1_notes",
                    Self::select_column(&columns, "title", "'Note'"),
                    Self::select_column(&columns, "content", "''"),
                    Self::select_column(&columns, "created_at", "datetime('now')")
                );

                let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
                let note_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, String>(4)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in note_rows {
                    if let Ok((old_id, old_project_id, title, content, created_at)) = row {
                        let project_uuid = id_map
                            .get("projects")
                            .and_then(|m| m.get(&old_project_id))
                            .cloned()
                            .unwrap_or_default();
                        if let Some(uuid) = notes_map.get(&old_id) {
                            let event_payload = serde_json::json!({
                                "type": "NoteCreated",
                                "title": title,
                                "content": content,
                                "metadata": {}
                            });
                            conn.execute(
                                "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                 VALUES (?1, ?2, 'note', ?3, 'NoteCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                                params![Uuid::new_v4().to_string(), project_uuid, uuid, event_payload.to_string(), global_seq, created_at],
                            ).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2h. Synthesize MaterialCreated
        if let Some(materials_map) = id_map.get("materials") {
            let has_v1_materials: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_materials'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_materials > 0 {
                let columns = Self::table_columns(conn, "v1_materials")?;
                let query = format!(
                    "SELECT id, project_id, {}, {}, {}, {}, {} FROM v1_materials",
                    Self::select_column(&columns, "name", "'Material'"),
                    Self::select_column(&columns, "code", "''"),
                    Self::select_column(&columns, "unit", "'units'"),
                    Self::select_column(&columns, "price", "0"),
                    Self::select_column(&columns, "created_at", "datetime('now')")
                );

                let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
                let material_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, String>(4)?,
                            row.get::<_, f64>(5)?,
                            row.get::<_, String>(6)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in material_rows {
                    if let Ok((old_id, old_project_id, name, code, unit, price, created_at)) = row {
                        let project_uuid = id_map
                            .get("projects")
                            .and_then(|m| m.get(&old_project_id))
                            .cloned()
                            .unwrap_or_default();
                        if let Some(uuid) = materials_map.get(&old_id) {
                            let event_payload = serde_json::json!({
                                "type": "MaterialCreated",
                                "name": name,
                                "code": if code.is_empty() { name.chars().take(5).collect::<String>().to_uppercase() } else { code },
                                "metadata": {
                                    "unit": unit,
                                    "price": price
                                }
                            });
                            conn.execute(
                                "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                 VALUES (?1, ?2, 'material', ?3, 'MaterialCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                                params![Uuid::new_v4().to_string(), project_uuid, uuid, event_payload.to_string(), global_seq, created_at],
                            ).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        // 2i. Synthesize ContractCreated
        if let Some(contracts_map) = id_map.get("contracts") {
            let has_v1_contracts: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_contracts'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has_v1_contracts > 0 {
                let columns = Self::table_columns(conn, "v1_contracts")?;
                let query = format!(
                    "SELECT id, project_id, {}, {}, {}, {}, {}, {} FROM v1_contracts",
                    Self::select_column(&columns, "name", "'Contract'"),
                    Self::select_column(&columns, "contract_number", "''"),
                    Self::select_column(&columns, "vendor", "NULL"),
                    Self::select_column(&columns, "details", "''"),
                    Self::select_column(&columns, "status", "'active'"),
                    Self::select_column(&columns, "created_at", "datetime('now')")
                );

                let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
                let contract_rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, Option<String>>(4)?,
                            row.get::<_, String>(5)?,
                            row.get::<_, String>(6)?,
                            row.get::<_, String>(7)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;

                for row in contract_rows {
                    if let Ok((
                        old_id,
                        old_project_id,
                        name,
                        contract_num,
                        vendor,
                        details,
                        status,
                        created_at,
                    )) = row
                    {
                        let project_uuid = id_map
                            .get("projects")
                            .and_then(|m| m.get(&old_project_id))
                            .cloned()
                            .unwrap_or_default();
                        if let Some(uuid) = contracts_map.get(&old_id) {
                            let event_payload = serde_json::json!({
                                "type": "ContractCreated",
                                "name": name,
                                "contract_number": if contract_num.is_empty() { format!("CN-{}", old_id) } else { contract_num },
                                "vendor": vendor,
                                "metadata": {
                                    "details": details,
                                    "status": status
                                }
                            });
                            conn.execute(
                                "INSERT OR IGNORE INTO event_store (id, project_id, entity_type, entity_id, event_type, payload_json, version, global_seq, device_id, created_at)
                                 VALUES (?1, ?2, 'contract', ?3, 'ContractCreated', ?4, 1, ?5, 'migration_synth', ?6)",
                                params![Uuid::new_v4().to_string(), project_uuid, uuid, event_payload.to_string(), global_seq, created_at],
                            ).ok();
                            global_seq += 1;
                        }
                    }
                }
            }
        }

        Ok(global_seq)
    }

    /// Rebuild entity_index from projection tables
    fn rebuild_entity_index(conn: &Connection) -> Result<i64, String> {
        // Index tasks
        conn.execute(
            "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
             SELECT id, 'task', project_id, name, name, COALESCE(updated_at, datetime('now')) FROM tasks",
            [],
        )
        .map_err(|e| e.to_string())?;

        // Index files
        conn.execute(
            "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
             SELECT id, 'file', project_id, filename, filename, COALESCE(updated_at, datetime('now')) FROM files",
            [],
        )
        .map_err(|e| e.to_string())?;

        // Index features
        let has_features: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='features'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if has_features > 0 {
            conn.execute(
                "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                 SELECT id, 'feature', project_id, name, name, COALESCE(updated_at, datetime('now')) FROM features",
                [],
            )
            .ok();
        }

        // Index notes
        let has_notes: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='notes'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if has_notes > 0 {
            conn.execute(
                "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                 SELECT id, 'note', project_id, title, title, COALESCE(updated_at, datetime('now')) FROM notes",
                [],
            )
            .ok();
        }

        // Index work items
        let has_work_items: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='work_items'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if has_work_items > 0 {
            conn.execute(
                "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                 SELECT id, 'work_item', project_id, name, name, COALESCE(updated_at, datetime('now')) FROM work_items",
                [],
            )
            .ok();
        }

        // Index contracts
        let has_contracts: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='contracts'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if has_contracts > 0 {
            conn.execute(
                "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                 SELECT id, 'contract', project_id, name, name, COALESCE(updated_at, datetime('now')) FROM contracts",
                [],
            )
            .ok();
        }

        // Index regions
        let has_regions: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='regions'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if has_regions > 0 {
            conn.execute(
                "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                 SELECT id, 'region', project_id, name, name, COALESCE(updated_at, datetime('now')) FROM regions",
                [],
            )
            .ok();
        }

        let index_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM entity_index", [], |r| r.get(0))
            .unwrap_or(0);

        Ok(index_count)
    }

    /// Helper to rebuild all projections using ProjectionEngine
    fn rebuild_all_projections(conn: &Connection) -> Result<(), String> {
        // Fallback to picking the winner ID
        let project_id_str: String = conn
            .query_row("SELECT id FROM projects LIMIT 1", [], |r| r.get(0))
            .map_err(|e| format!("No project found for rebuild: {}", e))?;

        Self::rebuild_all_projections_for_id(conn, &project_id_str)
    }

    /// Helper to rebuild all projections for a specific project ID
    fn rebuild_all_projections_for_id(
        conn: &Connection,
        project_id_str: &str,
    ) -> Result<(), String> {
        use crate::implement::modules::v2::projections::*;

        let project_id = Uuid::parse_str(project_id_str).map_err(|e| e.to_string())?;

        // Setup engine with all projectors
        let projectors: Vec<Box<dyn Projector>> = vec![
            Box::new(ProjectProjector),
            Box::new(FileProjector),
            Box::new(TaskProjector),
            Box::new(FeatureProjector),
            Box::new(WorkItemProjector),
            Box::new(ContractProjector),
            Box::new(LayerProjector),
            Box::new(FeatureGroupProjector),
            Box::new(NoteProjector),
            Box::new(MaterialProjector),
            Box::new(RegionProjector),
            Box::new(PersonnelProjector),
            Box::new(SettingsProjector),
            Box::new(ContentItemProjector),
        ];

        for projector in projectors {
            log::info!(
                "[V2 Migration] Rebuilding projection for {} to ID {}...",
                projector.entity_type(),
                project_id
            );
            projector.rebuild(conn, project_id)?;
        }

        Ok(())
    }

    /// Check for foreign key violations
    fn check_fk_violations(conn: &Connection) -> i64 {
        conn.query_row("PRAGMA foreign_key_check", [], |r| r.get(0))
            .unwrap_or(0)
    }

    /// Remove V1 tables (cleanup)
    pub fn cleanup_v1_tables(conn: &Connection) -> Result<(), String> {
        let v1_tables = vec![
            "v1_projects",
            "v1_files",
            "v1_tasks",
            "v1_features",
            "v1_layers",
            "v1_regions",
            "v1_notes",
            "v1_materials",
            "v1_contracts",
            "v1_personnel",
            "v1_work_items",
            "v1_design_events",
            "v1_spatial_features",
            "v1_feature_groups",
            "v1_design_styles",
            "v1_project_settings",
            "v1_project_folders",
            "v1_feature_attachments",
            "v1_audit_logs",
            "v1_content_types",
            "v1_content_fields",
            "v1_content_items",
            "v1_roles",
            "v1_personnel_roles",
            "v1_contract_execution_groups",
        ];

        for table in v1_tables {
            conn.execute(&format!("DROP TABLE IF EXISTS {}", table), [])
                .ok();
        }
        Ok(())
    }

    // Helper functions for dynamic SQL projection
    fn table_columns(conn: &Connection, table_name: &str) -> Result<Vec<String>, String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info('{}')", table_name))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(rows)
    }

    fn select_column(columns: &[String], column_name: &str, default_expr: &str) -> String {
        if columns.iter().any(|column| column == column_name) {
            format!("\"{}\"", column_name)
        } else {
            default_expr.to_string()
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_v1_database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();

        // Create minimal V1 schema
        conn.execute_batch(
            "
            CREATE TABLE projects (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                root_path TEXT NOT NULL,
                path TEXT,
                description TEXT,
                status TEXT DEFAULT 'active',
                metadata_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                path TEXT NOT NULL,
                filename TEXT NOT NULL,
                rel_path TEXT,
                extension TEXT,
                size INTEGER DEFAULT 0,
                file_size INTEGER DEFAULT 0,
                metadata_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                parent_id INTEGER,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'todo',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE personnel (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE contracts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE materials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE work_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                material_id INTEGER,
                name TEXT NOT NULL,
                quantity REAL DEFAULT 0,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id),
                FOREIGN KEY (material_id) REFERENCES materials(id)
            );

            CREATE TABLE notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                title TEXT NOT NULL,
                content TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                permissions_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE content_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                icon TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE content_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_type_id INTEGER,
                project_id INTEGER,
                name TEXT NOT NULL,
                data_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (content_type_id) REFERENCES content_types(id),
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE personnel_roles (
                personnel_id INTEGER NOT NULL,
                role_id INTEGER NOT NULL,
                PRIMARY KEY (personnel_id, role_id),
                FOREIGN KEY (personnel_id) REFERENCES personnel(id),
                FOREIGN KEY (role_id) REFERENCES roles(id)
            );

            CREATE TABLE feature_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                feature_id TEXT NOT NULL,
                file_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id),
                FOREIGN KEY (file_id) REFERENCES files(id)
            );

            CREATE TABLE design_styles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                geom_type TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE contract_execution_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                user_id INTEGER,
                action_type TEXT NOT NULL,
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id),
                FOREIGN KEY (user_id) REFERENCES personnel(id)
            );

            CREATE TABLE project_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                folder_path TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE project_settings (
                project_id INTEGER PRIMARY KEY,
                epsg_code TEXT DEFAULT '3857',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE design_events (
                event_id TEXT PRIMARY KEY,
                project_id INTEGER,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_undone BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            -- Insert test data
            INSERT INTO projects (id, name, root_path) VALUES (1, 'Test Project', '/test');
            INSERT INTO files (project_id, path, filename, rel_path) VALUES (1, '/test/doc.pdf', 'doc.pdf', 'test/doc.pdf');
            INSERT INTO tasks (project_id, name) VALUES (1, 'Test Task');
            INSERT INTO personnel (project_id, name) VALUES (1, 'John Doe');
            INSERT INTO design_events (event_id, project_id, event_type, payload_json)
                VALUES ('evt-1', 1, 'FeatureCreated', '{\"name\":\"Test Feature\"}');
            ",
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_detect_v1_database() {
        let conn = create_v1_database();
        assert!(!schema::is_v2_database(&conn).unwrap());
    }

    #[test]
    fn test_migration_report_has_data() {
        let conn = create_v1_database();

        // Run migration
        let report = V1ToV2Migrator::migrate(&conn).unwrap();

        // Verify report has data
        assert!(report.success);
        assert!(report.event_count > 0, "Should have migrated events");
        assert!(report.task_count > 0, "Should have migrated tasks");
        assert!(report.id_map_size > 0, "Should have ID mappings");
    }

    #[test]
    fn test_migration_creates_event_store() {
        let conn = create_v1_database();

        // Run migration
        V1ToV2Migrator::migrate(&conn).unwrap();

        // Verify event_store table exists and has data
        let event_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM event_store", [], |r| r.get(0))
            .unwrap();
        assert!(event_count > 0, "Event store should have events");
    }

    #[test]
    fn test_migration_creates_entity_index() {
        let conn = create_v1_database();

        // Run migration
        V1ToV2Migrator::migrate(&conn).unwrap();

        // Verify entity_index table exists and has data
        let index_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM entity_index", [], |r| r.get(0))
            .unwrap();
        assert!(index_count > 0, "Entity index should have entries");
    }

    #[test]
    fn test_migration_converts_to_v2() {
        let conn = create_v1_database();

        // Run migration
        V1ToV2Migrator::migrate(&conn).unwrap();

        // Verify database is now V2
        assert!(
            schema::is_v2_database(&conn).unwrap(),
            "Database should be V2 after migration"
        );

        // Verify projects have UUID IDs
        let project_id: String = conn
            .query_row("SELECT id FROM projects LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert!(
            Uuid::parse_str(&project_id).is_ok(),
            "Project ID should be a valid UUID"
        );

        // Verify files have UUID IDs
        let file_id: String = conn
            .query_row("SELECT id FROM files LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert!(
            Uuid::parse_str(&file_id).is_ok(),
            "File ID should be a valid UUID"
        );
    }

    #[test]
    fn test_migration_fails_on_already_v2() {
        let conn = Connection::open_in_memory().unwrap();
        schema::apply_v2_schema(&conn).unwrap();

        let result = V1ToV2Migrator::migrate(&conn);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already V2"));
    }

    #[test]
    fn test_cleanup_v1_tables() {
        let conn = create_v1_database();

        // Run migration first
        V1ToV2Migrator::migrate(&conn).unwrap();

        // Verify V1 tables exist before cleanup (as v1_*)
        let v1_design_events_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_design_events'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(
            v1_design_events_exists > 0,
            "v1_design_events should exist before cleanup"
        );

        // Run cleanup
        V1ToV2Migrator::cleanup_v1_tables(&conn).unwrap();

        // Verify V1 tables are removed
        let v1_design_events_exists_after: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='v1_design_events'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            v1_design_events_exists_after, 0,
            "v1_design_events should be removed after cleanup"
        );
    }

    #[test]
    #[ignore]
    fn inspect_user_pmp() {
        let db_path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165.pmp";
        let _db = crate::implement::modules::v2::V2Database::open(db_path, "repair-tool")
            .expect("Failed to open and repair user PMP file");
        let conn = Connection::open(db_path).expect("Failed to re-open for inspection");
        {
            let mut stmt = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='table'")
                .unwrap();
            let tables: Vec<String> = stmt
                .query_map([], |r| r.get(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();
            println!("USER_DB_TABLES: {:?}", tables);
            if tables.contains(&"v1_projects".to_string()) {
                let count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM v1_projects", [], |r| r.get(0))
                    .unwrap_or(0);
                println!("USER_V1_PROJECT_COUNT: {}", count);
            }
            if tables.contains(&"v1_design_events".to_string()) {
                let count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM v1_design_events", [], |r| r.get(0))
                    .unwrap_or(0);
                println!("USER_V1_DESIGN_EVENTS_COUNT: {}", count);
            }
            if tables.contains(&"v1_design_events".to_string()) {
                let mut stmt = conn.prepare("SELECT event_id, project_id, event_type, payload_json, timestamp, is_undone FROM v1_design_events LIMIT 5").unwrap();
                let rows = stmt
                    .query_map([], |row| {
                        let event_id: Result<String, _> = row.get(0);
                        let project_id: Result<Option<i64>, _> = row.get(1);
                        let event_type: Result<String, _> = row.get(2);
                        let is_undone: Result<i64, _> = row.get(5);
                        Ok((event_id, project_id, event_type, is_undone))
                    })
                    .unwrap();

                for (i, row) in rows.enumerate() {
                    match row {
                        Ok((eid, pid, etype, undone)) => {
                            println!(
                                "ROW {}: eid={:?}, pid={:?}, etype={:?}, undone={:?}",
                                i, eid, pid, etype, undone
                            );
                        }
                        Err(e) => println!("ROW {} ERROR: {}", i, e),
                    }
                }
            }
            if tables.contains(&"v1_features".to_string()) {
                let count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM v1_features", [], |r| r.get(0))
                    .unwrap_or(0);
                println!("USER_V1_FEATURE_COUNT: {}", count);
            }
            if tables.contains(&"features".to_string()) {
                let count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM features", [], |r| r.get(0))
                    .unwrap_or(0);
                println!("USER_V2_FEATURE_COUNT: {}", count);
            }
            if tables.contains(&"event_store".to_string())
                && tables.contains(&"v1_design_events".to_string())
            {
                let count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM event_store", [], |r| r.get(0))
                    .unwrap_or(0);
                println!("USER_EVENT_COUNT_BEFORE_MANUAL: {}", count);

                println!("[DEBUG] Attempting manual rebuild of events...");
                let mut id_map = HashMap::new();
                if tables.contains(&"v1_projects".to_string()) {
                    let mut p_map = HashMap::new();
                    // Thử cả ProjectID và id (do có thể đã rename)
                    let mut stmt = conn
                        .prepare("SELECT id FROM v1_projects")
                        .or_else(|_| conn.prepare("SELECT ProjectID FROM v1_projects"))
                        .unwrap();
                    let p_ids: Vec<i64> = stmt
                        .query_map([], |r| r.get(0))
                        .unwrap()
                        .filter_map(|r| r.ok())
                        .collect();
                    for pid in p_ids {
                        // Ánh xạ sang ID V2 nếu đã có trong bảng projects
                        let v2_id: Option<String> = conn
                            .query_row("SELECT id FROM projects LIMIT 1", [], |r| r.get(0))
                            .ok();
                        p_map.insert(pid, v2_id.unwrap_or_else(|| Uuid::new_v4().to_string()));
                    }
                    id_map.insert("projects".to_string(), p_map);
                }

                match V1ToV2Migrator::rebuild_event_store_v2(&conn, &id_map, &[]) {
                    Ok(cnt) => {
                        println!("[DEBUG] Rebuild success! Migrator reported {} events", cnt)
                    }
                    Err(e) => println!("[DEBUG] Rebuild FAILED: {}", e),
                }

                let new_count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM event_store", [], |r| r.get(0))
                    .unwrap_or(0);
                println!("USER_EVENT_COUNT_AFTER_MANUAL: {}", new_count);
            }
        }
    }

    #[test]
    #[ignore]
    fn force_rebuild_user_pmp_final() {
        use crate::implement::modules::v2::projections::*;
        let db_path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165_fix.pmp";
        let conn = Connection::open(db_path).expect("Failed to open DB");

        // ID này được xác định từ Event Store
        let project_id_str = "d9d7986b-c630-4e9d-a9ff-ed5309164c0f";
        let project_id = Uuid::parse_str(project_id_str).unwrap();

        println!("--- FORCE REBUILD START ---");
        println!("Project ID: {}", project_id);

        // Đảm bảo project tồn tại trong bảng projects
        conn.execute(
            "INSERT OR IGNORE INTO projects (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
            [project_id_str, "Du_an_165"],
        ).unwrap();

        let projectors: Vec<Box<dyn Projector>> = vec![
            Box::new(ProjectProjector),
            Box::new(LayerProjector),
            Box::new(FeatureGroupProjector),
            Box::new(FeatureProjector),
            Box::new(TaskProjector),
            Box::new(FileProjector),
            Box::new(NoteProjector),
        ];

        for projector in projectors {
            let name = projector.entity_type();
            println!("Rebuilding {}...", name);
            projector
                .rebuild(&conn, project_id)
                .expect(&format!("Failed to rebuild {}", name));
        }

        println!("--- FORCE REBUILD DONE ---");
    }
}
