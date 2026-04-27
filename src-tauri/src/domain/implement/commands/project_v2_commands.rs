/// V2 Tauri Commands
///
/// Exposes V2 architecture to the frontend:
/// - Event-based CRUD for all entities
/// - Unified search
/// - Project management
/// - Sync operations
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use parking_lot::Mutex;
use std::sync::Arc;
use uuid::Uuid;

use crate::implement::db::DatabaseState;
use crate::implement::modules::core::active_pmp::{ensure_pmp_v2, ActivePmpState};
use crate::implement::modules::v2;
use crate::implement::modules::v2::storage::schema::ensure_pmp_metadata;

// ============================================================================
// Command: Create V2 Project
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectV2Request {
    pub db_path: String,
    pub project_name: String,
    pub root_path: String,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectV2Response {
    pub success: bool,
    pub project_id: String,
    pub event_id: String,
    pub message: String,
}

#[tauri::command]
pub async fn create_project_v2(
    request: CreateProjectV2Request,
    db_state: tauri::State<'_, DatabaseState>,
    active_pmp: tauri::State<'_, ActivePmpState>,
) -> Result<CreateProjectV2Response, String> {
    let db = v2::V2Database::create(&request.db_path, &request.device_id)?;

    let project_id = db.create_project(&request.project_name, &request.root_path).await?;
    let event_id = project_id;
    db.update_metadata(
        project_id,
        project_id,
        "project",
        serde_json::json!({ "root_path": request.root_path }),
    ).await?;

    {
        let conn = db
            .conn
            .lock();
        ensure_pmp_metadata(&conn, project_id, &request.device_id)?;
    }

    drop(db);
    let db_path = std::path::PathBuf::from(&request.db_path);
    ensure_pmp_v2(&db_path)?;
    let db_inner = db_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::implement::db::open_project_db(&db_inner, db_path)
    })
    .await
    .map_err(|e| e.to_string())??;

    active_pmp
        .bind_project(std::path::PathBuf::from(&request.db_path), project_id, None)?;

    Ok(CreateProjectV2Response {
        success: true,
        project_id: project_id.to_string(),
        event_id: event_id.to_string(),
        message: format!("Project '{}' created", request.project_name),
    })
}

