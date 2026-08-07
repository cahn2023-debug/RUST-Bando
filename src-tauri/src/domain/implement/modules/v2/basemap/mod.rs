use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BasemapStatusPayload {
    pub is_ready: bool,
    pub active_preset: String,
    pub cached_tiles_count: usize,
}

pub enum BasemapWorkerCommand {
    ReportStatus,
    PrefetchRegion { west: f64, south: f64, east: f64, north: f64, zoom: u8 },
}

pub struct BasemapWorker;

impl BasemapWorker {
    pub fn spawn(
        mut rx: mpsc::Receiver<BasemapWorkerCommand>,
        app_handle: Option<tauri::AppHandle>,
    ) -> tauri::async_runtime::JoinHandle<()> {
        tauri::async_runtime::spawn(async move {
            log::info!("[BasemapWorker] Started independent Basemap Tokio Task");
            
            // Emit initial ready status if app_handle is available
            if let Some(ref handle) = app_handle {
                use tauri::Emitter;
                let payload = BasemapStatusPayload {
                    is_ready: true,
                    active_preset: "street".to_string(),
                    cached_tiles_count: 0,
                };
                let _ = handle.emit("basemap:status-stream", payload);
            }

            while let Some(cmd) = rx.recv().await {
                match cmd {
                    BasemapWorkerCommand::ReportStatus => {
                        if let Some(ref handle) = app_handle {
                            use tauri::Emitter;
                            let payload = BasemapStatusPayload {
                                is_ready: true,
                                active_preset: "street".to_string(),
                                cached_tiles_count: 0,
                            };
                            let _ = handle.emit("basemap:status-stream", payload);
                        }
                    }
                    BasemapWorkerCommand::PrefetchRegion { .. } => {
                        log::info!("[BasemapWorker] Prefetching tile region request received");
                    }
                }
            }
            log::info!("[BasemapWorker] Stopped");
        })
    }
}
