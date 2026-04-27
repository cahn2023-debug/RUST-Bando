use bincode;
use chrono::{DateTime, Utc};
use parking_lot::Mutex;
/// EventStore - Source of Truth for V2
///
/// All changes go through the EventStore. It provides:
/// - Atomic event appending with auto-versioning
/// - Event querying by entity, device, or global sequence
/// - Sync state management
use rusqlite::{params, Connection};
use serde_json::{self, Value};
use std::sync::Arc;
use uuid::Uuid;

use crate::domain::models::v2::{AppEvent, EventEnvelope, SyncState, ZeroCopyEventEnvelope};

// ============================================================================
// EventStore
// ============================================================================

#[derive(Clone)]
pub struct EventStore {
    conn: Arc<Mutex<Connection>>,
    device_id: String,
}

impl EventStore {
    /// Create a new EventStore
    pub fn new(conn: Arc<Mutex<Connection>>, device_id: String) -> Self {
        Self { conn, device_id }
    }

    pub fn get_device_id(&self) -> String {
        self.device_id.clone()
    }

    /// Append an event to the store
    pub fn append(
        &self,
        project_id: Uuid,
        event: AppEvent,
        entity_type: &str,
        entity_id: Uuid,
    ) -> Result<EventEnvelope, String> {
        self.append_direct(event, entity_type, entity_id)
    }

    /// Direct append for convenience (Synchronous)
    pub fn append_direct(
        &self,
        event: AppEvent,
        entity_type: &str,
        entity_id: Uuid,
    ) -> Result<EventEnvelope, String> {
        let conn = self.conn.lock();

        let next_global = conn
            .query_row(
                "SELECT COALESCE(MAX(global_seq), 0) + 1 FROM event_store",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(1);

        let next_version = conn.query_row(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM event_store WHERE entity_type = ? AND entity_id = ?",
            params![entity_type, entity_id.to_string()],
            |r| r.get::<_, i64>(0),
        ).unwrap_or(1);

        let envelope = EventEnvelope::new(
            Uuid::nil(),
            entity_type,
            entity_id,
            event.clone(),
            &self.device_id,
            None,
        )
        .with_version(next_version)
        .with_global_seq(next_global);

        let payload_json =
            serde_json::to_string(&event.to_zero_copy_payload()).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO event_store (
                id, project_id, entity_type, entity_id, event_type, 
                payload, version, global_seq, device_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                envelope.id.to_string(),
                envelope.project_id.to_string(),
                entity_type,
                entity_id.to_string(),
                envelope.event.action(),
                payload_json,
                next_version,
                next_global,
                self.device_id,
                envelope.created_at.to_rfc3339(),
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(envelope)
    }

    pub fn append_envelope(&self, envelope: EventEnvelope) -> Result<(), String> {
        let conn = self.conn.lock();
        let payload_json = serde_json::to_string(&envelope.event.to_zero_copy_payload())
            .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR IGNORE INTO event_store (
                id, project_id, entity_type, entity_id, event_type, 
                payload, version, global_seq, device_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                envelope.id.to_string(),
                envelope.project_id.to_string(),
                envelope.entity_type,
                envelope.entity_id.to_string(),
                envelope.event.action(),
                payload_json,
                envelope.version,
                envelope.global_seq,
                envelope.device_id,
                envelope.created_at.to_rfc3339(),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn append_batch(&self, envelopes: Vec<EventEnvelope>) -> Result<(), String> {
        for env in envelopes {
            self.append_envelope(env)?;
        }
        Ok(())
    }

    pub fn get_events_since(&self, last_seq: i64) -> Result<Vec<EventEnvelope>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, entity_type, entity_id, event_type, payload, version, global_seq, device_id, created_at 
             FROM event_store WHERE global_seq > ? ORDER BY global_seq ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![last_seq], |row| self.row_to_envelope(row))
            .map_err(|e| e.to_string())?;
        let mut events = Vec::new();
        for row in rows {
            events.push(row.map_err(|e| e.to_string())?);
        }
        Ok(events)
    }

    pub fn get_event(&self, id: Uuid) -> Result<EventEnvelope, String> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT id, project_id, entity_type, entity_id, event_type, payload, version, global_seq, device_id, created_at 
             FROM event_store WHERE id = ?",
            params![id.to_string()],
            |row| self.row_to_envelope(row),
        ).map_err(|e| e.to_string())
    }

