use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureChunkPayload {
    pub chunk_index: usize,
    pub total_chunks: usize,
    pub bbox: Option<[f64; 4]>,
    pub features_json: String,
}

pub enum GisStreamCommand {
    StreamVisibleFeatures {
        bbox: [f64; 4],
        zoom: f64,
        project_id: Option<String>,
    },
}

pub struct GisStreamWorker;

impl GisStreamWorker {
    pub fn spawn(
        mut rx: mpsc::Receiver<GisStreamCommand>,
        app_handle: Option<tauri::AppHandle>,
    ) -> tauri::async_runtime::JoinHandle<()> {
        tauri::async_runtime::spawn(async move {
            log::info!("[GisStreamWorker] Started independent GIS Stream Tokio Task");

            while let Some(cmd) = rx.recv().await {
                match cmd {
                    GisStreamCommand::StreamVisibleFeatures { bbox, zoom, project_id: _ } => {
                        log::info!("[GisStreamWorker] Processing GIS stream for bbox {:?} at zoom {}", bbox, zoom);
                        if let Some(ref handle) = app_handle {
                            use tauri::Emitter;
                            let payload = FeatureChunkPayload {
                                chunk_index: 0,
                                total_chunks: 1,
                                bbox: Some(bbox),
                                features_json: r#"{"type":"FeatureCollection","features":[]}"#.to_string(),
                            };
                            let _ = handle.emit("gis:features-chunk", payload);
                        }
                    }
                }
            }
            log::info!("[GisStreamWorker] Stopped");
        })
    }
}
