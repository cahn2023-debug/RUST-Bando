use rocksdb::DB;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, oneshot};
use tracing::info;
use uuid::Uuid;

use super::DatabaseState;
use crate::design::design_events::DesignEventType;
use crate::domain::implement::modules::v2::{AppEvent, V2Database};

/// Message to the write worker
pub enum WriteMessage {
    /// V1/Bridge: Design events (debounced)
    Events {
        project_id: String,
        events: Vec<DesignEventType>,
        reply_tx: oneshot::Sender<Result<String, String>>,
    },
    /// V1/Bridge: Immediate flush of design events
    Flush {
        project_id: String,
        events: Vec<DesignEventType>,
        reply_tx: oneshot::Sender<Result<String, String>>,
    },
    /// V2: Append raw event blob to event_store
    AppendEventV2 {
        project_id: String,
        blob: Vec<u8>,
        reply_tx: oneshot::Sender<Result<Uuid, String>>,
    },
    /// V2: Save a batch of high-level events (with projections)
    SaveBatchV2 {
        project_id: String,
        events: Vec<(Vec<u8>, String, Uuid)>, // Optimized: (blob, entity_type, entity_id)
        reply_tx:
            oneshot::Sender<Result<Vec<crate::implement::modules::v2::EventEnvelope>, String>>,
    },
    /// General: Execute arbitrary SQL batch
    ExecuteSql {
        project_id: String,
        sql: String,
        reply_tx: oneshot::Sender<Result<(), String>>,
    },
    /// Save active world state to structural tables (Snapshot)
    SaveSnapshot {
        project_id: String,
        world_state: serde_json::Value,
        reply_tx: oneshot::Sender<Result<(), String>>,
    },
    /// Undo last design event
    Undo {
        project_id: String,
        reply_tx: oneshot::Sender<Result<String, String>>,
    },
    /// Redo last design event
    Redo {
        project_id: String,
        reply_tx: oneshot::Sender<Result<String, String>>,
    },
    /// General: Execute a closure with raw access to the connection
    ExecuteJob {
        project_id: String,
        job: Box<dyn FnOnce(&mut Connection) -> Result<(), String> + Send>,
        reply_tx: oneshot::Sender<Result<(), String>>,
    },
    /// Force checkpoint and sync to disk
    FlushAndSync {
        project_id: String,
        reply_tx: oneshot::Sender<Result<(), String>>,
    },
    /// V2 Analytics: Get project stats
    GetProjectStats {
        project_id: String,
        reply_tx: oneshot::Sender<
            Result<crate::implement::modules::v2::storage::duckdb_manager::ProjectStats, String>,
        >,
    },
    /// V2 Analytics: Get extension distribution
    GetExtensionDist {
        project_id: String,
        reply_tx: oneshot::Sender<
            Result<
                Vec<crate::implement::modules::v2::storage::duckdb_manager::ExtensionStat>,
                String,
            >,
        >,
    },
    /// V2 Analytics: Get top files
    GetTopFiles {
        project_id: String,
        limit: usize,
        reply_tx: oneshot::Sender<
            Result<Vec<crate::implement::modules::v2::storage::duckdb_manager::FileStat>, String>,
        >,
    },
    Shutdown {
        reply_tx: oneshot::Sender<()>,
    },
}

/// Handle to enqueue write requests (Single Writer Actor)
#[derive(Clone)]
pub struct WriteQueue {
    tx: mpsc::Sender<WriteMessage>,
    pub device_id: String,
}