    pub fn get_entity_version(&self, entity_type: &str, entity_id: Uuid) -> Result<i64, String> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM event_store WHERE entity_type = ? AND entity_id = ?",
            params![entity_type, entity_id.to_string()],
            |r| r.get(0),
        ).map_err(|e| e.to_string())
    }

    pub fn get_entity_events(
        &self,
        entity_type: &str,
        entity_id: Uuid,
    ) -> Result<Vec<EventEnvelope>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, entity_type, entity_id, event_type, payload, version, global_seq, device_id, created_at 
             FROM event_store WHERE entity_type = ? AND entity_id = ? ORDER BY version ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![entity_type, entity_id.to_string()], |row| {
                self.row_to_envelope(row)
            })
            .map_err(|e| e.to_string())?;
        let mut events = Vec::new();
        for row in rows {
            events.push(row.map_err(|e| e.to_string())?);
        }
        Ok(events)
    }

    fn row_to_envelope(&self, row: &rusqlite::Row) -> rusqlite::Result<EventEnvelope> {
        let payload_str: String = row.get(5)?;
        let payload: Value =
            serde_json::from_str(&payload_str).map_err(|_| rusqlite::Error::QueryReturnedNoRows)?;
        let event =
            AppEvent::from_payload(&payload).map_err(|_| rusqlite::Error::QueryReturnedNoRows)?;

        let created_at_str: String = row.get(9)?;
        let created_at = DateTime::parse_from_rfc3339(&created_at_str)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|_| rusqlite::Error::QueryReturnedNoRows)?;

        Ok(EventEnvelope {
            id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_default(),
            project_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_default(),
            entity_type: row.get(2)?,
            entity_id: Uuid::parse_str(&row.get::<_, String>(3)?).unwrap_or_default(),
            event,
            version: row.get(6)?,
            global_seq: row.get(7)?,
            device_id: row.get(8)?,
            correlation_id: None,
            causal_id: None,
            metadata: Some(serde_json::json!({})),
            created_at,
            schema_version: 1,
        })
    }

    pub fn get_sync_state(&self) -> Result<SyncState, String> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT last_pushed_seq, last_pulled_seq, last_sync_at, device_id, device_name, last_seq, sync_status 
             FROM sync_state WHERE device_id = ?",
            params![self.device_id],
            |r| {
                let last_sync_at_str: Option<String> = r.get(2)?;
                let last_sync_at = last_sync_at_str.and_then(|s| DateTime::parse_from_rfc3339(&s).map(|dt| dt.with_timezone(&Utc)).ok());

                Ok(SyncState {
                    last_pushed_seq: r.get(0)?,
                    last_pulled_seq: r.get(1)?,
                    last_sync_at,
                    device_id: r.get(3)?,
                    device_name: r.get(4)?,
                    last_seq: r.get(5)?,
                    sync_status: r.get(6)?,
                })
            },
        ).or_else(|_| {
            Ok(SyncState {
                last_pushed_seq: 0,
                last_pulled_seq: 0,
                last_sync_at: None,
                device_id: self.device_id.clone(),
                device_name: "Local Device".to_string(),
                last_seq: 0,
                sync_status: "local".to_string(),
            })
        })
    }

    pub fn update_sync_state(&self, state: SyncState) -> Result<(), String> {
        let conn = self.conn.lock();
        let last_sync_at_str = state.last_sync_at.map(|dt| dt.to_rfc3339());

        conn.execute(
            "INSERT INTO sync_state (device_id, device_name, last_pushed_seq, last_pulled_seq, last_sync_at, last_seq, sync_status)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(device_id) DO UPDATE SET
                last_pushed_seq = excluded.last_pushed_seq,
                last_pulled_seq = excluded.last_pulled_seq,
                last_sync_at = excluded.last_sync_at,
                last_seq = excluded.last_seq,
                sync_status = excluded.sync_status",
            params![
                state.device_id,
                state.device_name,
                state.last_pushed_seq,
                state.last_pulled_seq,
                last_sync_at_str,
                state.last_seq,
                state.sync_status,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }
}
