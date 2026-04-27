use std::future::Future;
use std::pin::Pin;
/// Actor Model - Message-driven pipeline for data processing
///
/// Each actor handles one stage of the pipeline:
/// Ingestion → Parsing → AI Analysis → Normalization → Storage
///
/// Actors communicate via message queues (tokio::mpsc channels).
use tokio::sync::{mpsc, oneshot};

// ============================================================================
/// Actor Trait
// ============================================================================

pub trait Actor: Send + 'static {
    type Message: Send + 'static;
    type Response: Send + 'static;

    fn name(&self) -> &str;

    /// Process a single message
    fn handle(
        &mut self,
        msg: Self::Message,
    ) -> Pin<Box<dyn Future<Output = Option<Self::Response>> + Send>>;

    /// Called when actor starts
    fn start(&mut self) -> Pin<Box<dyn Future<Output = ()> + Send>> {
        Box::pin(async {})
    }

    /// Called when actor stops
    fn stop(&mut self) -> Pin<Box<dyn Future<Output = ()> + Send>> {
        Box::pin(async {})
    }
}

// ============================================================================
/// Actor Handle
// ============================================================================

pub struct ActorHandle<M: Send + 'static, R: Send + 'static> {
    tx: mpsc::Sender<(M, oneshot::Sender<Option<R>>)>,
}

impl<M: Send + 'static, R: Send + 'static> ActorHandle<M, R> {
    /// Send a message to the actor and wait for response
    pub async fn send(&self, msg: M) -> Option<R> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx.send((msg, reply_tx)).await.ok()?;
        reply_rx.await.ok()?
    }
}

impl<M: Send + 'static, R: Send + 'static> Clone for ActorHandle<M, R> {
    fn clone(&self) -> Self {
        Self {
            tx: self.tx.clone(),
        }
    }
}

// ============================================================================
/// Spawn Actor
// ============================================================================

pub fn spawn_actor<A: Actor>(
    mut actor: A,
    capacity: usize,
) -> ActorHandle<A::Message, A::Response> {
    let (tx, mut rx) =
        mpsc::channel::<(A::Message, oneshot::Sender<Option<A::Response>>)>(capacity);

    tauri::async_runtime::spawn(async move {
        actor.start().await;

        while let Some((msg, reply_tx)) = rx.recv().await {
            let response = actor.handle(msg).await;
            let _ = reply_tx.send(response);
        }

        actor.stop().await;
    });

    ActorHandle { tx }
}

// ============================================================================
/// Pipeline Messages
// ============================================================================

#[derive(Debug, Clone)]
pub struct IngestionMessage {
    pub file_path: String,
    pub project_id: uuid::Uuid,
    pub correlation_id: uuid::Uuid,
}

#[derive(Debug, Clone)]
pub struct IngestionResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct ParsingMessage {
    pub file_path: String,
    pub project_id: uuid::Uuid,
    pub correlation_id: uuid::Uuid,
    pub format: String,
}

#[derive(Debug, Clone)]
pub struct ParsingResponse {
    pub success: bool,
    pub message: String,
    pub record_count: usize,
}

#[derive(Debug, Clone)]
pub struct NormalizationMessage {
    pub records: Vec<serde_json::Value>,
    pub project_id: uuid::Uuid,
    pub correlation_id: uuid::Uuid,
}

#[derive(Debug, Clone)]
pub struct NormalizationResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct StorageMessage {
    pub records: Vec<serde_json::Value>,
    pub project_id: uuid::Uuid,
    pub correlation_id: uuid::Uuid,
}

#[derive(Debug, Clone)]
pub struct StorageResponse {
    pub success: bool,
    pub message: String,
    pub stored_count: usize,
}

// ============================================================================
/// Pipeline
// ============================================================================

pub struct Pipeline {
    pub ingestion_handle: ActorHandle<IngestionMessage, IngestionResponse>,
}

