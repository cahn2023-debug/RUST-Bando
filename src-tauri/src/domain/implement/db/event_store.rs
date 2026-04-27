use crate::domain::models::v2::{AppEvent, EventEnvelope, SyncState};
use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct EventStore {
    pub conn: Arc<Mutex<Connection>>,
    pub device_id: String,
}

impl EventStore {
    pub fn new(conn: Arc<Mutex<Connection>>, device_id: String) -> Self {
        Self { conn, device_id }
    }

    pub fn append(
        &self,
        project_id: Uuid,
        event: AppEvent,
        _entity_type_hint: &str, // event has its own entity_type
        entity_id: Uuid,
    ) -> Result<EventEnvelope, String> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        let payload = serde_json::to_string(&event).map_err(|e| e.to_string())?;
        let entity_type = event.entity_type();

        // 1. Get next version for this entity (Optimistic Locking)
        let next_version: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(version), 0) + 1 FROM event_store WHERE entity_id = ?",
                params![entity_id.to_string()],
                |r| r.get(0),
            )
            .unwrap_or(1);

        let id = Uuid::new_v4();
        let created_at = Utc::now();

        // 2. Persist to event_store
        let global_seq: i64 = tx.query_row(
            "INSERT INTO event_store (id, project_id, entity_type, entity_id, event_type, payload, version, device_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING global_seq",
            params![
                id.to_string(),
                project_id.to_string(),
                entity_type.to_string(),
                entity_id.to_string(),
                event.action(),
                payload,
                next_version,
                self.device_id,
                created_at.to_rfc3339()
            ],
            |r| r.get(0)
        ).map_err(|e| format!("Failed to append event: {}", e))?;

        // 3. Double-write to design_events for UI compatibility (Undo/Redo & Log)
        if entity_type == "feature"
            || entity_type == "layer"
            || entity_type == "region"
            || entity_type == "task"
        {
            let _ = tx.execute(
                "INSERT INTO design_events (event_id, project_id, event_type, payload_json, timestamp, is_undone)
                 VALUES (?, ?, ?, ?, ?, 0)",
                params![
                    id.to_string(),
                    project_id.to_string(),
                    event.action(),
                    payload,
                    created_at.to_rfc3339()
                ],
            );
        }

        tx.commit().map_err(|e| e.to_string())?;

        Ok(EventEnvelope {
            id,
            project_id,
            entity_type: entity_type.to_string(),
            entity_id,
            event,
            version: next_version,
            global_seq,
            device_id: self.device_id.clone(),
            causal_id: None,
            correlation_id: None,
            created_at,
            metadata: Some(serde_json::json!({})),
            schema_version: 1,
        })
    }

    pub fn save_batch(
        &self,
        project_id: Uuid,
        events: Vec<(AppEvent, String, Uuid)>,
    ) -> Result<Vec<Uuid>, String> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut saved_ids = Vec::new();

        for (event, _entity_type_hint, entity_id) in events {
            let payload = serde_json::to_string(&event).map_err(|e| e.to_string())?;
            let entity_type = event.entity_type();

            let next_version: i64 = tx
                .query_row(
                    "SELECT COALESCE(MAX(version), 0) + 1 FROM event_store WHERE entity_id = ?",
                    params![entity_id.to_string()],
                    |r| r.get(0),
                )
                .unwrap_or(1);

            let id = Uuid::new_v4();
            let created_at = Utc::now();

            tx.execute(
                "INSERT INTO event_store (id, project_id, entity_type, entity_id, event_type, payload, version, device_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    id.to_string(),
                    project_id.to_string(),
                    entity_type.to_string(),
                    entity_id.to_string(),
                    event.action(),
                    payload,
                    next_version,
                    self.device_id,
                    created_at.to_rfc3339()
                ],
            ).map_err(|e| format!("Batch insert failed: {}", e))?;

            if entity_type == "feature" || entity_type == "layer" || entity_type == "region" {
                let _ = tx.execute(
                    "INSERT INTO design_events (event_id, project_id, event_type, payload_json, timestamp, is_undone)
                     VALUES (?, ?, ?, ?, ?, 0)",
                    params![
                        id.to_string(),
                        project_id.to_string(),
                        event.action(),
                        payload,
                        created_at.to_rfc3339()
                    ],
                );
            }
            saved_ids.push(id);
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(saved_ids)
    }

    pub fn get_events_after(&self, seq: i64) -> Result<Vec<EventEnvelope>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, entity_type, entity_id, payload, version, device_id, global_seq, created_at FROM event_store WHERE global_seq > ? ORDER BY global_seq ASC"
        ).map_err(|e| e.to_string())?;

        let events = stmt
            .query_map(params![seq], |row| {
                let payload_str: String = row.get(4)?;
                let event: AppEvent = serde_json::from_str(&payload_str)
                    .map_err(|_| rusqlite::Error::InvalidQuery)?;

                Ok(EventEnvelope {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_default(),
                    project_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_default(),
                    entity_type: row.get(2)?,
                    entity_id: Uuid::parse_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                    event,
                    version: row.get(5)?,
                    device_id: row.get(6)?,
                    global_seq: row.get(7)?,
                    causal_id: None,
                    correlation_id: None,
                    created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                        .unwrap_or_default()
                        .with_timezone(&Utc),
                    metadata: Some(serde_json::json!({})),
                    schema_version: 1,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for event in events {
            result.push(event.map_err(|e| e.to_string())?);
        }
        Ok(result)
    }

    pub fn get_device_id(&self) -> String {
        self.device_id.clone()
    }

    pub fn get_sync_state(&self) -> Result<SyncState, String> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT device_id, last_pushed_seq, last_pulled_seq, last_sync_at FROM sync_state WHERE device_id = ?",
            params![self.device_id],
            |r| {
                let last_sync_at_str: Option<String> = r.get(3)?;
                let last_sync_at = last_sync_at_str.and_then(|s| {
                    chrono::DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc))
                });

                Ok(SyncState {
                    device_id: r.get(0)?,
                    last_pushed_seq: r.get(1)?,
                    last_pulled_seq: r.get(2)?,
                    last_sync_at,
                })
            }
        ).map_err(|e| format!("Failed to get sync state: {}", e))
    }

    pub fn update_sync_state(&self, state: SyncState) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO sync_state (device_id, last_pushed_seq, last_pulled_seq, last_sync_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'))
             ON CONFLICT(device_id) DO UPDATE SET
                last_pushed_seq = excluded.last_pushed_seq,
                last_pulled_seq = excluded.last_pulled_seq,
                last_sync_at = excluded.last_sync_at,
                updated_at = datetime('now')",
            params![
                state.device_id,
                state.last_pushed_seq,
                state.last_pulled_seq,
                state.last_sync_at.map(|dt| dt.to_rfc3339())
            ],
        ).map_err(|e| format!("Failed to update sync state: {}", e))?;
        Ok(())
    }

    pub fn get_events_since(&self, seq: i64) -> Result<Vec<EventEnvelope>, String> {
        self.get_events_after(seq)
    }

    pub fn get_event(&self, id: Uuid) -> Result<EventEnvelope, String> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT id, project_id, entity_type, entity_id, payload, version, device_id, global_seq, created_at FROM event_store WHERE id = ?",
            params![id.to_string()],
            |row| {
                let payload_str: String = row.get(4)?;
                let event: AppEvent = serde_json::from_str(&payload_str)
                    .map_err(|_| rusqlite::Error::InvalidQuery)?;

                Ok(EventEnvelope {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_default(),
                    project_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_default(),
                    entity_type: row.get(2)?,
                    entity_id: Uuid::parse_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                    event,
                    version: row.get(5)?,
                    device_id: row.get(6)?,
                    global_seq: row.get(7)?,
                    causal_id: None,
                    correlation_id: None,
                    created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                        .unwrap_or_default()
                        .with_timezone(&Utc),
                    metadata: Some(serde_json::json!({})),
                    schema_version: 1,
                })
            }
        ).map_err(|e| format!("Event not found: {}", e))
    }

    pub fn get_entity_version(&self, _entity_type: &str, entity_id: Uuid) -> Result<i64, String> {
        let conn = self.conn.lock();
        let version: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM event_store WHERE entity_id = ?",
                params![entity_id.to_string()],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok(version)
    }

    pub fn get_entity_events(
        &self,
        _entity_type: &str,
        entity_id: Uuid,
    ) -> Result<Vec<EventEnvelope>, String> {
        self.load_envelopes_by_entity(entity_id)
    }

    pub fn append_envelope(&self, envelope: EventEnvelope) -> Result<(), String> {
        let conn = self.conn.lock();
        let payload = serde_json::to_string(&envelope.event).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO event_store (id, project_id, entity_type, entity_id, event_type, payload, version, global_seq, device_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                envelope.id.to_string(),
                envelope.project_id.to_string(),
                envelope.entity_type,
                envelope.entity_id.to_string(),
                envelope.event.action(),
                payload,
                envelope.version,
                envelope.global_seq,
                envelope.device_id,
                envelope.created_at.to_rfc3339()
            ],
        ).map_err(|e| format!("Failed to append envelope: {}", e))?;

        Ok(())
    }

    pub fn load_envelopes_by_entity(&self, entity_id: Uuid) -> Result<Vec<EventEnvelope>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, entity_type, entity_id, payload, version, device_id, global_seq, created_at FROM event_store WHERE entity_id = ? ORDER BY version ASC"
        ).map_err(|e| e.to_string())?;

        let events = stmt
            .query_map(params![entity_id.to_string()], |row| {
                let payload_str: String = row.get(4)?;
                let event: AppEvent = serde_json::from_str(&payload_str)
                    .map_err(|_| rusqlite::Error::InvalidQuery)?;

                Ok(EventEnvelope {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_default(),
                    project_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_default(),
                    entity_type: row.get(2)?,
                    entity_id: Uuid::parse_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                    event,
                    version: row.get(5)?,
                    device_id: row.get(6)?,
                    global_seq: row.get(7)?,
                    causal_id: None,
                    correlation_id: None,
                    created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                        .unwrap_or_default()
                        .with_timezone(&Utc),
                    metadata: Some(serde_json::json!({})),
                    schema_version: 1,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for event in events {
            result.push(event.map_err(|e| e.to_string())?);
        }
        Ok(result)
    }
}
