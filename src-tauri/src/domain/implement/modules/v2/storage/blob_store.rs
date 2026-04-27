use parking_lot::Mutex;
/// Blob Storage - Content-addressable file storage
///
/// Files are stored by their SHA-256 hash, enabling:
/// - Deduplication: Same content = same storage
/// - Integrity: Hash verification on read
/// - Sync-friendly: Only transfer missing blobs
/// - GC: Safe deletion when reference_count = 0
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

// ============================================================================
// Blob Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlobInfo {
    pub id: Uuid,
    pub sha256: String,
    pub file_size: u64,
    pub mime_type: Option<String>,
    pub original_filename: Option<String>,
    pub blob_path: String,
    pub reference_count: i64,
    pub created_at: String,
}

// ============================================================================
/// BlobStore
// ============================================================================
pub struct BlobStore {
    blobs_dir: PathBuf,
    conn: Arc<Mutex<Connection>>,
}

impl BlobStore {
    pub fn new(blobs_dir: PathBuf, conn: Arc<Mutex<Connection>>) -> Self {
        // Ensure blobs directory exists
        if !blobs_dir.exists() {
            std::fs::create_dir_all(&blobs_dir).ok();
        }

        Self { blobs_dir, conn }
    }

    // ── Store ─────────────────────────────────────────────────────────────

    /// Store data and register in blob_registry
    pub fn store(
        &self,
        data: &[u8],
        original_filename: Option<&str>,
        mime_type: Option<&str>,
    ) -> Result<Uuid, String> {
        let sha256 = Self::calculate_sha256(data);
        let blob_path = Self::hash_to_path(&sha256);
        let full_path = self.blobs_dir.join(&blob_path);

        // Create directory structure
        if let Some(parent) = full_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // Write file (idempotent - same hash = same content)
        if !full_path.exists() {
            std::fs::write(&full_path, data).map_err(|e| {
                error!(
                    "[Save Error] [BlobStore] Failed to write blob to {:?}: {}",
                    full_path, e
                );
                e.to_string()
            })?;
            info!(
                "[BlobStore] Successfully stored new blob at {:?}",
                full_path
            );
        } else {
            debug!("[BlobStore] Blob already exists at {:?}", full_path);
        }

        // Register in blob_registry
        let id = Uuid::new_v4();
        let conn = self.conn.lock();

        // Check if blob already exists by hash
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM blob_registry WHERE sha256 = ?",
                params![sha256],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if exists > 0 {
            // Increment reference count
            conn.execute(
                "UPDATE blob_registry SET reference_count = reference_count + 1 WHERE sha256 = ?",
                params![sha256],
            )
            .map_err(|e| e.to_string())?;

            // Get existing ID
            conn.query_row(
                "SELECT id FROM blob_registry WHERE sha256 = ?",
                params![sha256],
                |r| r.get::<_, String>(0),
            )
            .map(|s| Uuid::parse_str(&s).unwrap_or(id))
            .map_err(|e| e.to_string())
        } else {
            conn.execute(
                "INSERT INTO blob_registry (id, sha256, file_size, mime_type, original_filename, blob_path, reference_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
                params![
                    id.to_string(),
                    sha256,
                    data.len() as i64,
                    mime_type,
                    original_filename,
                    blob_path,
                ],
            )
            .map_err(|e| e.to_string())?;

            Ok(id)
        }
    }

    // ── Retrieve ──────────────────────────────────────────────────────────

