/// Manifest - Versioned .pmp container metadata
///
/// manifest.json is the entry point for V2 .pmp files:
/// - Format version tracking
/// - App version tracking
/// - Feature flags
/// - Schema versions
/// - Device tracking
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{debug, error, info};
use uuid::Uuid;

// ============================================================================
/// Manifest Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    /// Container format version (e.g., "2.0")
    pub format_version: String,

    /// Application version that created/last modified this file
    pub app_version: String,

    /// Unique project identifier
    pub project_id: Uuid,

    /// Creation timestamp
    pub created_at: String,

    /// Last modification timestamp
    pub updated_at: String,

    /// Enabled features
    pub features: Vec<String>,

    /// SQLite schema version
    pub db_schema_version: i64,

    /// Metadata registry schema version
    pub metadata_schema_version: i64,

    /// Last device that modified this file
    pub device_id: String,

    /// Last event global_seq written
    pub last_global_seq: i64,
}

impl Manifest {
    /// Create a new manifest for a fresh project
    pub fn new(project_id: Uuid, app_version: &str, device_id: &str) -> Self {
        let now = chrono::Utc::now().to_rfc3339();

        Self {
            format_version: "2.0".to_string(),
            app_version: app_version.to_string(),
            project_id,
            created_at: now.clone(),
            updated_at: now,
            features: vec!["event_sourcing".to_string()],
            db_schema_version: 1,
            metadata_schema_version: 1,
            device_id: device_id.to_string(),
            last_global_seq: 0,
        }
    }

    /// Add a feature flag
    pub fn with_feature(mut self, feature: &str) -> Self {
        if !self.features.contains(&feature.to_string()) {
            self.features.push(feature.to_string());
        }
        self
    }

    /// Update timestamps and device info
    pub fn touch(&mut self, device_id: &str, global_seq: i64) {
        self.updated_at = chrono::Utc::now().to_rfc3339();
        self.device_id = device_id.to_string();
        self.last_global_seq = global_seq;
    }

    /// Check if a feature is enabled
    pub fn has_feature(&self, feature: &str) -> bool {
        self.features.contains(&feature.to_string())
    }

    /// Check if format version is supported
    pub fn is_supported(&self) -> bool {
        self.format_version == "2.0"
    }
}

// ============================================================================
/// ManifestIO
// ============================================================================
pub struct ManifestIO {
    manifest_path: PathBuf,
}

impl ManifestIO {
    pub fn new(pmp_path: &Path) -> Self {
        let manifest_path = if pmp_path.is_dir() {
            pmp_path.join("manifest.json")
        } else {
            // For single-file mode, store alongside
            // If the file ends in .pmp, we use .pmp.manifest.json
            pmp_path.with_extension("pmp.manifest.json")
        };

        Self { manifest_path }
    }

    pub fn exists(&self) -> bool {
        self.manifest_path.exists()
    }

    pub fn read(&self) -> Result<Manifest, String> {
        if !self.exists() {
            return Err("Manifest file not found".to_string());
        }

        let content = std::fs::read_to_string(&self.manifest_path).map_err(|e| e.to_string())?;

        let loaded = serde_json::from_str::<Manifest>(&content).map_err(|e| {
            error!("[Manifest] Deserialization error: {}", e);
            e.to_string()
        })?;
        debug!(
            "[Manifest] Successfully read manifest from {:?}",
            self.manifest_path
        );
        Ok(loaded)
    }

    pub fn write(&self, manifest: &Manifest) -> Result<(), String> {
        if let Some(parent) = self.manifest_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                error!(
                    "[Manifest] Failed to create parent directory for {:?}: {}",
                    self.manifest_path, e
                );
                e.to_string()
            })?;
        }

        let content = serde_json::to_string_pretty(manifest).map_err(|e| {
            error!("[Manifest] Serialization error: {}", e);
            e.to_string()
        })?;

        std::fs::write(&self.manifest_path, content).map_err(|e| {
            error!(
                "[Save Error] Failed to write manifest to {:?}: {}",
                self.manifest_path, e
            );
            e.to_string()
        })?;

        info!(
            "[Manifest] Successfully saved manifest to {:?}",
            self.manifest_path
        );
        Ok(())
    }

    pub fn path(&self) -> &Path {
        &self.manifest_path
    }
}

