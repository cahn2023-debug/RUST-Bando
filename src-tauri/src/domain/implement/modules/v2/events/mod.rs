pub use crate::domain::models::v2::{AppEvent, EventEnvelope, SyncState};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZeroCopyEventEnvelope {
    pub event_id: Uuid,
    pub entity_id: Uuid,
    pub project_id: Uuid,
    pub payload: serde_json::Value,
}
