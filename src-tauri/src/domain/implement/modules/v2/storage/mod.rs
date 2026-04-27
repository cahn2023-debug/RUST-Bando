pub mod blob_store;
pub mod db_config;
pub mod duckdb_manager;
pub mod manifest;
/// V2 Storage Module
///
/// Database schema, blob storage, and manifest management for V2.
pub mod schema;
pub mod worker;

pub use blob_store::BlobStore;
pub use db_config::open_v2_connection;
pub use manifest::{Manifest, ManifestIO, PmpContainer};
pub use schema::{apply_v2_schema, get_schema_version, is_v2_database};
pub use worker::{DiskPersistenceWorker, WorkerCommand};

// Re-export at storage level for external access
pub use blob_store::BlobInfo;
