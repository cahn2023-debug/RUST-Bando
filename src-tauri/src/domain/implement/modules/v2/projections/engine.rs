use rusqlite::{params, Connection};
/// Projection Engine (CQRS-lite)
///
/// Transforms events from EventStore into read model tables.
/// Each entity type has a Projector that knows how to apply events.
use uuid::Uuid;

use crate::domain::contract::spatial_models::BBox;
pub use crate::domain::implement::db::projection_engine::{ProjectionEngine, Projector};
use crate::domain::models::v2::{AppEvent, EventEnvelope};

// ============================================================================
// TaskProjector (Example Implementation)
// ============================================================================

// ============================================================================
// TaskProjector (Example Implementation)
// ============================================================================

pub struct TaskProjector;

impl Projector for TaskProjector {
    fn entity_type(&self) -> &str {
        "task"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::TaskCreated {
                name,
                parent_id,
                metadata,
                ..
            } => {
                conn.execute(
                    "INSERT OR IGNORE INTO tasks (id, project_id, parent_id, name, status, priority, progress, metadata_json, current_version, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, 'todo', 'normal', 0, ?5, ?6, ?7, ?8)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        parent_id.as_ref().map(|u| u.to_string()),
                        name,
                        metadata.to_string(),
                        event.version,
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;

                // Update entity_index for search
                conn.execute(
                    "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                     VALUES (?1, 'task', ?2, ?3, ?4, ?5)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        name,
                        name,
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }

            AppEvent::TaskUpdated { changes } => {
                if let Some(obj) = changes.as_object() {
                    for (key, value) in obj {
                        match key.as_str() {
                            "name" => {
                                let name_str = value.as_str().unwrap_or("").to_string();
                                conn.execute(
                                    "UPDATE tasks SET name = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![name_str, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;

                                conn.execute(
                                    "UPDATE entity_index SET name = ?, search_vector = ?, updated_at = datetime('now')
                                     WHERE entity_id = ? AND entity_type = 'task'",
                                    params![name_str, name_str, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "metadata" => {
                                conn.execute(
                                    "UPDATE tasks SET metadata_json = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![value.to_string(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            // V2 FIX: Handle all task fields from legacy commands
                            "status" => {
                                let v = value.as_str().unwrap_or("todo");
                                conn.execute(
                                    "UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![v, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "is_completed" => {
                                let v = value.as_bool().unwrap_or(false);
                                conn.execute(
                                    "UPDATE tasks SET is_completed = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![v, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "start_date" => {
                                let v = value.as_str();
                                conn.execute(
                                    "UPDATE tasks SET start_date = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![v, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "end_date" => {
                                let v = value.as_str();
                                conn.execute(
                                    "UPDATE tasks SET end_date = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![v, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "color" => {
                                let v = value.as_str();
                                conn.execute(
                                    "UPDATE tasks SET color = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![v, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "parent_id" => {
                                let v = value.as_str();
                                conn.execute(
                                    "UPDATE tasks SET parent_id = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![v, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "target_file_path" => {
                                let v = value.as_str();
                                conn.execute(
                                    "UPDATE tasks SET target_file_path = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![v, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "priority" => {
                                let v = value.as_str().unwrap_or("normal");
                                conn.execute(
                                    "UPDATE tasks SET priority = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![v, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "progress" => {
                                let v = value.as_f64().unwrap_or(0.0);
                                conn.execute(
                                    "UPDATE tasks SET progress = ?, updated_at = datetime('now') WHERE id = ?",
                                    params![v, event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            _ => {
                                // Unknown field — skip silently
                            }
                        }
                    }
                }
            }

            AppEvent::TaskDeleted { .. } => {
                conn.execute(
                    "DELETE FROM tasks WHERE id = ?1",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;

                conn.execute(
                    "DELETE FROM entity_index WHERE entity_id = ? AND entity_type = 'task'",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;

                conn.execute(
                    "DELETE FROM task_links WHERE from_task_id = ?1 OR to_task_id = ?1",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::TaskLinked { target_id, .. } => {
                conn.execute(
                    "INSERT OR REPLACE INTO task_links (id, from_task_id, to_task_id, link_type, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        format!("{}-{}", event.entity_id, target_id),
                        event.entity_id.to_string(),
                        target_id.to_string(),
                        "link",
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::TaskUnlinked { target_id, .. } => {
                conn.execute(
                    "DELETE FROM task_links WHERE from_task_id = ?1 AND to_task_id = ?2",
                    params![event.entity_id.to_string(), target_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        // Clear task projection
        conn.execute(
            "DELETE FROM tasks WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        // Replay all task events
        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'task'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event = AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "task",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version)
            .with_global_seq(0); // Sequence doesn't matter for apply

            // Override created_at to match original
            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// ProjectProjector
// ============================================================================

pub struct ProjectProjector;

impl Projector for ProjectProjector {
    fn entity_type(&self) -> &str {
        "project"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::ProjectCreated {
                id: _id,
                name,
                root_path,
                metadata,
                settings: _settings,
            } => {
                conn.execute(
                    "INSERT OR REPLACE INTO projects (id, name, root_path, metadata_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        event.entity_id.to_string(),
                        name,
                        root_path,
                        metadata.to_string(),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::ProjectUpdated { changes } => {
                if let Some(obj) = changes.as_object() {
                    for (key, value) in obj {
                        match key.as_str() {
                            "name" => {
                                conn.execute(
                                    "UPDATE projects SET name = ?, updated_at = ? WHERE id = ?",
                                    params![
                                        value.as_str().unwrap_or(""),
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            "description" | "project_description" => {
                                conn.execute(
                                    "UPDATE projects SET description = ?, updated_at = ? WHERE id = ?",
                                    params![
                                        value.as_str().unwrap_or(""),
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            "metadata" => {
                                // Update raw metadata blob
                                conn.execute(
                                    "UPDATE projects SET metadata_json = ?, updated_at = ? WHERE id = ?",
                                    params![value.to_string(), event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;

                                // Extract specialized columns from nested metadata if present
                                if let Some(meta_obj) = value.as_object() {
                                    for (m_key, m_val) in meta_obj {
                                        let val_str = match m_val {
                                            serde_json::Value::String(s) => s.clone(),
                                            serde_json::Value::Null => "".to_string(),
                                            _ => m_val.to_string(),
                                        };

                                        match m_key.as_str() {
                                            "contract_number" => {
                                                let _ = conn.execute("UPDATE projects SET contract_number = ? WHERE id = ?", params![val_str, event.entity_id.to_string()]);
                                            }
                                            "investor" => {
                                                let _ = conn.execute(
                                                    "UPDATE projects SET investor = ? WHERE id = ?",
                                                    params![val_str, event.entity_id.to_string()],
                                                );
                                            }
                                            "contractor" => {
                                                let _ = conn.execute("UPDATE projects SET contractor = ? WHERE id = ?", params![val_str, event.entity_id.to_string()]);
                                            }
                                            "signed_date" | "contract_date" => {
                                                let _ = conn.execute("UPDATE projects SET signed_date = ? WHERE id = ?", params![val_str, event.entity_id.to_string()]);
                                            }
                                            "duration" => {
                                                let _ = conn.execute(
                                                    "UPDATE projects SET duration = ? WHERE id = ?",
                                                    params![val_str, event.entity_id.to_string()],
                                                );
                                            }
                                            "end_date" => {
                                                let _ = conn.execute(
                                                    "UPDATE projects SET end_date = ? WHERE id = ?",
                                                    params![val_str, event.entity_id.to_string()],
                                                );
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                            }
                            "contract_number" => {
                                conn.execute(
                                    "UPDATE projects SET contract_number = ?, updated_at = ? WHERE id = ?",
                                    params![value.as_str(), event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "investor" => {
                                conn.execute(
                                    "UPDATE projects SET investor = ?, updated_at = ? WHERE id = ?",
                                    params![
                                        value.as_str(),
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            "contractor" => {
                                conn.execute(
                                    "UPDATE projects SET contractor = ?, updated_at = ? WHERE id = ?",
                                    params![value.as_str(), event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "signed_date" | "contract_date" => {
                                conn.execute(
                                    "UPDATE projects SET signed_date = ?, updated_at = ? WHERE id = ?",
                                    params![value.as_str(), event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "duration" => {
                                conn.execute(
                                    "UPDATE projects SET duration = ?, updated_at = ? WHERE id = ?",
                                    params![
                                        value.as_str(),
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            "end_date" => {
                                conn.execute(
                                    "UPDATE projects SET end_date = ?, updated_at = ? WHERE id = ?",
                                    params![
                                        value.as_str(),
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            "status" => {
                                let status = value.as_str().unwrap_or("active");
                                conn.execute(
                                    "UPDATE projects SET status = ?, updated_at = ? WHERE id = ?",
                                    params![
                                        status,
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            _ => {}
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        // Clear projection (for this project only)
        conn.execute(
            "DELETE FROM projects WHERE id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        // Replay all project events
        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'project'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event: AppEvent =
                AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "project",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// RegionProjector
// ============================================================================

pub struct RegionProjector;

impl Projector for RegionProjector {
    fn entity_type(&self) -> &str {
        "region"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::RegionCreated { name, metadata } => {
                let parent_id = metadata
                    .get("parent_id")
                    .and_then(|v: &serde_json::Value| v.as_str());
                let description = metadata
                    .get("description")
                    .and_then(|v: &serde_json::Value| v.as_str())
                    .unwrap_or("");

                conn.execute(
                    "INSERT OR REPLACE INTO regions (id, project_id, parent_id, name, description, metadata_json, current_version, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        parent_id,
                        name,
                        description,
                        metadata.to_string(),
                        event.version,
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;

                // Search index
                conn.execute(
                    "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                     VALUES (?1, 'region', ?2, ?3, ?4, ?5)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        name,
                        name,
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM regions WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "DELETE FROM entity_index WHERE project_id = ? AND entity_type = 'region'",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'region'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event = AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "region",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// FileProjector
// ============================================================================

pub struct FileProjector;

impl Projector for FileProjector {
    fn entity_type(&self) -> &str {
        "file"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::FileCreated {
                rel_path,
                filename,
                file_size,
                hash_sha256,
                metadata,
                ..
            } => {
                conn.execute(
                    "INSERT OR REPLACE INTO files (id, project_id, rel_path, filename, file_size, hash_sha256, metadata_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        rel_path,
                        filename,
                        file_size,
                        hash_sha256,
                        metadata.to_string(),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;

                // Search index
                conn.execute(
                    "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                     VALUES (?1, 'file', ?2, ?3, ?4, ?5)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        filename,
                        filename,
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::FileUpdated { changes, .. } => {
                if let Some(obj) = changes.as_object() {
                    for (key, value) in obj {
                        if key == "metadata" {
                            conn.execute(
                                "UPDATE files SET metadata_json = ?, updated_at = ? WHERE id = ?",
                                params![
                                    value.to_string(),
                                    event.created_at.to_rfc3339(),
                                    event.entity_id.to_string()
                                ],
                            )
                            .map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
            AppEvent::FileDeleted { .. } => {
                conn.execute(
                    "DELETE FROM files WHERE id = ?",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
                conn.execute(
                    "DELETE FROM entity_index WHERE entity_id = ? AND entity_type = 'file'",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM files WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "DELETE FROM entity_index WHERE project_id = ? AND entity_type = 'file'",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'file'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event = AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "file",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// FeatureProjector
// ============================================================================

pub struct FeatureProjector;

impl Projector for FeatureProjector {
    fn entity_type(&self) -> &str {
        "feature"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::FeatureCreated {
                layer_id,
                group_id,
                name,
                geom_type,
                geometry,
                properties,
                style_id,
                is_visible,
                ..
            } => {
                use crate::implement::modules::v2::spatial::calculate_spatial;
                let (
                    transformed_geometry,
                    wkb,
                    min_x,
                    min_y,
                    max_x,
                    max_y,
                    x_vn,
                    y_vn,
                    area,
                    length,
                ) = calculate_spatial(geometry);
                let geom_str = transformed_geometry.to_string();
                conn.execute(
                    "INSERT OR REPLACE INTO features (id, project_id, layer_id, group_id, name, geom_type, geometry_json, geometry_wkb, min_x, min_y, max_x, max_y, x_vn2000, y_vn2000, area, length, is_visible, note, properties_json, style_id, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        layer_id.to_string(),
                        group_id.as_ref().map(|u: &Uuid| u.to_string()),
                        name,
                        geom_type,
                        geom_str,
                        wkb,
                        min_x,
                        min_y,
                        max_x,
                        max_y,
                        x_vn,
                        y_vn,
                        area,
                        length,
                        is_visible,
                        "", 
                        properties.to_string(),
                        style_id.as_ref().map(|u: &Uuid| u.to_string()),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ]
                )
                .map_err(|e| e.to_string())?;

                conn.execute(
                    "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                     VALUES (?1, 'feature', ?2, ?3, ?4, ?5)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        name,
                        name,
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::FeatureUpdated { changes, .. } => {
                if let Some(obj) = changes.as_object() {
                    for (key, value) in obj {
                        match key.as_str() {
                            "properties" => {
                                tracing::info!(
                                    "[Projection] Updating properties for feature {}",
                                    event.entity_id
                                );
                                conn.execute(
                                    "UPDATE features SET properties_json = ?, updated_at = ? WHERE id = ?",
                                    params![value.to_string(), event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "geometry" => {
                                tracing::info!(
                                    "[Projection] Updating geometry for feature {}",
                                    event.entity_id
                                );
                                use crate::implement::modules::v2::spatial::calculate_spatial;
                                let (
                                    transformed_geometry,
                                    wkb,
                                    min_x,
                                    min_y,
                                    max_x,
                                    max_y,
                                    x_vn,
                                    y_vn,
                                    area,
                                    length,
                                ) = calculate_spatial(value);
                                let geom_str = transformed_geometry.to_string();
                                conn.execute(
                                    "UPDATE features SET geometry_json = ?, geometry_wkb = ?, min_x = ?, min_y = ?, max_x = ?, max_y = ?, x_vn2000 = ?, y_vn2000 = ?, area = ?, length = ?, updated_at = ? WHERE id = ?",
                                    params![
                                        geom_str,
                                        wkb,
                                        min_x,
                                        min_y,
                                        max_x,
                                        max_y,
                                        x_vn,
                                        y_vn,
                                        area,
                                        length,
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                ).map_err(|e| e.to_string())?;
                            }
                            "name" => {
                                tracing::info!(
                                    "[Projection] Updating name for feature {}",
                                    event.entity_id
                                );
                                conn.execute(
                                    "UPDATE features SET name = ?, updated_at = ? WHERE id = ?",
                                    params![
                                        value.as_str().unwrap_or(""),
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                                conn.execute(
                                    "UPDATE entity_index SET name = ?, search_vector = ?, updated_at = ?
                                     WHERE entity_id = ? AND entity_type = 'feature'",
                                    params![
                                        value.as_str().unwrap_or(""),
                                        value.as_str().unwrap_or(""),
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            "bbox" => {
                                if let Ok(bbox) =
                                    serde_json::from_value::<Option<BBox>>(value.clone())
                                {
                                    if let Some(b) = bbox {
                                        let _ = conn.execute(
                                            "UPDATE features SET min_x = ?, min_y = ?, max_x = ?, max_y = ?, updated_at = ? WHERE id = ?",
                                            params![
                                                b.min_x,
                                                b.min_y,
                                                b.max_x,
                                                b.max_y,
                                                event.created_at.to_rfc3339(),
                                                event.entity_id.to_string()
                                            ],
                                        );
                                    }
                                }
                            }
                            "is_visible" => {
                                let v = value.as_bool().unwrap_or(true);
                                conn.execute(
                                    "UPDATE features SET is_visible = ?, updated_at = ? WHERE id = ?",
                                    params![v, event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "note" => {
                                let v = value.as_str().unwrap_or("");
                                conn.execute(
                                    "UPDATE features SET note = ?, updated_at = ? WHERE id = ?",
                                    params![
                                        v,
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            other => {
                                tracing::warn!(
                                    "[Projection] Skipping unknown update key '{}' for feature {}",
                                    other,
                                    event.entity_id
                                );
                            }
                        }
                    }
                }
            }
            AppEvent::FeatureDeleted { .. } => {
                conn.execute(
                    "DELETE FROM features WHERE id = ?",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
                conn.execute(
                    "DELETE FROM entity_index WHERE entity_id = ? AND entity_type = 'feature'",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM features WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "DELETE FROM entity_index WHERE project_id = ? AND entity_type = 'feature'",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'feature'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event = AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "feature",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// WorkItemProjector
// ============================================================================

pub struct WorkItemProjector;

impl Projector for WorkItemProjector {
    fn entity_type(&self) -> &str {
        "work_item"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::WorkItemCreated {
                feature_id,
                material_id,
                name,
                quantity,
                unit_price,
                metadata,
            } => {
                let total_price = quantity * unit_price;
                conn.execute(
                    "INSERT OR REPLACE INTO work_items (id, project_id, feature_id, material_id, name, quantity, unit_price, total_price, metadata_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        feature_id.to_string(),
                        material_id.to_string(),
                        name,
                        quantity,
                        unit_price,
                        total_price,
                        metadata.to_string(),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::WorkItemUpdated { changes, .. } => {
                if let Some(obj) = changes.as_object() {
                    for (key, value) in obj {
                        if key == "metadata" {
                            conn.execute(
                                "UPDATE work_items SET metadata_json = ?, updated_at = ? WHERE id = ?",
                                params![
                                    value.to_string(),
                                    event.created_at.to_rfc3339(),
                                    event.entity_id.to_string()
                                ],
                            )
                            .map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
            AppEvent::WorkItemDeleted { .. } => {
                conn.execute(
                    "DELETE FROM work_items WHERE id = ?1",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM work_items WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'work_item'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event = AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "work_item",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// ContractProjector
// ============================================================================

pub struct ContractProjector;

impl Projector for ContractProjector {
    fn entity_type(&self) -> &str {
        "contract"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::ContractCreated {
                name,
                contract_number,
                vendor,
                metadata,
            } => {
                let value_opt = metadata.get("value").and_then(|v| v.as_f64());
                let signed_date = metadata.get("signed_date").and_then(|v| v.as_str());
                let notes = metadata.get("notes").and_then(|v| v.as_str());
                let file_path = metadata.get("file_path").and_then(|v| v.as_str());

                conn.execute(
                    "INSERT OR REPLACE INTO contracts (id, project_id, name, contract_number, vendor, value, signed_date, notes, file_path, metadata_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        name,
                        contract_number,
                        vendor,
                        value_opt,
                        signed_date,
                        notes,
                        file_path,
                        metadata.to_string(),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;

                conn.execute(
                    "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                     VALUES (?1, 'contract', ?2, ?3, ?4, ?5)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        name,
                        format!("{} {}", name, vendor.as_deref().unwrap_or_default()),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::ContractUpdated { id: _, changes, .. } => {
                if let Some(obj) = changes.as_object() {
                    for (key, value) in obj {
                        match key.as_str() {
                            "name" => {
                                let name: &str = value.as_str().unwrap_or("");
                                conn.execute(
                                    "UPDATE contracts SET name = ?1, updated_at = ?2 WHERE id = ?3",
                                    params![
                                        name,
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;

                                conn.execute(
                                    "UPDATE entity_index SET name = ?1, search_vector = ?1, updated_at = ?2 WHERE entity_id = ?3 AND entity_type = 'contract'",
                                    params![name, event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "contract_number" | "vendor" | "signed_date" | "notes"
                            | "file_path" => {
                                let val_str: &str = value.as_str().unwrap_or("");
                                let sql = format!(
                                    "UPDATE contracts SET {} = ?1, updated_at = ?2 WHERE id = ?3",
                                    key
                                );
                                conn.execute(
                                    &sql,
                                    params![
                                        val_str,
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            "value" => {
                                let val_f64 = value.as_f64().unwrap_or(0.0);
                                conn.execute(
                                    "UPDATE contracts SET value = ?1, updated_at = ?2 WHERE id = ?3",
                                    params![val_f64, event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "metadata" => {
                                conn.execute(
                                    "UPDATE contracts SET metadata_json = ?1, updated_at = ?2 WHERE id = ?3",
                                    params![value.to_string(), event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            _ => {}
                        }
                    }
                }
            }
            AppEvent::ContractDeleted { id: _ } => {
                conn.execute(
                    "DELETE FROM contracts WHERE id = ?1",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
                conn.execute(
                    "DELETE FROM entity_index WHERE entity_id = ? AND entity_type = 'contract'",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM contracts WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "DELETE FROM entity_index WHERE project_id = ? AND entity_type = 'contract'",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'contract'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event = AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "contract",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// LayerProjector
// ============================================================================

pub struct LayerProjector;

impl Projector for LayerProjector {
    fn entity_type(&self) -> &str {
        "layer"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::LayerCreated { name, metadata, .. } => {
                let region_id = metadata
                    .get("region_id")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default();
                conn.execute(
                    "INSERT OR REPLACE INTO layers (id, project_id, region_id, name, metadata_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        region_id,
                        name,
                        metadata.to_string(),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::LayerUpdated { changes } => {
                if let Some(obj) = changes.as_object() {
                    if let Some(name) = obj.get("name").and_then(|value| value.as_str()) {
                        conn.execute(
                            "UPDATE layers SET name = ?, updated_at = ? WHERE id = ?",
                            params![
                                name,
                                event.created_at.to_rfc3339(),
                                event.entity_id.to_string()
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    if let Some(is_visible) =
                        obj.get("is_visible").and_then(|value| value.as_bool())
                    {
                        conn.execute(
                            "UPDATE layers SET is_visible = ?, updated_at = ? WHERE id = ?",
                            params![
                                is_visible,
                                event.created_at.to_rfc3339(),
                                event.entity_id.to_string()
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    if let Some(region_id) = obj.get("region_id").and_then(|value| value.as_str()) {
                        conn.execute(
                            "UPDATE layers SET region_id = ?, updated_at = ? WHERE id = ?",
                            params![
                                region_id,
                                event.created_at.to_rfc3339(),
                                event.entity_id.to_string()
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                }
            }
            AppEvent::LayerDeleted { .. } => {
                conn.execute(
                    "DELETE FROM layers WHERE id = ?1",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM layers WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM entity_index WHERE project_id = ? AND entity_type = 'layer'",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'layer'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event = AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "layer",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// FeatureGroupProjector
// ============================================================================

pub struct FeatureGroupProjector;

impl Projector for FeatureGroupProjector {
    fn entity_type(&self) -> &str {
        "feature_group"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::FeatureGroupCreated { name, metadata, .. } => {
                let layer_id = metadata
                    .get("layer_id")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default();
                let parent_id = metadata.get("parent_id").and_then(|value| value.as_str());
                let group_type = metadata
                    .get("group_type")
                    .and_then(|value| value.as_str())
                    .unwrap_or("group");
                let is_visible = metadata
                    .get("is_visible")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(true);

                conn.execute(
                    "INSERT OR REPLACE INTO feature_groups (id, project_id, layer_id, parent_id, name, group_type, is_visible, metadata_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        layer_id,
                        parent_id,
                        name,
                        group_type,
                        is_visible,
                        metadata.to_string(),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::FeatureGroupUpdated { changes } => {
                if let Some(obj) = changes.as_object() {
                    if let Some(name) = obj.get("name").and_then(|value| value.as_str()) {
                        conn.execute(
                            "UPDATE feature_groups SET name = ?, updated_at = ? WHERE id = ?",
                            params![
                                name,
                                event.created_at.to_rfc3339(),
                                event.entity_id.to_string()
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    if let Some(is_visible) =
                        obj.get("is_visible").and_then(|value| value.as_bool())
                    {
                        conn.execute(
                            "UPDATE feature_groups SET is_visible = ?, updated_at = ? WHERE id = ?",
                            params![
                                is_visible,
                                event.created_at.to_rfc3339(),
                                event.entity_id.to_string()
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    if let Some(layer_id) = obj.get("layer_id").and_then(|value| value.as_str()) {
                        conn.execute(
                            "UPDATE feature_groups SET layer_id = ?, updated_at = ? WHERE id = ?",
                            params![
                                layer_id,
                                event.created_at.to_rfc3339(),
                                event.entity_id.to_string()
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    if let Some(parent_id) = obj.get("parent_id") {
                        conn.execute(
                            "UPDATE feature_groups SET parent_id = ?, updated_at = ? WHERE id = ?",
                            params![
                                parent_id.as_str(),
                                event.created_at.to_rfc3339(),
                                event.entity_id.to_string()
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    if let Some(metadata) = obj.get("metadata") {
                        conn.execute(
                            "UPDATE feature_groups SET metadata_json = ?, updated_at = ? WHERE id = ?",
                            params![metadata.to_string(), event.created_at.to_rfc3339(), event.entity_id.to_string()],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                }
            }
            AppEvent::FeatureGroupDeleted { .. } => {
                conn.execute(
                    "DELETE FROM feature_groups WHERE id = ?1",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM feature_groups WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM entity_index WHERE project_id = ? AND entity_type = 'feature_group'",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'feature_group'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event = AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "feature_group",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// NoteProjector
// ============================================================================

pub struct NoteProjector;

impl Projector for NoteProjector {
    fn entity_type(&self) -> &str {
        "note"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::NoteCreated {
                title,
                content,
                metadata,
            } => {
                let target_file_path = metadata
                    .get("target_file_path")
                    .and_then(|value: &serde_json::Value| value.as_str());
                conn.execute(
                    "INSERT OR REPLACE INTO notes (id, project_id, title, content, target_file_path, metadata_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        title,
                        content,
                        target_file_path,
                        metadata.to_string(),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;

                conn.execute(
                    "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                     VALUES (?1, 'note', ?2, ?3, ?4, ?5)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        title,
                        format!("{} {}", title, content.clone()),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::NoteUpdated { id: _, changes } => {
                if let Some(obj) = changes.as_object() {
                    if let Some(title) = obj
                        .get("title")
                        .and_then(|value: &serde_json::Value| value.as_str())
                    {
                        conn.execute(
                            "UPDATE notes SET title = ?, updated_at = ? WHERE id = ?",
                            params![
                                title,
                                event.created_at.to_rfc3339(),
                                event.entity_id.to_string()
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    if let Some(content) = obj
                        .get("content")
                        .and_then(|value: &serde_json::Value| value.as_str())
                    {
                        conn.execute(
                            "UPDATE notes SET content = ?, updated_at = ? WHERE id = ?",
                            params![
                                content,
                                event.created_at.to_rfc3339(),
                                event.entity_id.to_string()
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                }
            }
            AppEvent::NoteDeleted { .. } => {
                conn.execute(
                    "DELETE FROM notes WHERE id = ?1",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
                conn.execute(
                    "DELETE FROM entity_index WHERE entity_id = ? AND entity_type = 'note'",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM notes WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM entity_index WHERE project_id = ? AND entity_type = 'note'",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'note'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event = AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "note",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// MaterialProjector
// ============================================================================

pub struct MaterialProjector;

impl Projector for MaterialProjector {
    fn entity_type(&self) -> &str {
        "material"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::MaterialCreated {
                name,
                code,
                metadata,
            } => {
                let unit = metadata
                    .get("unit")
                    .and_then(|value: &serde_json::Value| value.as_str());
                let base_price = metadata
                    .get("base_price")
                    .and_then(|value: &serde_json::Value| value.as_f64());
                let category = metadata
                    .get("category")
                    .and_then(|value: &serde_json::Value| value.as_str());

                conn.execute(
                    "INSERT OR REPLACE INTO materials (id, project_id, name, code, unit, base_price, category, metadata_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        name,
                        code,
                        unit,
                        base_price,
                        category,
                        metadata.to_string(),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::MaterialUpdated { changes, .. } => {
                if let Some(obj) = changes.as_object() {
                    for (key, value) in obj {
                        match key.as_str() {
                            "name" => {
                                let name: &str = value.as_str().unwrap_or("");
                                conn.execute(
                                    "UPDATE materials SET name = ?1, updated_at = ?2 WHERE id = ?3",
                                    params![
                                        name,
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;

                                conn.execute(
                                    "UPDATE entity_index SET name = ?1, search_vector = ?1, updated_at = ?2 WHERE entity_id = ?3 AND entity_type = 'material'",
                                    params![name, event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "code" | "unit" | "category" => {
                                let val_str: &str = value.as_str().unwrap_or("");
                                let sql = format!(
                                    "UPDATE materials SET {} = ?1, updated_at = ?2 WHERE id = ?3",
                                    key
                                );
                                conn.execute(
                                    &sql,
                                    params![
                                        val_str,
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            "base_price" | "basePrice" => {
                                let val_f64 = value.as_f64().unwrap_or(0.0);
                                conn.execute(
                                    "UPDATE materials SET base_price = ?1, updated_at = ?2 WHERE id = ?3",
                                    params![val_f64, event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "metadata" => {
                                conn.execute(
                                    "UPDATE materials SET metadata_json = ?1, updated_at = ?2 WHERE id = ?3",
                                    params![value.to_string(), event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            _ => {}
                        }
                    }
                }
            }
            AppEvent::MaterialDeleted { .. } => {
                conn.execute(
                    "DELETE FROM materials WHERE id = ?1",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM materials WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'material'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event =
                AppEvent::robust_deserialize(&payload).map_err(|e: String| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "material",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// PersonnelProjector
// ============================================================================

pub struct PersonnelProjector;

impl Projector for PersonnelProjector {
    fn entity_type(&self) -> &str {
        "personnel"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::PersonnelCreated { name, metadata } => {
                let role = metadata
                    .get("role")
                    .and_then(|v: &serde_json::Value| v.as_str())
                    .unwrap_or("worker");

                conn.execute(
                    "INSERT OR REPLACE INTO personnel (id, project_id, name, role, metadata_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        name,
                        role,
                        metadata.to_string(),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;

                // Update entity_index
                conn.execute(
                    "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                     VALUES (?1, 'personnel', ?2, ?3, ?4, ?5)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        name,
                        name,
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::PersonnelUpdated { changes, .. } => {
                if let Some(obj) = changes.as_object() {
                    for (key, value) in obj {
                        match key.as_str() {
                            "name" => {
                                let name: &str = value.as_str().unwrap_or("");
                                conn.execute(
                                    "UPDATE personnel SET name = ?1, updated_at = ?2 WHERE id = ?3",
                                    params![
                                        name,
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;

                                conn.execute(
                                    "UPDATE entity_index SET name = ?1, search_vector = ?1, updated_at = ?2 WHERE entity_id = ?3 AND entity_type = 'personnel'",
                                    params![name, event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            "role" => {
                                let role: &str = value.as_str().unwrap_or("");
                                conn.execute(
                                    "UPDATE personnel SET role = ?1, updated_at = ?2 WHERE id = ?3",
                                    params![
                                        role,
                                        event.created_at.to_rfc3339(),
                                        event.entity_id.to_string()
                                    ],
                                )
                                .map_err(|e| e.to_string())?;
                            }
                            "metadata" => {
                                conn.execute(
                                    "UPDATE personnel SET metadata_json = ?1, updated_at = ?2 WHERE id = ?3",
                                    params![value.to_string(), event.created_at.to_rfc3339(), event.entity_id.to_string()],
                                ).map_err(|e| e.to_string())?;
                            }
                            _ => {}
                        }
                    }
                }
            }
            AppEvent::PersonnelDeleted { .. } => {
                conn.execute(
                    "DELETE FROM personnel WHERE id = ?1",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM personnel WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'personnel'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event = AppEvent::robust_deserialize(&payload).map_err(|e| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "personnel",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// SettingsProjector
// ============================================================================

pub struct SettingsProjector;

impl Projector for SettingsProjector {
    fn entity_type(&self) -> &str {
        "settings"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        if let AppEvent::SettingsUpdated { changes } = &event.event {
            let epsg_code = changes
                .get("epsg_code")
                .or_else(|| changes.get("epsgCode"))
                .and_then(|value: &serde_json::Value| value.as_str())
                .unwrap_or("3857");
            let units = changes
                .get("units")
                .and_then(|value: &serde_json::Value| value.as_str())
                .unwrap_or("m");
            let center_lat = changes
                .get("center_lat")
                .or_else(|| changes.get("centerLat"));
            let center_lon = changes
                .get("center_lon")
                .or_else(|| changes.get("centerLon"));
            let default_zoom = changes
                .get("default_zoom")
                .or_else(|| changes.get("defaultZoom"))
                .and_then(|value: &serde_json::Value| value.as_f64())
                .unwrap_or(15.0);

            conn.execute(
                "INSERT INTO project_settings (project_id, epsg_code, units, center_lat, center_lon, default_zoom, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(project_id) DO UPDATE SET
                    epsg_code = excluded.epsg_code,
                    units = excluded.units,
                    center_lat = excluded.center_lat,
                    center_lon = excluded.center_lon,
                    default_zoom = excluded.default_zoom,
                    updated_at = excluded.updated_at",
                params![
                    event.project_id.to_string(),
                    epsg_code,
                    units,
                    center_lat.and_then(|value: &serde_json::Value| value.as_f64()),
                    center_lon.and_then(|value: &serde_json::Value| value.as_f64()),
                    default_zoom,
                    event.created_at.to_rfc3339(),
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM project_settings WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'settings'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event =
                AppEvent::robust_deserialize(&payload).map_err(|e: String| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "settings",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// ContentItemProjector
// ============================================================================

pub struct ContentItemProjector;

impl Projector for ContentItemProjector {
    fn entity_type(&self) -> &str {
        "content_item"
    }

    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String> {
        match &event.event {
            AppEvent::ContentItemUpserted {
                content_type_id,
                name,
                data_json,
            } => {
                conn.execute(
                    "INSERT OR REPLACE INTO content_items (id, content_type_id, project_id, name, data_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        event.entity_id.to_string(),
                        content_type_id.to_string(),
                        event.project_id.to_string(),
                        name,
                        data_json.to_string(),
                        event.created_at.to_rfc3339(),
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;

                conn.execute(
                    "INSERT OR REPLACE INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                     VALUES (?1, 'content_item', ?2, ?3, ?4, ?5)",
                    params![
                        event.entity_id.to_string(),
                        event.project_id.to_string(),
                        name,
                        name,
                        event.created_at.to_rfc3339(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            AppEvent::ContentItemDeleted { id: _ } => {
                conn.execute(
                    "DELETE FROM content_items WHERE id = ?1",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
                conn.execute(
                    "DELETE FROM entity_index WHERE entity_id = ? AND entity_type = 'content_item'",
                    params![event.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }

    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String> {
        conn.execute(
            "DELETE FROM content_items WHERE project_id = ?",
            params![project_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT entity_id, project_id, payload_json, version, created_at
                 FROM event_store
                 WHERE project_id = ? AND entity_type = 'content_item'
                 ORDER BY global_seq ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut count = 0;
        for row in rows {
            let (entity_id, proj_id, payload, version, created_at) =
                row.map_err(|e| e.to_string())?;
            let event =
                AppEvent::robust_deserialize(&payload).map_err(|e: String| e.to_string())?;

            let envelope = EventEnvelope::new(
                Uuid::parse_str(&proj_id).unwrap(),
                "content_item",
                Uuid::parse_str(&entity_id).unwrap(),
                event,
                "rebuild",
                None,
            )
            .with_version(version);

            let mut envelope = envelope;
            envelope.created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            self.apply(conn, &envelope)?;
            count += 1;
        }

        Ok(count)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Arc;
    use std::sync::Mutex;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::implement::modules::v2::storage::schema::apply_v2_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn test_register_projector() {
        let conn = create_test_db();
        let mut engine = ProjectionEngine::new(Arc::new(Mutex::new(conn)));

        assert_eq!(engine.registered_types().len(), 0);

        engine.register(Box::new(NoteProjector));
        engine.register(Box::new(MaterialProjector));
        engine.register(Box::new(SettingsProjector));
        engine.register(Box::new(ContentItemProjector));
        engine.register(Box::new(PersonnelProjector));

        assert_eq!(engine.registered_types().len(), 5);
    }

    #[test]
    fn test_task_projector_apply_created() {
        let conn = create_test_db();
        let engine = ProjectionEngine::new(Arc::new(Mutex::new(conn)));

        let projector = TaskProjector;
        let project_id = Uuid::new_v4();
        let entity_id = Uuid::new_v4();

        let event = EventEnvelope::new(
            project_id,
            "task",
            entity_id,
            AppEvent::TaskCreated {
                name: "Test Task".to_string(),
                parent_id: None,
                metadata: serde_json::json!({}),
            },
            "test-device",
            None,
        )
        .with_version(1)
        .with_global_seq(1);

        projector
            .apply(&engine.conn.lock().unwrap(), &event)
            .unwrap();

        // Verify task was created
        let task_count: i64 = engine
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(task_count, 1);

        // Verify entity_index was updated
        let index_count: i64 = engine
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM entity_index", [], |r| r.get(0))
            .unwrap();
        assert_eq!(index_count, 1);

        // Verify task name
        let name: String = engine
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT name FROM tasks LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "Test Task");
    }

    #[test]
    fn test_task_projector_apply_deleted() {
        let conn = create_test_db();
        let engine = ProjectionEngine::new(Arc::new(Mutex::new(conn)));

        let projector = TaskProjector;
        let project_id = Uuid::new_v4();
        let entity_id = Uuid::new_v4();

        // First create
        let create_event = EventEnvelope::new(
            project_id,
            "task",
            entity_id,
            AppEvent::TaskCreated {
                name: "To Delete".to_string(),
                parent_id: None,
                metadata: serde_json::json!({}),
            },
            "test-device",
            None,
        )
        .with_version(1)
        .with_global_seq(1);

        projector
            .apply(&engine.conn.lock().unwrap(), &create_event)
            .unwrap();

        // Then delete
        let delete_event = EventEnvelope::new(
            project_id,
            "task",
            entity_id,
            AppEvent::TaskDeleted,
            "test-device",
            None,
        )
        .with_version(2)
        .with_global_seq(2);

        projector
            .apply(&engine.conn.lock().unwrap(), &delete_event)
            .unwrap();

        // Verify task was deleted
        let task_count: i64 = engine
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(task_count, 0);

        // Verify entity_index was cleaned
        let index_count: i64 = engine
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM entity_index", [], |r| r.get(0))
            .unwrap();
        assert_eq!(index_count, 0);
    }

    #[test]
    fn test_personnel_projector() {
        let conn = create_test_db();
        let engine = ProjectionEngine::new(Arc::new(Mutex::new(conn)));
        let projector = PersonnelProjector;
        let project_id = Uuid::new_v4();
        let entity_id = Uuid::new_v4();

        let event = EventEnvelope::new(
            project_id,
            "personnel",
            entity_id,
            AppEvent::PersonnelCreated {
                name: "John Doe".to_string(),
                metadata: serde_json::json!({"role": "manager", "phone": "123"}),
            },
            "test-device",
            None,
        );

        projector
            .apply(&engine.conn.lock().unwrap(), &event)
            .unwrap();

        // Verify personnel exists
        let name: String = engine
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT name FROM personnel WHERE id = ?",
                [entity_id.to_string()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(name, "John Doe");

        let role: String = engine
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT role FROM personnel WHERE id = ?",
                [entity_id.to_string()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(role, "manager");

        // Verify index
        let index_count: i64 = engine
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM entity_index WHERE entity_id = ?",
                [entity_id.to_string()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(index_count, 1);
    }

    #[test]
    fn test_task_linking() {
        let conn = create_test_db();
        let engine = ProjectionEngine::new(Arc::new(Mutex::new(conn)));
        let project_id = Uuid::new_v4();
        let task_id = Uuid::new_v4();

        // 1. Create a task
        let event1 = EventEnvelope::new(
            project_id,
            "task",
            task_id,
            AppEvent::TaskCreated {
                name: "Test Task".to_string(),
                parent_id: None,
                metadata: serde_json::json!({}),
            },
            "dev",
            None,
        );
        TaskProjector
            .apply(&engine.conn.lock().unwrap(), &event1)
            .unwrap();

        // 2. Link another task to this task
        let to_task_id = Uuid::new_v4();
        let event2 = EventEnvelope::new(
            project_id,
            "task",
            task_id,
            AppEvent::TaskLinked {
                from_task_id: task_id,
                to_task_id,
                link_type: "dependency".to_string(),
            },
            "dev",
            None,
        );
        TaskProjector
            .apply(&engine.conn.lock().unwrap(), &event2)
            .unwrap();

        // 3. Verify link in task_links
        let count: i64 = engine
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM task_links WHERE from_task_id = ? AND to_task_id = ?",
                [task_id.to_string(), to_task_id.to_string()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // 4. Unlink
        let event3 = EventEnvelope::new(
            project_id,
            "task",
            task_id,
            AppEvent::TaskUnlinked {
                from_task_id: task_id,
                to_task_id,
            },
            "dev",
            None,
        );
        TaskProjector
            .apply(&engine.conn.lock().unwrap(), &event3)
            .unwrap();

        // 5. Verify unlinked
        let count: i64 = engine
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM task_links WHERE from_task_id = ? AND to_task_id = ?",
                [task_id.to_string(), to_task_id.to_string()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_process_event_no_projector_error() {
        let conn = create_test_db();
        let engine = ProjectionEngine::new(Arc::new(Mutex::new(conn)));

        let event = EventEnvelope::new(
            Uuid::new_v4(),
            "unknown_type",
            Uuid::new_v4(),
            AppEvent::TaskDeleted,
            "test-device",
            None,
        );

        let result = engine.process_event(&event);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No projector for entity_type"));
    }
}