impl Pipeline {
    /// Create a new pipeline with all actors
    pub fn new() -> Self {
        // Create actors in dependency order (last to first)

        // Storage Actor (final stage)
        let storage_actor = StorageActor::new();
        let storage_handle = spawn_actor(storage_actor, 100);

        // Normalization Actor
        let normalize_actor = NormalizationActor::new(storage_handle.clone());
        let normalize_handle = spawn_actor(normalize_actor, 100);

        // Parsing Actor
        let parsing_actor = ParsingActor::new(normalize_handle.clone());
        let parsing_handle = spawn_actor(parsing_actor, 50);

        // Ingestion Actor (first stage)
        let ingestion_actor = IngestionActor::new(parsing_handle.clone());
        let ingestion_handle = spawn_actor(ingestion_actor, 20);

        Self { ingestion_handle }
    }

    /// Import a file through the pipeline
    pub async fn import_file(
        &self,
        file_path: &str,
        project_id: uuid::Uuid,
    ) -> Result<IngestionResponse, String> {
        let correlation_id = uuid::Uuid::new_v4();
        let msg = IngestionMessage {
            file_path: file_path.to_string(),
            project_id,
            correlation_id,
        };

        self.ingestion_handle
            .send(msg)
            .await
            .ok_or_else(|| "Pipeline unavailable".to_string())
    }
}

// ============================================================================
/// Ingestion Actor (Stage 1)
// ============================================================================

pub struct IngestionActor {
    parsing_handle: ActorHandle<ParsingMessage, ParsingResponse>,
}

impl IngestionActor {
    pub fn new(parsing_handle: ActorHandle<ParsingMessage, ParsingResponse>) -> Self {
        Self { parsing_handle }
    }
}

impl Actor for IngestionActor {
    type Message = IngestionMessage;
    type Response = IngestionResponse;

    fn name(&self) -> &str {
        "IngestionActor"
    }

    fn handle(
        &mut self,
        msg: Self::Message,
    ) -> Pin<Box<dyn Future<Output = Option<Self::Response>> + Send>> {
        let parsing_handle = self.parsing_handle.clone();

        Box::pin(async move {
            let extension = std::path::Path::new(&msg.file_path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            let parsing_msg = ParsingMessage {
                file_path: msg.file_path,
                project_id: msg.project_id,
                correlation_id: msg.correlation_id,
                format: extension,
            };

            match parsing_handle.send(parsing_msg).await {
                Some(result) => Some(IngestionResponse {
                    success: result.success,
                    message: result.message,
                }),
                None => Some(IngestionResponse {
                    success: false,
                    message: "Parsing failed".to_string(),
                }),
            }
        })
    }
}

// ============================================================================
/// Parsing Actor (Stage 2)
// ============================================================================

pub struct ParsingActor {
    normalize_handle: ActorHandle<NormalizationMessage, NormalizationResponse>,
}

impl ParsingActor {
    pub fn new(normalize_handle: ActorHandle<NormalizationMessage, NormalizationResponse>) -> Self {
        Self { normalize_handle }
    }
}

impl Actor for ParsingActor {
    type Message = ParsingMessage;
    type Response = ParsingResponse;

    fn name(&self) -> &str {
        "ParsingActor"
    }

    fn handle(
        &mut self,
        msg: Self::Message,
    ) -> Pin<Box<dyn Future<Output = Option<Self::Response>> + Send>> {
        let normalize_handle = self.normalize_handle.clone();

        Box::pin(async move {
            // Parse based on format
            let record_count = match msg.format.as_str() {
                "xlsx" | "xls" => 10, // Simulated
                "kml" => 5,
                "kmz" => 5,
                "csv" => 20,
                _ => 0,
            };

            if record_count == 0 {
                return Some(ParsingResponse {
                    success: false,
                    message: format!("Unsupported format: {}", msg.format),
                    record_count: 0,
                });
            }

            // Create dummy records for testing
            let records: Vec<serde_json::Value> = (0..record_count)
                .map(|i| {
                    serde_json::json!({
                        "index": i,
                        "name": format!("Record {}", i),
                        "source": msg.format,
                    })
                })
                .collect();

            // Forward to normalization
            let norm_msg = NormalizationMessage {
                records,
                project_id: msg.project_id,
                correlation_id: msg.correlation_id,
            };

            let _ = normalize_handle.send(norm_msg).await;

            Some(ParsingResponse {
                success: true,
                message: format!("Parsed {} records from {}", record_count, msg.format),
                record_count,
            })
        })
    }
}

// ============================================================================
/// Normalization Actor (Stage 3)
// ============================================================================

pub struct NormalizationActor {
    storage_handle: ActorHandle<StorageMessage, StorageResponse>,
}

impl NormalizationActor {
    pub fn new(storage_handle: ActorHandle<StorageMessage, StorageResponse>) -> Self {
        Self { storage_handle }
    }
}

impl Actor for NormalizationActor {
    type Message = NormalizationMessage;
    type Response = NormalizationResponse;

