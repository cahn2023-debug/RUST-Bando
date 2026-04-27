use std::sync::Arc;
use arc_swap::ArcSwapOption;
use crate::domain::implement::modules::v2::V2Database;
use crate::implement::modules::core::config::ConfigState;
use crate::domain::implement::modules::v2::storage::worker::WorkerCommand;
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Clone)]
pub struct ActivePmpState {
    pub db_v2: Arc<ArcSwapOption<V2Database>>,
    pub config: Arc<ArcSwapOption<ConfigState>>,
    pub active_path: Arc<ArcSwapOption<std::path::PathBuf>>,
    pub active_project_id: Arc<ArcSwapOption<String>>,
    pub v2_sender: Arc<ArcSwapOption<mpsc::Sender<WorkerCommand>>>,
}

impl ActivePmpState {
    pub fn new() -> Self {
        Self {
            db_v2: Arc::new(ArcSwapOption::from(None)),
            config: Arc::new(ArcSwapOption::from(None)),
            active_path: Arc::new(ArcSwapOption::from(None)),
            active_project_id: Arc::new(ArcSwapOption::from(None)),
            v2_sender: Arc::new(ArcSwapOption::from(None)),
        }
    }

    pub fn set_config(&self, config: ConfigState) {
        self.config.store(Some(Arc::new(config)));
    }

    pub fn v2_db(&self) -> Result<Arc<V2Database>, String> {
        self.db_v2.load_full().ok_or_else(|| "No project is currently open.".to_string())
    }

    pub fn open_project(&self, id: &str, path: &str) -> Result<(), String> {
        // Tự động nâng cấp nếu là file cũ
        ensure_pmp_v2(std::path::Path::new(path))?;

        let config = self.config.load_full().ok_or_else(|| "Config not initialized".to_string())?;
        let v2_db = V2Database::open(path, &config.0.load().device_id)?;
        
        // Khởi tạo Worker
        let (tx, rx) = mpsc::channel(100);
        crate::domain::implement::modules::v2::storage::worker::DiskPersistenceWorker::start_with_receiver(
            rx,
            v2_db.conn.clone(),
            v2_db.event_store.clone(),
            v2_db.projection_engine.clone(),
            v2_db.metadata_registry.clone(),
            None,
            None,
            None,
        );

        // Lưu thông tin dự án đang hoạt động
        let path_buf = std::path::PathBuf::from(path);
        let project_id = id.to_string();
        
        self.db_v2.store(Some(Arc::new(v2_db)));
        self.active_path.store(Some(Arc::new(path_buf)));
        self.active_project_id.store(Some(Arc::new(project_id)));
        self.v2_sender.store(Some(Arc::new(tx)));
        
        Ok(())
    }

    pub fn close_project(&self) {
        if let Some(sender) = self.v2_sender.swap(None) {
             let _ = sender.send(WorkerCommand::Shutdown);
        }
        self.db_v2.store(None);
        self.active_path.store(None);
        self.active_project_id.store(None);
    }

    // ========================================================================
    // Legacy API - PHỤC VỤ TOÁN TỬ ? TRONG COMMANDS
    // ========================================================================

    pub fn project_id(&self) -> Result<Uuid, String> {
        self.active_project_id
            .load()
            .as_ref()
            .and_then(|id| Uuid::parse_str(id).ok())
            .ok_or_else(|| "No project is currently open (ID)".to_string())
    }

    pub fn project_id_string(&self) -> Result<String, String> {
        self.active_project_id
            .load()
            .as_ref()
            .map(|id| id.to_string())
            .ok_or_else(|| "No project is currently open (ID String)".to_string())
    }

    pub fn current_device_id(&self) -> Result<String, String> { 
        Ok(self.config.load().as_ref().map(|c| c.0.load().device_id.clone()).unwrap_or_default())
    }

    pub fn db_path(&self) -> Result<String, String> {
        self.active_path
            .load()
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .ok_or_else(|| "No project is currently open (Path)".to_string())
    }

    pub fn binder(&self) -> bool { false }
    pub fn ensure_alias(&self) -> Result<(), String> { Ok(()) }
    pub fn bind_project(&self, path: std::path::PathBuf, id: Uuid, _v: Option<serde_json::Value>) -> Result<(), String> {
        let path_str = path.to_string_lossy().to_string();
        self.open_project(&id.to_string(), &path_str)
    }
    pub async fn shutdown(&self) -> Result<(), String> { 
        if let Some(sender) = self.v2_sender.swap(None) {
            let _ = sender.send(WorkerCommand::Shutdown).await;
        }
        self.close_project(); 
        Ok(()) 
    }
    pub fn sender(&self) -> Result<mpsc::Sender<WorkerCommand>, String> { 
        self.v2_sender.load_full()
            .map(|s| (*s).clone())
            .ok_or_else(|| "V2 Worker is not initialized".to_string())
    }
}

pub fn ensure_pmp_v2(path: &std::path::Path) -> Result<(), String> {
    use crate::domain::implement::modules::v2::migration::engine::V1ToV2Migrator;
    use crate::domain::implement::modules::v2::storage::schema;
    use rusqlite::Connection;

    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    // Nếu không phải V2, chạy migration
    if !schema::is_v2_database(&conn).unwrap_or(false) {
        println!("[ActivePmp] Legacy PMP detected at {:?}. Migrating to V2...", path);
        
        V1ToV2Migrator::migrate(&conn)?;
        
        println!("[ActivePmp] Migration completed successfully.");
    }
    
    Ok(())
}
