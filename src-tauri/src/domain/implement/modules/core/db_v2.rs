use chrono::Utc;
use rusqlite::{params, Connection, Result};
use serde_json::json;
use std::path::Path;
use uuid::Uuid;

pub struct PmpDbV2 {
    conn: Connection,
}

impl PmpDbV2 {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let mut db = Self { conn };
        db.initialize()?;
        Ok(db)
    }

    pub fn insert_project(&self, title: &str, description: Option<&str>) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO projects (id, title, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, title, description, now, now],
        )?;
        Ok(id)
    }

    fn initialize(&mut self) -> Result<()> {
        let version: i32 = self
            .conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))?;

        if version == 0 {
            self.create_schema()?;
            self.conn.execute("PRAGMA user_version = 2", [])?;
        } else if version == 1 {
            self.migrate_v1_to_v2()?;
            self.conn.execute("PRAGMA user_version = 2", [])?;
        }

        // Enable FTS5 and Foreign Keys
        self.conn.execute("PRAGMA foreign_keys = ON", [])?;

        Ok(())
    }

    fn create_schema(&self) -> Result<()> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                base_dir_hint TEXT,
                metadata_json TEXT DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                rel_path TEXT NOT NULL,
                filename TEXT NOT NULL,
                extension TEXT,
                file_size INTEGER,
                hash_sha256 TEXT,
                mime_type TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                metadata_json TEXT DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#6366f1',
                category TEXT
            );

            CREATE TABLE IF NOT EXISTS file_tags (
                file_id TEXT NOT NULL,
                tag_id INTEGER NOT NULL,
                PRIMARY KEY (file_id, tag_id),
                FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );

            -- FTS5 Virtual Table for Search
            CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
                id UNINDEXED,
                filename,
                rel_path,
                metadata_json,
                content='files',
                content_rowid='rowid'
            );

            -- Triggers for FTS5
            CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
                INSERT INTO files_fts(rowid, id, filename, rel_path, metadata_json)
                VALUES (new.rowid, new.id, new.filename, new.rel_path, new.metadata_json);
            END;

            CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
                INSERT INTO files_fts(files_fts, rowid, id, filename, rel_path, metadata_json)
                VALUES('delete', old.rowid, old.id, old.filename, old.rel_path, old.metadata_json);
            END;

            CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
                INSERT INTO files_fts(files_fts, rowid, id, filename, rel_path, metadata_json)
                VALUES('delete', old.rowid, old.id, old.filename, old.rel_path, old.metadata_json);
                INSERT INTO files_fts(rowid, id, filename, rel_path, metadata_json)
                VALUES (new.rowid, new.id, new.filename, new.rel_path, new.metadata_json);
            END;
            "#,
        )?;
        Ok(())
    }

    fn migrate_v1_to_v2(&self) -> Result<()> {
        log::info!("[DB] Starting migration from V1 to V2...");
        self.conn.execute("PRAGMA foreign_keys = OFF", [])?;
        
        // 1. Kiểm tra sự tồn tại của các bảng V1
        let tables: Vec<String> = self.conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")?
            .query_map([], |r| r.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        if !tables.contains(&"projects".to_string()) {
            // Clean V2 schema will be created
            return self.create_schema();
        }

        // 2. Rename legacy tables
        self.conn.execute("ALTER TABLE projects RENAME TO projects_v1", [])?;
        self.conn.execute("ALTER TABLE files RENAME TO files_v1", [])?;
        // tags và file_tags (nếu có) xử lý tương tự hoặc bỏ qua nếu đơn giản
        if tables.contains(&"tags".to_string()) {
             self.conn.execute("ALTER TABLE tags RENAME TO tags_v1", [])?;
        }

        // 3. Create NEW V2 schema
        self.create_schema()?;

        // 4. Migrate Projects
        let mut stmt_p = self.conn.prepare("SELECT id, name, path, root_path, description, metadata_json FROM projects_v1")?;
        let projects_v1_iter = stmt_p.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?, // old_id
                row.get::<_, String>(1)?, // name
                row.get::<_, String>(2)?, // path
                row.get::<_, String>(3)?, // root_path
                row.get::<_, Option<String>>(4)?, // description
                row.get::<_, Option<String>>(5)?, // metadata_str
            ))
        })?;

        use std::collections::HashMap;
        let mut id_map: HashMap<i64, String> = HashMap::new();

        for p_row in projects_v1_iter {
            let (old_id, name, _path, root_path, desc, meta_str) = p_row?;
            let new_uuid = Uuid::new_v4().to_string();
            id_map.insert(old_id, new_uuid.clone());

            let now = Utc::now().to_rfc3339();
            self.conn.execute(
                "INSERT INTO projects (id, title, description, base_dir_hint, metadata_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    new_uuid, name, desc, root_path, 
                    meta_str.unwrap_or_else(|| "{}".to_string()),
                    now, now
                ],
            )?;
        }

        // 5. Migrate Files
        let mut stmt_f = self.conn.prepare("SELECT id, project_id, path, filename, extension, size, metadata_json FROM files_v1")?;
        let files_v1_iter = stmt_f.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?, // old_f_id
                row.get::<_, i64>(1)?, // old_p_id
                row.get::<_, String>(2)?, // abs_path
                row.get::<_, String>(3)?, // filename
                row.get::<_, Option<String>>(4)?, // ext
                row.get::<_, Option<i64>>(5)?, // size
                row.get::<_, Option<String>>(6)?, // meta
            ))
        })?;

        for f_row in files_v1_iter {
            let (_old_f_id, old_p_id, abs_path, filename, ext, size, meta) = f_row?;
            let project_uuid = match id_map.get(&old_p_id) {
                Some(uuid) => uuid,
                None => continue, // Skip orphans
            };

            // Convert Absolute to Relative
            let rel_path = if let Some(root_pos) = abs_path.find("Projects") {
                // Try to extract relative path after "Projects" folder
                abs_path[root_pos..].to_string()
            } else if abs_path.find(std::path::MAIN_SEPARATOR).is_some() {
                // Try to find a reasonable root path separator
                // On Windows, this might be "C:\Projects\..." 
                // We'll use the filename after the first separator following a common root
                let path_parts: Vec<&str> = abs_path.split(std::path::MAIN_SEPARATOR).collect();
                if path_parts.len() > 3 {
                    // Skip drive letter and first folder, take the rest
                    path_parts[2..].join(&std::path::MAIN_SEPARATOR.to_string())
                } else {
                    abs_path.clone()
                }
            } else {
                abs_path.clone()
            };

            let file_uuid = Uuid::new_v4().to_string();
            let now = Utc::now().to_rfc3339();
            self.conn.execute(
                "INSERT INTO files (id, project_id, rel_path, filename, extension, file_size, status, metadata_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, ?8, ?9)",
                params![
                    file_uuid, project_uuid, rel_path, filename, ext, size,
                    meta.unwrap_or_else(|| "{}".to_string()),
                    now, now
                ],
            )?;
        }

        // 6. Cleanup
        self.conn.execute("DROP TABLE projects_v1", [])?;
        self.conn.execute("DROP TABLE files_v1", [])?;
        if tables.contains(&"tags_v1".to_string()) {
             self.conn.execute("DROP TABLE tags_v1", [])?;
        }

        // Migration complete
        Ok(())
    }

    pub fn get_connection(&self) -> &Connection {
        &self.conn
    }

    pub fn get_connection_owned(self) -> Connection {
        self.conn
    }

    pub fn upsert_file(&self, file: &shared_models::pmp_v2::PmpV2File) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            r#"
            INSERT INTO files (
                id, project_id, rel_path, filename, extension, file_size, 
                hash_sha256, mime_type, status, metadata_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
                rel_path=excluded.rel_path,
                filename=excluded.filename,
                extension=excluded.extension,
                file_size=excluded.file_size,
                hash_sha256=excluded.hash_sha256,
                mime_type=excluded.mime_type,
                status=excluded.status,
                metadata_json=excluded.metadata_json,
                updated_at=excluded.updated_at
            "#,
            params![
                file.id,
                file.project_id,
                file.rel_path,
                file.filename,
                file.extension,
                file.file_size,
                file.hash_sha256,
                file.mime_type,
                file.status,
                file.metadata_json.to_string(),
                now,
                now
            ],
        )?;
        Ok(())
    }

    pub fn search_files(&self, query: &str) -> Result<Vec<shared_models::pmp_v2::PmpV2File>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT f.id, f.project_id, f.rel_path, f.filename, f.extension, f.file_size, 
                   f.hash_sha256, f.mime_type, f.status, f.metadata_json, f.created_at, f.updated_at
            FROM files f
            JOIN files_fts ft ON ft.id = f.id
            WHERE files_fts MATCH ?1
            ORDER BY rank
            "#,
        )?;

        let file_iter = stmt.query_map([query], |row| {
            let metadata_str: String = row.get(9)?;
            Ok(shared_models::pmp_v2::PmpV2File {
                id: row.get(0)?,
                project_id: row.get(1)?,
                rel_path: row.get(2)?,
                filename: row.get(3)?,
                extension: row.get(4)?,
                file_size: row.get(5)?,
                hash_sha256: row.get(6)?,
                mime_type: row.get(7)?,
                status: row.get(8)?,
                metadata_json: serde_json::from_str(&metadata_str).unwrap_or(json!({})),
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?;

        let mut results = Vec::new();
        for file in file_iter {
            results.push(file?);
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_v1_to_v2() -> Result<()> {
        let conn = Connection::open_in_memory()?;
        
        // 1. Create V1 Schema
        conn.execute_batch(
            r#"
            CREATE TABLE projects (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                root_path TEXT NOT NULL,
                path TEXT,
                description TEXT,
                metadata_json TEXT,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                path TEXT NOT NULL,
                filename TEXT NOT NULL,
                extension TEXT,
                size INTEGER DEFAULT 0,
                metadata_json TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            "#,
        )?;

        // 2. Insert V1 Data
        conn.execute(
            "INSERT INTO projects (id, name, root_path, path) VALUES (1, 'Legacy Project', 'C:/Projects', 'C:/Projects/test.pmp')",
            [],
        )?;
        conn.execute("PRAGMA user_version = 1", [])?;
        conn.execute(
            "INSERT INTO files (project_id, path, filename, extension, size) VALUES (1, 'C:/Projects/doc1.pdf', 'doc1.pdf', 'pdf', 1024)",
            [],
        )?;

        // 3. Close and Wrap in PmpDbV2 (simulating open)
        // Note: initialize() will detect existing tables and call migrate_v1_to_v2
        let mut db = PmpDbV2 { conn };
        db.initialize()?;

        // 4. Verify V2 Data
        let version: i32 = db.conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        assert_eq!(version, 2);

        let project_count: i64 = db.conn.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))?;
        assert_eq!(project_count, 1);

        let (p_id, p_title): (String, String) = db.conn.query_row(
            "SELECT id, title FROM projects LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        assert_eq!(p_title, "Legacy Project");
        assert!(Uuid::parse_str(&p_id).is_ok());

        let file_count: i64 = db.conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))?;
        assert_eq!(file_count, 1);

        let (f_id, f_filename, f_proj_id): (String, String, String) = db.conn.query_row(
            "SELECT id, filename, project_id FROM files LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        assert_eq!(f_filename, "doc1.pdf");
        assert_eq!(f_proj_id, p_id);
        assert!(Uuid::parse_str(&f_id).is_ok());

        // 5. Test FTS5
        let search_results = db.search_files("doc1")?;
        assert_eq!(search_results.len(), 1);
        assert_eq!(search_results[0].filename, "doc1.pdf");

        Ok(())
    }
}
