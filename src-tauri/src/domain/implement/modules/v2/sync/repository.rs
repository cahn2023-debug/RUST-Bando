use crate::domain::models::v2::EventEnvelope;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use std::sync::Arc;
use uuid::Uuid;

pub struct SyncRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SyncRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    /// Add an event to the offline queue
    pub fn queue_offline_event(&self, envelope: &EventEnvelope) -> Result<(), String> {
        let conn = self.conn.lock();
        let event_json = serde_json::to_string(envelope).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO offline_sync_queue (id, project_id, event_json, created_at)
             VALUES (?1, ?2, ?3, datetime('now'))",
            params![
                envelope.entity_id.to_string(),
                envelope.project_id.to_string(),
                event_json
            ],
        )
        .map_err(|e| format!("Failed to queue offline event: {}", e))?;

        Ok(())
    }

    /// Get all pending offline events
    pub fn get_offline_events(&self) -> Result<Vec<EventEnvelope>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT event_json FROM offline_sync_queue ORDER BY created_at ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let json: String = row.get(0)?;
                Ok(json)
            })
            .map_err(|e| e.to_string())?;

        let mut events = Vec::new();
        for row in rows {
            let json = row.map_err(|e| e.to_string())?;
            let envelope: EventEnvelope = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            events.push(envelope);
        }

        Ok(events)
    }

    /// Remove an event from the offline queue after successful sync
    pub fn remove_from_offline_queue(&self, event_id: &Uuid) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM offline_sync_queue WHERE id = ?",
            params![event_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }
}
