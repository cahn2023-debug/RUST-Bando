use crate::implement::modules::v2::events::AppEvent;
use crate::implement::modules::v2::storage::manifest::{Manifest, ManifestIO};
use crate::implement::modules::v2::{EventStore, MetadataRegistry, ProjectionEngine};
use rusqlite::Connection;
use parking_lot::Mutex;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::info;
use uuid::Uuid;

/// Command sent from Tauri IPC to the background worker
pub enum WorkerCommand {
    SaveBatch {
        project_id: Uuid,
        events: Vec<(AppEvent, String, Uuid)>, // (event, entity_type, entity_id)
        reply_tx: tokio::sync::oneshot::Sender<Result<Vec<Uuid>, String>>,
    },
    Shutdown,
}

/// Actor-based Background Worker for Disk Persistence
pub struct DiskPersistenceWorker {
    receiver: mpsc::Receiver<WorkerCommand>,
}

impl DiskPersistenceWorker {
    pub fn start_with_receiver(
        receiver: mpsc::Receiver<WorkerCommand>,
        _conn: Arc<Mutex<Connection>>,
        event_store: EventStore,
        projection_engine: ProjectionEngine,
        _metadata_registry: MetadataRegistry,
        _manifest_io: Option<ManifestIO>,
        _manifest: Option<Manifest>,
        _repo_v53: Option<module_storage::repository::EventRepository>,
    ) -> tauri::async_runtime::JoinHandle<()> {
        let worker = Self { receiver };

        tauri::async_runtime::spawn(async move {
            worker.run(event_store, projection_engine).await;
        })
    }

    async fn run(mut self, event_store: EventStore, projection_engine: ProjectionEngine) {
        info!("[V2 Worker] ONLINE - Processing batches via Direct Sync.");

        while let Some(command) = self.receiver.recv().await {
            match command {
                WorkerCommand::SaveBatch {
                    project_id,
                    events,
                    reply_tx,
                } => {
                    let mut saved_ids = Vec::new();
                    let mut errors = Vec::new();

                    for (event, entity_type, entity_id) in events {
                        match event_store.append(project_id, event, &entity_type, entity_id) {
                            Ok(envelope) => {
                                if let Err(e) = projection_engine.process_event(&envelope) {
                                    errors.push(format!("Projection failed for {}: {}", envelope.entity_id, e));
                                }
                                saved_ids.push(envelope.entity_id);
                            }
                            Err(e) => {
                                errors.push(format!("Append failed: {}", e));
                            }
                        }
                    }

                    if errors.is_empty() {
                        let _ = reply_tx.send(Ok(saved_ids));
                    } else {
                        let _ = reply_tx.send(Err(errors.join("; ")));
                    }
                }
                WorkerCommand::Shutdown => {
                    info!("[V2 Worker] Shutting down.");
                    break;
                }
            }
        }
        info!("[V2 Worker] Offline.");
    }
}