// ============================================================================
// Command: V2 Unified Search
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchV2Request {
    pub db_path: String,
    pub query: String,
    pub project_id: Option<String>,
    pub entity_types: Option<Vec<String>>,
    pub limit: Option<usize>,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultV2 {
    pub entity_id: String,
    pub entity_type: String,
    pub project_id: String,
    pub name: String,
    pub rank: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchV2Response {
    pub results: Vec<SearchResultV2>,
    pub total_count: usize,
}

#[tauri::command]
pub async fn search_v2(request: SearchV2Request) -> Result<SearchV2Response, String> {
    let db = v2::V2Database::open(&request.db_path, &request.device_id)?;

    let project_uuid = request
        .project_id
        .as_ref()
        .and_then(|s| Uuid::parse_str(s).ok());

    let filters = v2::SearchFilters {
        project_id: project_uuid,
        entity_types: request.entity_types,
        limit: request.limit.unwrap_or(50),
        offset: 0,
    };

    let results = db.search_engine().search(&request.query, filters)?;

    Ok(SearchV2Response {
        total_count: results.len(),
        results: results
            .into_iter()
            .map(|r| SearchResultV2 {
                entity_id: r.entity_id,
                entity_type: r.entity_type,
                project_id: r.project_id,
                name: r.name,
                rank: r.rank,
            })
            .collect(),
    })
}

// ============================================================================
// Command: V2 Create Task (Event-sourced)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskV2Request {
    pub db_path: String,
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskV2Response {
    pub success: bool,
    pub task_id: String,
    pub event_id: String,
    pub message: String,
}

#[tauri::command]
pub async fn create_task_v2(request: CreateTaskV2Request) -> Result<CreateTaskV2Response, String> {
    let db = v2::V2Database::open(&request.db_path, &request.device_id)?;

    let project_uuid =
        Uuid::parse_str(&request.project_id).map_err(|e| format!("Invalid project_id: {}", e))?;

    let task_id = db.create_task(project_uuid, &request.name).await?;

    Ok(CreateTaskV2Response {
        success: true,
        task_id: task_id.to_string(),
        event_id: "task-created".to_string(),
        message: format!("Task '{}' created", request.name),
    })
}

// ============================================================================
// Command: V2 Update Entity Metadata
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadataV2Request {
    pub db_path: String,
    pub project_id: String,
    pub entity_id: String,
    pub entity_type: String,
    pub metadata: serde_json::Value,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMetadataV2Response {
    pub success: bool,
    pub event_id: String,
    pub message: String,
}

#[tauri::command]
pub async fn update_entity_metadata_v2(
    request: UpdateMetadataV2Request,
) -> Result<UpdateMetadataV2Response, String> {
    let db = v2::V2Database::open(&request.db_path, &request.device_id)?;

    let project_uuid =
        Uuid::parse_str(&request.project_id).map_err(|e| format!("Invalid project_id: {}", e))?;

    let entity_uuid =
        Uuid::parse_str(&request.entity_id).map_err(|e| format!("Invalid entity_id: {}", e))?;

    let event_id = db.update_metadata(
        project_uuid,
        entity_uuid,
        &request.entity_type,
        request.metadata,
    ).await?;

    Ok(UpdateMetadataV2Response {
        success: true,
        event_id: event_id.to_string(),
        message: format!("Metadata for {} updated", request.entity_type),
    })
}

// ============================================================================
// Command: V2 Get Database Stats
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsV2Request {
    pub db_path: String,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsV2Response {
    pub event_count: i64,
    pub task_count: i64,
    pub file_count: i64,
    pub feature_count: i64,
    pub max_global_seq: i64,
    pub index_count: i64,
    pub analytics_file_size: u64,
    pub analytics_metadata: Option<serde_json::Value>,
    pub is_v2: bool,
}

#[tauri::command]
pub async fn get_stats_v2(request: StatsV2Request) -> Result<StatsV2Response, String> {
    // Check if V2
    let conn = Connection::open(&request.db_path).map_err(|e| e.to_string())?;
    let is_v2 = v2::is_v2_database(&conn)?;

    if !is_v2 {
        return Ok(StatsV2Response {
            event_count: 0,
            task_count: 0,
            file_count: 0,
            feature_count: 0,
            max_global_seq: 0,
            index_count: 0,
            analytics_file_size: 0,
            analytics_metadata: None,
            is_v2: false,
        });
    }

    let db = v2::V2Database::open(&request.db_path, &request.device_id)?;
    let stats = db.stats()?;

    Ok(StatsV2Response {
        event_count: stats.event_count,
        task_count: stats.task_count,
        file_count: stats.file_count,
        feature_count: stats.feature_count,
        max_global_seq: stats.max_global_seq,
        index_count: stats.index_count,
        analytics_file_size: stats.analytics_file_size,
        analytics_metadata: stats.analytics_metadata,
        is_v2: true,
    })
}

// ============================================================================
// Command: V2 Migrate from V1
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateV2Request {
    pub db_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateV2Response {
    pub success: bool,
    pub event_count: i64,
    pub task_count: i64,
    pub file_count: i64,
    pub feature_count: i64,
    pub index_count: i64,
    pub id_map_size: usize,
    pub errors: Vec<String>,
    pub message: String,
}

#[tauri::command]
pub async fn migrate_to_v2(request: MigrateV2Request) -> Result<MigrateV2Response, String> {
    let conn = Connection::open(&request.db_path).map_err(|e| e.to_string())?;

    let report = v2::V1ToV2Migrator::migrate(&conn)?;

    Ok(MigrateV2Response {
        success: report.success,
        event_count: report.event_count,
        task_count: report.task_count,
        file_count: report.file_count,
        feature_count: report.feature_count,
        index_count: report.index_count,
        id_map_size: report.id_map_size,
        errors: report.errors,
        message: if report.success {
            "Migration completed successfully".to_string()
        } else {
            "Migration completed with warnings".to_string()
        },
    })
}

// ============================================================================
// Command: V2 Blob Upload
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobUploadRequest {
    pub db_path: String,
    pub blobs_dir: String,
    pub data_base64: String,
    pub filename: Option<String>,
    pub mime_type: Option<String>,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobUploadResponse {
    pub success: bool,
    pub blob_id: String,
    pub sha256: String,
    pub size: u64,
}

#[tauri::command]
pub async fn upload_blob_v2(request: BlobUploadRequest) -> Result<BlobUploadResponse, String> {
    let conn = Arc::new(Mutex::new(
        Connection::open(&request.db_path).map_err(|e| e.to_string())?,
    ));

    let store = v2::BlobStore::new(std::path::PathBuf::from(&request.blobs_dir), conn);

    let data = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &request.data_base64,
    )
    .map_err(|e| e.to_string())?;

    let size = data.len() as u64;
    let sha256 = v2::storage::blob_store::BlobStore::calculate_sha256(&data);
    let blob_id = store.store(
        &data,
        request.filename.as_deref(),
        request.mime_type.as_deref(),
    )?;

    Ok(BlobUploadResponse {
        success: true,
        blob_id: blob_id.to_string(),
        sha256,
        size,
    })
}

// ============================================================================
// Command: V2 PmpContainer Info
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PmpInfoRequest {
    pub pmp_path: String,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PmpInfoResponse {
    pub is_v2: bool,
    pub has_manifest: bool,
    pub format_version: Option<String>,
    pub project_id: Option<String>,
    pub app_version: Option<String>,
    pub features: Vec<String>,
    pub core_db_exists: bool,
    pub blobs_dir_exists: bool,
}

#[tauri::command]
pub async fn get_pmp_info_v2(request: PmpInfoRequest) -> Result<PmpInfoResponse, String> {
    let path = std::path::Path::new(&request.pmp_path);

    // Check V2
    let is_v2 = if path.exists() {
        if let Ok(conn) = Connection::open(path) {
            v2::is_v2_database(&conn).unwrap_or(false)
        } else {
            false
        }
    } else {
        false
    };

    // Check manifest
    let manifest_io = v2::ManifestIO::new(path);
    let has_manifest = manifest_io.exists();

    let (format_version, project_id, app_version, features) = if has_manifest {
        if let Ok(manifest) = manifest_io.read() {
            (
                Some(manifest.format_version.clone()),
                Some(manifest.project_id.to_string()),
                Some(manifest.app_version.clone()),
                manifest.features.clone(),
            )
        } else {
            (None, None, None, vec![])
        }
    } else {
        (None, None, None, vec![])
    };

    let container = v2::PmpContainer::open(path, &request.device_id).ok();

    Ok(PmpInfoResponse {
        is_v2,
        has_manifest,
        format_version,
        project_id,
        app_version,
        features,
        core_db_exists: container
            .as_ref()
            .map(|c| c.core_db_path().exists())
            .unwrap_or(false),
        blobs_dir_exists: container
            .as_ref()
            .map(|c| c.blobs_dir().exists())
            .unwrap_or(false),
    })
}
