/// V2 Sync Engine - Multi-device event-based sync
///
/// Strategy: Event-based sync (NOT file sync)
/// - Push local events to server
/// - Pull remote events from server
/// - Apply remote events locally
/// - Conflict detection and resolution
use reqwest::Client;
use serde::{Deserialize, Serialize};
use parking_lot::Mutex;
use std::sync::Arc;

use crate::domain::models::v2::EventEnvelope;
use crate::domain::implement::modules::v2::EventStore;
use super::repository::SyncRepository;

// ============================================================================
// Sync Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushRequest {
    pub device_id: String,
    pub events: Vec<EventEnvelope>,
    pub since_seq: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResponse {
    pub accepted: usize,
    pub rejected: Vec<String>, // Event IDs that were rejected
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullResponse {
    pub events: Vec<EventEnvelope>,
    pub server_seq: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub pushed: usize,
    pub pulled: usize,
    pub conflicts: usize,
}

// ============================================================================
/// SyncEngine
// ============================================================================
pub struct SyncEngine {
    event_store: Arc<Mutex<EventStore>>,
    sync_repo: Arc<SyncRepository>,
    server_url: String,
    http_client: Client,
    is_online: Arc<Mutex<bool>>,
    last_sync_error: Arc<Mutex<Option<String>>>,
}

impl SyncEngine {
    pub fn new(
        event_store: Arc<Mutex<EventStore>>,
        sync_repo: Arc<SyncRepository>,
        server_url: &str,
    ) -> Self {
        Self {
            event_store,
            sync_repo,
            server_url: server_url.to_string(),
            http_client: Client::new(),
            is_online: Arc::new(Mutex::new(true)),
            last_sync_error: Arc::new(Mutex::new(None)),
        }
    }

    fn set_last_error(&self, err: String) {
        let mut lock = self.last_sync_error.lock();
        *lock = Some(err);
    }

    pub fn get_last_error(&self) -> Option<String> {
        self.last_sync_error.lock().clone()
    }

    // ── Push Events ───────────────────────────────────────────────────────
    /// Push local events and pending offline queue to server
    pub async fn push_events(&self) -> Result<usize, String> {
        let device_id = {
            let store = self.event_store.lock();
            store.get_device_id()
        };

        // 1. Lấy events chưa push từ main store
        let (since_seq, mut events) = {
            let store = self.event_store.lock();
            let sync_state = store.get_sync_state()?;
            let events = store.get_events_since(sync_state.last_pushed_seq)?;
            (sync_state.last_pushed_seq, events)
        };

        // 2. Lấy events từ offline repository (nếu có)
        let offline_events = self.sync_repo.get_offline_events()?;
        
        // Hợp nhất tránh trùng lặp
        for off_ev in &offline_events {
            if !events.iter().any(|e| e.id == off_ev.id) {
                events.push(off_ev.clone());
            }
        }

        if events.is_empty() {
            return Ok(0);
        }

        let max_seq = events.iter().map(|e| e.global_seq).max().unwrap_or(since_seq);

        let response = self
            .http_client
            .post(&format!("{}/push-events", self.server_url))
            .json(&PushRequest {
                device_id,
                events: events.clone(),
                since_seq,
            })
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let _push_resp: PushResponse = resp.json().await.map_err(|e| e.to_string())?;
                
                // Cập nhật sync state
                {
                    let store = self.event_store.lock();
                    let mut sync_state = store.get_sync_state()?;
                    sync_state.last_pushed_seq = max_seq;
                    store.update_sync_state(sync_state)?;
                }

                // Xóa khỏi offline queue sau khi gửi thành công
                for ev in &events {
                    let _ = self.sync_repo.remove_from_offline_queue(&ev.id);
                }

                Ok(events.len())
            }
            Ok(resp) => {
                let err = format!("Server error: {}", resp.status());
                self.set_last_error(err.clone());
                Err(err)
            }
            Err(e) => {
                let err = format!("Network error: {}", e);
                self.set_last_error(err.clone());
                Err(err)
            }
        }
    }

    // ── Pull Events ───────────────────────────────────────────────────────
 
    /// Pull remote events from server
    pub async fn pull_events(&self) -> Result<Vec<EventEnvelope>, String> {
        let (device_id, last_pulled_seq) = {
            let store = self.event_store.lock();
            let sync_state = store.get_sync_state()?;
            (store.get_device_id(), sync_state.last_pulled_seq)
        };

        let response = self
            .http_client
            .get(&format!("{}/pull-events", self.server_url))
            .query(&[("device_id", &device_id), ("since_seq", &last_pulled_seq.to_string())])
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let pull_resp: PullResponse = resp.json().await.map_err(|e| e.to_string())?;
                
                if pull_resp.events.is_empty() {
                    return Ok(Vec::new());
                }

                // Apply events locally
                for ev in &pull_resp.events {
                    self.apply_remote_event(ev).await?;
                }

                // Update sync state
                {
                    let store = self.event_store.lock();
                    let mut sync_state = store.get_sync_state()?;
                    let max_server_seq = pull_resp.events.iter().map(|e| e.global_seq).max().unwrap_or(last_pulled_seq);
                    sync_state.last_pulled_seq = max_server_seq;
                    store.update_sync_state(sync_state)?;
                }

                Ok(pull_resp.events)
            }
            Ok(resp) => {
                let err = format!("Server error on pull: {}", resp.status());
                self.set_last_error(err.clone());
                Err(err)
            }
            Err(e) => {
                let err = format!("Network error on pull: {}", e);
                self.set_last_error(err.clone());
                Err(err)
            }
        }
    }

    // ── Full Sync ─────────────────────────────────────────────────────────

    /// Execute full sync cycle (push then pull)
    pub async fn sync(&self) -> Result<SyncResult, String> {
        let pushed = match self.push_events().await {
            Ok(count) => count,
            Err(e) => {
                log::warn!("Push failed: {}", e);
                0
            }
        };

        let pulled_events = match self.pull_events().await {
            Ok(events) => events,
            Err(e) => {
                log::warn!("Pull failed: {}", e);
                Vec::new()
            }
        };

        Ok(SyncResult {
            pushed,
            pulled: pulled_events.len(),
            conflicts: 0,
        })
    }

    /// Submit a local event for background synchronization
    pub fn submit_event(&self, envelope: EventEnvelope) -> Result<(), String> {
        self.sync_repo.queue_offline_event(&envelope)?;
        Ok(())
    }

    // ── Offline Mode ──────────────────────────────────────────────────────

    pub fn go_offline(&self) {
        *self.is_online.lock() = false;
    }

    pub fn go_online(&self) {
        *self.is_online.lock() = true;
    }

    pub fn is_online(&self) -> bool {
        *self.is_online.lock()
    }

    // ── Conflict Resolution ──────────────────────────────────────────────

    async fn apply_remote_event(&self, event: &EventEnvelope) -> Result<(), String> {
        // 1. Kiểm tra tranh chấp
        if self.has_conflict(event)? {
            self.resolve_conflict(event)?;
        } else {
            // 2. Không tranh chấp, áp dụng trực tiếp
            let store = self.event_store.lock();
            
            // Idempotency check: try to get event. If it fails, assume it's new.
            if store.get_event(event.id).is_err() {
                store.append_envelope(event.clone())?;
            }
        }
        Ok(())
    }

    fn has_conflict(&self, remote_event: &EventEnvelope) -> Result<bool, String> {
        let store = self.event_store.lock();
        
        // Lấy version hiện tại của entity local
        let local_version = store.get_entity_version(&remote_event.entity_type, remote_event.entity_id)?;

        // Xung đột xảy ra nếu:
        // 1. Entity đã tồn tại (local_version > 0)
        // 2. Version của remote trùng hoặc cũ hơn version local
        // 3. Khác device (migration events không bị coi là xung đột)
        let is_conflict = local_version > 0 
            && local_version <= remote_event.version 
            && remote_event.device_id != "migration";

        Ok(is_conflict)
    }

    fn resolve_conflict(&self, remote_event: &EventEnvelope) -> Result<(), String> {
        use std::cmp::Ordering;

        let latest_local = {
            let store = self.event_store.lock();
            let events = store.get_entity_events(&remote_event.entity_type, remote_event.entity_id)?;
            events.last().cloned()
        };

        if let Some(local_ev) = latest_local {
            match remote_event.version.cmp(&local_ev.version) {
                Ordering::Greater => {
                    // Remote mới hơn, ghi đè
                    let store = self.event_store.lock();
                    store.append_envelope(remote_event.clone())?;
                }
                Ordering::Less => {
                    // Local mới hơn, đưa remote vào hàng đợi xử lý sau (offline repo)
                    self.submit_event(remote_event.clone())?;
                }
                Ordering::Equal => {
                    // Version bằng nhau, dùng timestamp
                    if remote_event.created_at > local_ev.created_at {
                        let store = self.event_store.lock();
                        store.append_envelope(remote_event.clone())?;
                    } else {
                        self.submit_event(remote_event.clone())?;
                    }
                }
            }
        } else {
            // Không thấy local, cứ append
            let store = self.event_store.lock();
            store.append_envelope(remote_event.clone())?;
        }

        Ok(())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::implement::modules::v2::events::AppEvent;
    use rusqlite::Connection;
    use uuid::Uuid;

    fn create_test_resources() -> (Arc<Mutex<EventStore>>, Arc<SyncRepository>) {
        let conn = Arc::new(Mutex::new(Connection::open_in_memory().unwrap()));
        
        // Setup schema
        {
            let lock = conn.lock().unwrap();
            lock.execute_batch(
                "CREATE TABLE event_store (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    metadata_json TEXT,
                    version INTEGER NOT NULL,
                    global_seq INTEGER NOT NULL UNIQUE,
                    device_id TEXT NOT NULL,
                    correlation_id TEXT,
                    causation_id TEXT,
                    schema_version INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE sync_state (
                    device_id TEXT PRIMARY KEY,
                    device_name TEXT,
                    last_pushed_seq INTEGER DEFAULT 0,
                    last_pulled_seq INTEGER DEFAULT 0,
                    last_sync_at TEXT,
                    sync_status TEXT DEFAULT 'idle',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE offline_sync_queue (
                    event_id TEXT PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    payload_json TEXT NOT NULL,
                    metadata_json TEXT,
                    device_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    queued_at TEXT NOT NULL DEFAULT (datetime('now'))
                );"
            ).unwrap();
        }

        let store = Arc::new(Mutex::new(EventStore::new(conn.clone(), "test-device".to_string())));
        let repo = Arc::new(SyncRepository::new(conn.clone()));
        (store, repo)
    }

    #[test]
    fn test_sync_engine_creation() {
        let (store, repo) = create_test_resources();
        let engine = SyncEngine::new(store, repo, "http://localhost:3000");

        assert!(engine.is_online());
        assert!(engine.get_last_error().is_none());
    }

    #[test]
    fn test_offline_submission() {
        let (store, repo) = create_test_resources();
        let engine = SyncEngine::new(store, repo.clone(), "http://localhost:3000");

        let event = EventEnvelope::new(
            Uuid::new_v4(),
            "task",
            Uuid::new_v4(),
            AppEvent::TaskCreated {
                name: "Offline Task".to_string(),
                parent_id: None,
                metadata: serde_json::json!({}),
            },
            "test-device",
            None,
        );

        engine.submit_event(event).unwrap();
        let pending = repo.get_offline_events().unwrap();
        assert_eq!(pending.len(), 1);
    }
}
