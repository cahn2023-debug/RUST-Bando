use crate::domain::design::events::{DesignEvent, DesignEventRecord};
use rusqlite::{params, Connection, Result};
use std::sync::{Arc, Mutex};

pub struct EventLog {
    conn: Arc<Mutex<Connection>>,
}

impl EventLog {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Result<Self> {
        let guard = conn.lock().unwrap();

        // Tạo bảng lưu trữ log sự kiện nếu chưa tồn tại
        guard.execute(
            "CREATE TABLE IF NOT EXISTS design_event_log (
                sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )",
            [],
        )?;

        drop(guard);
        Ok(Self { conn })
    }

    pub fn append(&self, event: &DesignEvent) -> Result<i64> {
        let event_type = match event {
            DesignEvent::AddFeature { .. } => "AddFeature",
            DesignEvent::UpdateFeature { .. } => "UpdateFeature",
            DesignEvent::DeleteFeature { .. } => "DeleteFeature",
            DesignEvent::MoveFeature { .. } => "MoveFeature",
            DesignEvent::CreateLayer { .. } => "CreateLayer",
            DesignEvent::UpdateLayer { .. } => "UpdateLayer",
            DesignEvent::DeleteLayer { .. } => "DeleteLayer",
            DesignEvent::CreateRegion { .. } => "CreateRegion",
            DesignEvent::UpdateRegion { .. } => "UpdateRegion",
        };

        let payload_json = serde_json::to_string(event)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        let timestamp = chrono::Utc::now().timestamp_millis();

        let guard = self.conn.lock().unwrap();
        guard.execute(
            "INSERT INTO design_event_log (event_type, payload_json, timestamp) VALUES (?1, ?2, ?3)",
            params![event_type, payload_json, timestamp],
        )?;

        Ok(guard.last_insert_rowid())
    }

    pub fn get_events_from(&self, sequence_id: i64) -> Result<Vec<DesignEventRecord>> {
        let guard = self.conn.lock().unwrap();
        let mut stmt = guard.prepare(
            "SELECT sequence_id, payload_json, timestamp FROM design_event_log WHERE sequence_id > ?1 ORDER BY sequence_id ASC"
        )?;

        let event_iter = stmt.query_map(params![sequence_id], |row| {
            let seq: i64 = row.get(0)?;
            let json: String = row.get(1)?;
            let ts: i64 = row.get(2)?;

            let event: DesignEvent = serde_json::from_str(&json)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

            Ok(DesignEventRecord {
                sequence_id: seq,
                event,
                timestamp: ts,
            })
        })?;

        let mut events = Vec::new();
        for event in event_iter {
            events.push(event?);
        }

        Ok(events)
    }
}
