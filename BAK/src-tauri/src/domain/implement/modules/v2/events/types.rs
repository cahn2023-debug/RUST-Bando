use crate::domain::models::v2::{AppEvent, EventEnvelope, ZeroCopyEventEnvelope};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SyncData {
    pub last_pushed_seq: i64,
    pub last_pulled_seq: i64,
    pub last_sync_at: Option<chrono::DateTime<chrono::Utc>>,
    pub device_id: String,
    pub device_name: String,
    pub last_seq: i64,
    pub sync_status: String,
}
