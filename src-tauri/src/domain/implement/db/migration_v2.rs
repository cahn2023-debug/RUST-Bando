use crate::domain::implement::modules::v2::events::AppEvent;
use rusqlite::{params, Connection};
use uuid::Uuid;

/// Thực hiện migration từ PMP V1 sang Event Store V2
pub fn migrate_v1_to_v2(conn: &Connection, project_id: Uuid) -> Result<(), String> {
    // 1. Tạo bảng event_store nếu chưa có (Phải đồng bộ với EventStore)
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS event_store (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            version INTEGER NOT NULL,
            global_seq INTEGER NOT NULL UNIQUE,
            device_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_event_store_entity ON event_store(entity_id, version);
        CREATE INDEX IF NOT EXISTS idx_event_store_project ON event_store(project_id);
        ",
    )
    .map_err(|e| e.to_string())?;

    // 2. Chuyển đổi dữ liệu Project
    let project_name: String = conn
        .query_row(
            "SELECT name FROM projects WHERE id = ?",
            [project_id.to_string()],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "Legacy Project".to_string());

    let event = AppEvent::ProjectCreated {
        id: project_id,
        name: project_name,
        root_path: "".to_string(),
        metadata: serde_json::json!({}),
        settings: serde_json::json!({}),
    };

    let payload = serde_json::to_string(&event).map_err(|e| e.to_string())?;

    // Check if event already exists to avoid conflict on migration re-run
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM event_store WHERE entity_id = ? AND event_type = 'created'",
            [project_id.to_string()],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if exists == 0 {
        conn.execute(
            "INSERT INTO event_store (id, project_id, entity_type, entity_id, event_type, payload, version, global_seq, device_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(global_seq), 0) + 1 FROM event_store), ?, datetime('now'))",
            params![
                Uuid::new_v4().to_string(),
                project_id.to_string(),
                "project",
                project_id.to_string(),
                "created",
                payload,
                1,
                "migration_v1"
            ],
        ).map_err(|e| format!("Failed to record project migration event: {}", e))?;
    }

    Ok(())
}
