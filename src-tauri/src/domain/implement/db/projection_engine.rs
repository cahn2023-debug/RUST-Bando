use crate::domain::models::v2::{AppEvent, EventEnvelope};
use parking_lot::Mutex;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

pub trait Projector: Send + Sync {
    fn entity_type(&self) -> &str;
    fn apply(&self, conn: &Connection, event: &EventEnvelope) -> Result<(), String>;
    fn rebuild(&self, conn: &Connection, project_id: Uuid) -> Result<usize, String>;
}

#[derive(Clone)]
pub struct ProjectionEngine {
    projectors: HashMap<String, Arc<dyn Projector>>,
    conn: Arc<Mutex<Connection>>,
}

impl ProjectionEngine {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self {
            projectors: HashMap::new(),
            conn,
        }
    }

    pub fn register(&mut self, projector: Arc<dyn Projector>) {
        let entity_type = projector.entity_type().to_string();
        self.projectors.insert(entity_type, projector);
    }

    pub fn process_event(&self, event: &EventEnvelope) -> Result<(), String> {
        let projector = self
            .projectors
            .get(&event.entity_type)
            .ok_or_else(|| format!("No projector for entity_type: {}", event.entity_type))?;

        let conn = self.conn.lock();
        projector.apply(&conn, event)
    }

    pub fn process_batch(&self, events: &[EventEnvelope]) -> Result<(), String> {
        for event in events {
            self.process_event(event)?;
        }
        Ok(())
    }

    pub fn apply_to_transaction(
        &self,
        conn: &Connection,
        event: &EventEnvelope,
    ) -> Result<(), String> {
        let projector = self
            .projectors
            .get(&event.entity_type)
            .ok_or_else(|| format!("No projector for entity_type: {}", event.entity_type))?;

        projector.apply(conn, event)
    }

    pub fn rebuild_all(&self, project_id: Uuid) -> Result<HashMap<String, usize>, String> {
        let mut results = HashMap::new();
        for (entity_type, projector) in &self.projectors {
            let conn = self.conn.lock();
            let count = projector.rebuild(&conn, project_id)?;
            results.insert(entity_type.clone(), count);
        }
        Ok(results)
    }

    pub fn registered_types(&self) -> Vec<String> {
        self.projectors.keys().cloned().collect()
    }
}

// Default Entity Projector
pub struct EntityProjector;
impl Projector for EntityProjector {
    fn entity_type(&self) -> &str {
        "entity"
    }
    fn apply(&self, conn: &Connection, envelope: &EventEnvelope) -> Result<(), String> {
        match &envelope.event {
            AppEvent::EntityCreated {
                id,
                project_id,
                entity_type,
                data,
            } => {
                conn.execute(
                    "INSERT INTO projection_entities (id, project_id, entity_type, data, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?)",
                    rusqlite::params![
                        id.to_string(),
                        project_id.to_string(),
                        entity_type,
                        serde_json::to_string(data).unwrap_or_default(),
                        envelope.created_at.to_rfc3339(),
                        envelope.created_at.to_rfc3339()
                    ],
                ).map_err(|e| e.to_string())?;

                conn.execute(
                    "INSERT INTO entity_index (id, entity_type, project_id, content) VALUES (?, ?, ?, ?)",
                    rusqlite::params![id.to_string(), entity_type, project_id.to_string(), ""]
                ).map_err(|e| e.to_string())?;
                Ok(())
            }
            AppEvent::EntityUpdated {
                id,
                project_id: _,
                entity_type: _,
                data,
            } => {
                conn.execute(
                    "UPDATE projection_entities SET data = ?, updated_at = ? WHERE id = ?",
                    rusqlite::params![
                        serde_json::to_string(data).unwrap_or_default(),
                        envelope.created_at.to_rfc3339(),
                        id.to_string()
                    ],
                )
                .map_err(|e| e.to_string())?;
                Ok(())
            }
            AppEvent::EntityDeleted {
                id,
                project_id: _,
                entity_type: _,
            } => {
                conn.execute(
                    "DELETE FROM projection_entities WHERE id = ?",
                    [id.to_string()],
                )
                .map_err(|e| e.to_string())?;
                conn.execute("DELETE FROM entity_index WHERE id = ?", [id.to_string()])
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            _ => Ok(()),
        }
    }
    fn rebuild(&self, _conn: &Connection, _project_id: Uuid) -> Result<usize, String> {
        Ok(0)
    }
}
