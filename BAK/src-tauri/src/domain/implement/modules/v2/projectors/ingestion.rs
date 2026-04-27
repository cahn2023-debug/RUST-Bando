use crate::domain::models::v2::{AppEvent, EventEnvelope};
use crate::implement::db::projection_engine::Projector;
use rusqlite::{params, Connection};
use uuid::Uuid;

pub struct IngestionProjector;

impl Projector for IngestionProjector {
    fn project(&self, conn: &Connection, envelope: &EventEnvelope) -> Result<(), String> {
        match &envelope.event {
            AppEvent::IngestionStarted {
                source_type: _,
                metadata: _,
            } => Ok(()),
            AppEvent::IngestionFeatureAdded { data } => {
                let feature_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO feature_records (id, dataset_id, data) VALUES (?1, ?2, ?3)",
                    params![feature_id, envelope.entity_id.to_string(), data.to_string()],
                )
                .map_err(|e| e.to_string())?;
                Ok(())
            }
            AppEvent::IngestionCompleted { total_count, .. } => {
                conn.execute(
                    "UPDATE datasets SET status = 'completed', feature_count = ?1 WHERE id = ?2",
                    params![*total_count as i64, envelope.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

pub struct TaskProjector;

impl Projector for TaskProjector {
    fn project(&self, conn: &Connection, envelope: &EventEnvelope) -> Result<(), String> {
        match &envelope.event {
            AppEvent::TaskCreated {
                name,
                parent_id,
                metadata,
            } => {
                conn.execute(
                    "INSERT INTO tasks (id, project_id, name, parent_id, metadata, status) VALUES (?1, ?2, ?3, ?4, ?5, 'pending')",
                    params![
                        envelope.entity_id.to_string(),
                        envelope.project_id.to_string(),
                        name,
                        parent_id.map(|u| u.to_string()),
                        metadata.to_string()
                    ],
                ).map_err(|e| e.to_string())?;
            }
            AppEvent::TaskUpdated { changes } => {
                if let Some(status) = changes.get("status").and_then(|v| v.as_str()) {
                    conn.execute(
                        "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?",
                        params![
                            status,
                            envelope.created_at.to_rfc3339(),
                            envelope.entity_id.to_string()
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
            AppEvent::TaskDeleted => {
                conn.execute(
                    "DELETE FROM tasks WHERE id = ?",
                    [envelope.entity_id.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }
}