// ============================================================================
/// PmpContainer - .pmp folder/zip management
// ============================================================================
pub struct PmpContainer {
    pub base_path: PathBuf,
    pub manifest: Manifest,
    pub is_folder: bool,
}

impl PmpContainer {
    /// Open a .pmp container (folder or zip)
    pub fn open(pmp_path: &Path, device_id: &str) -> Result<Self, String> {
        let is_folder = pmp_path.is_dir();
        let manifest_io = ManifestIO::new(pmp_path);

        let manifest = if manifest_io.exists() {
            let mut m = manifest_io.read()?;
            if !m.is_supported() {
                return Err(format!(
                    "Unsupported format version: {}. Expected 2.0",
                    m.format_version
                ));
            }
            m.touch(device_id, m.last_global_seq);
            m
        } else {
            // Create default manifest for new containers
            let m = Manifest::new(Uuid::new_v4(), env!("CARGO_PKG_VERSION"), device_id);
            // Persist immediately to prevent orphan containers
            manifest_io.write(&m)?;
            m
        };

        Ok(Self {
            base_path: pmp_path.to_path_buf(),
            manifest,
            is_folder,
        })
    }

    /// Create a new .pmp container
    pub fn create(
        pmp_path: &Path,
        project_id: Uuid,
        app_version: &str,
        device_id: &str,
    ) -> Result<Self, String> {
        let is_folder = true;

        // Create directory
        std::fs::create_dir_all(pmp_path).map_err(|e| e.to_string())?;

        let manifest = Manifest::new(project_id, app_version, device_id);

        // Write manifest
        let manifest_io = ManifestIO::new(pmp_path);
        manifest_io.write(&manifest)?;

        Ok(Self {
            base_path: pmp_path.to_path_buf(),
            manifest,
            is_folder,
        })
    }

    /// Save manifest to disk
    pub fn save(&self) -> Result<(), String> {
        let manifest_io = ManifestIO::new(&self.base_path);
        manifest_io.write(&self.manifest)
    }

    /// Package as .zip for distribution
    pub fn package_as_zip(&self, output_path: &Path) -> Result<(), String> {
        use std::fs::File;
        use std::io::{Read, Write};
        use walkdir::WalkDir;
        use zip::write::FileOptions;

        // Ensure manifest is saved before zipping
        self.save()?;

        // Create output directory if needed
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // Create zip file
        let zip_file = File::create(output_path).map_err(|e| e.to_string())?;
        let mut zip_writer = zip::ZipWriter::new(zip_file);
        let options = FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o755);

