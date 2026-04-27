use crate::domain::implement::db::models::DatabaseState;
use crate::domain::implement::modules::v2::events::types::ZeroCopyEventEnvelope;
use rusqlite::{params, Connection, Transaction};
use std::sync::{Arc, Mutex};
use tauri::State;
use uuid::Uuid;

pub const LATEST_SCHEMA_VERSION: u32 = 2;

// ============================================================================
// EventMigrator (Lazy Migration Pattern)
// ============================================================================
pub struct EventMigrator;

impl EventMigrator {
    pub fn upcast<'a>(mut envelope: ZeroCopyEventEnvelope<'a>) -> ZeroCopyEventEnvelope<'a> {
        while envelope.schema_version < LATEST_SCHEMA_VERSION {
            // Logic Lazy migration hoạt động ở đây:
            // Nó kiểm tra version của từng Record lúc kéo lên (Read).
            // Nếu schema_version < 2, nâng cấp trực tiếp payload trong bộ nhớ.
            envelope.schema_version += 1;
        }
        envelope
    }
}

// ============================================================================
// Unit of Work (Transaction Manager)
// ============================================================================
pub fn run_in_transaction<F, R>(
    db_state: &State<'_, DatabaseState>,
    db_path: &std::path::PathBuf,
    operation: F,
) -> Result<R, String>
where
    F: FnOnce(&Transaction) -> Result<R, String>,
{
    // Lấy lock an toàn từ Dashboard Connection Pool
    let conn_arc = db_state
        .connection_pool
        .get(db_path)
        .ok_or_else(|| "Database connection not found in pool".to_string())?
        .clone();

    let mut conn = conn_arc
        .lock()
        .map_err(|_| "Failed to lock database connection".to_string())?;

    // Mở transaction cho nghiệp vụ ghi (Write)
    let tx = conn
        .transaction()
        .map_err(|e| format!("Fail to start transaction: {}", e))?;

    match operation(&tx) {
        Ok(result) => {
            // Tự động commit nếu operation thành công
            tx.commit()
                .map_err(|e| format!("Transaction commit failed: {}", e))?;
            Ok(result)
        }
        Err(e) => {
            // Tự động rollback nếu xảy ra bất cứ lỗi gì
            let _ = tx.rollback();
            Err(e)
        }
    }
}

// ============================================================================
// EventRepository (Zero-copy DB Access)
// ============================================================================
pub struct EventRepository {
    conn: Arc<Mutex<Connection>>,
}

impl EventRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    /// Ghi sự kiện vào Store bằng bincode
    pub fn append(&self, envelope: &ZeroCopyEventEnvelope<'_>) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "Failed to lock DB")?;

        let encoded_blob = bincode::serialize(envelope).map_err(|e| e.to_string())?;

        // Ở V5.3, chúng ta tận dụng cột metadata_json làm storage primary cho binary data
        // hoặc thêm cột blob mới. Để tương thích ngược, ta dùng cột metadata_json.
        conn.execute(
            "INSERT INTO event_store (id, entity_id, schema_version, metadata_json, created_at)
             VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)",
            params![
                envelope.event_id.to_string(),
                envelope.entity_id.to_string(),
                envelope.schema_version,
                encoded_blob,
            ],
        )
        .map_err(|e| format!("DB Insert Error: {}", e))?;

        Ok(())
    }

    /// Truy vấn sự kiện và Upcast nếu cần
    pub fn get_by_entity(
        &self,
        entity_id: Uuid,
    ) -> Result<Vec<ZeroCopyEventEnvelope<'static>>, String> {
        let conn = self.conn.lock().map_err(|_| "Failed to lock DB")?;

        let mut stmt = conn.prepare(
            "SELECT metadata_json FROM event_store WHERE entity_id = ?1 ORDER BY global_seq ASC"
        ).map_err(|e| e.to_string())?;

        let event_iter = stmt
            .query_map(params![entity_id.to_string()], |row| {
                let blob: Vec<u8> = row.get(0)?;
                Ok(blob)
            })
            .map_err(|e| e.to_string())?;

        let mut events = Vec::new();
        for result in event_iter {
            if let Ok(blob) = result {
                if let Ok(decoded) = bincode::deserialize::<ZeroCopyEventEnvelope<'_>>(&blob) {
                    let migrated = EventMigrator::upcast(decoded);
                    events.push(migrated.into_owned());
                }
            }
        }

        Ok(events)
    }
}