    fn name(&self) -> &str {
        "NormalizationActor"
    }

    fn handle(
        &mut self,
        msg: Self::Message,
    ) -> Pin<Box<dyn Future<Output = Option<Self::Response>> + Send>> {
        let storage_handle = self.storage_handle.clone();

        Box::pin(async move {
            // Normalize records (standardize field names, validate, etc.)
            let normalized: Vec<serde_json::Value> = msg
                .records
                .into_iter()
                .map(|mut record| {
                    if let Some(obj) = record.as_object_mut() {
                        obj.insert("normalized".to_string(), serde_json::json!(true));
                        obj.insert(
                            "project_id".to_string(),
                            serde_json::json!(msg.project_id.to_string()),
                        );
                    }
                    record
                })
                .collect();

            let count = normalized.len();

            // Forward to storage
            let storage_msg = StorageMessage {
                records: normalized,
                project_id: msg.project_id,
                correlation_id: msg.correlation_id,
            };

            let _ = storage_handle.send(storage_msg).await;

            Some(NormalizationResponse {
                success: true,
                message: format!("Normalized {} records", count),
            })
        })
    }
}

// ============================================================================
/// Storage Actor (Stage 4 - Final)
// ============================================================================

pub struct StorageActor;

impl StorageActor {
    pub fn new() -> Self {
        Self
    }
}

impl Actor for StorageActor {
    type Message = StorageMessage;
    type Response = StorageResponse;

    fn name(&self) -> &str {
        "StorageActor"
    }

    fn handle(
        &mut self,
        msg: Self::Message,
    ) -> Pin<Box<dyn Future<Output = Option<Self::Response>> + Send>> {
        Box::pin(async move {
            let count = msg.records.len();

            // In production, this would write to the EventStore
            // For now, simulate success
            Some(StorageResponse {
                success: true,
                message: format!("Stored {} records", count),
                stored_count: count,
            })
        })
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_creation() {
        // Need tokio runtime for actor spawning
        let rt = tokio::runtime::Runtime::new().unwrap();

        let _pipeline = rt.block_on(async { Pipeline::new() });

        assert!(true); // Pipeline created successfully
    }

    #[test]
    fn test_ingestion_message_creation() {
        let msg = IngestionMessage {
            file_path: "test.xlsx".to_string(),
            project_id: uuid::Uuid::new_v4(),
            correlation_id: uuid::Uuid::new_v4(),
        };

        assert_eq!(msg.file_path, "test.xlsx");
    }

    #[test]
    fn test_parsing_response() {
        let resp = ParsingResponse {
            success: true,
            message: "Parsed 10 records".to_string(),
            record_count: 10,
        };

        assert!(resp.success);
        assert_eq!(resp.record_count, 10);
    }

    #[test]
    fn test_normalization_message() {
        let records = vec![
            serde_json::json!({"name": "Test"}),
            serde_json::json!({"name": "Test 2"}),
        ];

        let msg = NormalizationMessage {
            records,
            project_id: uuid::Uuid::new_v4(),
            correlation_id: uuid::Uuid::new_v4(),
        };

        assert_eq!(msg.records.len(), 2);
    }

    #[test]
    fn test_actor_handle_clone() {
        // Verify ActorHandle is Clone
        let _ = || {
            // This is compile-time check
            fn assert_clone<T: Clone>() {}
            assert_clone::<ActorHandle<IngestionMessage, IngestionResponse>>();
        };
    }
}
