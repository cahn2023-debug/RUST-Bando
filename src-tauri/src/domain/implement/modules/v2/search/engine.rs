/// V2 Search Engine - Unified Entity Index
///
/// Replaces scattered FTS5 tables (file_search, task_search, note_search)
/// with one unified entity_index + entity_search FTS5 virtual table.
use crate::domain::implement::db::db_config::apply_performance_pragmas;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use parking_lot::Mutex;
use std::sync::Arc;
use uuid::Uuid;

// ============================================================================
// Search Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub entity_id: String,
    pub entity_type: String,
    pub project_id: String,
    pub name: String,
    pub rank: f64,
    pub tags: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct SearchFilters {
    pub project_id: Option<Uuid>,
    pub entity_types: Option<Vec<String>>,
    pub limit: usize,
    pub offset: usize,
}

// ============================================================================
// SearchEngine
// ============================================================================

#[derive(Clone)]
pub struct SearchEngine {
    conn: Arc<Mutex<Connection>>,
}

impl SearchEngine {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    /// Full-text search across all entities (using provided connection)
    pub fn search_with_conn(
        &self,
        conn: &Connection,
        query: &str,
        filters: SearchFilters,
    ) -> Result<Vec<SearchResult>, String> {
        let limit = if filters.limit == 0 {
            50
        } else {
            filters.limit
        };

        // Support multi-word prefix search
        let fts_query = query
            .split_whitespace()
            .map(|w| format!("\"{}\"*", w))
            .collect::<Vec<_>>()
            .join(" AND ");

        let mut sql = "
            SELECT 
                e.entity_id, 
                e.entity_type, 
                e.project_id, 
                e.name, 
                s.rank
            FROM entity_index e
            JOIN entity_search s ON e.rowid = s.rowid
            WHERE s.entity_search MATCH ?1
        "
        .to_string();

        if let Some(ref pid) = filters.project_id {
            sql.push_str(&format!(" AND e.project_id = '{}'", pid));
        }

        sql.push_str(" ORDER BY s.rank LIMIT ?2");

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

        let results = stmt
            .query_map(params![fts_query, limit], |row| {
                Ok(SearchResult {
                    entity_id: row.get(0)?,
                    entity_type: row.get(1)?,
                    project_id: row.get(2)?,
                    name: row.get(3)?,
                    rank: row.get(4)?,
                    tags: None,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut filtered: Vec<SearchResult> = Vec::new();
        for row in results {
            let r = row.map_err(|e| e.to_string())?;

            // Post-filter for entity_types if specified (SQL filtering for Vec is complex)
            if let Some(ref types) = filters.entity_types {
                if !types.is_empty() && !types.contains(&r.entity_type) {
                    continue;
                }
            }
            filtered.push(r);
        }

        Ok(filtered)
    }

    pub fn search(&self, query: &str, filters: SearchFilters) -> Result<Vec<SearchResult>, String> {
        let conn = self.conn.lock();
        self.search_with_conn(&conn, query, filters)
    }

    /// Parallel Search (Optimized for V5.3):
    /// Spawns parallel tasks to search FTS5 index and Native GIS features simultaneously.
    pub async fn search_parallel(
        &self,
        db_path: String,
        query: String,
        filters: SearchFilters,
    ) -> Result<Vec<SearchResult>, String> {
        use tauri::async_runtime::spawn_blocking;

        let query_fts = query.clone();
        let filters_fts = filters.clone();
        let db_path_fts = db_path.clone();

        // 1. Task for FTS5 Search
        let handle_fts = spawn_blocking(move || {
            let conn = Connection::open(&db_path_fts).map_err(|e| e.to_string())?;
            apply_performance_pragmas(&conn).map_err(|e| e.to_string())?;

            let engine = SearchEngine::new(Arc::new(Mutex::new(conn)));
            // Using a temporary connection since we need read-only access
            let conn_tmp = Connection::open(&db_path_fts).map_err(|e| e.to_string())?;
            engine.search_with_conn(&conn_tmp, &query_fts, filters_fts)
        });

        // 2. Task for Native GIS Feature Search (if applicable)
        let query_gis = query.clone();
        let filters_gis = filters.clone();
        let db_path_gis = db_path.clone();

        let handle_gis = spawn_blocking(move || {
            let conn = Connection::open(&db_path_gis).map_err(|e| e.to_string())?;
            apply_performance_pragmas(&conn).map_err(|e| e.to_string())?;

            let mut results = Vec::new();
            if let Some(pid) = filters_gis.project_id {
                let pid_bytes = pid.into_bytes();
                let fts_query = format!("%{}%", query_gis); // Simple like for native

                let mut stmt = conn
                    .prepare(
                        "
                    SELECT id, project_id, name FROM features 
                    WHERE project_id = ? AND name LIKE ? 
                    LIMIT ?
                ",
                    )
                    .map_err(|e| e.to_string())?;

                let rows = stmt
                    .query_map(
                        params![&pid_bytes.as_slice(), fts_query, filters_gis.limit],
                        |row| {
                            let id_bytes: Vec<u8> = row.get(0)?;
                            let pid_bytes: Vec<u8> = row.get(1)?;
                            let name: Option<String> = row.get(2)?;

                            Ok(SearchResult {
                                entity_id: Uuid::from_slice(&id_bytes)
                                    .map(|u| u.to_string())
                                    .unwrap_or_default(),
                                entity_type: "feature".to_string(),
                                project_id: Uuid::from_slice(&pid_bytes)
                                    .map(|u| u.to_string())
                                    .unwrap_or_default(),
                                name: name.unwrap_or_else(|| "Untitled Feature".to_string()),
                                rank: 0.1, // Lower priority than FTS matches
                                tags: None,
                            })
                        },
                    )
                    .map_err(|e| e.to_string())?;

                for r in rows {
                    results.push(r.map_err(|e| e.to_string())?);
                }
            }
            Ok::<Vec<SearchResult>, String>(results)
        });

        // Wait for both
        let res_fts = handle_fts.await.map_err(|e| e.to_string())??;
        let res_gis = handle_gis.await.map_err(|e| e.to_string())??;

        // Merge and deduplicate
        let mut final_results = res_fts;
        for r in res_gis {
            if !final_results
                .iter()
                .any(|existing| existing.entity_id == r.entity_id)
            {
                final_results.push(r);
            }
        }

        // Sort by rank
        final_results.sort_by(|a, b| {
            a.rank
                .partial_cmp(&b.rank)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(final_results)
    }

    /// Update entity index entry
    pub fn upsert_entity(
        &self,
        entity_id: Uuid,
        entity_type: &str,
        project_id: Uuid,
        name: &str,
        search_vector: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock();

        // Check if entity exists
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM entity_index WHERE entity_id = ? AND entity_type = ?",
                params![entity_id.to_string(), entity_type],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if exists > 0 {
            // Update
            conn.execute(
                "UPDATE entity_index SET name = ?, search_vector = ?, project_id = ?, updated_at = datetime('now')
                 WHERE entity_id = ? AND entity_type = ?",
                params![name, search_vector, project_id.to_string(), entity_id.to_string(), entity_type],
            )
            .map_err(|e| e.to_string())?;
        } else {
            // Insert
            conn.execute(
                "INSERT INTO entity_index (entity_id, entity_type, project_id, name, search_vector, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
                params![
                    entity_id.to_string(),
                    entity_type,
                    project_id.to_string(),
                    name,
                    search_vector,
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    /// Remove entity from index
    pub fn remove_entity(&self, entity_id: Uuid, entity_type: &str) -> Result<(), String> {
        let conn = self.conn.lock();

        conn.execute(
            "DELETE FROM entity_index WHERE entity_id = ? AND entity_type = ?",
            params![entity_id.to_string(), entity_type],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Get entities by type for a project (Phase 2: V5.3 Native Support)
    pub fn get_entities(
        &self,
        project_id: Uuid,
        entity_type: &str,
    ) -> Result<Vec<SearchResult>, String> {
        let conn = self.conn.lock();

        // Phase 2/3: If type is 'feature', try V5.3 native table ONLY
        if entity_type == "feature" {
            let pid_bytes = project_id.into_bytes();
            let mut stmt = conn
                .prepare(
                    "SELECT id, project_id, name FROM features
                     WHERE project_id = ?
                     ORDER BY name ASC",
                )
                .map_err(|e| e.to_string())?;

            let rows = stmt
                .query_map(params![&pid_bytes.as_slice()], |row| {
                    let id_bytes: Vec<u8> = row.get(0)?;
                    let pid_bytes: Vec<u8> = row.get(1)?;
                    let name: Option<String> = row.get(2)?;

                    Ok(SearchResult {
                        entity_id: Uuid::from_slice(&id_bytes)
                            .map(|u| u.to_string())
                            .unwrap_or_default(),
                        entity_type: "feature".to_string(),
                        project_id: Uuid::from_slice(&pid_bytes)
                            .map(|u| u.to_string())
                            .unwrap_or_default(),
                        name: name.unwrap_or_else(|| "Untitled Feature".to_string()),
                        rank: 0.0,
                        tags: None,
                    })
                })
                .map_err(|e| e.to_string())?;

            let results: Vec<SearchResult> = rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            // Total Deprecation: We no longer fallback to V2 for GIS features
            return Ok(results);
        }

        // --- LEGACY V2 FALLBACK (Standard lookup for non-GIS or fallback) ---
        let mut stmt = conn
            .prepare(
                "SELECT entity_id, entity_type, project_id, name, updated_at
                 FROM entity_index
                 WHERE project_id = ? AND entity_type = ?
                 ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string(), entity_type], |row| {
                Ok(SearchResult {
                    entity_id: row.get(0)?,
                    entity_type: row.get(1)?,
                    project_id: row.get(2)?,
                    name: row.get(3)?,
                    rank: 0.0,
                    tags: None,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }

        Ok(results)
    }

    /// Count entities by type (Phase 3: Support Native GIS counting)
    pub fn count_by_type(&self, project_id: Uuid) -> Result<Vec<(String, i64)>, String> {
        let conn = self.conn.lock();

        // 1. Get counts from standard V2 index (Tasks, Files, Notes, etc.)
        let mut stmt = conn
            .prepare(
                "SELECT entity_type, COUNT(*) FROM entity_index WHERE project_id = ? GROUP BY entity_type",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .map_err(|e| e.to_string())?;

        let mut counts: Vec<(String, i64)> = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // 2. Add Native GIS feature count from 'features' table
        let pid_bytes = project_id.into_bytes();
        let gis_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM features WHERE project_id = ?",
                params![&pid_bytes.as_slice()],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if gis_count > 0 {
            // Find if 'feature' already exists (shouldn't, but better be safe)
            if let Some(pos) = counts.iter().position(|(t, _)| t == "feature") {
                counts[pos].1 += gis_count;
            } else {
                counts.push(("feature".to_string(), gis_count));
            }
        }

        Ok(counts)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use parking_lot::Mutex;
    use std::sync::Arc;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();

        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            
            CREATE TABLE entity_index (
                entity_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                project_id TEXT NOT NULL,
                name TEXT,
                search_vector TEXT,
                tags TEXT,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (entity_id, entity_type)
            );

            CREATE VIRTUAL TABLE entity_search USING fts5(
                entity_id UNINDEXED,
                entity_type UNINDEXED,
                name,
                search_vector,
                tags,
                content='entity_index',
                content_rowid='rowid',
                tokenize='unicode61 remove_diacritics 2'
            );

            CREATE TRIGGER entity_search_ai AFTER INSERT ON entity_index BEGIN
                INSERT INTO entity_search(rowid, entity_id, entity_type, name, search_vector, tags)
                VALUES (new.rowid, new.entity_id, new.entity_type, new.name, new.search_vector, new.tags);
            END;

            CREATE TRIGGER entity_search_ad AFTER DELETE ON entity_index BEGIN
                INSERT INTO entity_search(entity_search, rowid, entity_id, entity_type, name, search_vector, tags)
                VALUES('delete', old.rowid, old.entity_id, old.entity_type, old.name, old.search_vector, old.tags);
            END;

            CREATE TRIGGER entity_search_au AFTER UPDATE ON entity_index BEGIN
                INSERT INTO entity_search(entity_search, rowid, entity_id, entity_type, name, search_vector, tags)
                VALUES('delete', old.rowid, old.entity_id, old.entity_type, old.name, old.search_vector, old.tags);
                INSERT INTO entity_search(rowid, entity_id, entity_type, name, search_vector, tags)
                VALUES (new.rowid, new.entity_id, new.entity_type, new.name, new.search_vector, new.tags);
            END;
            ",
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_upsert_entity() {
        let conn = create_test_db();
        let engine = SearchEngine::new(Arc::new(Mutex::new(conn)));

        let entity_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();

        engine
            .upsert_entity(entity_id, "task", project_id, "Test Task", "Test Task")
            .unwrap();

        let entities = engine.get_entities(project_id, "task").unwrap();
        assert_eq!(entities.len(), 1);
        assert_eq!(entities[0].name, "Test Task");
    }

    #[test]
    fn test_search_fts() {
        let conn = create_test_db();
        let engine = SearchEngine::new(Arc::new(Mutex::new(conn)));

        let project_id = Uuid::new_v4();

        // Insert test data using upsert_entity
        engine
            .upsert_entity(
                Uuid::new_v4(),
                "task",
                project_id,
                "Build database",
                "Build database",
            )
            .unwrap();
        engine
            .upsert_entity(Uuid::new_v4(), "task", project_id, "Design UI", "Design UI")
            .unwrap();
        engine
            .upsert_entity(
                Uuid::new_v4(),
                "file",
                project_id,
                "database schema.pdf",
                "database schema pdf",
            )
            .unwrap();

        // Search for "database"
        let results = engine.search("database", SearchFilters::default()).unwrap();
        assert!(results.len() >= 1);

        // All results should contain "database" in name
        for r in &results {
            assert!(
                r.name.to_lowercase().contains("database"),
                "Result name '{}' should contain 'database'",
                r.name
            );
        }
    }

    #[test]
    fn test_search_with_project_filter() {
        let conn = create_test_db();
        let engine = SearchEngine::new(Arc::new(Mutex::new(conn)));

        let project1 = Uuid::new_v4();
        let project2 = Uuid::new_v4();

        engine
            .upsert_entity(Uuid::new_v4(), "task", project1, "Task Alpha", "Task Alpha")
            .unwrap();
        engine
            .upsert_entity(Uuid::new_v4(), "task", project2, "Task Beta", "Task Beta")
            .unwrap();

        let filters = SearchFilters {
            project_id: Some(project1),
            ..Default::default()
        };

        let results = engine.search("Task", filters).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].project_id, project1.to_string());
    }

    #[test]
    fn test_search_with_type_filter() {
        let conn = create_test_db();
        let engine = SearchEngine::new(Arc::new(Mutex::new(conn)));

        let project_id = Uuid::new_v4();

        engine
            .upsert_entity(Uuid::new_v4(), "task", project_id, "My Task", "My Task")
            .unwrap();
        engine
            .upsert_entity(Uuid::new_v4(), "file", project_id, "My File", "My File")
            .unwrap();
        engine
            .upsert_entity(Uuid::new_v4(), "note", project_id, "My Note", "My Note")
            .unwrap();

        let filters = SearchFilters {
            entity_types: Some(vec!["task".to_string(), "file".to_string()]),
            ..Default::default()
        };

        let results = engine.search("My", filters).unwrap();
        assert!(results.len() <= 2);

        for r in &results {
            assert!(
                r.entity_type == "task" || r.entity_type == "file",
                "Expected task or file, got {}",
                r.entity_type
            );
        }
    }

    #[test]
    fn test_remove_entity() {
        let conn = create_test_db();
        let engine = SearchEngine::new(Arc::new(Mutex::new(conn)));

        let entity_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();

        engine
            .upsert_entity(entity_id, "task", project_id, "To Remove", "To Remove")
            .unwrap();

        let entities = engine.get_entities(project_id, "task").unwrap();
        assert_eq!(entities.len(), 1);

        engine.remove_entity(entity_id, "task").unwrap();

        let entities = engine.get_entities(project_id, "task").unwrap();
        assert_eq!(entities.len(), 0);
    }

    #[test]
    fn test_count_by_type() {
        let conn = create_test_db();
        let engine = SearchEngine::new(Arc::new(Mutex::new(conn)));

        let project_id = Uuid::new_v4();

        for i in 0..3 {
            engine
                .upsert_entity(
                    Uuid::new_v4(),
                    "task",
                    project_id,
                    &format!("Task {}", i),
                    &format!("Task {}", i),
                )
                .unwrap();
        }
        for i in 0..2 {
            engine
                .upsert_entity(
                    Uuid::new_v4(),
                    "file",
                    project_id,
                    &format!("File {}", i),
                    &format!("File {}", i),
                )
                .unwrap();
        }

        let counts = engine.count_by_type(project_id).unwrap();

        let task_count = counts
            .iter()
            .find(|(t, _)| t == "task")
            .map(|(_, c)| *c)
            .unwrap_or(0);
        let file_count = counts
            .iter()
            .find(|(t, _)| t == "file")
            .map(|(_, c)| *c)
            .unwrap_or(0);

        assert_eq!(task_count, 3);
        assert_eq!(file_count, 2);
    }

    #[test]
    fn test_upsert_updates_search_index() {
        let conn = create_test_db();
        let engine = SearchEngine::new(Arc::new(Mutex::new(conn)));

        let project_id = Uuid::new_v4();
        let entity_id = Uuid::new_v4();

        engine
            .upsert_entity(
                entity_id,
                "task",
                project_id,
                "Initial Name",
                "Initial Name",
            )
            .unwrap();

        // Search for initial name
        let results = engine.search("Initial", SearchFilters::default()).unwrap();
        assert_eq!(results.len(), 1);

        // Update the entity
        engine
            .upsert_entity(
                entity_id,
                "task",
                project_id,
                "Updated Name",
                "Updated Name",
            )
            .unwrap();

        // Search for updated name - should find it
        let results = engine.search("Updated", SearchFilters::default()).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Updated Name");
    }
}
