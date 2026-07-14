use std::path::PathBuf;
use tokio::sync::oneshot;

#[derive(Debug)]
pub enum StorageCommand {
    OpenDatabase {
        path: PathBuf,
        reply: oneshot::Sender<Result<(), String>>,
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
    DeleteMediaAsset {
        project_id: String,
        asset_id: String,
        reply: oneshot::Sender<Result<(), String>>,
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
    // Queries
    Query {
        sql: String,
        params: Vec<String>,
        reply: oneshot::Sender<Result<serde_json::Value, String>>,
    },
}
