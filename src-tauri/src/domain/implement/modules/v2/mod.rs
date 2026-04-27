use std::sync::Arc;
use parking_lot::Mutex;
use rusqlite::Connection;
pub use uuid::Uuid;
pub use serde::{Serialize, Deserialize};

pub mod events;
pub mod gis;
pub mod metadata;
pub mod migration;
pub mod projections;
pub mod reporting;
pub mod search;
pub mod spatial;
pub mod storage;
pub mod sync;

pub use crate::domain::implement::db::event_store::EventStore;
pub use crate::domain::implement::db::projection_engine::ProjectionEngine;
pub use metadata::MetadataRegistry;
pub use search::{SearchEngine, SearchResult, SearchFilters};

use crate::domain::implement::modules::core::config::ConfigState;

// Re-export main models
pub use crate::domain::models::v2::{AppEvent, EventEnvelope};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZeroCopyEventEnvelope {
    pub event_id: Uuid,
    pub payload: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectStatsV2 {
    pub event_count: i64,
    pub task_count: i64,
    pub file_count: i64,
    pub feature_count: i64,
    pub max_global_seq: i64,
    pub index_count: i64,
    pub analytics_file_size: u64,
    pub analytics_metadata: Option<serde_json::Value>,
}

// Re-export from storage level
pub use storage::duckdb_manager::{DuckDBManager, ProjectStats, ExtensionStat, FileStat};
pub use storage::blob_store::{BlobStore, BlobInfo};
pub use storage::manifest::{Manifest, ManifestIO, PmpContainer};
pub use migration::{MigrationReport, V1ToV2Migrator};

pub struct V2Database {
    pub conn: Arc<Mutex<Connection>>,
    pub event_store: EventStore,
    pub projection_engine: ProjectionEngine,
    pub metadata_registry: MetadataRegistry,
    pub duckdb: DuckDBManager,
    pub config: ConfigState,
}

impl V2Database {
    pub fn new(conn: Arc<Mutex<Connection>>, config: ConfigState, db_path: &str) -> Self {
        let device_id = config.0.load().device_id.clone();
        Self {
            conn: conn.clone(),
            event_store: EventStore::new(conn.clone(), device_id),
            projection_engine: ProjectionEngine::new(conn.clone()),
            metadata_registry: MetadataRegistry::new(conn.clone()),
            duckdb: DuckDBManager::new(db_path).expect("DuckDB initialization failed"),
            config,
        }
    }

    pub fn create(db_path: &str, device_id: &str) -> Result<Self, String> {
        let conn = Connection::open(db_path).map_err(|e| format!("Failed to open SQLite: {}", e))?;
        let arc_conn = Arc::new(Mutex::new(conn));
        let config = ConfigState(Arc::new(arc_swap::ArcSwap::from_pointee(
            crate::domain::implement::modules::core::config::AppConfig {
                device_id: device_id.to_string(),
                ..Default::default()
            },
        )));
        Ok(Self::new(arc_conn, config, db_path))
    }

    pub fn open(db_path: &str, device_id: &str) -> Result<Self, String> {
        Self::create(db_path, device_id)
    }

    pub async fn create_project(&self, name: &str, root_path: &str) -> Result<Uuid, String> {
        let project_id = Uuid::new_v4();
        let event = AppEvent::ProjectCreated {
            id: project_id,
            name: name.to_string(),
            root_path: root_path.to_string(),
            metadata: serde_json::json!({}),
            settings: serde_json::json!({}),
        };
        self.event_store.append(project_id, event, "project", project_id).map_err(|e| e.to_string())?;
        Ok(project_id)
    }

    pub async fn update_metadata(&self, project_id: Uuid, entity_id: Uuid, _t: &str, data: serde_json::Value) -> Result<Uuid, String> {
        let event = AppEvent::ProjectMetadataUpdated {
            changes: data,
        };
        self.event_store.append(project_id, event, "project", entity_id).map_err(|e| e.to_string())?;
        Ok(entity_id)
    }

    pub async fn create_task(&self, project_id: Uuid, name: &str) -> Result<Uuid, String> {
        let task_id = Uuid::new_v4();
        let event = AppEvent::TaskCreated {
            name: name.to_string(),
            parent_id: None,
            metadata: serde_json::json!({}),
        };
        self.event_store.append(project_id, event, "task", task_id).map_err(|e| e.to_string())?;
        Ok(task_id)
    }

    pub fn stats(&self) -> Result<ProjectStatsV2, String> {
        let conn = self.conn.lock();
        let event_count: i64 = conn.query_row("SELECT COUNT(*) FROM event_store", [], |r| r.get(0)).unwrap_or(0);
        let task_count: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap_or(0);
        let file_count: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap_or(0);
        let feature_count: i64 = conn.query_row("SELECT COUNT(*) FROM features", [], |r| r.get(0)).unwrap_or(0);
        let max_global_seq: i64 = conn.query_row("SELECT COALESCE(MAX(global_seq), 0) FROM event_store", [], |r| r.get(0)).unwrap_or(0);
        
        Ok(ProjectStatsV2 {
            event_count,
            task_count,
            file_count,
            feature_count,
            max_global_seq,
            index_count: 0,
            analytics_file_size: 0,
            analytics_metadata: None,
        })
    }

    pub fn search_engine(&self) -> SearchEngine {
        SearchEngine::new(self.conn.clone())
    }

    pub fn ensure_alias(&self) -> Result<(), String> {
        // Implement alias logic if needed for DuckDB/SQLite views
        Ok(())
    }
}

pub fn is_v2_database(conn: &Connection) -> Result<bool, String> {
    storage::schema::is_v2_database(conn)
}

pub mod migration_v2 {
    use super::*;
    pub struct MigrationServiceV2;
    impl MigrationServiceV2 {
        pub fn migrate_v1_to_v2(conn: &mut Connection) -> Result<(), String> {
            let report = V1ToV2Migrator::migrate(conn)?;
            if report.success {
                log::info!("[V2] Migration success: {} events, {} tasks", report.event_count, report.task_count);
                Ok(())
            } else {
                Err(format!("Migration failed: {:?}", report.errors))
            }
        }
    }
}
