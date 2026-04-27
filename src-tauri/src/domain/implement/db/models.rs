use crate::design::design_events::MapState;
// use crate::implement::db::write_queue::WriteQueue;
use dashmap::DashMap;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct DatabaseState {
    pub conn: Arc<Mutex<Option<Connection>>>,
    pub write_conn: Arc<Mutex<Option<Connection>>>,
    pub connection_pool: Arc<DashMap<PathBuf, Arc<Mutex<Connection>>>>,
    pub state_cache: Arc<DashMap<String, Arc<MapState>>>,
    pub active_project_id: Arc<Mutex<Option<String>>>,
    pub hydrated_project_id: Arc<Mutex<Option<String>>>,
    pub indexing_task_id: Arc<AtomicU64>,
    pub project_id_to_path: Arc<DashMap<String, PathBuf>>,
    pub design_state_blob: Arc<Mutex<Option<Vec<u8>>>>, // Added for streaming
    pub active_dmp_path: Arc<Mutex<Option<PathBuf>>>,
    pub storage_v53: Arc<module_storage::StorageService>, // V5.3 Storage Core
    pub device_id: Arc<Mutex<String>>,
}

impl Default for DatabaseState {
    fn default() -> Self {
        Self::new()
    }
}

impl DatabaseState {
    pub fn new() -> Self {
        Self {
            conn: Arc::new(Mutex::new(None)),
            write_conn: Arc::new(Mutex::new(None)),
            connection_pool: Arc::new(DashMap::new()),
            state_cache: Arc::new(DashMap::new()),
            active_project_id: Arc::new(Mutex::new(None)),
            hydrated_project_id: Arc::new(Mutex::new(None)),
            indexing_task_id: Arc::new(AtomicU64::new(0)),
            project_id_to_path: Arc::new(DashMap::new()),
            design_state_blob: Arc::new(Mutex::new(None)),
            active_dmp_path: Arc::new(Mutex::new(None)),
            storage_v53: Arc::new(module_storage::StorageService::new()),
            device_id: Arc::new(Mutex::new("UNKNOWN".to_string())),
        }
    }

    /// Standardizes SQLite connection with WAL mode and performance pragmas
    pub fn initialize_connection(conn: &Connection) -> Result<(), rusqlite::Error> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;
             PRAGMA cache_size = -64000;
             PRAGMA mmap_size = 268435456;
             PRAGMA foreign_keys = ON;
             PRAGMA temp_store = MEMORY;",
        )
    }

    /// Opens a project database and sets it as active in the state
    pub fn open_project(
        &self,
        db_path: PathBuf,
    ) -> Result<crate::contract::project_model::Project, String> {
        // We call the implementation in mod.rs to avoid code duplication for now,
        // or we could move the logic here.
        crate::implement::db::open_project_db(self, db_path)
    }

    /// Gets a read-only connection for a specific project from the pool.
    /// If not in pool, opens a new one and adds it.
    pub fn get_read_conn(&self, project_id: &str) -> Result<Arc<Mutex<Connection>>, String> {
        if let Some(path) = self.project_id_to_path.get(project_id) {
            if let Some(conn) = self.connection_pool.get(&*path) {
                return Ok(conn.clone());
            }

            // Open new connection for pool
            let conn = Connection::open(&*path).map_err(|e| e.to_string())?;
            Self::initialize_connection(&conn).map_err(|e| e.to_string())?;
            let conn_arc = Arc::new(Mutex::new(conn));
            self.connection_pool.insert(path.clone(), conn_arc.clone());
            Ok(conn_arc)
        } else {
            Err(format!("Project path not found for ID: {}", project_id))
        }
    }

    /// Gets the current write connection
    pub fn get_write_conn(&self) -> Result<Arc<Mutex<Option<Connection>>>, String> {
        Ok(self.write_conn.clone())
    }

    /// Gets the path to a project's database file (.pmp)
    pub fn get_project_db_path(&self, project_id: &str) -> PathBuf {
        self.project_id_to_path
            .get(project_id)
            .map(|p| p.value().clone())
            .unwrap_or_else(|| PathBuf::from(format!("{}.pmp", project_id)))
    }

    /// Gets the path to a project's RocksDB WAL directory
    pub fn get_project_wal_path(&self, project_id: &str) -> PathBuf {
        let mut db_path = self.get_project_db_path(project_id);
        db_path.set_extension("wal"); // e.g. project_id.wal directory
        db_path
    }
}
