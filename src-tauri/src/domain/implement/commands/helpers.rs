use crate::implement::db::DatabaseState;
use crate::implement::modules::core::active_pmp::ActivePmpState;
use crate::implement::modules::v2::events::AppEvent;
use crate::implement::modules::v2::storage::worker::WorkerCommand;
use rusqlite::{params, Connection, OptionalExtension};
use tokio::sync::mpsc;
use tracing::{debug, error};
use uuid::Uuid;

pub fn get_db_connection(
    state: &DatabaseState,
) -> Result<std::sync::MutexGuard<'_, Option<Connection>>, String> {
    state
        .conn
        .lock()
        .map_err(|_| "Database connection lock poisoned".to_string())
}

pub async fn send_v2_event(
    sender: &mpsc::Sender<WorkerCommand>,
    project_id: Uuid,
    entity_type: &str,
    entity_id: Uuid,
    event: AppEvent,
) -> Result<Uuid, String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();

    debug!("[IPC] Queueing V2 event for entity {}", entity_id);

    // Save batch of single event
    let command = WorkerCommand::SaveBatch {
        project_id,
        events: vec![(event, entity_type.to_string(), entity_id)],
        reply_tx,
    };

    if let Err(e) = sender.send(command).await {
        error!("[IPC] Worker channel closed: {}", e);
        return Err("Database Worker is offline".into());
    }

    match reply_rx.await {
        Ok(Ok(saved_ids)) => {
            if let Some(id) = saved_ids.into_iter().next() {
                Ok(id)
            } else {
                Err("No ID returned from transaction".into())
            }
        }
        Ok(Err(e)) => {
            error!("[IPC] Worker transaction failed: {}", e);
            Err(e)
        }
        Err(e) => {
            error!("[IPC] Worker dropped response: {}", e);
            Err("Database transaction timeout or crash".into())
        }
    }
}

pub fn active_v2_sender(active_pmp: &ActivePmpState) -> Result<mpsc::Sender<WorkerCommand>, String> {
    active_pmp.sender()
}

pub fn project_id_to_uuid(project_id: &str) -> Result<Uuid, String> {
    Uuid::parse_str(project_id).map_err(|e| format!("Invalid project UUID '{}': {}", project_id, e))
}

pub fn project_scope_id(project_id: &str) -> String {
    project_id.to_string()
}

pub fn global_scope_id() -> String {
    String::new()
}

pub fn resolve_legacy_uuid(
    conn: &Connection,
    entity_type: &str,
    scope_id: &str,
    legacy_id: i32,
) -> Result<Uuid, String> {
    let uuid_raw: String = conn
        .query_row(
            "SELECT uuid FROM entity_id_aliases
             WHERE entity_type = ?1 AND scope_id = ?2 AND legacy_id = ?3",
            params![entity_type, scope_id, legacy_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Uuid::parse_str(&uuid_raw).map_err(|e| format!("Invalid aliased UUID for {}#{}: {}", entity_type, legacy_id, e))
}

pub fn ensure_legacy_alias(
    conn: &Connection,
    entity_type: &str,
    scope_id: &str,
    entity_uuid: Uuid,
) -> Result<i32, String> {
    if let Some(existing) = conn
        .query_row(
            "SELECT legacy_id FROM entity_id_aliases
             WHERE entity_type = ?1 AND scope_id = ?2 AND uuid = ?3",
            params![entity_type, scope_id, entity_uuid.to_string()],
            |row| row.get::<_, i32>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
    {
        return Ok(existing);
    }

    let next_id = conn
        .query_row(
            "SELECT COALESCE(MAX(legacy_id), 0) + 1 FROM entity_id_aliases
             WHERE entity_type = ?1 AND scope_id = ?2",
            params![entity_type, scope_id],
            |row| row.get::<_, i32>(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO entity_id_aliases (entity_type, scope_id, legacy_id, uuid)
         VALUES (?1, ?2, ?3, ?4)",
        params![entity_type, scope_id, next_id, entity_uuid.to_string()],
    )
    .map_err(|e| e.to_string())?;

    Ok(next_id)
}