    /// Get blob data by ID
    pub fn get(&self, blob_id: Uuid) -> Result<Vec<u8>, String> {
        let conn = self.conn.lock();

        let (sha256, blob_path) = conn
            .query_row(
                "SELECT sha256, blob_path FROM blob_registry WHERE id = ?",
                params![blob_id.to_string()],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .map_err(|e| e.to_string())?;

        let full_path = self.blobs_dir.join(&blob_path);

        if !full_path.exists() {
            return Err(format!("Blob file missing: {}", blob_path));
        }

        let data = std::fs::read(&full_path).map_err(|e| {
            error!(
                "[Read Error] [BlobStore] Failed to read blob from {:?}: {}",
                full_path, e
            );
            e.to_string()
        })?;

        info!("[BlobStore] Successfully read blob from {:?}", full_path);

        // Verify integrity
        let actual_sha256 = Self::calculate_sha256(&data);
        if actual_sha256 != sha256 {
            warn!("[BlobStore] Integrity check failed for {:?}", full_path);
            return Err(format!(
                "Blob integrity check failed: expected {}, got {}",
                sha256, actual_sha256
            ));
        }

        Ok(data)
    }

    /// Get blob data by SHA-256 hash
    pub fn get_by_hash(&self, sha256: &str) -> Result<Vec<u8>, String> {
        let blob_path = Self::hash_to_path(sha256);
        let full_path = self.blobs_dir.join(&blob_path);

        if !full_path.exists() {
            return Err(format!("Blob file missing: {}", blob_path));
        }

        let data = std::fs::read(&full_path).map_err(|e| e.to_string())?;

        // Verify integrity
        let actual_sha256 = Self::calculate_sha256(&data);
        if actual_sha256 != sha256 {
            return Err("Blob integrity check failed".to_string());
        }

        Ok(data)
    }

    // ── Reference Management ──────────────────────────────────────────────

    /// Increment reference count
    pub fn add_reference(&self, blob_id: Uuid) -> Result<(), String> {
        let conn = self.conn.lock();

        conn.execute(
            "UPDATE blob_registry SET reference_count = reference_count + 1 WHERE id = ?",
            params![blob_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Decrement reference count
    pub fn remove_reference(&self, blob_id: Uuid) -> Result<(), String> {
        let conn = self.conn.lock();

        conn.execute(
            "UPDATE blob_registry SET reference_count = reference_count - 1 WHERE id = ?",
            params![blob_id.to_string()],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    // ── Garbage Collection ────────────────────────────────────────────────

    /// Delete blobs with reference_count <= 0
    pub fn gc(&self) -> Result<usize, String> {
        let conn = self.conn.lock();

        let mut stmt = conn
            .prepare("SELECT id, blob_path FROM blob_registry WHERE reference_count <= 0")
            .map_err(|e| e.to_string())?;

        let blobs: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let count = blobs.len();

        for (id, blob_path) in blobs {
            // Delete file
            let full_path = self.blobs_dir.join(&blob_path);
            std::fs::remove_file(&full_path).ok();

            // Delete from registry
            conn.execute("DELETE FROM blob_registry WHERE id = ?", params![id])
                .map_err(|e| e.to_string())?;
        }

        Ok(count)
    }

    // ── Query ─────────────────────────────────────────────────────────────

    /// Check if a blob exists by hash
    pub fn has_hash(&self, sha256: &str) -> bool {
        let conn = self.conn.lock();

        conn.query_row(
            "SELECT COUNT(*) FROM blob_registry WHERE sha256 = ?",
            params![sha256],
            |r: &rusqlite::Row| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
            > 0
    }

    /// Get blob info by ID
    pub fn get_info(&self, blob_id: Uuid) -> Result<BlobInfo, String> {
        let conn = self.conn.lock();

        conn.query_row(
            "SELECT id, sha256, file_size, mime_type, original_filename, blob_path, reference_count, created_at
             FROM blob_registry WHERE id = ?",
            params![blob_id.to_string()],
            |row| {
                Ok(BlobInfo {
                    id: blob_id,
                    sha256: row.get(1)?,
                    file_size: row.get(2)?,
                    mime_type: row.get(3)?,
                    original_filename: row.get(4)?,
                    blob_path: row.get(5)?,
                    reference_count: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    /// Get missing blob hashes (for sync)
    pub fn get_missing_blobs(&self, remote_hashes: &[String]) -> Result<Vec<String>, String> {
        let mut missing = Vec::new();

        for hash in remote_hashes {
            if !self.has_hash(hash) {
                missing.push(hash.clone());
            }
        }

        Ok(missing)
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    pub fn calculate_sha256(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }

    /// Convert SHA-256 hash to path: ab/cdef1234...
    fn hash_to_path(sha256: &str) -> String {
        if sha256.len() < 2 {
            sha256.to_string()
        } else {
            format!("{}/{}", &sha256[..2], &sha256[2..])
        }
    }

    /// Get total blob count and size
    pub fn stats(&self) -> Result<(i64, i64), String> {
        let conn = self.conn.lock();

        conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(file_size), 0) FROM blob_registry",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_test_env() -> (PathBuf, Arc<Mutex<Connection>>) {
        let blobs_dir = std::env::temp_dir().join(format!("blobs_test_{}", Uuid::new_v4()));
        let conn = Connection::open_in_memory().unwrap();

        conn.execute(
            "CREATE TABLE blob_registry (
                id TEXT PRIMARY KEY,
                sha256 TEXT NOT NULL UNIQUE,
                file_size INTEGER NOT NULL,
                mime_type TEXT,
                original_filename TEXT,
                blob_path TEXT NOT NULL,
                reference_count INTEGER DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
            [],
        )
        .unwrap();

        (blobs_dir, Arc::new(Mutex::new(conn)))
    }

    #[test]
    fn test_store_and_get() {
        let (blobs_dir, conn) = create_test_env();
        let store = BlobStore::new(blobs_dir.clone(), conn);

        let data = b"Hello, Blob Storage!";
        let blob_id = store
            .store(data, Some("test.txt"), Some("text/plain"))
            .unwrap();

        // Get data back
        let retrieved = store.get(blob_id).unwrap();
        assert_eq!(retrieved, data);

        // Cleanup
        let _ = std::fs::remove_dir_all(&blobs_dir);
    }

    #[test]
    fn test_deduplication() {
        let (blobs_dir, conn) = create_test_env();
        let store = BlobStore::new(blobs_dir.clone(), conn);

        let data = b"Duplicate content";

        // Store twice
        let id1 = store.store(data, Some("file1.txt"), None).unwrap();
        let id2 = store.store(data, Some("file2.txt"), None).unwrap();

        // Should return same ID (deduplication)
        assert_eq!(id1, id2);

        // Reference count should be 2
        let info = store.get_info(id1).unwrap();
        assert_eq!(info.reference_count, 2);

        let _ = std::fs::remove_dir_all(&blobs_dir);
    }

    #[test]
    fn test_integrity_check() {
        let (blobs_dir, conn) = create_test_env();
        let store = BlobStore::new(blobs_dir.clone(), conn);

        let data = b"Integrity test data";
        let blob_id = store.store(data, None, None).unwrap();

        // Corrupt the file
        let info = store.get_info(blob_id).unwrap();
        let full_path = blobs_dir.join(&info.blob_path);
        std::fs::write(&full_path, b"corrupted").unwrap();

        // Get should fail integrity check
        let result = store.get(blob_id);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("integrity"));

        let _ = std::fs::remove_dir_all(&blobs_dir);
    }

    #[test]
    fn test_reference_management() {
        let (blobs_dir, conn) = create_test_env();
        let store = BlobStore::new(blobs_dir.clone(), conn);

        let data = b"Reference test";
        let blob_id = store.store(data, None, None).unwrap();

        store.add_reference(blob_id).unwrap();
        store.add_reference(blob_id).unwrap();

        let info = store.get_info(blob_id).unwrap();
        assert_eq!(info.reference_count, 3);

        store.remove_reference(blob_id).unwrap();
        let info = store.get_info(blob_id).unwrap();
        assert_eq!(info.reference_count, 2);

        let _ = std::fs::remove_dir_all(&blobs_dir);
    }

    #[test]
    fn test_garbage_collection() {
        let (blobs_dir, conn) = create_test_env();
        let store = BlobStore::new(blobs_dir.clone(), conn);

        let data1 = b"GC test data 1";
        let data2 = b"GC test data 2";

        let id1 = store.store(data1, None, None).unwrap();
        let id2 = store.store(data2, None, None).unwrap();

        // Remove references from first blob
        store.remove_reference(id1).unwrap(); // ref_count = 0
        store.remove_reference(id1).unwrap(); // ref_count = -1

        let count = store.gc().unwrap();
        assert_eq!(count, 1); // Only id1 should be deleted

        // id1 should be gone
        let result = store.get_info(id1);
        assert!(result.is_err());

        // id2 should still exist
        let info = store.get_info(id2).unwrap();
        assert_eq!(info.reference_count, 1);

        let _ = std::fs::remove_dir_all(&blobs_dir);
    }

    #[test]
    fn test_has_hash() {
        let (blobs_dir, conn) = create_test_env();
        let store = BlobStore::new(blobs_dir.clone(), conn);

        let data = b"Hash check test";
        store.store(data, None, None).unwrap();

        let sha256 = BlobStore::calculate_sha256(data);
        assert!(store.has_hash(&sha256));
        assert!(!store.has_hash("nonexistent_hash"));

        let _ = std::fs::remove_dir_all(&blobs_dir);
    }

    #[test]
    fn test_stats() {
        let (blobs_dir, conn) = create_test_env();
        let store = BlobStore::new(blobs_dir.clone(), conn);

        store.store(b"data1", None, None).unwrap();
        store.store(b"longer_data_123", None, None).unwrap();

        let (count, total_size) = store.stats().unwrap();
        assert_eq!(count, 2);
        assert_eq!(total_size, 5 + 15); // "data1" + "longer_data_123"

        let _ = std::fs::remove_dir_all(&blobs_dir);
    }
}