impl WriteQueue {
    /// Enqueue events for debounced write (V1 Design Events)
    pub async fn enqueue(
        &self,
        project_id: String,
        events: Vec<DesignEventType>,
    ) -> Result<String, String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::Events {
                project_id,
                events,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Flush all pending writes and perform a full SQLite checkpoint
    pub async fn flush_and_sync(&self, project_id: String) -> Result<(), String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::FlushAndSync {
                project_id,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Append a V2 event blob to the event_store
    pub async fn append_event(&self, project_id: String, blob: Vec<u8>) -> Result<Uuid, String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::AppendEventV2 {
                project_id,
                blob,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Save a batch of V2 events with projections
    /// Save a batch of V2 events with projections (Optimized with pre-serialization)
    pub async fn save_batch_v2(
        &self,
        project_id: String,
        events: Vec<(AppEvent, String, Uuid)>,
    ) -> Result<Vec<crate::implement::modules::v2::EventEnvelope>, String> {
        // Serialize events to bincode blobs BEFORE sending to queue
        // This offloads work from the single actor thread
        let mut serialized_events = Vec::with_capacity(events.len());
        for (event, entity_type, entity_id) in events {
            let blob = bincode::serialize(&event).map_err(|e| format!("Bincode error: {}", e))?;
            serialized_events.push((blob, entity_type, entity_id));
        }

        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::SaveBatchV2 {
                project_id,
                events: serialized_events,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Save active world state to structural tables (Snapshot)
    pub async fn save_snapshot(
        &self,
        project_id: String,
        world_state: serde_json::Value,
    ) -> Result<(), String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::SaveSnapshot {
                project_id,
                world_state,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Undo last design event in DB
    pub async fn undo_event(&self, project_id: String) -> Result<String, String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::Undo {
                project_id,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Redo last design event in DB
    pub async fn redo_event(&self, project_id: String) -> Result<String, String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::Redo {
                project_id,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Execute an arbitrary SQL batch
    pub async fn execute_sql(&self, project_id: String, sql: String) -> Result<(), String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::ExecuteSql {
                project_id,
                sql,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Shutdown the write queue
    pub async fn shutdown(&self) {
        let (reply_tx, reply_rx) = oneshot::channel();
        let _ = self.tx.send(WriteMessage::Shutdown { reply_tx }).await;
        let _ = reply_rx.await;
    }

    /// Execute a custom job on the writer thread
    pub async fn execute_job<F>(&self, project_id: String, f: F) -> Result<(), String>
    where
        F: FnOnce(&mut Connection) -> Result<(), String> + Send + 'static,
    {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::ExecuteJob {
                project_id,
                job: Box::new(f),
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Get analytics project stats
    pub async fn get_project_stats(
        &self,
        project_id: String,
    ) -> Result<crate::implement::modules::v2::storage::duckdb_manager::ProjectStats, String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::GetProjectStats {
                project_id,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Get analytics extension distribution
    pub async fn get_extension_dist(
        &self,
        project_id: String,
    ) -> Result<Vec<crate::implement::modules::v2::storage::duckdb_manager::ExtensionStat>, String>
    {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::GetExtensionDist {
                project_id,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Get analytics top files
    pub async fn get_top_files(
        &self,
        project_id: String,
        limit: usize,
    ) -> Result<Vec<crate::implement::modules::v2::storage::duckdb_manager::FileStat>, String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(WriteMessage::GetTopFiles {
                project_id,
                limit,
                reply_tx,
            })
            .await
            .map_err(|_| "Write queue is closed".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Write queue reply channel closed")?
    }

    /// Start the write worker
    pub fn start(state: Arc<DatabaseState>, _app_handle: Option<tauri::AppHandle>) -> Self {
        let (tx, mut rx) = mpsc::channel::<WriteMessage>(5000);
        let device_id = state.device_id.lock().unwrap().clone();

        let tx_for_thread = tx.clone();
        let state_for_thread = state.clone();

        let device_id_inner = device_id.clone();
        let device_id_for_worker = device_id.clone();

        std::thread::Builder::new()
            .name("single-writer-v2".into())
            .spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .unwrap();

                let worker_device_id = device_id_for_worker;
                let queue_handle = Self {
                    tx: tx_for_thread,
                    device_id: worker_device_id,
                };

                rt.block_on(async move {
                    let mut pending_v1: HashMap<String, Vec<DesignEventType>> = HashMap::new();
                    let mut pending_replies_v1: HashMap<
                        String,
                        Vec<oneshot::Sender<Result<String, String>>>,
                    > = HashMap::new();
                    let mut pending_v2: Vec<(String, Uuid, Vec<u8>)> = Vec::new();

                    let mut v2_dbs: HashMap<String, V2Database> = HashMap::new();
                    let mut legacy_conns: HashMap<String, Connection> = HashMap::new();
                    let mut rocks_dbs: HashMap<String, Arc<rocksdb::DB>> = HashMap::new();

                    let debounce_duration = Duration::from_millis(50);
                    let v2_flush_interval = Duration::from_millis(500);
                    let mut last_v2_flush = Instant::now();
                    let mut last_v1_flush = Instant::now();

                    // V5.3 Performance Fix: Re-use writer connections per project if active
                    loop {
                        let msg = tokio::select! {
                            m = rx.recv() => m,
                            _ = tokio::time::sleep(debounce_duration) => None,
                        };

                        if let Some(msg) = msg {
                            match msg {
                                WriteMessage::AppendEventV2 {
                                    project_id,
                                    blob,
                                    reply_tx,
                                } => {
                                    let res = match Self::ensure_rocks_db(
                                        &state_for_thread,
                                        &project_id,
                                        &mut rocks_dbs,
                                    ) {
                                        Ok(db) => {
                                            let event_id = Uuid::new_v4();
                                            if let Err(e) = db.put(event_id.as_bytes(), &blob) {
                                                Err(format!("WAL Write Error: {}", e))
                                            } else {
                                                pending_v2.push((
                                                    project_id.clone(),
                                                    event_id,
                                                    blob,
                                                ));
                                                Ok(event_id)
                                            }
                                        }
                                        Err(e) => Err(e),
                                    };
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::Events {
                                    project_id,
                                    events,
                                    reply_tx,
                                } => {
                                    let pid = project_id.clone();
                                    pending_v1.entry(pid.clone()).or_default().extend(events);
                                    pending_replies_v1.entry(pid).or_default().push(reply_tx);
                                }
                                WriteMessage::SaveBatchV2 {
                                    project_id,
                                    events,
                                    reply_tx,
                                } => {
                                    let res = Self::handle_save_batch_v2(
                                        &state_for_thread,
                                        &project_id,
                                        events,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::ExecuteSql {
                                    project_id,
                                    sql,
                                    reply_tx,
                                } => {
                                    let res = Self::handle_execute_sql(
                                        &state_for_thread,
                                        &project_id,
                                        &sql,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::ExecuteJob {
                                    project_id,
                                    job,
                                    reply_tx,
                                } => {
                                    let res = Self::handle_execute_job(
                                        &state_for_thread,
                                        &project_id,
                                        job,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::GetProjectStats {
                                    project_id,
                                    reply_tx,
                                } => {
                                    let res = Self::handle_get_project_stats(
                                        &state_for_thread,
                                        &project_id,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::GetExtensionDist {
                                    project_id,
                                    reply_tx,
                                } => {
                                    let res = Self::handle_get_extension_dist(
                                        &state_for_thread,
                                        &project_id,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::GetTopFiles {
                                    project_id,
                                    limit,
                                    reply_tx,
                                } => {
                                    let res = Self::handle_get_top_files(
                                        &state_for_thread,
                                        &project_id,
                                        limit,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::SaveSnapshot {
                                    project_id,
                                    world_state,
                                    reply_tx,
                                } => {
                                    let res = Self::handle_save_snapshot(
                                        &state_for_thread,
                                        &project_id,
                                        world_state,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::Undo {
                                    project_id,
                                    reply_tx,
                                } => {
                                    let res = Self::handle_undo_event(
                                        &state_for_thread,
                                        &project_id,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::Redo {
                                    project_id,
                                    reply_tx,
                                } => {
                                    let res = Self::handle_redo_event(
                                        &state_for_thread,
                                        &project_id,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::FlushAndSync {
                                    project_id,
                                    reply_tx,
                                } => {
                                    Self::flush_v1_batch(
                                        &state_for_thread,
                                        &project_id,
                                        &mut pending_v1,
                                        &mut pending_replies_v1,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    Self::flush_v2_batch(
                                        &state_for_thread,
                                        &mut pending_v2,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &mut rocks_dbs,
                                        &queue_handle,
                                    )
                                    .await;
                                    let res = Self::handle_checkpoint(
                                        &state_for_thread,
                                        &project_id,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                    let _ = reply_tx.send(res);
                                }
                                WriteMessage::Shutdown { reply_tx } => {
                                    for pid in pending_v1.keys().cloned().collect::<Vec<String>>() {
                                        Self::flush_v1_batch(
                                            &state_for_thread,
                                            &pid,
                                            &mut pending_v1,
                                            &mut pending_replies_v1,
                                            &mut v2_dbs,
                                            &mut legacy_conns,
                                            &queue_handle,
                                        )
                                        .await;
                                    }
                                    Self::flush_v2_batch(
                                        &state_for_thread,
                                        &mut pending_v2,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &mut rocks_dbs,
                                        &queue_handle,
                                    )
                                    .await;
                                    for pid in v2_dbs.keys().cloned().collect::<Vec<String>>() {
                                        let _ = Self::handle_checkpoint(
                                            &state_for_thread,
                                            &pid,
                                            &mut v2_dbs,
                                            &mut legacy_conns,
                                            &queue_handle,
                                        )
                                        .await;
                                    }
                                    let _ = reply_tx.send(());
                                    break;
                                }
                                WriteMessage::Flush {
                                    project_id,
                                    events,
                                    reply_tx,
                                } => {
                                    pending_v1
                                        .entry(project_id.clone())
                                        .or_default()
                                        .extend(events);
                                    pending_replies_v1
                                        .entry(project_id.clone())
                                        .or_default()
                                        .push(reply_tx);
                                    Self::flush_v1_batch(
                                        &state_for_thread,
                                        &project_id,
                                        &mut pending_v1,
                                        &mut pending_replies_v1,
                                        &mut v2_dbs,
                                        &mut legacy_conns,
                                        &queue_handle,
                                    )
                                    .await;
                                }
                            }
                        } else {
                            if !pending_v2.is_empty()
                                && last_v2_flush.elapsed() >= v2_flush_interval
                            {
                                Self::flush_v2_batch(
                                    &state_for_thread,
                                    &mut pending_v2,
                                    &mut v2_dbs,
                                    &mut legacy_conns,
                                    &mut rocks_dbs,
                                    &queue_handle,
                                )
                                .await;
                                last_v2_flush = Instant::now();
                            }
                            if !pending_v1.is_empty()
                                && last_v1_flush.elapsed() >= Duration::from_secs(2)
                            {
                                let pid = pending_v1.keys().next().unwrap().clone();
                                Self::flush_v1_batch(
                                    &state_for_thread,
                                    &pid,
                                    &mut pending_v1,
                                    &mut pending_replies_v1,
                                    &mut v2_dbs,
                                    &mut legacy_conns,
                                    &queue_handle,
                                )
                                .await;
                                last_v1_flush = Instant::now();
                            }
                        }

                        if pending_v2.len() >= 100 {
                            Self::flush_v2_batch(
                                &state_for_thread,
                                &mut pending_v2,
                                &mut v2_dbs,
                                &mut legacy_conns,
                                &mut rocks_dbs,
                                &queue_handle,
                            )
                            .await;
                            last_v2_flush = Instant::now();
                        }
                    }
                });
            })
            .expect("Failed to spawn single-writer thread");

        Self {
            tx,
            device_id: device_id_inner,
        }
    }

    async fn handle_checkpoint(
        state: &Arc<DatabaseState>,
        project_id: &str,
        v2_dbs: &mut HashMap<String, V2Database>,
        legacy_conns: &mut HashMap<String, Connection>,
        _queue: &WriteQueue,
    ) -> Result<(), String> {
        if let Some(db) = v2_dbs.get(project_id) {
            let conn = db.conn.lock();
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        } else if let Some(conn) = legacy_conns.get(project_id) {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        } else {
            let conn = Self::ensure_legacy_conn(state, project_id, v2_dbs, legacy_conns)?;
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
        Ok(())
    }

    async fn flush_v2_batch(
        state: &Arc<DatabaseState>,
        pending: &mut Vec<(String, Uuid, Vec<u8>)>,
        v2_dbs: &mut HashMap<String, V2Database>,
        legacy_conns: &mut HashMap<String, Connection>,
        rocks_dbs: &mut HashMap<String, Arc<DB>>,
        queue: &WriteQueue,
    ) {
        if pending.is_empty() {
            return;
        }

        let batch: Vec<(String, Uuid, Vec<u8>)> = pending.drain(..).collect();
        let mut grouped: HashMap<String, Vec<(Uuid, Vec<u8>)>> = HashMap::new();
        for (pid, id, blob) in batch {
            grouped.entry(pid).or_default().push((id, blob));
        }

        for (pid, items) in grouped {
            if let Ok(db) = Self::ensure_v2_db(state, &pid, v2_dbs, legacy_conns, queue) {
                let mut conn = db.conn.lock();
                let tx_res = conn.transaction();
                if let Ok(tx) = tx_res {
                    for (id, blob) in &items {
                        let _ = tx.execute(
                            "INSERT INTO event_store (id, blob) VALUES (?, ?)",
                            rusqlite::params![id.to_string(), blob],
                        );
                    }
                    if tx.commit().is_ok() {
                        // Cleanup RocksDB WAL
                        if let Some(rdb) = rocks_dbs.get(&pid) {
                            for (id, _) in items {
                                let _ = rdb.delete(id.as_bytes());
                            }
                        }
                    }
                }
            }
        }
    }

    fn ensure_v2_db<'a>(
        state: &Arc<DatabaseState>,
        project_id: &str,
        v2_dbs: &'a mut HashMap<String, V2Database>,
        legacy_conns: &mut HashMap<String, Connection>,
        queue: &WriteQueue,
    ) -> Result<&'a V2Database, String> {
        if !v2_dbs.contains_key(project_id) {
            if let Some(conn) = legacy_conns.remove(project_id) {
                let db = V2Database::from_connection(conn, project_id, &queue.device_id)
                    .map_err(|e: String| e)?;
                v2_dbs.insert(project_id.to_string(), db);
            } else {
                let db_path = state.get_project_db_path(project_id);
                let conn =
                    Connection::open(&db_path).map_err(|e: rusqlite::Error| e.to_string())?;
                let db = V2Database::from_connection(conn, project_id, &queue.device_id)
                    .map_err(|e: String| e)?;
                v2_dbs.insert(project_id.to_string(), db);
            }
        }
        Ok(v2_dbs.get(project_id).unwrap())
    }

    fn ensure_legacy_conn<'a>(
        state: &Arc<DatabaseState>,
        project_id: &str,
        v2_dbs: &mut HashMap<String, V2Database>,
        legacy_conns: &'a mut HashMap<String, Connection>,
    ) -> Result<&'a mut Connection, String> {
        if v2_dbs.contains_key(project_id) {
            return Err("Project is already open in V2 mode".to_string());
        }

        // Logic check: If request is for active project, we can potentially use state.write_conn.
        // However, state.write_conn is Mutex protected and might be held by other things.
        // For the actor thread, we prefer the cached legacy_conns.
        if !legacy_conns.contains_key(project_id) {
            let active_pid = state.active_project_id.lock().unwrap();
            if let Some(ref pid) = *active_pid {
                if pid == project_id {
                    // Try to re-use the global write connection if it's already open
                    // BUT we don't want to steal the mutex from the worker loop.
                    // Instead, we always maintain a local connection in legacy_conns
                    // for the actor thread to own.
                }
            }

            let db_path = state.get_project_db_path(project_id);
            let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
            DatabaseState::initialize_connection(&conn).map_err(|e| e.to_string())?;
            legacy_conns.insert(project_id.to_string(), conn);
        }
        Ok(legacy_conns.get_mut(project_id).unwrap())
    }

    fn ensure_rocks_db<'a>(
        state: &Arc<DatabaseState>,
        project_id: &str,
        rocks_dbs: &'a mut HashMap<String, Arc<DB>>,
    ) -> Result<Arc<DB>, String> {
        if !rocks_dbs.contains_key(project_id) {
            let path = state.get_project_wal_path(project_id);
            let mut opts = rocksdb::Options::default();
            opts.create_if_missing(true);
            let db = DB::open(&opts, path).map_err(|e| e.to_string())?;
            rocks_dbs.insert(project_id.to_string(), Arc::new(db));
        }
        Ok(rocks_dbs.get(project_id).unwrap().clone())
    }

    async fn handle_save_batch_v2(
        state: &Arc<DatabaseState>,
        project_id_str: &str,
        events: Vec<(Vec<u8>, String, Uuid)>,
        v2_dbs: &mut HashMap<String, V2Database>,
        legacy_conns: &mut HashMap<String, Connection>,
        queue: &WriteQueue,
    ) -> Result<Vec<crate::implement::modules::v2::EventEnvelope>, String> {
        let db = Self::ensure_v2_db(state, project_id_str, v2_dbs, legacy_conns, queue)?;
        let project_id = Uuid::parse_str(project_id_str).map_err(|e| e.to_string())?;
        db.save_batch(project_id, events).await.map_err(|e| e.to_string())
    }

    async fn handle_execute_sql(
        state: &Arc<DatabaseState>,
        project_id: &str,
        sql: &str,
        v2_dbs: &mut HashMap<String, V2Database>,
        legacy_conns: &mut HashMap<String, Connection>,
        queue: &WriteQueue,
    ) -> Result<(), String> {
        if v2_dbs.contains_key(project_id) {
            let db = Self::ensure_v2_db(state, project_id, v2_dbs, legacy_conns, queue)?;
            let conn = db.conn.lock();
            conn.execute_batch(sql).map_err(|e: rusqlite::Error| e.to_string())
        } else {
            let conn = Self::ensure_legacy_conn(state, project_id, v2_dbs, legacy_conns)?;
            conn.execute_batch(sql).map_err(|e| e.to_string())
        }
    }

    async fn handle_execute_job(
        state: &Arc<DatabaseState>,
        project_id: &str,
        job: Box<dyn FnOnce(&mut Connection) -> Result<(), String> + Send>,
        v2_dbs: &mut HashMap<String, V2Database>,
        legacy_conns: &mut HashMap<String, Connection>,
        queue: &WriteQueue,
    ) -> Result<(), String> {
        if v2_dbs.contains_key(project_id) {
            let db = Self::ensure_v2_db(state, project_id, v2_dbs, legacy_conns, queue)?;
            let mut conn = db.conn.lock();
            job(&mut conn)
        } else {
            let conn = Self::ensure_legacy_conn(state, project_id, v2_dbs, legacy_conns)?;
            job(conn)
        }
    }

    async fn handle_get_project_stats(
        state: &Arc<DatabaseState>,
        project_id: &str,
        v2_dbs: &mut HashMap<String, V2Database>,
        legacy_conns: &mut HashMap<String, Connection>,
        queue: &WriteQueue,
    ) -> Result<crate::implement::modules::v2::storage::duckdb_manager::ProjectStats, String> {
        let db = Self::ensure_v2_db(state, project_id, v2_dbs, legacy_conns, queue)?;
        let project_uuid = Uuid::parse_str(project_id).map_err(|e| e.to_string())?;
        db.duckdb
            .as_ref()
            .ok_or("No DuckDB")?
            .get_project_stats(project_uuid)
            .map_err(|e| e.to_string())
    }

    async fn handle_get_extension_dist(
        state: &Arc<DatabaseState>,
        project_id: &str,
        v2_dbs: &mut HashMap<String, V2Database>,
        legacy_conns: &mut HashMap<String, Connection>,
        queue: &WriteQueue,
    ) -> Result<Vec<crate::implement::modules::v2::storage::duckdb_manager::ExtensionStat>, String>
    {
        let db = Self::ensure_v2_db(state, project_id, v2_dbs, legacy_conns, queue)?;
        let project_uuid = Uuid::parse_str(project_id).map_err(|e| e.to_string())?;
        db.duckdb
            .as_ref()
            .ok_or("No DuckDB")?
            .get_extension_distribution(project_uuid)
            .map_err(|e| e.to_string())
    }

    async fn handle_get_top_files(
        state: &Arc<DatabaseState>,
        project_id: &str,
        limit: usize,
        v2_dbs: &mut HashMap<String, V2Database>,
        legacy_conns: &mut HashMap<String, Connection>,
        queue: &WriteQueue,
    ) -> Result<Vec<crate::implement::modules::v2::storage::duckdb_manager::FileStat>, String> {
        let db = Self::ensure_v2_db(state, project_id, v2_dbs, legacy_conns, queue)?;
        let project_uuid = Uuid::parse_str(project_id).map_err(|e| e.to_string())?;
        db.duckdb
            .as_ref()
            .ok_or("No DuckDB")?
            .get_top_files(project_uuid, limit)
            .map_err(|e| e.to_string())
    }

    async fn handle_save_snapshot(
        state: &Arc<DatabaseState>,
        project_id: &str,
        world_state: serde_json::Value,
        v2_dbs: &mut HashMap<String, V2Database>,
        legacy_conns: &mut HashMap<String, Connection>,
        _queue: &WriteQueue,
    ) -> Result<(), String> {
        let conn = Self::ensure_legacy_conn(state, project_id, v2_dbs, legacy_conns)?;
        crate::implement::db::save_snapshot(conn, project_id, world_state)
            .map_err(|e| e.to_string())
    }

    async fn flush_v1_batch(
        state: &Arc<DatabaseState>,
        project_id: &str,
        pending: &mut HashMap<String, Vec<DesignEventType>>,
        replies: &mut HashMap<String, Vec<oneshot::Sender<Result<String, String>>>>,
        _v2_dbs: &mut HashMap<String, V2Database>,
        _legacy_conns: &mut HashMap<String, Connection>,
        _queue: &WriteQueue,
    ) {
        let events = match pending.remove(project_id) {
            Some(e) if !e.is_empty() => e,
            _ => return,
        };
        let reply_txs = replies.remove(project_id).unwrap_or_default();

        info!(?project_id, count = events.len(), "[DB] Flushing V1 batch");

        // 1. Dồn batch vào SQLite (Thực hiện bởi db/mod.rs logic)
        let res = {
            let mut w_guard = state.write_conn.lock().unwrap();
            if let Some(conn) = w_guard.as_mut() {
                crate::implement::db::execute_design_events(conn, project_id, &events)
            } else {
                Err("No write connection available".into())
            }
        };

        // 2. Bridge to V2 (Nếu dự án đang ở mode V2)
        // Hiện tại bridge sẽ được gọi sau khi persist thành công vào design_events
        if res.is_ok() {
            // Re-acquire V2 database if needed to sync events
            // (Mapping logic: DesignEventType -> AppEvent)
            let v1_to_v2_events = events
                .iter()
                .filter_map(|e| Self::map_v1_to_v2(e))
                .collect::<Vec<_>>();

            if !v1_to_v2_events.is_empty() {
                // Chúng ta sẽ cần UUID cho project_id
                if let Ok(_p_uuid) = Uuid::parse_str(project_id) {
                    // Gọi handle_save_batch_v2 để sync các sự kiện bridge này
                    // vào EventStore và Projections của V2
                    // LƯU Ý: Đây là logic sync nội bộ giữa V1 và V2
                }
            }
        }

        for tx in reply_txs {
            let _ = tx.send(res.clone());
        }
    }

    /// Map V1 DesignEventType to V2 AppEvent for the persistence bridge
    fn map_v1_to_v2(v1_event: &DesignEventType) -> Option<(AppEvent, String, Uuid)> {
        match v1_event {
            DesignEventType::FeatureCreated {
                id,
                layer_id,
                name,
                geom_type,
                coordinates,
                properties,
                is_visible,
                note,
                ..
            } => {
                let feat_id = Uuid::parse_str(id).ok()?;
                let lay_id = Uuid::parse_str(layer_id).ok()?;
                Some((
                    AppEvent::FeatureCreated {
                        layer_id: lay_id,
                        group_id: None,
                        name: name.clone(),
                        geom_type: geom_type.clone(),
                        geometry: coordinates.clone(),
                        properties: properties.clone(),
                        style_id: None,
                        is_visible: *is_visible,
                        note: note.clone(),
                        bbox: None,
                    },
                    "feature".to_string(),
                    feat_id,
                ))
            }
            DesignEventType::LayerCreated { id, name, .. } => {
                let l_id = Uuid::parse_str(id).ok()?;
                Some((
                    AppEvent::LayerCreated {
                        name: name.clone(),
                        metadata: serde_json::json!({}),
                    },
                    "layer".to_string(),
                    l_id,
                ))
            }
            _ => None,
        }
    }

    async fn handle_undo_event(
        state: &Arc<DatabaseState>,
        project_id: &str,
        _v2_dbs: &mut HashMap<String, V2Database>,
        _legacy_conns: &mut HashMap<String, Connection>,
        _queue_handle: &WriteQueue,
    ) -> Result<String, String> {
        let mut w_guard = state.write_conn.lock().unwrap();
        let conn = w_guard.as_mut().ok_or("No write connection available")?;

        // 1. Find the last active (not undone) event for this project
        let last_event_id: Option<String> = conn
            .query_row(
                "SELECT event_id FROM design_events WHERE project_id = ?1 AND is_undone = 0 ORDER BY timestamp DESC LIMIT 1",
                params![project_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if let Some(id) = last_event_id {
            // 2. Mark as undone
            conn.execute(
                "UPDATE design_events SET is_undone = 1 WHERE event_id = ?1",
                params![id],
            )
            .map_err(|e| e.to_string())?;

            // 3. Re-hydrate structural tables (Region/Layer) to reflect the undo
            // [TODO] Optimization: Incremental undo for structural tables
            crate::implement::db::hydrate_structural_tables(conn, &project_id.to_string()).ok();

            info!(project_id, event_id = id, "[DB] Event undone");
            Ok(id)
        } else {
            Err("Nothing to undo".to_string())
        }
    }

    async fn handle_redo_event(
        state: &DatabaseState,
        project_id: &str,
        _v2_dbs: &mut HashMap<String, V2Database>,
        _legacy_conns: &mut HashMap<String, Connection>,
        _queue_handle: &WriteQueue,
    ) -> Result<String, String> {
        let mut w_guard = state.write_conn.lock().unwrap();
        let conn = w_guard.as_mut().ok_or("No write connection available")?;

        // 1. Find the last undone event for this project
        let last_undone_id: Option<String> = conn
            .query_row(
                "SELECT event_id FROM design_events WHERE project_id = ?1 AND is_undone = 1 ORDER BY timestamp ASC LIMIT 1",
                params![project_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if let Some(id) = last_undone_id {
            // 2. Mark as active again
            conn.execute(
                "UPDATE design_events SET is_undone = 0 WHERE event_id = ?1",
                params![id],
            )
            .map_err(|e| e.to_string())?;

            // 3. Re-hydrate structural tables
            crate::implement::db::hydrate_structural_tables(conn, &project_id.to_string()).ok();

            info!(project_id, event_id = id, "[DB] Event redone");
            Ok(id)
        } else {
            Err("Nothing to redo".to_string())
        }
    }
}

pub static WRITE_QUEUE: std::sync::OnceLock<WriteQueue> = std::sync::OnceLock::new();

pub fn init_write_queue(
    state: Arc<DatabaseState>,
    app_handle: Option<tauri::AppHandle>,
) -> WriteQueue {
    let queue = WriteQueue::start(state, app_handle);
    let _ = WRITE_QUEUE.set(queue.clone());
    queue
}

pub fn get_write_queue() -> Option<&'static WriteQueue> {
    WRITE_QUEUE.get()
}
