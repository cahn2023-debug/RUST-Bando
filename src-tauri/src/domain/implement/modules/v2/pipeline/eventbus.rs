use std::path::PathBuf;
use tokio::sync::oneshot;

#[derive(Debug)]
pub enum StorageCommand {
    OpenDatabase {
        path: PathBuf,
        reply: oneshot::Sender<Result<(), String>>,
    },
    OpenProjectBootstrap {
        path: PathBuf,
        title: String,
        base_hint: String,
        open_request_id: Option<i64>,
        viewport_first_limit: i64,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    CreateProject {
        id: String,
        title: String,
        base_hint: String,
    },
    AddFile {
        id: String,
        project_id: String,
        abs_path: PathBuf,
        meta: serde_json::Value,
    },
    PatchMetadata {
        file_id: String,
        patch: serde_json::Value,
    },
    PatchProjectMetadata {
        project_id: String,
        patch: serde_json::Value,
    },
    UpdateProjectState {
        project_id: String,
        state: serde_json::Value,
        reply: oneshot::Sender<Result<(), String>>,
    },
    DeleteFile {
        file_id: String,
    },
    ImportMediaAsset {
        project_id: String,
        feature_id: String,
        data_url: Option<String>,
        file_path: Option<String>,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    ReplaceMediaAsset {
        project_id: String,
        feature_id: String,
        asset_id: String,
        data_url: Option<String>,
        file_path: Option<String>,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    AnalyzePmpImport {
        source_path: PathBuf,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    ImportPmpIntoProject {
        source_path: PathBuf,
        target_project_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    DeleteMediaAsset {
        project_id: String,
        asset_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    ResolveMediaAsset {
        project_id: String,
        asset_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    OptimizeProjectStorage {
        project_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    DispatchEvents {
        events: Vec<crate::domain::models::v2::EventEnvelope>,
        reply: oneshot::Sender<Result<usize, String>>,
    },
    ApplyRemoteEvents {
        events: Vec<crate::domain::models::v2::EventEnvelope>,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    SaveProject {
        reply: oneshot::Sender<Result<(), String>>,
    },
    BackupProject {
        project_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    ListBackups {
        project_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    RestoreProject {
        project_id: String,
        backup_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    VerifyIntegrity {
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    GetProjectHealth {
        project_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    AnalyzeProjectMediaRecovery {
        project_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    ApplyProjectMediaRecovery {
        project_id: String,
        items: serde_json::Value,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    GetPendingSyncOutbox {
        project_id: String,
        reply: oneshot::Sender<Result<Vec<serde_json::Value>, String>>,
    },
    MarkOutboxSynced {
        event_ids: Vec<String>,
        server_seq_start: Option<i64>,
        ledger_hash: Option<String>,
        server_time: Option<String>,
        reply: oneshot::Sender<Result<usize, String>>,
    },
    UndoDesignEvent {
        project_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    RedoDesignEvent {
        project_id: String,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    GetMapTile {
        project_id: String,
        revision: i64,
        z: i64,
        x: i64,
        y: i64,
        reply: oneshot::Sender<Result<Vec<u8>, String>>,
    },
    BuildMapTiles {
        project_id: String,
        revision: i64,
        min_zoom: i64,
        max_zoom: i64,
        bounds: Option<[f64; 4]>,
        tile_limit: Option<i64>,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    InvalidateMapTiles {
        project_id: String,
        revision: Option<i64>,
        bbox: Option<[f64; 4]>,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
    // Queries
    Query {
        sql: String,
        params: Vec<String>,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
}
