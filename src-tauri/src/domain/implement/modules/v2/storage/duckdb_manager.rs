use crate::domain::models::v2::{AppEvent, EventEnvelope};
use duckdb::{params, Connection, Result};
use log::info;

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectStats {
    pub total_files: i64,
    pub total_size: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtensionStat {
    pub extension: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileStat {
    pub filename: String,
    pub rel_path: String,
    pub file_size: i64,
}

/// Quản lý kết nối và thao tác với DuckDB
#[derive(Clone)]
pub struct DuckDBManager {
    conn: Arc<Mutex<duckdb::Connection>>,
    path: std::path::PathBuf,
}

impl DuckDBManager {
    /// Khởi tạo DuckDBManager với đường dẫn file
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let db_path = path.as_ref().to_string_lossy().into_owned();
        info!("[DuckDB] Opening database at: {}", db_path);

        let conn = Connection::open(&db_path)?;

        let manager = Self {
            conn: Arc::new(Mutex::new(conn)),
            path: path.as_ref().to_path_buf(),
        };

        manager.init_schema()?;
        Ok(manager)
    }

    /// Khởi tạo schema cơ bản cho DuckDB
    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| {
            duckdb::Error::DuckDBFailure(unsafe { std::mem::zeroed() }, Some(e.to_string()))
        })?;

        // Tạo bảng folder_metadata để demo
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS folder_metadata (
                id UUID PRIMARY KEY,
                project_id UUID,
                rel_path VARCHAR,
                filename VARCHAR,
                extension VARCHAR,
                file_size BIGINT,
                metadata_json JSON,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );",
        )?;

        info!("[DuckDB] Schema initialized successfully");
        Ok(())
    }

    /// Đồng bộ hóa một EventEnvelope từ SQLite sang DuckDB
    pub fn sync_envelope(&self, envelope: &EventEnvelope) -> Result<()> {
        match &envelope.event {
            AppEvent::FileCreated {
                rel_path,
                filename,
                file_size,
                metadata,
                ..
            } => {
                self.upsert_metadata(
                    envelope.entity_id,
                    envelope.project_id,
                    rel_path,
                    filename,
                    &self.extract_extension(filename),
                    (*file_size) as i64,
                    &metadata.to_string(),
                )?;
            }
            AppEvent::FileUpdated { changes, .. } => {
                // Xử lý cập nhật metadata nếu có
                if let Some(metadata) = changes.get("metadata") {
                    self.update_metadata_json(envelope.entity_id, &metadata.to_string())?;
                }
            }
            AppEvent::FileDeleted { .. } => {
                self.delete_metadata(envelope.entity_id)?;
            }
            _ => {}
        }
        Ok(())
    }

    fn extract_extension(&self, filename: &str) -> String {
        Path::new(filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase()
    }

    fn update_metadata_json(&self, id: Uuid, metadata_json: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| {
            duckdb::Error::DuckDBFailure(unsafe { std::mem::zeroed() }, Some(e.to_string()))
        })?;
        conn.execute(
            "UPDATE folder_metadata SET metadata_json = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![metadata_json, id.to_string()],
        )?;
        Ok(())
    }

    fn delete_metadata(&self, id: Uuid) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| {
            duckdb::Error::DuckDBFailure(unsafe { std::mem::zeroed() }, Some(e.to_string()))
        })?;
        conn.execute(
            "DELETE FROM folder_metadata WHERE id = ?1",
            params![id.to_string()],
        )?;
        Ok(())
    }

    /// Thêm hoặc cập nhật metadata của một file/folder
    pub fn upsert_metadata(
        &self,
        id: Uuid,
        project_id: Uuid,
        rel_path: &str,
        filename: &str,
        extension: &str,
        file_size: i64,
        metadata_json: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| {
            duckdb::Error::DuckDBFailure(unsafe { std::mem::zeroed() }, Some(e.to_string()))
        })?;

        conn.execute(
            "INSERT OR REPLACE INTO folder_metadata 
            (id, project_id, rel_path, filename, extension, file_size, metadata_json, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)",
            params![
                id.to_string(),
                project_id.to_string(),
                rel_path,
                filename,
                extension,
                file_size,
                metadata_json
            ],
        )?;

        Ok(())
    }

    /// Tìm kiếm thông minh bằng DuckDB (Demo)
    pub fn search_by_extension(&self, ext: &str) -> Result<Vec<String>> {
        let conn = self.conn.lock().map_err(|e| {
            duckdb::Error::DuckDBFailure(unsafe { std::mem::zeroed() }, Some(e.to_string()))
        })?;
        let mut stmt = conn.prepare("SELECT filename FROM folder_metadata WHERE extension = ?1")?;

        let rows = stmt.query_map(params![ext], |row: &duckdb::Row| row.get::<_, String>(0))?;

        let mut results = Vec::new();
        for name in rows {
            results.push(name?);
        }
        Ok(results)
    }

    /// Lấy thống kê tổng quan của project
    pub fn get_project_stats(&self, project_id: Uuid) -> Result<ProjectStats> {
        let conn = self.conn.lock().map_err(|e| {
            duckdb::Error::DuckDBFailure(unsafe { std::mem::zeroed() }, Some(e.to_string()))
        })?;
        let mut stmt = conn.prepare(
            "SELECT count(*), coalesce(sum(file_size), 0) FROM folder_metadata WHERE project_id = ?1",
        )?;

        let mut rows = stmt.query(params![project_id.to_string()])?;
        if let Some(row) = rows.next()? {
            Ok(ProjectStats {
                total_files: row.get(0)?,
                total_size: row.get(1)?,
            })
        } else {
            Ok(ProjectStats {
                total_files: 0,
                total_size: 0,
            })
        }
    }

    /// Lấy phân bổ định dạng file
    pub fn get_extension_distribution(&self, project_id: Uuid) -> Result<Vec<ExtensionStat>> {
        let conn = self.conn.lock().map_err(|e| {
            duckdb::Error::DuckDBFailure(unsafe { std::mem::zeroed() }, Some(e.to_string()))
        })?;
        let mut stmt = conn.prepare(
            "SELECT extension, count(*) as count 
             FROM folder_metadata 
             WHERE project_id = ?1 
             GROUP BY extension 
             ORDER BY count DESC",
        )?;

        let rows = stmt.query_map(params![project_id.to_string()], |row: &duckdb::Row| {
            Ok(ExtensionStat {
                extension: row.get(0)?,
                count: row.get(1)?,
            })
        })?;

        let mut results = Vec::new();
        for res in rows {
            results.push(res?);
        }
        Ok(results)
    }

    /// Lấy top N file lớn nhất
    pub fn get_top_files(&self, project_id: Uuid, limit: usize) -> Result<Vec<FileStat>> {
        let conn = self.conn.lock().map_err(|e| {
            duckdb::Error::DuckDBFailure(unsafe { std::mem::zeroed() }, Some(e.to_string()))
        })?;
        let mut stmt = conn.prepare(
            "SELECT filename, rel_path, file_size 
             FROM folder_metadata 
             WHERE project_id = ?1 
             ORDER BY file_size DESC 
             LIMIT ?2",
        )?;

        let rows = stmt.query_map(
            params![project_id.to_string(), limit as i64],
            |row: &duckdb::Row| {
                Ok(FileStat {
                    filename: row.get(0)?,
                    rel_path: row.get(1)?,
                    file_size: row.get(2)?,
                })
            },
        )?;

        let mut results = Vec::new();
        for res in rows {
            results.push(res?);
        }
        Ok(results)
    }

    pub fn get_db_path(&self) -> &std::path::Path {
        &self.path
    }
}