        if self.is_folder {
            // Walk through the folder and add all files to zip
            let base_path = self.base_path.clone();

            for entry in WalkDir::new(&base_path).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                let relative_path = path.strip_prefix(&base_path).map_err(|e| e.to_string())?;

                if path.is_file() {
                    let relative_path_str =
                        relative_path.to_str().ok_or("Invalid UTF-8 in path")?;

                    zip_writer
                        .start_file(relative_path_str, options)
                        .map_err(|e| e.to_string())?;

                    let mut file = File::open(path).map_err(|e| e.to_string())?;
                    let mut buffer = Vec::new();
                    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

                    zip_writer.write_all(&buffer).map_err(|e| e.to_string())?;
                } else if !relative_path.as_os_str().is_empty() {
                    // Add directory entry (empty directories)
                    let relative_path_str =
                        relative_path.to_str().ok_or("Invalid UTF-8 in path")?;

                    zip_writer
                        .add_directory(relative_path_str, options)
                        .map_err(|e| e.to_string())?;
                }
            }
        } else {
            // If it's already a single file (like a .pmp file), just add it
            let file_name = self
                .base_path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or("Invalid filename")?;

            zip_writer
                .start_file(file_name, options)
                .map_err(|e| e.to_string())?;

            let mut file = File::open(&self.base_path).map_err(|e| e.to_string())?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

            zip_writer.write_all(&buffer).map_err(|e| e.to_string())?;
        }

        zip_writer.finish().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Get the core.db path
    pub fn core_db_path(&self) -> PathBuf {
        if self.is_folder {
            self.base_path.join("core.db")
        } else {
            // For single-file mode, the .pmp IS the database
            self.base_path.clone()
        }
    }

    /// Get the analytics.duckdb path
    pub fn analytics_db_path(&self) -> PathBuf {
        self.base_path.join("analytics.duckdb")
    }

    /// Get the blobs directory
    pub fn blobs_dir(&self) -> PathBuf {
        self.base_path.join("blobs")
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path() -> PathBuf {
        std::env::temp_dir().join(format!("pmp_test_{}", Uuid::new_v4()))
    }

    #[test]
    fn test_manifest_creation() {
        let project_id = Uuid::new_v4();
        let manifest = Manifest::new(project_id, "1.0.0", "test-device");

        assert_eq!(manifest.format_version, "2.0");
        assert_eq!(manifest.project_id, project_id);
        assert_eq!(manifest.device_id, "test-device");
        assert_eq!(manifest.last_global_seq, 0);
        assert!(manifest.has_feature("event_sourcing"));
        assert!(manifest.is_supported());
    }

    #[test]
    fn test_manifest_features() {
        let manifest = Manifest::new(Uuid::new_v4(), "1.0.0", "dev-1")
            .with_feature("sync")
            .with_feature("ai_analysis");

        assert!(manifest.has_feature("event_sourcing"));
        assert!(manifest.has_feature("sync"));
        assert!(manifest.has_feature("ai_analysis"));
        assert_eq!(manifest.features.len(), 3);
    }

    #[test]
    fn test_manifest_io_roundtrip() {
        let path = temp_path();
        std::fs::create_dir_all(&path).unwrap();

        let manifest = Manifest::new(Uuid::new_v4(), "1.0.0", "test-device");
        let io = ManifestIO::new(&path);

        io.write(&manifest).unwrap();
        assert!(io.exists());

        let loaded = io.read().unwrap();
        assert_eq!(loaded.format_version, manifest.format_version);
        assert_eq!(loaded.project_id, manifest.project_id);

        let _ = std::fs::remove_dir_all(&path);
    }

    #[test]
    fn test_pmp_container_create() {
        let path = temp_path();
        let container =
            PmpContainer::create(&path, Uuid::new_v4(), "1.0.0", "test-device").unwrap();

        assert!(container.is_folder);
        assert!(container.manifest.is_supported());
        assert!(path.exists());
        assert!(ManifestIO::new(&path).exists());

        let _ = std::fs::remove_dir_all(&path);
    }

    #[test]
    fn test_pmp_container_open() {
        let path = temp_path();

        // Create first
        let _ = PmpContainer::create(&path, Uuid::new_v4(), "1.0.0", "dev-1").unwrap();

        // Open
        let container = PmpContainer::open(&path, "dev-2").unwrap();
        assert_eq!(container.manifest.device_id, "dev-2");

        let _ = std::fs::remove_dir_all(&path);
    }

    #[test]
    fn test_container_paths() {
        let path = temp_path();
        let container = PmpContainer::create(&path, Uuid::new_v4(), "1.0.0", "dev").unwrap();

        assert_eq!(container.core_db_path(), path.join("core.db"));
        assert_eq!(container.analytics_db_path(), path.join("analytics.duckdb"));
        assert_eq!(container.blobs_dir(), path.join("blobs"));

        let _ = std::fs::remove_dir_all(&path);
    }

    #[test]
    fn test_manifest_touch() {
        let mut manifest = Manifest::new(Uuid::new_v4(), "1.0.0", "dev-1");
        let old_updated = manifest.updated_at.clone();

        std::thread::sleep(std::time::Duration::from_millis(10));
        manifest.touch("dev-2", 100);

        assert_eq!(manifest.device_id, "dev-2");
        assert_eq!(manifest.last_global_seq, 100);
        assert!(manifest.updated_at > old_updated);
    }
}
